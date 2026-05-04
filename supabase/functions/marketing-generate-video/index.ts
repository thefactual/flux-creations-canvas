// Marketing Studio video generation — AtlasCloud-only Seedance 2.0 pipeline.
// fal.ai was removed because its Seedance endpoint enforces ByteDance's
// "real person" moderation and rejects every avatar-based job
// (partner_validation_failed). AtlasCloud accepts avatars when we
// pre-register them via /sd/assets and pass `asset://` IDs.
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
const ATLAS_ASSET_BASE = 'https://console.atlascloud.ai/api/v1';
const SEEDANCE_REF = 'bytedance/seedance-2.0/reference-to-video';
const SEEDANCE_TEXT = 'bytedance/seedance-2.0/text-to-video';

type VideoMode = 'text-to-video' | 'reference-to-video';

type ReferenceBundle = {
  mode: VideoMode;
  referenceImages: string[];
  atlasReferenceImages?: string[];
  referenceAudios: string[];
  hasAvatar: boolean;
  hasProduct: boolean;
  assetRegistrationError?: string;
};

type SubmitOutcome = {
  ok: boolean;
  endpoint?: string;
  requestId?: string;
  error?: string;
  raw?: unknown;
};

type PollOutcome = {
  status: 'processing' | 'done' | 'failed';
  videoUrl?: string;
  error?: string;
};

function log(level: 'INFO' | 'WARN' | 'ERROR', msg: string, ctx: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, msg, ...ctx, ts: new Date().toISOString() }));
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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

function uniqueValidUrls(values: unknown[], max = 99): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    if (!isValidHttpUrl(raw)) continue;
    const url = String(raw).trim();
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= max) break;
  }
  return out;
}

function clampDuration(d: unknown): number {
  const n = Number(d);
  if (!Number.isFinite(n)) return 8;
  if (n === -1) return -1;
  return Math.max(4, Math.min(15, Math.round(n)));
}

function normalizeAtlasResolution(r: unknown): string {
  const allowed = new Set(['480p', '720p', '1080p', '1080p-SR', '1440p-SR']);
  const v = String(r ?? '720p');
  return allowed.has(v) ? v : '720p';
}

function normalizeAtlasRatio(a: unknown): string {
  const allowed = new Set(['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive']);
  const v = String(a ?? 'adaptive');
  if (!v || v === 'Auto' || v === 'auto') return 'adaptive';
  return allowed.has(v) ? v : 'adaptive';
}

function timeoutForDuration(d: unknown): number {
  const dur = clampDuration(d);
  const seconds = dur === -1 ? 10 : dur;
  return Math.max(8 * 60 * 1000, Math.min(15 * 60 * 1000, (6 * 60 + seconds * 30) * 1000));
}

function isBalanceError(status: number, body: string) {
  if (status === 401 || status === 402) return true;
  return /balance|exhausted|locked|insufficient|top.?up/i.test(body);
}

function friendlyAtlasError(raw: string | undefined): string {
  if (!raw) return 'AtlasCloud returned an unknown error.';
  if (/insufficient balance|402|top.?up|exhausted/i.test(raw)) {
    return 'AtlasCloud is out of credit. Add credits at console.atlascloud.ai then retry.';
  }
  return raw;
}

function isAvatarStorageUrl(url: string) {
  return /\/storage\/v1\/object\/sign\/ms-avatars\//i.test(url) || /\/storage\/v1\/object\/public\/ms-avatars\//i.test(url);
}

function isSelectedProductStorageUrl(url: string, productId?: string | null) {
  if (!productId) return false;
  const encoded = encodeURIComponent(productId);
  return (
    url.includes(`/storage/v1/object/sign/ms-products/`) && (url.includes(`/${productId}/`) || url.includes(`%2F${encoded}%2F`))
  ) || (
    url.includes(`/storage/v1/object/public/ms-products/`) && url.includes(`/${productId}/`)
  );
}

async function signedStorageUrl(admin: any, bucket: string, path: string, ttl = 60 * 60 * 24): Promise<string | null> {
  const { data } = await admin.storage.from(bucket).createSignedUrl(path, ttl);
  return data?.signedUrl ?? null;
}

