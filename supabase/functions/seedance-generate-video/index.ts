// Seedance 2.0 native multimodal video generation via AtlasCloud.
// Accepts up to 9 reference images, 3 reference videos (≤15s total),
// and 3 reference audios (≤15s total). Writes to video_generations.
//
// Endpoints used:
//   POST  https://api.atlascloud.ai/api/v1/model/generateVideo
//   GET   https://api.atlascloud.ai/api/v1/model/prediction/{id}
//   POST  https://console.atlascloud.ai/api/v1/sd/assets   (reference asset registration)
//
// Reference: https://www.atlascloud.ai/models/bytedance/seedance-2.0/reference-to-video
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
const ATLAS_ASSETS_BASE = 'https://console.atlascloud.ai/api/v1';

const SEEDANCE_REF = 'bytedance/seedance-2.0/reference-to-video';
const SEEDANCE_TEXT = 'bytedance/seedance-2.0/text-to-video';
const SEEDANCE_FAST = 'bytedance/seedance-2.0-fast/text-to-video';

const ALLOWED_RES = new Set(['480p', '720p', '1080p', '1080p-SR', '1440p-SR']);
const ALLOWED_RATIO = new Set(['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive']);
const ALLOWED_VARIANT = new Set([SEEDANCE_REF, SEEDANCE_TEXT, SEEDANCE_FAST]);

