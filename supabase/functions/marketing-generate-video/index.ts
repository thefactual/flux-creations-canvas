// Marketing Studio video generation — AtlasCloud Seedance 2.0 (sole provider).
//
// Implements the three Atlas Seedance endpoints exactly per docs:
//   • bytedance/seedance-2.0/text-to-video        (prompt only)
//   • bytedance/seedance-2.0/image-to-video       (prompt + image first-frame, optional last_image)
//   • bytedance/seedance-2.0/reference-to-video   (prompt + reference_images[1-9], optional reference_audios[1-3])
//
// Routing decision per Studio inputs:
//   • avatar present (with or without product) → keyframe (avatar+product composed) → IMAGE-TO-VIDEO
//   • product only, no avatar                  → REFERENCE-TO-VIDEO with product photos
//   • text only                                → TEXT-TO-VIDEO
//
// Atlas docs:
//   POST   https://api.atlascloud.ai/api/v1/model/generateVideo      → { data: { id } }
//   GET    https://api.atlascloud.ai/api/v1/model/prediction/{id}    → { data: { status, outputs: [url], error } }
//   POST   https://api.atlascloud.ai/api/v1/model/uploadMedia        → multipart/form-data, returns { data: { download_url } }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ATLAS_KEY = Deno.env.get('ATLASCLOUD_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ATLAS_BASE = 'https://api.atlascloud.ai/api/v1/model';

type AtlasMode = 'text-to-video' | 'image-to-video' | 'reference-to-video';

const MIN_TIMEOUT_MS = 8 * 60 * 1000;
const MAX_TIMEOUT_MS = 15 * 60 * 1000;

// ──────────────────────────── helpers ────────────────────────────

function log(level: 'INFO' | 'WARN' | 'ERROR', msg: string, ctx: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, msg, ...ctx, ts: new Date().toISOString() }));
}

function isValidHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const u = new URL(value.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function clampDuration(d: unknown): number {
  // Atlas: integer 4-15, or -1 for auto.
  const n = Number(d);
  if (!Number.isFinite(n)) return 8;
  if (n === -1) return -1;
  return Math.max(4, Math.min(15, Math.round(n)));
}

function normalizeResolution(r: unknown): string {
  // Atlas: 480p | 720p | 1080p | 1080p-SR | 1440p-SR
  const allowed = new Set(['480p', '720p', '1080p', '1080p-SR', '1440p-SR']);
  const v = String(r ?? '720p');
  return allowed.has(v) ? v : '720p';
}

function normalizeRatio(a: unknown): string {
  // Atlas: 16:9 | 4:3 | 1:1 | 3:4 | 9:16 | 21:9 | adaptive
  const allowed = new Set(['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive']);
  const v = String(a ?? 'adaptive');
  if (!v || v === 'Auto') return 'adaptive';
  return allowed.has(v) ? v : 'adaptive';
}

function timeoutForDuration(d: unknown): number {
  const dur = clampDuration(d);
  const seconds = dur === -1 ? 10 : dur;
  return Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, (6 * 60 + seconds * 30) * 1000));
}

async function signedStorageUrl(admin: any, bucket: string, path: string, ttl = 60 * 60 * 24): Promise<string | null> {
  const { data } = await admin.storage.from(bucket).createSignedUrl(path, ttl);
  return data?.signedUrl ?? null;
}

// ──────────────────────────── Atlas API client ────────────────────────────

interface AtlasUploadResult {
  ok: boolean;
  url?: string;
  error?: string;
}

/**
 * Upload an image or audio file to Atlas storage and get back a CDN URL.
 * Per docs: POST /api/v1/model/uploadMedia, multipart/form-data, returns { data: { download_url } }
 */