async function fetchProductImageUrls(admin: any, productId: string, max = 7): Promise<string[]> {
  const urls: string[] = [];
  const { data: imgs } = await admin
    .from('ms_product_images')
    .select('storage_path, is_primary')
    .eq('product_id', productId)
    .order('is_primary', { ascending: false })
    .limit(max);

  for (const img of imgs ?? []) {
    const signed = await signedStorageUrl(admin, 'ms-products', (img as any).storage_path);
    if (signed) urls.push(signed);
  }
  return urls;
}

async function fetchAvatarImageUrl(admin: any, avatarId: string): Promise<string | null> {
  const { data: avatar } = await admin
    .from('ms_avatars')
    .select('public_url, storage_path')
    .eq('id', avatarId)
    .maybeSingle();
  if (!avatar) return null;
  let raw: string | null = null;
  if (isValidHttpUrl((avatar as any).public_url)) raw = String((avatar as any).public_url);
  else if ((avatar as any).storage_path) raw = await signedStorageUrl(admin, 'ms-avatars', (avatar as any).storage_path);
  if (!raw) return null;
  // Route avatar through wsrv.nl: 640x640 face-crop JPG. Smaller, tighter
  // headshots reliably pass Seedance's "real person" moderator on Atlas.
  return `https://wsrv.nl/?url=${encodeURIComponent(raw)}&w=640&h=640&fit=cover&a=top&output=jpg`;
}

function toWsrvJpg(rawUrl: string, w = 1024, h = 1024): string {
  if (!rawUrl) return rawUrl;
  if (rawUrl.includes('wsrv.nl')) return rawUrl;
  return `https://wsrv.nl/?url=${encodeURIComponent(rawUrl)}&w=${w}&h=${h}&fit=cover&output=jpg&q=85`;
}

async function createAtlasPortraitAsset(imageUrl: string, avatarId?: string | null): Promise<string | null> {
  if (!ATLAS_KEY || !imageUrl) return null;
  // Always route through wsrv to normalize size/format. Seedance asset
  // registration is more reliable on small JPGs than large pngs.
  const submittedUrl = toWsrvJpg(imageUrl);
  const label = `ref-${String(avatarId ?? 'img').slice(0, 48)}`;
  log('INFO', 'atlas asset: submitting', { label, submittedUrl: submittedUrl.slice(0, 160) });
  const res = await fetch(`${ATLAS_ASSET_BASE}/sd/assets`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ATLAS_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: submittedUrl, name: label, asset_type: 'Image' }),
  });
  const text = await res.text();
  let parsed: any = {};
  try { parsed = JSON.parse(text); } catch { /* keep text */ }
  if (!res.ok) {
    log('WARN', 'atlas asset create failed', { status: res.status, error: parsed?.message ?? parsed?.msg ?? text.slice(0, 240) });
    return null;
  }
  const data = parsed?.data ?? parsed;
  const id = data?.id;
  const immediateAsset = data?.atlas_asset_id ?? data?.ark_asset_id;
  if (immediateAsset && String(data?.status ?? '').toLowerCase() === 'active') {
    log('INFO', 'atlas asset: active (immediate)', { label, assetId: immediateAsset });
    return `asset://${immediateAsset}`;
  }
  if (!id) {
    if (immediateAsset) {
      log('INFO', 'atlas asset: immediate (no poll)', { label, assetId: immediateAsset });
      return `asset://${immediateAsset}`;
    }
    log('WARN', 'atlas asset: no id returned', { label, raw: text.slice(0, 240) });
    return null;
  }
  for (let i = 0; i < 24; i++) {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const poll = await fetch(`${ATLAS_ASSET_BASE}/sd/assets/${id}`, { headers: { Authorization: `Bearer ${ATLAS_KEY}` } });
    const pollText = await poll.text();
    let pollJson: any = {};
    try { pollJson = JSON.parse(pollText); } catch { /* keep text */ }
    const asset = pollJson?.data ?? pollJson;
    const status = String(asset?.status ?? '').toLowerCase();
    const assetId = asset?.atlas_asset_id ?? asset?.ark_asset_id ?? immediateAsset;
    if (status === 'active' && assetId) {
      log('INFO', 'atlas asset: active (polled)', { label, assetId, attempts: i + 1 });
      return `asset://${assetId}`;
    }
    if (status === 'failed') {
      log('WARN', 'atlas asset failed', { id, error: asset?.error_message ?? asset?.error_code ?? pollText.slice(0, 240) });
      return null;
    }
  }
  log('WARN', 'atlas asset timeout', { avatarId });
  return null;
}