function log(level: 'INFO' | 'WARN' | 'ERROR', msg: string, ctx: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ fn: 'seedance-generate-video', level, msg, ...ctx, ts: new Date().toISOString() }));
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isHttpUrl(v: unknown): v is string {
  if (typeof v !== 'string' || !v.trim()) return false;
  try {
    const u = new URL(v.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch { return false; }
}

function uniqueUrls(values: unknown[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    if (!isHttpUrl(raw)) continue;
    const url = String(raw).trim();
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= max) break;
  }
  return out;
}

const VIDEO_EXT = /\.(mp4|mov|webm|m4v|mkv|avi)(\?|#|$)/i;
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|flac)(\?|#|$)/i;
function looksLikeVideo(url: string): boolean { return VIDEO_EXT.test(url); }
function looksLikeAudio(url: string): boolean { return AUDIO_EXT.test(url); }

function clampDuration(d: unknown): number {
  const n = Number(d);
  if (!Number.isFinite(n)) return 5;
  if (n === -1) return -1;
  return Math.max(4, Math.min(15, Math.round(n)));
}

function normRes(r: unknown): string {
  const v = String(r ?? '720p');
  return ALLOWED_RES.has(v) ? v : '720p';
}

function normRatio(a: unknown): string {
  const v = String(a ?? 'adaptive');
  if (!v || v === 'Auto' || v === 'auto') return 'adaptive';
  return ALLOWED_RATIO.has(v) ? v : 'adaptive';
}

function normVariant(v: unknown, hasRefs: boolean): string {
  const requested = String(v ?? '');
  if (ALLOWED_VARIANT.has(requested)) {
    // Force reference endpoint when refs exist; force text endpoint when none.
    if (hasRefs && requested !== SEEDANCE_REF) return SEEDANCE_REF;
    if (!hasRefs && requested === SEEDANCE_REF) return SEEDANCE_TEXT;
    return requested;
  }
  return hasRefs ? SEEDANCE_REF : SEEDANCE_TEXT;
}

function friendly(raw: string | undefined): string {
  if (!raw) return 'AtlasCloud returned an unknown error.';
  if (/insufficient balance|402|top.?up|exhausted/i.test(raw)) {
    return 'AtlasCloud is out of credit. Add credits at console.atlascloud.ai then retry.';
  }
  if (/output audio.*sensitive/i.test(raw)) {
    return 'Seedance flagged the generated audio. Turn Sound OFF and retry.';
  }
  if (/input video.*sensitive/i.test(raw)) {
    return 'Seedance flagged the input video as containing a real person. Try a shorter clip, a different framing, or remove the reference video.';
  }
  if (/input image.*sensitive|sensitive content/i.test(raw)) {
    return 'Seedance flagged a reference image. Try a different photo or rephrase the prompt.';
  }
  return raw;
}

function isGeneratedAudioModeration(raw: string | undefined): boolean {
  return /output audio.*sensitive|generated audio/i.test(raw ?? '');
}

function isBalanceError(status: number, body: string) {
  if (status === 401 || status === 402) return true;
  return /balance|exhausted|locked|insufficient|top.?up/i.test(body);
}

function toWsrvJpg(rawUrl: string, w = 1024, h = 1024): string {
  if (!rawUrl) return rawUrl;
  if (rawUrl.includes('wsrv.nl')) return rawUrl;
  return `https://wsrv.nl/?url=${encodeURIComponent(rawUrl)}&w=${w}&h=${h}&fit=cover&output=jpg&q=85`;
}

function filenameFromUrl(rawUrl: string, fallback: string): string {
  try {
    const name = decodeURIComponent(new URL(rawUrl).pathname.split('/').pop() || '');
    return name.includes('.') ? name.slice(0, 96) : fallback;
  } catch {
    return fallback;
  }
}

async function uploadAtlasMedia(rawUrl: string, label: string): Promise<string | null> {
  if (!ATLAS_KEY || !rawUrl) return null;
  const source = await fetch(rawUrl);
  if (!source.ok) {
    log('WARN', 'media fetch failed', { label, status: source.status });
    return null;
  }
  const blob = await source.blob();
  if (blob.size > 50 * 1024 * 1024) {
    log('WARN', 'media too large', { label, size: blob.size });
    return null;
  }
  const form = new FormData();
  form.append('file', blob, filenameFromUrl(rawUrl, `${label}.mp4`));
  const res = await fetch(`${ATLAS_BASE}/uploadMedia`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ATLAS_KEY}` },
    body: form,
  });
  const text = await res.text();
  let parsed: any = {};
  try { parsed = JSON.parse(text); } catch { /* keep text */ }
  const mediaUrl =
    parsed?.data?.download_url ??
    parsed?.data?.url ??
    parsed?.data?.file_url ??
    parsed?.download_url ??
    parsed?.url ??
    parsed?.file_url;
  if (!res.ok || !isHttpUrl(mediaUrl)) {
    log('WARN', 'media upload failed', { label, status: res.status, body: text.slice(0, 240) });
    return null;
  }
  return String(mediaUrl);
}

// Register prompt-bar uploads as AtlasCloud assets. Returns asset:// URI or
// null on failure. We require image/video references to be assets so Seedance
// never receives raw user-upload storage URLs that trigger real-person moderation.
async function createAtlasAsset(
  rawUrl: string,
  label: string,
  assetType: 'Image' | 'Video' = 'Image',
): Promise<string | null> {
  if (!ATLAS_KEY || !rawUrl) return null;
  const submittedUrl = assetType === 'Image' ? toWsrvJpg(rawUrl) : rawUrl;
  const res = await fetch(`${ATLAS_ASSETS_BASE}/sd/assets`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ATLAS_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: submittedUrl, name: label, asset_type: assetType }),
  });
  const text = await res.text();
  let parsed: any = {};
  try { parsed = JSON.parse(text); } catch { /* keep text */ }
  if (!res.ok) {
    log('WARN', 'asset create failed', { label, status: res.status, body: text.slice(0, 240) });
    return null;
  }
  const data = parsed?.data ?? parsed;
  const id = data?.id;
  const immediateAsset = data?.atlas_asset_id ?? data?.ark_asset_id;
  if (immediateAsset && String(data?.status ?? '').toLowerCase() === 'active') {
    return `asset://${immediateAsset}`;
  }
  if (!id) return immediateAsset ? `asset://${immediateAsset}` : null;
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    const poll = await fetch(`${ATLAS_ASSETS_BASE}/sd/assets/${id}`, { headers: { Authorization: `Bearer ${ATLAS_KEY}` } });
    const pollText = await poll.text();
    let pollJson: any = {};
    try { pollJson = JSON.parse(pollText); } catch { /* keep text */ }
    const asset = pollJson?.data ?? pollJson;
    const status = String(asset?.status ?? '').toLowerCase();
    const assetId = asset?.atlas_asset_id ?? asset?.ark_asset_id ?? immediateAsset;
    if (status === 'active' && assetId) return `asset://${assetId}`;
    if (status === 'failed') {
      log('WARN', 'asset failed', { id, label });
      return null;
    }
  }
  log('WARN', 'asset timeout', { id, label });
  return null;
}