async function atlasUpload(sourceUrl: string, kind: 'image' | 'audio', index = 0): Promise<AtlasUploadResult> {
  try {
    const src = await fetch(sourceUrl);
    if (!src.ok) return { ok: false, error: `source ${kind} not downloadable (${src.status})` };
    const blob = await src.blob();
    const contentType = blob.type || (kind === 'audio' ? 'audio/mpeg' : 'image/jpeg');
    const ext = (contentType.split('/')[1] || (kind === 'audio' ? 'mp3' : 'jpg')).split(';')[0];

    const form = new FormData();
    form.append('file', blob, `${kind}-${index + 1}.${ext}`);

    const res = await fetch(`${ATLAS_BASE}/uploadMedia`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ATLAS_KEY}` },
      body: form,
    });
    const json = await res.json().catch(() => ({}));
    const downloadUrl = json?.data?.download_url ?? json?.data?.url ?? json?.url;
    if (!res.ok || !isValidHttpUrl(downloadUrl)) {
      return { ok: false, error: json?.msg || json?.message || `upload http ${res.status}` };
    }
    return { ok: true, url: String(downloadUrl) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'upload threw' };
  }
}

interface AtlasSubmitResult {
  ok: boolean;
  predictionId?: string;
  error?: string;
  raw: unknown;
}

/**
 * Submit a Seedance generation. Caller is responsible for choosing the right
 * `model` and supplying the body fields per docs:
 *   • text-to-video       → { model, prompt, duration, resolution, ratio, generate_audio, watermark }
 *   • image-to-video      → above + { image: <url|base64|asset://>, last_image? }
 *   • reference-to-video  → above + { reference_images: string[], reference_audios?: string[] }
 */
async function atlasGenerateVideo(body: Record<string, unknown>): Promise<AtlasSubmitResult> {
  const res = await fetch(`${ATLAS_BASE}/generateVideo`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ATLAS_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  const predictionId = json?.data?.id ?? json?.id;
  if (!res.ok || !predictionId) {
    const code = json?.code ?? res.status;
    const msg = json?.message ?? json?.msg ?? json?.data?.error ?? `http ${res.status}`;
    return { ok: false, error: `Atlas ${code}: ${msg}`, raw: json };
  }
  return { ok: true, predictionId: String(predictionId), raw: json };
}

interface AtlasPollResult {
  status: 'processing' | 'done' | 'failed';
  videoUrl?: string;
  error?: string;
}

/**
 * Poll a Seedance prediction. Per docs status ∈ processing | completed | succeeded | failed | timeout.
 * On success, video URL is at data.outputs[0] (string) or data.outputs[0].url (object form for safety).
 */
async function atlasPollPrediction(predictionId: string): Promise<AtlasPollResult> {
  const res = await fetch(`${ATLAS_BASE}/prediction/${predictionId}`, {
    headers: { Authorization: `Bearer ${ATLAS_KEY}` },
  });
  const json = await res.json().catch(() => ({}));
  const data = json?.data ?? json;
  const status = String(data?.status ?? '').toLowerCase();

  if (status === 'completed' || status === 'succeeded') {
    const out = data?.outputs?.[0];
    const videoUrl = typeof out === 'string' ? out : out?.url ?? null;
    if (videoUrl) return { status: 'done', videoUrl: String(videoUrl) };
    return { status: 'failed', error: 'Atlas completed without a video URL' };
  }
  if (status === 'failed' || status === 'timeout') {
    return { status: 'failed', error: data?.error || json?.message || `Atlas reported ${status}` };
  }
  return { status: 'processing' };
}

// ──────────────────────────── reference gathering ────────────────────────────

interface ReferenceBundle {
  mode: AtlasMode;
  // image-to-video: a single first-frame URL (Atlas-hosted)
  firstFrame?: string;
  // reference-to-video: 1..9 reference image URLs (Atlas-hosted)
  referenceImages?: string[];
  // reference-to-video: 0..3 reference audio URLs (Atlas-hosted)
  referenceAudios?: string[];
}

// Collect product photo signed URLs (originals from storage).
async function fetchProductImageUrls(admin: any, productId: string, max = 6): Promise<string[]> {
  const out: string[] = [];
  const { data: imgs } = await admin
    .from('ms_product_images')
    .select('storage_path, is_primary')
    .eq('product_id', productId)
    .order('is_primary', { ascending: false })
    .limit(max);
  for (const img of imgs ?? []) {
    const signed = await signedStorageUrl(admin, 'ms-products', (img as any).storage_path);
    if (signed) out.push(signed);
  }
  return out;
}

async function fetchAvatarImageUrl(admin: any, avatarId: string): Promise<string | null> {
  const { data: a } = await admin
    .from('ms_avatars')
    .select('public_url, storage_path')
    .eq('id', avatarId)
    .maybeSingle();
  if (!a) return null;
  if ((a as any).public_url && isValidHttpUrl((a as any).public_url)) return String((a as any).public_url);
  if ((a as any).storage_path) {
    const signed = await signedStorageUrl(admin, 'ms-avatars', (a as any).storage_path);
    if (signed) return signed;
  }
  return null;
}

// Upload a list of source URLs to Atlas, return only successful Atlas-hosted URLs.
async function uploadAllToAtlas(sourceUrls: string[], kind: 'image' | 'audio'): Promise<string[]> {
  const out: string[] = [];
  for (const url of sourceUrls) {
    if (!isValidHttpUrl(url)) continue;
    const r = await atlasUpload(url, kind, out.length);
    if (r.ok && r.url) out.push(r.url);
    else log('WARN', `atlas upload failed (${kind})`, { err: r.error });
  }
  return out;
}

/**
 * Build the Atlas Seedance request bundle.
 *
 * IMPORTANT routing rules — these reflect what Atlas Cloud Seedance 2.0 actually
 * accepts (per docs at /docs/models/video):
 *
 *   • image-to-video  → expects a SINGLE first-frame `image`. Atlas runs strict
 *                       moderation on this image and will reject anything that
 *                       "may contain real person". So we ONLY use this endpoint
 *                       when we have a non-human keyframe (e.g. product-only
 *                       composed keyframe). NEVER for avatar + product — that
 *                       gets reliably rejected.
 *
 *   • reference-to-video → up to 9 `reference_images` + optional `reference_audios`.
 *                          This is the correct endpoint for avatar/person inputs;
 *                          it composes a fresh scene using the references for
 *                          identity/style/product anchoring. This is what every
 *                          format with an avatar should use.
 *
 *   • text-to-video → no image inputs at all.
 */
async function buildReferenceBundle(admin: any, opts: {
  productId?: string | null;
  avatarId?: string | null;
  keyframePath?: string | null;
  keyframeUrl?: string | null;
  format?: string | null;
  audioSourceUrls: string[];
  extraImageUrls: string[];
  preferReferenceMode?: boolean;
}): Promise<ReferenceBundle> {
  const hasAvatar = !!opts.avatarId;
  const hasProduct = !!opts.productId;

  // ──── Resolve raw source URLs ────
  const productSrcs: string[] = hasProduct ? await fetchProductImageUrls(admin, opts.productId!, 6) : [];
  const avatarSrc: string | null = hasAvatar ? await fetchAvatarImageUrl(admin, opts.avatarId!) : null;
  const extras: string[] = (opts.extraImageUrls ?? []).filter(isValidHttpUrl);

  // ──── Avatar jobs → reference-to-video ALWAYS ────
  // Order matters for Seedance: the prompt references "image 1", "image 2", etc.
  // We put the avatar first (identity anchor) then product photos (so script can
  // say "the person in image 1 holds the product in image 2…") then extras.
  if (hasAvatar) {
    const refSources: string[] = [];
    if (avatarSrc) refSources.push(avatarSrc);
    refSources.push(...productSrcs);
    refSources.push(...extras);

    const refImages = await uploadAllToAtlas(refSources.slice(0, 9), 'image');
    if (refImages.length > 0) {
      const audioRefs = await uploadAllToAtlas(opts.audioSourceUrls.slice(0, 3), 'audio');
      return {
        mode: 'reference-to-video',
        referenceImages: refImages,
        referenceAudios: audioRefs.length ? audioRefs : undefined,
      };
    }
    // If avatar uploads failed entirely, fall through to text-to-video.
    log('WARN', 'avatar present but no references uploaded — falling back to text-to-video');
    return { mode: 'text-to-video' };
  }

  // ──── Product-only jobs → reference-to-video with product photos + extras ────
  if (hasProduct) {
    const refSources = [...productSrcs, ...extras];
    const refImages = await uploadAllToAtlas(refSources.slice(0, 9), 'image');
    if (refImages.length > 0) {
      return { mode: 'reference-to-video', referenceImages: refImages };
    }
  }

  // ──── No product, no avatar, but extras → reference-to-video using extras ────
  if (extras.length > 0) {
    const refImages = await uploadAllToAtlas(extras.slice(0, 9), 'image');
    if (refImages.length > 0) {
      return { mode: 'reference-to-video', referenceImages: refImages };
    }
  }

  // ──── Optional non-human keyframe path (only when explicitly safe) ────
  // We currently do NOT route through image-to-video for avatar jobs because
  // Atlas blocks human first frames. Kept here for future product-only keyframes.
  const hasKeyframe = !!opts.keyframePath || isValidHttpUrl(opts.keyframeUrl);
  if (!hasAvatar && hasKeyframe) {
    let keyframeUrl: string | null = null;
    if (opts.keyframePath) keyframeUrl = await signedStorageUrl(admin, 'ms-products', opts.keyframePath);
    if (!keyframeUrl && isValidHttpUrl(opts.keyframeUrl)) keyframeUrl = String(opts.keyframeUrl);
    if (keyframeUrl) {
      const uploaded = await atlasUpload(keyframeUrl, 'image', 0);
      if (uploaded.ok && uploaded.url) {
        return { mode: 'image-to-video', firstFrame: uploaded.url };
      }
    }
  }

  // ──── Text-to-video ────
  return { mode: 'text-to-video' };
}

function isModerationRealPersonError(err: string | undefined): boolean {
  if (!err) return false;
  return /real person|may contain real|moderation|nsfw|content policy/i.test(err);
}

// ──────────────────────────── orchestrator helpers ────────────────────────────

async function gatherAudioSourceUrls(admin: any, opts: { avatarId?: string | null; format?: string | null }): Promise<string[]> {
  const out: string[] = [];
  if (opts.avatarId) {
    const { data: av } = await admin.from('ms_avatars').select('voice_sample_url').eq('id', opts.avatarId).maybeSingle();
    if (isValidHttpUrl(av?.voice_sample_url)) out.push(String(av?.voice_sample_url).trim());
  }
  if (String(opts.format ?? '').toLowerCase() === 'podcast') {
    const second = await ensurePodcastSecondVoiceUrl(admin);
    if (second && !out.includes(second)) out.push(second);
  }
  return out;
}

async function ensurePodcastSecondVoiceUrl(admin: any): Promise<string | null> {
  const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
  if (!ELEVENLABS_API_KEY) return null;
  const path = 'system/podcast-second-jessica-v2.mp3';
  const { data: pub } = admin.storage.from('video-inputs').getPublicUrl(path);
  const publicUrl = pub?.publicUrl;
  if (!publicUrl) return null;
  try {
    const head = await fetch(publicUrl, { method: 'HEAD' });
    if (head.ok) return publicUrl;
  } catch { /* generate */ }
  try {
    const tts = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/cgSgspJ2msm6clMCkdW9?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: { 'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: "Yeah, no, I get that. That's actually so true.",
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.55, similarity_boost: 0.85, style: 0.2, use_speaker_boost: true, speed: 1.0 },
        }),
      },
    );
    if (!tts.ok) return null;
    const audio = new Uint8Array(await tts.arrayBuffer());
    const { error: upErr } = await admin.storage
      .from('video-inputs')
      .upload(path, audio, { contentType: 'audio/mpeg', upsert: true });
    if (upErr) return null;
    return publicUrl;
  } catch {
    return null;
  }
}

// ──────────────────────────── submit + retry pipeline ────────────────────────────

interface SubmitOutcome {
  ok: boolean;
  predictionId?: string;
  endpoint?: AtlasMode;
  error?: string;
  raw?: unknown;
}

async function submitToAtlas(opts: {
  prompt: string;
  bundle: ReferenceBundle;
  duration: number;
  resolution: string;
  ratio: string;
  generateAudio: boolean;
}): Promise<SubmitOutcome> {
  const model = `bytedance/seedance-2.0/${opts.bundle.mode}`;
  const body: Record<string, unknown> = {
    model,
    prompt: opts.prompt,
    duration: opts.duration,
    resolution: opts.resolution,
    ratio: opts.ratio,
    generate_audio: opts.generateAudio,
    watermark: false,
  };

  if (opts.bundle.mode === 'image-to-video' && opts.bundle.firstFrame) {
    body.image = opts.bundle.firstFrame;
  } else if (opts.bundle.mode === 'reference-to-video' && opts.bundle.referenceImages?.length) {
    body.reference_images = opts.bundle.referenceImages;
    if (opts.bundle.referenceAudios?.length) {
      body.reference_audios = opts.bundle.referenceAudios;
    }
  }

  const result = await atlasGenerateVideo(body);
  if (!result.ok) {
    return { ok: false, endpoint: opts.bundle.mode, error: result.error, raw: result.raw };
  }
  return { ok: true, predictionId: result.predictionId, endpoint: opts.bundle.mode, raw: result.raw };
}

// ──────────────────────────── HTTP handler ────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json();

    // ──── POLL ────
    if (body.poll) {
      const { data: row } = await admin.from('ms_generations').select('*').eq('id', body.poll).maybeSingle();
      if (!row) {
        return new Response(JSON.stringify({ status: 'queued_pending_persist' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (row.status === 'done' || row.status === 'failed') {
        return new Response(JSON.stringify(row), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!row.fal_request_id) {
        return new Response(JSON.stringify({ ...row, status: 'queued_pending_persist' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const startedAt = Date.parse(row.updated_at || row.created_at || '') || Date.now();
      const timeoutMs = timeoutForDuration(row.duration_seconds);
      if (Date.now() - startedAt > timeoutMs) {
        const msg = `Timed out after ${Math.round(timeoutMs / 60000)} minutes (Atlas prediction ${row.fal_request_id}).`;
        const { data: updated } = await admin
          .from('ms_generations')
          .update({ status: 'failed', stage: 'failed', error: msg })
          .eq('id', row.id)
          .select()
          .single();
        return new Response(JSON.stringify(updated), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const result = await atlasPollPrediction(row.fal_request_id);
      if (result.status === 'done') {
        const { data: updated } = await admin
          .from('ms_generations')
          .update({ status: 'done', stage: 'done', video_url: result.videoUrl, error: null })
          .eq('id', row.id)
          .select()
          .single();
        return new Response(JSON.stringify(updated), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (result.status === 'failed') {
        const { data: updated } = await admin
          .from('ms_generations')
          .update({ status: 'failed', stage: 'failed', error: result.error ?? 'Atlas reported failure' })
          .eq('id', row.id)
          .select()
          .single();
        return new Response(JSON.stringify(updated), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (row.status !== 'running') {
        await admin.from('ms_generations').update({ status: 'running' }).eq('id', row.id);
      }
      return new Response(JSON.stringify({ ...row, status: 'running' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ──── RETRY ────
    if (body.retry) {
      const { data: row } = await admin.from('ms_generations').select('*').eq('id', body.retry).maybeSingle();
      if (!row) {
        return new Response(JSON.stringify({ error: 'not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const audioSourceUrls = await gatherAudioSourceUrls(admin, { avatarId: row.avatar_id, format: row.format });
      const bundle = await buildReferenceBundle(admin, {
        productId: row.product_id,
        avatarId: row.avatar_id,
        keyframePath: row.keyframe_path,
        keyframeUrl: row.keyframe_url,
        format: row.format,
        audioSourceUrls,
      });

      const submission = await submitToAtlas({
        prompt: row.prompt,
        bundle,
        duration: clampDuration(row.duration_seconds ?? 8),
        resolution: normalizeResolution(row.resolution ?? '720p'),
        ratio: normalizeRatio(row.aspect ?? '9:16'),
        generateAudio: true,
      });

      if (!submission.ok) {
        await admin
          .from('ms_generations')
          .update({ status: 'failed', stage: 'failed', error: submission.error ?? 'Atlas rejected retry' })
          .eq('id', row.id);
        return new Response(JSON.stringify({ id: row.id, status: 'failed', error: submission.error, details: submission.raw }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: updated } = await admin
        .from('ms_generations')
        .update({
          status: 'queued',
          stage: 'videoing',
          provider: 'atlascloud',
          provider_endpoint: `bytedance/seedance-2.0/${submission.endpoint}`,
          fal_request_id: submission.predictionId,
          fallback_attempted: false,
          error: null,
          video_url: null,
        })
        .eq('id', row.id)
        .select()
        .single();
      log('INFO', 'retry: submitted', { jobId: row.id, endpoint: submission.endpoint });
      return new Response(JSON.stringify(updated), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ──── SUBMIT ────
    const {
      prompt,
      keyframe_url,
      keyframe_path,
      aspect = '9:16',
      duration_seconds = 8,
      resolution = '720p',
      productId,
      avatarId,
      format,
      surface,
      projectId,
      script_text,
      reuseGenerationId,
    } = body;

    if (!prompt || typeof prompt !== 'string') {
      return new Response(JSON.stringify({ error: 'prompt required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!ATLAS_KEY) {
      return new Response(JSON.stringify({ error: 'ATLASCLOUD_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const duration = clampDuration(duration_seconds);
    const resolutionN = normalizeResolution(resolution);
    const ratio = normalizeRatio(aspect);

    const audioSourceUrls = await gatherAudioSourceUrls(admin, { avatarId, format });
    const bundle = await buildReferenceBundle(admin, {
      productId,
      avatarId,
      keyframePath: keyframe_path,
      keyframeUrl: keyframe_url,
      format,
      audioSourceUrls,
    });
    log('INFO', 'submit: bundle built', {
      mode: bundle.mode,
      hasFirstFrame: !!bundle.firstFrame,
      refImages: bundle.referenceImages?.length ?? 0,
      refAudios: bundle.referenceAudios?.length ?? 0,
    });

    // Persist row (or update existing one created by orchestrator)
    let row: any;
    const referenceUrlsForRow =
      bundle.mode === 'image-to-video' && bundle.firstFrame
        ? [bundle.firstFrame]
        : bundle.referenceImages ?? [];

    if (reuseGenerationId) {
      const { data: updated, error: updErr } = await admin
        .from('ms_generations')
        .update({
          prompt,
          script_text: script_text ?? null,
          keyframe_url: keyframe_url ?? null,
          reference_paths: referenceUrlsForRow,
          status: 'queued',
          stage: 'videoing',
          provider: null,
          provider_endpoint: null,
          fal_request_id: null,
          fallback_attempted: false,
          error: null,
          video_url: null,
          aspect: ratio,
          duration_seconds: duration,
          resolution: resolutionN,
        })
        .eq('id', reuseGenerationId)
        .select()
        .single();
      if (updErr) throw updErr;
      row = updated;
    } else {
      const { data: inserted, error: insErr } = await admin
        .from('ms_generations')
        .insert({
          user_id: null,
          project_id: projectId ?? null,
          product_id: productId ?? null,
          avatar_id: avatarId ?? null,
          format,
          surface,
          aspect: ratio,
          duration_seconds: duration,
          resolution: resolutionN,
          prompt,
          script_text: script_text ?? null,
          keyframe_url: keyframe_url ?? null,
          reference_paths: referenceUrlsForRow,
          status: 'queued',
          stage: 'videoing',
        })
        .select()
        .single();
      if (insErr) throw insErr;
      row = inserted;
    }
    log('INFO', 'submit: row persisted', { jobId: row.id, mode: bundle.mode });

    const submission = await submitToAtlas({
      prompt,
      bundle,
      duration,
      resolution: resolutionN,
      ratio,
      generateAudio: true,
    });

    if (!submission.ok) {
      await admin
        .from('ms_generations')
        .update({ status: 'failed', stage: 'failed', error: submission.error ?? 'Atlas rejected submit' })
        .eq('id', row.id);
      return new Response(
        JSON.stringify({ id: row.id, status: 'failed', error: submission.error, details: submission.raw }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: updated } = await admin
      .from('ms_generations')
      .update({
        provider: 'atlascloud',
        provider_endpoint: `bytedance/seedance-2.0/${submission.endpoint}`,
        fal_request_id: submission.predictionId,
      })
      .eq('id', row.id)
      .select()
      .single();

    log('INFO', 'submit: done', { jobId: row.id, endpoint: submission.endpoint, predictionId: submission.predictionId });

    return new Response(
      JSON.stringify({
        id: updated.id,
        provider: 'atlascloud',
        endpoint: submission.endpoint,
        fal_request_id: submission.predictionId,
        status: 'queued',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    log('ERROR', 'unhandled', { err: e instanceof Error ? e.message : String(e) });
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'unknown' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