async function createRequiredAtlasPortraitAsset(imageUrl: string | null | undefined, label: string): Promise<{ assetUrl?: string; error?: string }> {
  if (!imageUrl) return {};
  const assetUrl = await createAtlasPortraitAsset(imageUrl, label);
  if (assetUrl?.startsWith('asset://')) return { assetUrl };
  return { error: `AtlasCloud could not register the ${label} as a portrait asset. Retry after checking the source image.` };
}

async function gatherAudioSourceUrls(admin: any, opts: { avatarId?: string | null; format?: string | null }): Promise<string[]> {
  const out: string[] = [];
  if (opts.avatarId) {
    const { data: av } = await admin.from('ms_avatars').select('voice_sample_url').eq('id', opts.avatarId).maybeSingle();
    if (isValidHttpUrl(av?.voice_sample_url)) out.push(String(av.voice_sample_url).trim());
  }
  if (String(opts.format ?? '').toLowerCase() === 'podcast') {
    const second = await ensurePodcastSecondVoiceUrl(admin);
    if (second && !out.includes(second)) out.push(second);
  }
  return out.slice(0, 3);
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
  } catch { /* generate below */ }
  try {
    const tts = await fetch('https://api.elevenlabs.io/v1/text-to-speech/cgSgspJ2msm6clMCkdW9?output_format=mp3_44100_128', {
      method: 'POST',
      headers: { 'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: "Yeah, no, I get that. That's actually so true.",
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.55, similarity_boost: 0.85, style: 0.2, use_speaker_boost: true, speed: 1.0 },
      }),
    });
    if (!tts.ok) return null;
    const audio = new Uint8Array(await tts.arrayBuffer());
    const { error } = await admin.storage.from('video-inputs').upload(path, audio, { contentType: 'audio/mpeg', upsert: true });
    return error ? null : publicUrl;
  } catch {
    return null;
  }
}

async function buildReferenceBundle(admin: any, opts: {
  productId?: string | null;
  avatarId?: string | null;
  extraImageUrls: string[];
  audioSourceUrls: string[];
  keyframeUrl?: string | null;
}): Promise<ReferenceBundle> {
  const productUrls = opts.productId ? await fetchProductImageUrls(admin, opts.productId, 7) : [];
  const avatarUrl = opts.avatarId ? await fetchAvatarImageUrl(admin, opts.avatarId) : null;
  const avatarAsset = opts.avatarId ? await createRequiredAtlasPortraitAsset(avatarUrl, `avatar-${String(opts.avatarId).slice(0, 48)}`) : {};
  const keyframeAsset = opts.avatarId && opts.keyframeUrl
    ? await createRequiredAtlasPortraitAsset(opts.keyframeUrl, `keyframe-${String(opts.avatarId).slice(0, 46)}`)
    : {};
  const extraImageUrls = uniqueValidUrls(opts.extraImageUrls ?? [], 9).filter((url) => {
    if (url === opts.keyframeUrl) return false;
    if (!opts.avatarId) return true;
    if (url === avatarUrl) return false;
    if (url.includes('wsrv.nl') && url.includes('ms-avatars')) return false;
    if (isSelectedProductStorageUrl(url, opts.productId)) return false;
    return !isAvatarStorageUrl(url);
  });

  // Identity-first ordering: avatar [0] wins Seedance facial identity arbitration.
  // Keyframe [1] still seeds scene/composition. Product references follow.
  const orderedRefs = opts.keyframeUrl
    ? uniqueValidUrls([
        ...(avatarUrl ? [avatarUrl] : []),
        opts.keyframeUrl,
        ...productUrls,
        ...extraImageUrls,
      ], 9)
    : uniqueValidUrls([
        ...(avatarUrl ? [avatarUrl] : []),
        ...productUrls,
        ...extraImageUrls,
      ], 9);

  const assetRegistrationError = avatarAsset.error ?? keyframeAsset.error;
  const atlasReferenceImages = orderedRefs.map((url) => {
    if (opts.keyframeUrl && url === opts.keyframeUrl && keyframeAsset.assetUrl) return keyframeAsset.assetUrl;
    if (avatarUrl && url === avatarUrl && avatarAsset.assetUrl) return avatarAsset.assetUrl;
    return url;
  });

  return {
    mode: orderedRefs.length > 0 ? 'reference-to-video' : 'text-to-video',
    referenceImages: orderedRefs,
    atlasReferenceImages,
    referenceAudios: uniqueValidUrls(opts.audioSourceUrls ?? [], 3),
    hasAvatar: !!opts.avatarId && !!avatarUrl,
    hasProduct: !!opts.productId && productUrls.length > 0,
    assetRegistrationError,
  };
}