async function createRequiredAtlasAsset(
  rawUrl: string,
  label: string,
  assetType: 'Image' | 'Video' | 'Audio',
): Promise<{ assetUrl?: string; error?: string }> {
  if (assetType === 'Video') {
    // AtlasCloud docs: sd/assets is a subject portrait/image library only;
    // reference_videos accept uploaded URLs, so videos go through uploadMedia.
    const mediaUrl = await uploadAtlasMedia(rawUrl, label);
    if (mediaUrl) return { assetUrl: mediaUrl };
    return { error: 'AtlasCloud could not ingest the reference video. Retry with a smaller file (<50MB) or remove that reference.' };
  }
  if (assetType === 'Audio') {
    // Audio references are not sd/assets; re-host bytes through uploadMedia.
    const mediaUrl = await uploadAtlasMedia(rawUrl, label);
    if (mediaUrl) return { assetUrl: mediaUrl };
    return { error: 'AtlasCloud could not ingest the reference audio. Retry with a smaller file (<50MB) or remove that reference.' };
  }
  // Images with potential human faces MUST be registered via sd/assets to avoid
  // "real person" moderation rejections.
  const assetUrl = await createAtlasAsset(rawUrl, label, assetType);
  if (assetUrl?.startsWith('asset://')) return { assetUrl };
  return { error: `AtlasCloud could not ingest the reference image. Retry with a JPG/PNG under 10MB or remove that reference.` };
}

type SubmitParams = {
  prompt: string;
  imageUrls: string[];
  videoUrls: string[];
  audioUrls: string[];
  duration: number;
  resolution: string;
  ratio: string;
  generateAudio: boolean;
  variant: string;
};

function splitRefsByType(refs: unknown[]) {
  const raw = uniqueUrls(refs, 18);
  const imageUrls: string[] = [];
  const videoUrls: string[] = [];
  const audioUrls: string[] = [];
  for (const url of raw) {
    if (looksLikeVideo(url)) videoUrls.push(url);
    else if (looksLikeAudio(url)) audioUrls.push(url);
    else imageUrls.push(url);
  }
  return {
    imageUrls: imageUrls.slice(0, 9),
    videoUrls: videoUrls.slice(0, 3),
    audioUrls: audioUrls.slice(0, 3),
  };
}

