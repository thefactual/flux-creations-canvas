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
const BYTEPLUS_KEY = Deno.env.get('BYTEPLUS_ARK_API_KEY') ?? '';
const APIYI_KEY = Deno.env.get('APIYI_API_KEY') ?? '';

// Apiyi / laozhang.ai Seedance 2.0 proxy (https://docs.laozhang.ai/api-capabilities/seedance2-video-generation)
// Same Seedance 2.0 model, different reseller. Accepts public HTTPS URLs.
const APIYI_BASE = 'https://api.laozhang.ai/v1/videos';
const APIYI_MODEL = 'doubao-seedance-2-0-260128';
const APIYI_MODEL_FAST = 'doubao-seedance-2-0-fast-260128';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const ATLAS_BASE = 'https://api.atlascloud.ai/api/v1/model';
const ATLAS_ASSETS_BASE = 'https://console.atlascloud.ai/api/v1';

// BytePlus ModelArk (direct ByteDance) — fallback when AtlasCloud fails.
// Docs: https://docs.byteplus.com/en/docs/ModelArk/1520757
const BYTEPLUS_BASE = 'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks';
const BYTEPLUS_MODEL = 'dreamina-seedance-2-0-260128';
const BYTEPLUS_MODEL_FAST = 'dreamina-seedance-2-0-fast-260128';

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