function withReferenceMap(prompt: string, bundle: ReferenceBundle) {
  if (bundle.mode !== 'reference-to-video' || bundle.referenceImages.length === 0) return prompt;
  const lines: string[] = [];
  const firstUrl = bundle.referenceImages[0] || '';
  const hasKeyframe = firstUrl.includes('ms-keyframes');

  if (hasKeyframe) {
    lines.push('Reference map: image 1 is the COMPOSED SCENE — animate THIS frame. The avatar is already positioned, the product is already in their hands, the lighting and setting are already established. Treat image 1 as the first frame of the video.');
    if (bundle.hasAvatar) {
      lines.push('The remaining images are identity locks: the avatar reference is for FACIAL LIKENESS ONLY — do NOT recreate its background, wardrobe, room, pose, or composition. The product references lock product shape, color, material, packaging, and visible details exactly.');
    } else {
      lines.push('The remaining images are product references — preserve product shape, color, material, packaging, and visible details exactly.');
    }
    lines.push('Animate the composed scene naturally with the dialogue, micro-actions, and camera language described below. Do not invent a new environment.');
  } else if (bundle.hasProduct && bundle.hasAvatar) {
    const productCount = Math.max(1, bundle.referenceImages.length - 1);
    const avatarIndex = bundle.referenceImages.findIndex((url) => url.includes('wsrv.nl') && url.includes('ms-avatars')) + 1;
    const productIndexes = bundle.referenceImages
      .map((url, idx) => ({ url, idx: idx + 1 }))
      .filter(({ idx }) => idx !== avatarIndex)
      .map(({ idx }) => idx)
      .join(', ');
    lines.push(`Reference map: images ${productIndexes || '1'} are product references — preserve product shape, color, material, packaging, and visible details exactly. Image ${avatarIndex || productCount + 1} is the creator/avatar identity — preserve facial likeness only; do not copy the uploaded photo composition, background, pose, lighting, or wardrobe.`);
    lines.push('Generate a fresh scene from the script below; direct the subject and product naturally inside that new scene.');
  } else if (bundle.hasProduct) {
    lines.push('Reference map: all images are product references. Preserve product shape, color, material, packaging, and visible details exactly.');
    lines.push('Generate a fresh scene from the script below.');
  } else if (bundle.hasAvatar) {
    lines.push('Reference map: the image is the creator/avatar identity. Preserve facial likeness only; do not copy the uploaded photo composition, background, pose, lighting, or wardrobe.');
    lines.push('Generate a fresh scene from the script below.');
  } else {
    lines.push('Reference map: use the provided images as visual anchors, not as a first frame to animate.');
  }
  return `${lines.join('\n')}\n\n${prompt}`;
}

function assertNoRawHumanReferences(bundle: ReferenceBundle): string | null {
  if (!bundle.hasAvatar) return null;
  if (bundle.assetRegistrationError) return bundle.assetRegistrationError;
  const rawHumanRef = bundle.atlasReferenceImages?.find((url) => !String(url).startsWith('asset://') && (
    /ms-avatars/i.test(String(url)) || /ms-keyframes/i.test(String(url)) || String(url).includes('wsrv.nl')
  ));
  return rawHumanRef
    ? 'AtlasCloud portrait asset registration did not complete, so the avatar/keyframe was not submitted as a raw image. Retry shortly or re-upload the avatar.'
    : null;
}