async function atlasSubmit(p: SubmitParams) {
  const body: Record<string, unknown> = {
    model: p.variant,
    prompt: p.prompt,
    duration: p.duration,
    resolution: normRes(p.resolution),
    ratio: normRatio(p.ratio),
    generate_audio: p.generateAudio,
    watermark: false,
    return_last_frame: false,
  };
  if (p.variant === SEEDANCE_REF) {
    if (p.imageUrls.length) body.reference_images = p.imageUrls;
    if (p.videoUrls.length) body.reference_videos = p.videoUrls;
    if (p.audioUrls.length) body.reference_audios = p.audioUrls;
  }

  log('INFO', 'submit', {
    endpoint: p.variant,
    images: p.imageUrls.length,
    videos: p.videoUrls.length,
    audios: p.audioUrls.length,
    duration: p.duration,
    resolution: p.resolution,
    ratio: p.ratio,
    generateAudio: p.generateAudio,
    sampleImages: p.imageUrls.slice(0, 3).map((u) => (String(u).startsWith('asset://') ? u : `RAW:${String(u).slice(0, 80)}`)),
    sampleVideos: p.videoUrls.slice(0, 3).map((u) => (String(u).startsWith('asset://') ? u : `RAW:${String(u).slice(0, 80)}`)),
  });

  const res = await fetch(`${ATLAS_BASE}/generateVideo`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ATLAS_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any = {};
  try { parsed = JSON.parse(text); } catch { /* keep text */ }
  const predictionId = parsed?.data?.id ?? parsed?.id;
  if (!res.ok || !predictionId) {
    const code = parsed?.code ?? res.status;
    const rawMsg = (parsed?.message ?? parsed?.msg ?? parsed?.data?.error ?? text) || `http ${res.status}`;
    if (isBalanceError(res.status, text)) {
      return { ok: false as const, error: 'AtlasCloud is out of credit. Add credits at console.atlascloud.ai then retry.' };
    }
    return { ok: false as const, error: friendly(`${rawMsg}`) };
  }
  return { ok: true as const, predictionId: String(predictionId), endpoint: p.variant };
}

async function atlasPoll(predictionId: string) {
  const res = await fetch(`${ATLAS_BASE}/prediction/${predictionId}`, {
    headers: { Authorization: `Bearer ${ATLAS_KEY}` },
  });
  const text = await res.text();
  let parsed: any = {};
  try { parsed = JSON.parse(text); } catch { /* keep text */ }
  const data = parsed?.data ?? parsed;
  if (!res.ok) {
    return { status: 'failed' as const, error: friendly((data?.error ?? parsed?.message ?? text) || `poll http ${res.status}`) };
  }
  const status = String(data?.status ?? '').toLowerCase();
  if (status === 'completed' || status === 'succeeded') {
    const out = data?.outputs?.[0];
    const videoUrl = typeof out === 'string' ? out : out?.url;
    return videoUrl ? { status: 'done' as const, videoUrl: String(videoUrl) } : { status: 'failed' as const, error: 'Completed without a video URL' };
  }
  if (status === 'failed' || status === 'timeout') {
    return { status: 'failed' as const, error: friendly(data?.error ?? `AtlasCloud reported ${status}`) };
  }
  return { status: 'processing' as const };
}

// Update the corresponding video_generations row.
async function updateRow(admin: any, videoId: string, patch: Record<string, unknown>) {
  await admin.from('video_generations').update(patch).eq('id', videoId);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (!ATLAS_KEY) return json({ error: 'AtlasCloud is not configured. Add ATLASCLOUD_API_KEY.' }, 500);

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json();
    const action = body?.action ?? 'submit';

    // ----- POLL -----
    if (action === 'poll') {
      const predictionId = String(body.predictionId ?? body.taskId ?? '').trim();
      const videoId = String(body.videoId ?? '').trim();
      if (!predictionId) return json({ error: 'predictionId required' }, 400);

      const out = await atlasPoll(predictionId);
      if (out.status === 'done') {
        if (videoId) await updateRow(admin, videoId, { status: 'complete', stage: 'complete', video_url: out.videoUrl, error: null });
        return json({ status: 'complete', stage: 'complete', videoUrl: out.videoUrl });
      }
      if (out.status === 'failed') {
        if (videoId) await updateRow(admin, videoId, { status: 'failed', stage: 'failed', error: out.error });
        return json({ status: 'failed', stage: 'failed', error: out.error });
      }
      return json({ status: 'processing', stage: 'processing' });
    }

    // ----- SUBMIT -----
    const {
      prompt = '',
      imageUrls = [],
      videoUrls = [],
      audioUrls = [],
      duration = 5,
      resolution = '720p',
      ratio = 'adaptive',
      generateAudio = true,
      variant,
      videoId,            // existing video_generations row id (created client-side)
      projectId,
    } = body ?? {};

    const promptText = String(prompt ?? '').trim();
    // Split every provided ref by file extension. Retry flows store all refs in
    // `reference_images`, so without this videos were silently re-submitted as
    // image assets and Seedance behaved differently from the successful submit.
    const fromImages = splitRefsByType(imageUrls);
    const fromVideos = splitRefsByType(videoUrls);
    const fromAudios = splitRefsByType(audioUrls);
    const images = uniqueUrls([...fromImages.imageUrls, ...fromVideos.imageUrls, ...fromAudios.imageUrls], 9);
    const videos = uniqueUrls([...fromImages.videoUrls, ...fromVideos.videoUrls, ...fromAudios.videoUrls], 3);
    const audios = uniqueUrls([...fromImages.audioUrls, ...fromVideos.audioUrls, ...fromAudios.audioUrls], 3);

    if (!promptText && images.length === 0 && videos.length === 0) {
      return json({ error: 'Provide a prompt or at least one reference image/video.' }, 400);
    }
    if (audios.length && images.length === 0 && videos.length === 0) {
      return json({ error: 'Reference audios require at least one reference image or video.' }, 400);
    }

    const hasRefs = images.length > 0 || videos.length > 0 || audios.length > 0;
    const chosenVariant = normVariant(variant, hasRefs);

    // Mark the row as uploading references so the UI can show "Uploading refs…".
    if (videoId) await updateRow(admin, videoId, { stage: 'uploading_refs', status: 'processing', error: null });

    // Register all references in parallel — image registration polling can take 30s+
    // each, so serial uploads were the main reason jobs felt "stuck".
    const tag = (videoId ?? 'anon').slice(0, 24);
    const [imgResults, vidResults, audResults] = await Promise.all([
      Promise.all(images.map((u, i) => createRequiredAtlasAsset(u, `seedance-img-${i}-${tag}`, 'Image'))),
      Promise.all(videos.map((u, i) => createRequiredAtlasAsset(u, `seedance-vid-${i}-${tag}`, 'Video'))),
      Promise.all(audios.map((u, i) => createRequiredAtlasAsset(u, `seedance-aud-${i}-${tag}`, 'Audio'))),
    ]);

    const refError =
      imgResults.find((r) => r.error)?.error ??
      vidResults.find((r) => r.error)?.error ??
      audResults.find((r) => r.error)?.error;
    if (refError) {
      if (videoId) await updateRow(admin, videoId, { status: 'failed', stage: 'failed', error: refError });
      return json({ status: 'failed', stage: 'failed', error: refError }, 400);
    }

    const assetImages = imgResults.map((r) => r.assetUrl!);
    const assetVideos = vidResults.map((r) => r.assetUrl!);
    const assetAudios = audResults.map((r) => r.assetUrl!);

    if (videoId) await updateRow(admin, videoId, { stage: 'queued' });

    // Generated audio has been the latest hard failure for image+video jobs.
    // Keep multimodal reference jobs visual-first unless the user supplied audio.
    const effectiveGenerateAudio = audios.length > 0 ? !!generateAudio : false;

    const requestedDuration = clampDuration(duration);
    const maxSafeDuration = videos.length > 0 ? 12 : 15;
    const safeDuration = requestedDuration === -1 ? -1 : Math.min(requestedDuration, maxSafeDuration);

    const baseSubmit = {
      prompt: promptText || 'The character in image 1 dances gracefully to the music',
      imageUrls: assetImages,
      videoUrls: assetVideos,
      audioUrls: assetAudios,
      duration: safeDuration,
      resolution: normRes(resolution),
      ratio: normRatio(ratio),
      variant: chosenVariant,
    };

    let submission = await atlasSubmit({ ...baseSubmit, generateAudio: effectiveGenerateAudio });
    let audioFallbackUsed = false;

    // Auto-retry visual-only on ANY audio-moderation failure, not just when the
    // user explicitly enabled audio. AtlasCloud sometimes flags generated audio
    // even when the request had generate_audio=false, so we retry once.
    if (!submission.ok && isGeneratedAudioModeration(submission.error)) {
      audioFallbackUsed = true;
      submission = await atlasSubmit({ ...baseSubmit, generateAudio: false });
    }

    if (!submission.ok) {
      log('WARN', 'submit failed', { err: submission.error });
      if (videoId) await updateRow(admin, videoId, { status: 'failed', stage: 'failed', error: submission.error });
      return json({ status: 'failed', stage: 'failed', error: submission.error });
    }

    if (videoId) {
      await updateRow(admin, videoId, {
        provider: 'atlascloud',
        task_id: submission.predictionId,
        status: 'processing',
        stage: 'processing',
        error: null,
      });
    }

    log('INFO', 'submit ok', { predictionId: submission.predictionId, endpoint: submission.endpoint, audioFallbackUsed });

    return json({
      submitted: true,
      provider: 'atlascloud',
      taskId: submission.predictionId,
      endpoint: submission.endpoint,
      status: 'processing',
      stage: 'processing',
      audioFallbackUsed,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log('ERROR', 'unhandled', { err: msg });
    return json({ error: msg }, 500);
  }
});