function isAtlasDirectVideoUrl(url: string): boolean {
  // AtlasCloud reference_videos accepts normal public MP4/MOV URLs. Re-uploading
  // those through uploadMedia can return extensionless atlas-img URLs, which
  // Seedance then rejects as an invalid/unsupported reference file.
  return /\.(mp4|mov)(\?|#|$)/i.test(url);
}

function clampDuration(d: unknown): number {
  const n = Number(d);
  if (!Number.isFinite(n)) return 5;
  if (n === -1) return -1;
  return Math.max(4, Math.min(15, Math.round(n)));
}

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth'];
function ordinal(n: number, kind: 'image' | 'video' | 'audio'): string {
  const word = n >= 1 && n <= 9 ? ORDINALS[n - 1] : `${n}th`;
  return `the ${word} reference ${kind}`;
}

// Resolve any leftover @image_N / @video_N / @audio_N tokens to natural
// language and add an explicit "Edit the reference video" frame for edit-style
// prompts. Mirrors the client resolver so retries and direct API calls also
// produce a model-friendly prompt.
function resolvePromptTags(prompt: string, counts: { images: number; videos: number; audios: number }): string {
  let out = prompt.replace(/@(image|video|audio)_(\d+)/gi, (match, kindRaw: string, idxRaw: string) => {
    const kind = kindRaw.toLowerCase() as 'image' | 'video' | 'audio';
    const idx = parseInt(idxRaw, 10);
    const cap = kind === 'image' ? counts.images : kind === 'video' ? counts.videos : counts.audios;
    if (!Number.isFinite(idx) || idx < 1 || idx > cap) return match;
    if (kind === 'video' && cap === 1) return 'the reference video';
    if (kind === 'audio' && cap === 1) return 'the reference audio';
    return ordinal(idx, kind);
  });
  const hasEditVerb = /\b(replace|swap|change|put|add|remove|insert|turn|make .* into)\b/i.test(prompt);
  const alreadyFramed = /^edit the reference video:/i.test(out);
  if (hasEditVerb && counts.videos > 0 && !alreadyFramed) {
    out = `Edit the reference video: ${out}. Keep everything else identical to the reference video — same person, same setting, same motion, same lighting.`;
  }
  out = out.replace(/\b(this|that|these|those)\s+the\s+(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)\s+reference\s+(image|video|audio)\b/gi,
    (_m, _det, ord, kind) => `the ${ord} reference ${kind}`);
  out = out.replace(/\bto\s+this\s+the\s+reference\s+(video|audio)\b/gi, 'to the reference $1');
  return out.trim();
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
  if (/input video.*sensitive|input video.*real person|PrivacyInformation/i.test(raw)) {
    return 'BytePlus Seedance 2.0 rejected the reference video because it may contain a real person/privacy information. Try a shorter clip, a different framing, or remove the reference video.';
  }
  if (/input image.*sensitive|input image.*real person|sensitive content/i.test(raw)) {
    return 'BytePlus Seedance 2.0 rejected the reference image because it may contain a real person/privacy information. Try a different photo, crop/blur the face, or remove that reference.';
  }
  if (/reference asset was rejected|check the URL, format, and size|unsupported format/i.test(raw)) {
    return 'AtlasCloud rejected a reference file. Reference videos must be MP4/MOV at 480p/720p, under 50MB, and total video reference duration must stay under 15s.';
  }
  return raw;
}

function isInputPrivacyRejection(raw: string | undefined): boolean {
  return /Input(Image|Video)SensitiveContentDetected\.PrivacyInformation|input (image|video).*real person|may contain real person|privacy information/i.test(raw ?? '');
}

function isGeneratedAudioModeration(raw: string | undefined): boolean {
  return /output audio.*sensitive|generated audio/i.test(raw ?? '');
}

function isBalanceError(status: number, body: string) {
  if (status === 401 || status === 402) return true;
  return /balance|exhausted|locked|insufficient|top.?up/i.test(body);
}

function normalizeProvider(raw: unknown): 'atlas' | 'byteplus' | 'apiyi' | '' {
  const v = String(raw ?? '').toLowerCase().trim();
  if (!v) return '';
  if (v.startsWith('atlas')) return 'atlas';
  if (v.startsWith('apiyi') || v.includes('laozhang')) return 'apiyi';
  if (v.startsWith('byteplus')) return 'byteplus';
  return '';
}

function inferProviderFromTaskId(taskId: string): 'atlas' | 'byteplus' {
  // AtlasCloud prediction ids are 32-char lowercase hex. BytePlus task ids are
  // not, so this prevents legacy rows with provider=null from polling BytePlus
  // with an Atlas id and getting permanent "resource not found" failures.
  return /^[a-f0-9]{32}$/i.test(taskId) ? 'atlas' : 'byteplus';
}

function resolvePollProvider(rawProvider: unknown, taskId: string): 'atlas' | 'byteplus' | 'apiyi' {
  // Never allow stale client/database provider values to override the concrete
  // AtlasCloud id shape. This is the permanent guard against Atlas jobs being
  // polled through BytePlus and failing with "resource not found".
  if (/^[a-f0-9]{32}$/i.test(taskId)) return 'atlas';
  return normalizeProvider(rawProvider) || inferProviderFromTaskId(taskId);
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

function filenameForAtlasUpload(rawUrl: string, blobType: string, label: string): string {
  const lowerType = blobType.toLowerCase();
  const ext = lowerType.includes('quicktime') || lowerType.includes('mov')
    ? 'mov'
    : lowerType.includes('webm')
      ? 'webm'
      : lowerType.includes('audio')
        ? (lowerType.includes('mpeg') ? 'mp3' : lowerType.includes('wav') ? 'wav' : 'm4a')
        : 'mp4';
  return filenameFromUrl(rawUrl, `${label}.${ext}`).replace(/\.[^/.]+$/, `.${ext}`);
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
  form.append('file', blob, filenameForAtlasUpload(rawUrl, blob.type, label));
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
    // reference_videos accept public MP4/MOV URLs directly. Prefer the original
    // storage URL when it has a supported extension so the generation request
    // does not receive an extensionless uploadMedia URL.
    if (isAtlasDirectVideoUrl(rawUrl)) return { assetUrl: rawUrl };
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

// ===== BytePlus ModelArk fallback =====
// Submit a Seedance 2.0 job directly to ByteDance via ModelArk. Accepts public
// HTTPS URLs in `content[]`, no asset registration required. Used when the
// AtlasCloud path fails (balance, persistent moderation, timeout).
async function byteplusSubmit(p: SubmitParams): Promise<{ ok: true; predictionId: string; endpoint: string } | { ok: false; error: string }> {
  if (!BYTEPLUS_KEY) return { ok: false, error: 'BytePlus fallback not configured (BYTEPLUS_ARK_API_KEY missing).' };

  const content: Array<Record<string, unknown>> = [];
  if (p.prompt) content.push({ type: 'text', text: p.prompt });
  for (const url of p.imageUrls) {
    content.push({ type: 'image_url', image_url: { url }, role: 'reference_image' });
  }
  for (const url of p.videoUrls) {
    content.push({ type: 'video_url', video_url: { url }, role: 'reference_video' });
  }
  for (const url of p.audioUrls) {
    content.push({ type: 'audio_url', audio_url: { url }, role: 'reference_audio' });
  }

  const useFast = p.variant === SEEDANCE_FAST;
  const body: Record<string, unknown> = {
    model: useFast ? BYTEPLUS_MODEL_FAST : BYTEPLUS_MODEL,
    content,
    duration: p.duration,
    resolution: normRes(p.resolution),
    ratio: normRatio(p.ratio),
    generate_audio: p.generateAudio,
    watermark: false,
  };

  log('INFO', 'byteplus submit', {
    model: body.model,
    images: p.imageUrls.length,
    videos: p.videoUrls.length,
    audios: p.audioUrls.length,
    duration: p.duration,
    resolution: body.resolution,
    ratio: body.ratio,
    generateAudio: p.generateAudio,
  });

  const res = await fetch(BYTEPLUS_BASE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${BYTEPLUS_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any = {};
  try { parsed = JSON.parse(text); } catch { /* keep text */ }
  const taskId = parsed?.id;
  if (!res.ok || !taskId) {
    const rawMsg = parsed?.error?.message ?? parsed?.message ?? text ?? `http ${res.status}`;
    log('WARN', 'byteplus submit failed', { status: res.status, body: text.slice(0, 400) });
    return { ok: false, error: friendly(`BytePlus: ${rawMsg}`) };
  }
  return { ok: true, predictionId: String(taskId), endpoint: String(body.model) };
}

async function byteplusPoll(taskId: string) {
  const res = await fetch(`${BYTEPLUS_BASE}/${taskId}`, {
    headers: { Authorization: `Bearer ${BYTEPLUS_KEY}` },
  });
  const text = await res.text();
  let parsed: any = {};
  try { parsed = JSON.parse(text); } catch { /* keep text */ }
  if (!res.ok) {
    return { status: 'failed' as const, error: friendly(parsed?.error?.message ?? parsed?.message ?? text ?? `poll http ${res.status}`) };
  }
  const status = String(parsed?.status ?? '').toLowerCase();
  if (status === 'succeeded') {
    const videoUrl = parsed?.content?.video_url;
    return videoUrl ? { status: 'done' as const, videoUrl: String(videoUrl) } : { status: 'failed' as const, error: 'BytePlus completed without a video URL' };
  }
  if (status === 'failed' || status === 'expired' || status === 'cancelled') {
    return { status: 'failed' as const, error: friendly(parsed?.error?.message ?? `BytePlus reported ${status}`) };
  }
  return { status: 'processing' as const };
}

// ===== Apiyi / laozhang.ai (Seedance 2.0 reseller) =====
async function apiyiSubmit(p: SubmitParams): Promise<{ ok: true; predictionId: string; endpoint: string } | { ok: false; error: string }> {
  if (!APIYI_KEY) return { ok: false, error: 'Apiyi not configured (APIYI_API_KEY missing).' };

  const useFast = p.variant === SEEDANCE_FAST;
  const model = useFast ? APIYI_MODEL_FAST : APIYI_MODEL;

  const hasRefs = p.imageUrls.length || p.videoUrls.length || p.audioUrls.length;

  const body: Record<string, unknown> = {
    model,
    prompt: p.prompt,
    ratio: normRatio(p.ratio),
    duration: p.duration,
    watermark: false,
    generate_audio: p.generateAudio,
  };

  if (hasRefs) {
    const content: Array<Record<string, unknown>> = [{ type: 'text', text: p.prompt }];
    for (const url of p.imageUrls) content.push({ type: 'image_url', image_url: { url }, role: 'reference_image' });
    for (const url of p.videoUrls) content.push({ type: 'video_url', video_url: { url }, role: 'reference_video' });
    for (const url of p.audioUrls) content.push({ type: 'audio_url', audio_url: { url }, role: 'reference_audio' });
    body.content = content;
  }

  log('INFO', 'apiyi submit', {
    model,
    images: p.imageUrls.length,
    videos: p.videoUrls.length,
    audios: p.audioUrls.length,
    duration: p.duration,
    ratio: body.ratio,
    generateAudio: p.generateAudio,
  });

  const res = await fetch(APIYI_BASE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${APIYI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any = {};
  try { parsed = JSON.parse(text); } catch { /* keep text */ }
  const taskId = parsed?.id;
  if (!res.ok || !taskId) {
    const rawMsg = parsed?.error?.message ?? parsed?.message ?? text ?? `http ${res.status}`;
    log('WARN', 'apiyi submit failed', { status: res.status, body: text.slice(0, 400) });
    return { ok: false, error: friendly(`Apiyi: ${rawMsg}`) };
  }
  return { ok: true, predictionId: String(taskId), endpoint: model };
}

async function apiyiPoll(taskId: string) {
  const res = await fetch(`${APIYI_BASE}/${taskId}`, {
    headers: { Authorization: `Bearer ${APIYI_KEY}` },
  });
  const text = await res.text();
  let parsed: any = {};
  try { parsed = JSON.parse(text); } catch { /* keep text */ }
  if (!res.ok) {
    return { status: 'failed' as const, error: friendly(parsed?.error?.message ?? parsed?.message ?? text ?? `poll http ${res.status}`) };
  }
  const status = String(parsed?.status ?? '').toLowerCase();
  if (status === 'completed' || status === 'succeeded') {
    const videoUrl = parsed?.video_url ?? parsed?.url;
    return videoUrl ? { status: 'done' as const, videoUrl: String(videoUrl) } : { status: 'failed' as const, error: 'Apiyi completed without a video URL' };
  }
  if (status === 'failed' || status === 'expired' || status === 'cancelled') {
    return { status: 'failed' as const, error: friendly(parsed?.error?.message ?? `Apiyi reported ${status}`) };
  }
  return { status: 'processing' as const };
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
  if (!BYTEPLUS_KEY && !ATLAS_KEY) return json({ error: 'No Seedance provider configured (set BYTEPLUS_ARK_API_KEY or ATLASCLOUD_API_KEY).' }, 500);

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json();
    const action = body?.action ?? 'submit';

    // ----- POLL -----
    if (action === 'poll') {
      const predictionId = String(body.predictionId ?? body.taskId ?? '').trim();
      const videoId = String(body.videoId ?? '').trim();
      if (!predictionId) return json({ error: 'predictionId required' }, 400);
      const provider = resolvePollProvider(body.provider, predictionId);

      const out = provider === 'atlas'
        ? await atlasPoll(predictionId)
        : provider === 'apiyi'
          ? await apiyiPoll(predictionId)
          : await byteplusPoll(predictionId);
      if (out.status === 'done') {
        if (videoId) await updateRow(admin, videoId, { status: 'complete', stage: 'complete', video_url: out.videoUrl, error: null, provider });
        return json({ status: 'complete', stage: 'complete', videoUrl: out.videoUrl });
      }
      if (out.status === 'failed') {
        if (videoId) await updateRow(admin, videoId, { status: 'failed', stage: 'failed', error: out.error, provider });
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

    const safeDuration = clampDuration(duration);
    // Sound enabled — honor the client's generateAudio flag (defaults to true).
    // If Seedance flags the generated audio, the friendly() helper surfaces a
    // "Turn Sound OFF" hint to the user.
    const effectiveGenerateAudio = generateAudio !== false;
    const submittedAudios = effectiveGenerateAudio ? audios : [];

    // ===== BytePlus ModelArk =====
    // Accepts raw HTTPS URLs in content[]. No asset registration step.
    const tryByteplus = async (variantOverride?: string): Promise<{ ok: true; predictionId: string; endpoint: string; provider: 'byteplus'; audioFallbackUsed: boolean } | { ok: false; error: string }> => {
      if (!BYTEPLUS_KEY) return { ok: false, error: 'BytePlus not configured' };

      const variantUsed = variantOverride ?? chosenVariant;
      const resolvedPrompt = resolvePromptTags(promptText, {
        images: images.length, videos: videos.length, audios: audios.length,
      });
      log('INFO', 'byteplus resolved prompt', { resolved: resolvedPrompt.slice(0, 240), variant: variantUsed });

      const baseSubmit = {
        prompt: resolvedPrompt || 'The character in image 1 dances gracefully to the music',
        imageUrls: images,
        videoUrls: videos,
        audioUrls: submittedAudios,
        duration: safeDuration,
        resolution: normRes(resolution),
        ratio: normRatio(ratio),
        variant: variantUsed,
      };
      let submission = await byteplusSubmit({ ...baseSubmit, generateAudio: effectiveGenerateAudio });
      let audioFallbackUsed = false;
      if (!submission.ok && isGeneratedAudioModeration(submission.error)) {
        audioFallbackUsed = true;
        submission = await byteplusSubmit({ ...baseSubmit, generateAudio: false });
      }
      if (!submission.ok) return { ok: false, error: submission.error };
      return { ok: true, predictionId: submission.predictionId, endpoint: submission.endpoint, provider: 'byteplus', audioFallbackUsed };
    };

    // ===== AtlasCloud Seedance 2.0 fallback =====
    // Requires sd/assets registration for images (avoids real-person moderation).
    const tryAtlas = async (): Promise<{ ok: true; predictionId: string; endpoint: string; provider: 'atlas'; audioFallbackUsed: boolean } | { ok: false; error: string }> => {
      if (!ATLAS_KEY) return { ok: false, error: 'AtlasCloud not configured' };

      const imageAssets: string[] = [];
      for (let i = 0; i < images.length; i++) {
        const r = await createRequiredAtlasAsset(images[i], `ref-image-${i + 1}`, 'Image');
        if (r.error || !r.assetUrl) return { ok: false, error: r.error ?? 'AtlasCloud asset registration failed' };
        imageAssets.push(r.assetUrl);
      }
      const videoAssets: string[] = [];
      for (let i = 0; i < videos.length; i++) {
        const r = await createRequiredAtlasAsset(videos[i], `ref-video-${i + 1}`, 'Video');
        if (r.error || !r.assetUrl) return { ok: false, error: r.error ?? 'AtlasCloud video upload failed' };
        videoAssets.push(r.assetUrl);
      }
      const audioAssets: string[] = [];
      for (let i = 0; i < submittedAudios.length; i++) {
        const r = await createRequiredAtlasAsset(submittedAudios[i], `ref-audio-${i + 1}`, 'Audio');
        if (r.error || !r.assetUrl) return { ok: false, error: r.error ?? 'AtlasCloud audio upload failed' };
        audioAssets.push(r.assetUrl);
      }

      const resolvedPrompt = resolvePromptTags(promptText, {
        images: images.length, videos: videos.length, audios: submittedAudios.length,
      });
      log('INFO', 'atlas resolved prompt', { resolved: resolvedPrompt.slice(0, 240), variant: chosenVariant });

      const baseSubmit = {
        prompt: resolvedPrompt || 'The character in image 1 dances gracefully to the music',
        imageUrls: imageAssets,
        videoUrls: videoAssets,
        audioUrls: audioAssets,
        duration: safeDuration,
        resolution: normRes(resolution),
        ratio: normRatio(ratio),
        variant: chosenVariant,
      };
      let submission = await atlasSubmit({ ...baseSubmit, generateAudio: effectiveGenerateAudio });
      let audioFallbackUsed = false;
      if (!submission.ok && isGeneratedAudioModeration(submission.error)) {
        audioFallbackUsed = true;
        submission = await atlasSubmit({ ...baseSubmit, generateAudio: false });
      }
      if (!submission.ok) return { ok: false, error: submission.error };
      return { ok: true, predictionId: submission.predictionId, endpoint: submission.endpoint, provider: 'atlas', audioFallbackUsed };
    };

    // ===== Attempt 0 (PRIMARY): Apiyi / laozhang.ai =====
    // Reseller proxy for Seedance 2.0. Accepts public HTTPS URLs directly,
    // no asset registration. Currently the main test path.
    const tryApiyi = async (): Promise<{ ok: true; predictionId: string; endpoint: string; provider: 'apiyi'; audioFallbackUsed: boolean } | { ok: false; error: string }> => {
      if (!APIYI_KEY) return { ok: false, error: 'Apiyi not configured' };
      const resolvedPrompt = resolvePromptTags(promptText, {
        images: images.length, videos: videos.length, audios: audios.length,
      });
      log('INFO', 'apiyi resolved prompt', { resolved: resolvedPrompt.slice(0, 240) });

      const baseSubmit = {
        prompt: resolvedPrompt || 'The character in image 1 dances gracefully to the music',
        imageUrls: images,
        videoUrls: videos,
        audioUrls: submittedAudios,
        duration: safeDuration,
        resolution: normRes(resolution),
        ratio: normRatio(ratio),
        variant: chosenVariant,
      };
      let submission = await apiyiSubmit({ ...baseSubmit, generateAudio: effectiveGenerateAudio });
      let audioFallbackUsed = false;
      if (!submission.ok && isGeneratedAudioModeration(submission.error)) {
        audioFallbackUsed = true;
        submission = await apiyiSubmit({ ...baseSubmit, generateAudio: false });
      }
      if (!submission.ok) return { ok: false, error: submission.error };
      return { ok: true, predictionId: submission.predictionId, endpoint: submission.endpoint, provider: 'apiyi', audioFallbackUsed };
    };

    if (videoId) await updateRow(admin, videoId, { stage: 'queued' });

    // AtlasCloud is the primary Seedance 2.0 route. BytePlus is only fallback.
    const attempts: Array<{ name: string; run: () => Promise<any> }> = [
      { name: 'atlas', run: () => tryAtlas() },
      { name: 'byteplus', run: () => tryByteplus() },
    ];
    if (chosenVariant !== SEEDANCE_FAST) {
      attempts.push({ name: 'byteplus-fast', run: () => tryByteplus(SEEDANCE_FAST) });
    }

    let result: any = { ok: false, error: 'No providers configured' };
    let usedFallback = false;
    const errors: string[] = [];
    for (let i = 0; i < attempts.length; i++) {
      const step = attempts[i];
      log('INFO', 'attempt', { step: step.name, index: i });
      result = await step.run();
      if (result.ok) {
        usedFallback = i > 0;
        break;
      }
      errors.push(`${step.name}: ${result.error}`);
      log('WARN', 'attempt failed', { step: step.name, error: result.error });
    }

    if (!result.ok) {
      const finalErr = errors.join(' | ');
      const failedProvider = errors.some((e) => e.startsWith('atlas:')) ? 'atlas' : errors.some((e) => e.startsWith('apiyi:')) ? 'apiyi' : 'byteplus';
      if (videoId) await updateRow(admin, videoId, { status: 'failed', stage: 'failed', error: finalErr, provider: failedProvider });
      return json({ status: 'failed', stage: 'failed', error: finalErr, provider: failedProvider });
    }

    if (videoId) {
      await updateRow(admin, videoId, {
        provider: result.provider,
        task_id: result.predictionId,
        status: 'processing',
        stage: 'processing',
        error: null,
      });
    }

    log('INFO', 'submit ok', { provider: result.provider, predictionId: result.predictionId, endpoint: result.endpoint, usedFallback, audioFallbackUsed: result.audioFallbackUsed });

    return json({
      submitted: true,
      provider: result.provider,
      taskId: result.predictionId,
      endpoint: result.endpoint,
      status: 'processing',
      stage: 'processing',
      audioFallbackUsed: result.audioFallbackUsed,
      usedFallback,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log('ERROR', 'unhandled', { err: msg });
    return json({ error: msg }, 500);
  }
});