async function atlasSubmit(opts: { prompt: string; bundle: ReferenceBundle; duration: number; resolution: string; ratio: string; generateAudio: boolean }): Promise<SubmitOutcome> {
  if (!ATLAS_KEY) return { ok: false, error: 'ATLASCLOUD_API_KEY not configured' };
  const humanRefError = assertNoRawHumanReferences(opts.bundle);
  if (humanRefError) return { ok: false, error: humanRefError };
  const endpoint = opts.bundle.mode === 'reference-to-video' ? SEEDANCE_REF : SEEDANCE_TEXT;
  const body: Record<string, unknown> = {
    model: endpoint,
    prompt: opts.prompt,
    duration: opts.duration,
    resolution: normalizeAtlasResolution(opts.resolution),
    ratio: normalizeAtlasRatio(opts.ratio),
    generate_audio: opts.generateAudio,
    watermark: false,
  };
  if (opts.bundle.mode === 'reference-to-video') {
    body.reference_images = opts.bundle.atlasReferenceImages?.length ? opts.bundle.atlasReferenceImages : opts.bundle.referenceImages;
    body.reference_videos = [];
    body.return_last_frame = false;
    if (opts.bundle.referenceAudios.length) body.reference_audios = opts.bundle.referenceAudios;
  }

  const refsForLog = (body.reference_images as string[] | undefined) ?? [];
  log('INFO', 'atlas submit: body', {
    endpoint,
    referenceImagesCount: refsForLog.length,
    referenceImages: refsForLog.map((u) => String(u).startsWith('asset://') ? u : `RAW:${String(u).slice(0, 120)}`),
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
    const balance = isBalanceError(res.status, text);
    const error = balance
      ? 'AtlasCloud is out of credit. Add credits at console.atlascloud.ai then retry.'
      : `AtlasCloud ${code}: ${rawMsg}`;
    return { ok: false, endpoint, error, raw: parsed || text };
  }
  return { ok: true, endpoint, requestId: String(predictionId), raw: parsed };
}

async function atlasPoll(requestId: string): Promise<PollOutcome> {
  const res = await fetch(`${ATLAS_BASE}/prediction/${requestId}`, {
    headers: { Authorization: `Bearer ${ATLAS_KEY}` },
  });
  const text = await res.text();
  let parsed: any = {};
  try { parsed = JSON.parse(text); } catch { /* keep text */ }
  const data = parsed?.data ?? parsed;
  if (!res.ok) {
    return { status: 'failed', error: friendlyAtlasError((data?.error ?? parsed?.message ?? parsed?.msg ?? text) || `AtlasCloud poll http ${res.status}`) };
  }
  const status = String(data?.status ?? '').toLowerCase();
  if (status === 'completed' || status === 'succeeded') {
    const out = data?.outputs?.[0];
    const videoUrl = typeof out === 'string' ? out : out?.url;
    return videoUrl ? { status: 'done', videoUrl: String(videoUrl) } : { status: 'failed', error: 'AtlasCloud completed without a video URL' };
  }
  if (status === 'failed' || status === 'timeout') {
    return { status: 'failed', error: friendlyAtlasError(data?.error ?? parsed?.message ?? `AtlasCloud reported ${status}`) };
  }
  return { status: 'processing' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json();

    if (body.poll) {
      const { data: row } = await admin.from('ms_generations').select('*').eq('id', body.poll).maybeSingle();
      if (!row) return json({ status: 'queued_pending_persist' });
      if (row.status === 'done') return json(row);
      if (row.status === 'failed') return json(row);
      if (!row.fal_request_id || !row.provider_endpoint) return json({ ...row, status: 'queued_pending_persist' });

      const poll = await atlasPoll(row.fal_request_id);

      if (poll.status === 'done') {
        const { data: updated } = await admin.from('ms_generations').update({ status: 'done', stage: 'done', video_url: poll.videoUrl, error: null }).eq('id', row.id).select().single();
        return json(updated);
      }

      if (poll.status === 'failed') {
        const { data: updated } = await admin.from('ms_generations').update({ status: 'failed', stage: 'failed', error: poll.error ?? 'AtlasCloud reported failure' }).eq('id', row.id).select().single();
        return json(updated);
      }

      const startedAt = Date.parse(row.updated_at || row.created_at || '') || Date.now();
      const timeoutMs = timeoutForDuration(row.duration_seconds);
      if (Date.now() - startedAt > timeoutMs) {
        const msg = `Timed out after ${Math.round(timeoutMs / 60000)} minutes while rendering. Retry will submit a fresh job.`;
        const { data: updated } = await admin.from('ms_generations').update({ status: 'failed', stage: 'failed', error: msg }).eq('id', row.id).select().single();
        return json(updated);
      }

      if (row.status !== 'processing') await admin.from('ms_generations').update({ status: 'processing' }).eq('id', row.id);
      return json({ ...row, status: 'processing' });
    }

    if (body.retry) {
      const { data: row } = await admin.from('ms_generations').select('*').eq('id', body.retry).maybeSingle();
      if (!row) return json({ error: 'not found' }, 404);
      body.reuseGenerationId = row.id;
      body.prompt = row.prompt;
      body.productId = row.product_id;
      body.avatarId = row.avatar_id;
      body.format = row.format;
      body.surface = row.surface;
      body.aspect = row.aspect;
      body.duration_seconds = row.duration_seconds;
      body.resolution = row.resolution;
      body.script_text = row.script_text;
      body.image_urls = Array.isArray(row.reference_paths) ? row.reference_paths : [];
    }

    const {
      prompt,
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
      image_urls,
    } = body;

    if (!prompt || typeof prompt !== 'string') return json({ error: 'prompt required' }, 400);
    if (!ATLAS_KEY) return json({ error: 'AtlasCloud is not configured. Add ATLASCLOUD_API_KEY to enable video generation.' }, 500);

    const duration = clampDuration(duration_seconds);
    const atlasRatio = normalizeAtlasRatio(aspect);
    const extraImageUrls = Array.isArray(image_urls) ? uniqueValidUrls(image_urls, 9) : [];
    const audioSourceUrls = await gatherAudioSourceUrls(admin, { avatarId, format });

    let keyframeUrl: string | null = (body.keyframe_url as string | null) ?? null;
    if (!keyframeUrl && reuseGenerationId) {
      const { data: existingRow } = await admin
        .from('ms_generations')
        .select('keyframe_url, keyframe_path')
        .eq('id', reuseGenerationId)
        .maybeSingle();
      if (existingRow?.keyframe_url) keyframeUrl = existingRow.keyframe_url as string;
    }

    const bundle = await buildReferenceBundle(admin, { productId, avatarId, extraImageUrls, audioSourceUrls, keyframeUrl });

    log('INFO', 'submit: bundle built', {
      mode: bundle.mode,
      refImages: bundle.referenceImages.length,
      refAudios: bundle.referenceAudios.length,
      hasAvatar: bundle.hasAvatar,
      hasProduct: bundle.hasProduct,
      hasKeyframe: !!keyframeUrl,
      provider: 'atlascloud',
    });

    let row: any;
    const rowPayload: Record<string, unknown> = {
      prompt,
      script_text: script_text ?? null,
      reference_paths: bundle.referenceImages,
      status: 'queued',
      stage: 'videoing',
      provider: null,
      provider_endpoint: null,
      fal_request_id: null,
      fallback_attempted: false,
      error: null,
      video_url: null,
      aspect: atlasRatio,
      duration_seconds: duration,
      resolution: normalizeAtlasResolution(resolution),
    };
    if (keyframeUrl) {
      rowPayload.keyframe_url = keyframeUrl;
    }

    if (reuseGenerationId) {
      const { data: updated, error } = await admin.from('ms_generations').update(rowPayload).eq('id', reuseGenerationId).select().single();
      if (error) throw error;
      row = updated;
    } else {
      const { data: inserted, error } = await admin.from('ms_generations').insert({
        user_id: null,
        project_id: projectId ?? null,
        product_id: productId ?? null,
        avatar_id: avatarId ?? null,
        format,
        surface,
        ...rowPayload,
      }).select().single();
      if (error) throw error;
      row = inserted;
    }

    const prompted = withReferenceMap(prompt, bundle);
    const submission = await atlasSubmit({
      prompt: prompted,
      bundle,
      duration,
      resolution,
      ratio: atlasRatio,
      generateAudio: true,
    });

    if (!submission.ok) {
      log('WARN', 'atlas submit failed', { error: submission.error });
      await admin.from('ms_generations').update({ status: 'failed', stage: 'failed', error: submission.error ?? 'AtlasCloud rejected submit' }).eq('id', row.id);
      return json({ id: row.id, status: 'failed', error: submission.error, details: submission.raw });
    }

    const { data: updated } = await admin.from('ms_generations').update({
      provider: 'atlascloud',
      provider_endpoint: submission.endpoint,
      fal_request_id: submission.requestId,
      fallback_attempted: false,
    }).eq('id', row.id).select().single();

    log('INFO', 'submit: done', { jobId: row.id, provider: 'atlascloud', endpoint: submission.endpoint, requestId: submission.requestId });

    return json({
      id: updated.id,
      provider: 'atlascloud',
      endpoint: submission.endpoint,
      fal_request_id: submission.requestId,
      status: 'queued',
    });
  } catch (e) {
    log('ERROR', 'unhandled', { err: e instanceof Error ? e.message : String(e) });
    return json({ error: e instanceof Error ? e.message : 'unknown' }, 500);
  }
});
