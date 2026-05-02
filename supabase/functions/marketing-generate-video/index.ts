// Multi-provider Seedance video generation.
// Provider chain: AtlasCloud (primary) -> fal.ai (fallback)
//
// Routes (POST):
//   { prompt, image_urls, aspect, duration_seconds, resolution, ... }
//        -> persists ms_generations row, submits to first available provider, returns {id, provider, status}
//   { poll: id }   -> polls correct provider, updates row
//   { retry: id }  -> resubmits using stored params (re-runs provider chain)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ATLAS_KEY = Deno.env.get('ATLASCLOUD_API_KEY') ?? '';
const FAL_KEY = Deno.env.get('FAL_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MIN_PROVIDER_TIMEOUT_MS = 8 * 60 * 1000;
const MAX_PROVIDER_TIMEOUT_MS = 15 * 60 * 1000;

type Provider = 'atlascloud' | 'fal';

function log(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', msg: string, ctx: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, msg, ...ctx, ts: new Date().toISOString() }));
}

function aspectToRatio(a: string) {
  if (!a || a === 'Auto') return 'adaptive';
  return a;
}

function ratioForProvider(provider: Provider, ratio: string) {
  if (!ratio || ratio === 'Auto') return provider === 'fal' ? 'auto' : 'adaptive';
  if (ratio === 'adaptive') return provider === 'fal' ? 'auto' : 'adaptive';
  return ratio;
}

function providerTimeoutMs(durationSeconds: unknown) {
  const duration = clampDuration(durationSeconds);
  return Math.max(MIN_PROVIDER_TIMEOUT_MS, Math.min(MAX_PROVIDER_TIMEOUT_MS, (6 * 60 + duration * 30) * 1000));
}

function clampDuration(d: unknown) {
  const n = Number(d) || 8;
  return Math.max(4, Math.min(15, n));
}

// Lazily generate (and cache) a SHORT smooth-warm female reference voice clip
// for the "second speaker" in Podcast Mode A. Uses Jessica
// (cgSgspJ2msm6clMCkdW9) — the closest match to the smooth, warm Jade-like
// tone the user asked for.
//
// CRITICAL: Atlas/Seedance reference_audios spec is "duration [2,15]s, max 3
// audios, TOTAL duration ≤15s". The avatar's own voice clip is typically
// ~10s, so the second voice MUST stay short (~3s) so combined ≤15s, otherwise
// Seedance silently drops the audio refs and invents a generic high-pitched
// voice. Bumping the cache key forces a regen of the old 10.9s clip.
async function ensurePodcastSecondVoiceUrl(
  admin: ReturnType<typeof createClient>,
): Promise<string | null> {
  const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
  if (!ELEVENLABS_API_KEY) return null;
  const path = 'system/podcast-second-jessica-v2.mp3';
  const { data: pub } = admin.storage.from('video-inputs').getPublicUrl(path);
  const publicUrl = pub?.publicUrl;
  if (!publicUrl) return null;
  try {
    const head = await fetch(publicUrl, { method: 'HEAD' });
    if (head.ok) return publicUrl;
  } catch { /* fall through to generate */ }
  try {
    // Short ~3-4s clip — keeps total reference_audios ≤15s when paired with
    // a typical 10s avatar voice sample.
    const text = "Yeah, no, I get that. That's actually so true.";
    const tts = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/cgSgspJ2msm6clMCkdW9?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: { 'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.55, similarity_boost: 0.85, style: 0.2, use_speaker_boost: true, speed: 1.0 },
        }),
      },
    );
    if (!tts.ok) {
      log('WARN', 'podcast 2nd voice: ElevenLabs failed', { status: tts.status });
      return null;
    }
    const audio = new Uint8Array(await tts.arrayBuffer());
    const { error: upErr } = await admin.storage
      .from('video-inputs')
      .upload(path, audio, { contentType: 'audio/mpeg', upsert: true });
    if (upErr) {
      log('WARN', 'podcast 2nd voice: upload failed', { err: upErr.message });
      return null;
    }
    return publicUrl;
  } catch (e) {
    log('WARN', 'podcast 2nd voice: exception', { err: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

function isValidHttpUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const u = new URL(value.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function uniqueValidUrls(urls: unknown[], limit = 9) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    if (!isValidHttpUrl(raw)) continue;
    const url = String(raw).trim();
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= limit) break;
  }
  return out;
}

function avatarIdentityCropUrl(url: string) {
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=640&h=640&fit=cover&a=top&output=jpg`;
}

async function signedStorageUrl(admin: any, bucket: string, path: string, ttl = 60 * 60 * 24) {
  const { data } = await admin.storage.from(bucket).createSignedUrl(path, ttl);
  return data?.signedUrl ?? null;
}

async function gatherFreshReferenceUrls(admin: any, opts: {
  productId?: string | null;
  avatarId?: string | null;
  keyframePath?: string | null;
  keyframeUrl?: string | null;
  fallbackUrls?: unknown[];
  maxProductImages?: number;
}) {
  const refs: string[] = [];
  if (opts.keyframePath) {
    const signed = await signedStorageUrl(admin, 'ms-products', opts.keyframePath);
    if (signed) refs.push(signed);
  } else if (isValidHttpUrl(opts.keyframeUrl)) {
    refs.push(String(opts.keyframeUrl).trim());
  }

  if (opts.productId) {
    const { data: imgs } = await admin
      .from('ms_product_images')
      .select('storage_path, is_primary')
      .eq('product_id', opts.productId)
      .order('is_primary', { ascending: false });
    const productCap = Math.max(1, opts.maxProductImages ?? 1);
    let added = 0;
    for (const img of imgs ?? []) {
      if (added >= productCap) break;
      const signed = await signedStorageUrl(admin, 'ms-products', (img as any).storage_path);
      if (signed) {
        refs.push(signed);
        added++;
      }
    }
  }

  if (opts.avatarId) {
    const { data: av } = await admin
      .from('ms_avatars')
      .select('public_url, storage_path')
      .eq('id', opts.avatarId)
      .maybeSingle();
    const avatarUrl = (av as any)?.public_url || ((av as any)?.storage_path ? await signedStorageUrl(admin, 'ms-avatars', (av as any).storage_path) : null);
    if (typeof avatarUrl === 'string') refs.push(avatarIdentityCropUrl(avatarUrl));
  }

  return uniqueValidUrls(refs.length ? refs : (opts.fallbackUrls ?? []), 3);
}

async function uploadAtlasMedia(url: string, index: number, kind: 'image' | 'audio') {
  const source = await fetch(url);
  if (!source.ok) throw new Error(`source ${kind} ${index + 1} not downloadable (${source.status})`);
  const blob = await source.blob();
  const form = new FormData();
  const ext = kind === 'audio' ? 'mp3' : ((blob.type.split('/')[1] || 'jpg').split(';')[0]);
  form.append('file', blob, `${kind}-${index + 1}.${ext}`);

  const res = await fetch('https://api.atlascloud.ai/api/v1/model/uploadMedia', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ATLAS_KEY}` },
    body: form,
  });
  const json = await res.json().catch(() => ({}));
  // Per Atlas docs the upload response is { data: { download_url, file_name, ... } }.
  const uploaded =
    json?.data?.download_url ??
    json?.data?.url ??
    json?.data?.file_url ??
    json?.data?.media_url ??
    json?.url;
  if (!res.ok || !isValidHttpUrl(uploaded)) {
    throw new Error(`Atlas uploadMedia rejected ${kind} ${index + 1}: ${json?.msg || json?.message || res.status}`);
  }
  return String(uploaded);
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function toFalDataUri(url: string, index: number, kind: 'image' | 'audio') {
  const source = await fetch(url);
  if (!source.ok) throw new Error(`source ${kind} ${index + 1} not downloadable (${source.status})`);
  const contentType = source.headers.get('content-type') || (kind === 'audio' ? 'audio/mpeg' : 'image/jpeg');
  const data = arrayBufferToBase64(await source.arrayBuffer());
  return `data:${contentType};base64,${data}`;
}

function hasAudioUrlError(raw: unknown) {
  return /audio_url|reference_audio|reference_audios|invalid url/i.test(JSON.stringify(raw));
}

function normalizeRes(r: string) {
  if (r === '1080p') return '1080p';
  if (r === '480p') return '480p';
  return '720p';
}

function providerEndpoint(provider: Provider, hasRefs: boolean) {
  if (provider === 'atlascloud') {
    return hasRefs
      ? 'bytedance/seedance-2.0/reference-to-video'
      : 'bytedance/seedance-2.0/text-to-video';
  }
  return hasRefs
    ? 'bytedance/seedance-2.0/reference-to-video'
    : 'bytedance/seedance-2.0/text-to-video';
}

// ---------------- AtlasCloud (primary) ----------------
// Docs: POST https://api.atlascloud.ai/api/v1/model/generateVideo
// model: bytedance/seedance-2.0/reference-to-video (supports up to 9 reference images)
async function submitAtlas(opts: {
  prompt: string;
  image_urls: string[];
  audio_urls: string[];
  ratio: string;
  duration: number;
  resolution: string;
}): Promise<{ ok: boolean; requestId?: string; raw: unknown }> {
  const hasRefs = opts.image_urls.length > 0;
  const model = hasRefs
    ? 'bytedance/seedance-2.0/reference-to-video'
    : 'bytedance/seedance-2.0/text-to-video';
  const atlasImageUrls = hasRefs
    ? await Promise.all(opts.image_urls.slice(0, 9).map((url, index) => uploadAtlasMedia(url, index, 'image')))
    : [];
  let atlasAudioUrls: string[] = [];
  if (hasRefs && opts.audio_urls.length > 0) {
    try {
      atlasAudioUrls = await Promise.all(opts.audio_urls.slice(0, 3).map((url, index) => uploadAtlasMedia(url, index, 'audio')));
    } catch (e) {
      log('WARN', 'submit: atlas audio upload failed, continuing with image refs', { err: e instanceof Error ? e.message : String(e) });
    }
  }
  const body: Record<string, unknown> = {
    model,
    prompt: opts.prompt,
    duration: opts.duration,
    resolution: opts.resolution,
    ratio: ratioForProvider('atlascloud', opts.ratio),
    generate_audio: true,
    watermark: false,
  };
  if (hasRefs) {
    // Atlas Seedance 2.0 schema: reference_images (1-9) + optional reference_audios (1-3).
    // Source: https://www.atlascloud.ai/models/bytedance/seedance-2.0/reference-to-video
    body.reference_images = atlasImageUrls;
    if (atlasAudioUrls.length) body.reference_audios = atlasAudioUrls;
  }

  const res = await fetch('https://api.atlascloud.ai/api/v1/model/generateVideo', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ATLAS_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  const requestId = json?.data?.id ?? json?.id;
  return { ok: res.ok && !!requestId, requestId, raw: json };
}

async function pollAtlas(requestId: string): Promise<{
  status: 'running' | 'done' | 'failed';
  videoUrl?: string | null;
  error?: string;
}> {
  const res = await fetch(`https://api.atlascloud.ai/api/v1/model/prediction/${requestId}`, {
    headers: { Authorization: `Bearer ${ATLAS_KEY}` },
  });
  const json = await res.json().catch(() => ({}));
  const status = json?.data?.status;
  if (status === 'completed' || status === 'succeeded') {
    const out = json?.data?.outputs?.[0];
    const videoUrl = typeof out === 'string' ? out : out?.url ?? null;
    return videoUrl ? { status: 'done', videoUrl } : { status: 'failed', error: 'No video in outputs' };
  }
  if (status === 'failed') {
    return { status: 'failed', error: json?.data?.error || json?.message || 'AtlasCloud reported failure' };
  }
  return { status: 'running' };
}

// ---------------- fal.ai (fallback) ----------------
async function submitFal(opts: {
  prompt: string;
  image_urls: string[];
  audio_urls: string[];
  ratio: string;
  duration: number;
  resolution: string;
}): Promise<{ ok: boolean; requestId?: string; raw: unknown }> {
  const hasRefs = opts.image_urls.length > 0;
  const endpoint = hasRefs
    ? 'https://queue.fal.run/bytedance/seedance-2.0/reference-to-video'
    : 'https://queue.fal.run/bytedance/seedance-2.0/text-to-video';
  const falImageUrls = hasRefs
    ? await Promise.all(opts.image_urls.slice(0, 9).map((url, index) => toFalDataUri(url, index, 'image')))
    : [];
  const falAudioUrls = hasRefs && opts.audio_urls.length > 0
    ? await Promise.all(opts.audio_urls.slice(0, 3).map((url, index) => toFalDataUri(url, index, 'audio')))
    : [];
  const payload: Record<string, unknown> = {
    prompt: opts.prompt,
    aspect_ratio: ratioForProvider('fal', opts.ratio),
    duration: String(opts.duration),
    resolution: opts.resolution === '1080p' ? '1080p' : '720p',
    generate_audio: true,
  };
  if (hasRefs) {
    // fal Seedance 2.0 schema uses `image_urls` (and historically `reference_image_urls`).
    payload.image_urls = falImageUrls;
    payload.reference_image_urls = falImageUrls;
    if (falAudioUrls.length) payload.audio_urls = falAudioUrls;
  }
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok && !!json?.request_id, requestId: json?.request_id, raw: json };
}

async function pollFal(requestId: string, endpoint = 'bytedance/seedance-2.0/reference-to-video'): Promise<{
  status: 'running' | 'done' | 'failed';
  videoUrl?: string | null;
  error?: string;
}> {
  const statusRes = await fetch(
    `https://queue.fal.run/${endpoint}/requests/${requestId}/status`,
    { headers: { Authorization: `Key ${FAL_KEY}` } },
  );
  const status = await statusRes.json().catch(() => ({}));
  if (status.status === 'COMPLETED') {
    const respRes = await fetch(
      `https://queue.fal.run/${endpoint}/requests/${requestId}`,
      { headers: { Authorization: `Key ${FAL_KEY}` } },
    );
    const resp = await respRes.json().catch(() => ({}));
    const videoUrl = resp?.video?.url || resp?.video_url || resp?.output?.video?.url || null;
    if (videoUrl) return { status: 'done', videoUrl };
    // fal returns 200 COMPLETED even when the response body is a content-policy error.
    const detail = Array.isArray(resp?.detail) ? resp.detail[0] : null;
    if (detail?.type === 'content_policy_violation') {
      return { status: 'failed', error: 'fal blocked the avatar image (likeness of a real person). Use AtlasCloud (top up balance) — fal Seedance does not allow human reference images.' };
    }
    if (detail?.msg) return { status: 'failed', error: `fal: ${detail.msg}` };
    return { status: 'failed', error: 'No video returned' };
  }
  if (status.status === 'FAILED' || status.status === 'ERROR') {
    const detail = Array.isArray(status?.detail) ? status.detail[0] : status?.detail;
    const msg = detail?.msg || status?.error || status?.message || 'fal reported failure';
    return { status: 'failed', error: `fal: ${msg}` };
  }
  return { status: 'running' };
}

// ---------------- Provider chain ----------------
// Input-aware routing rules:
//   - keep avatar + product references together; do not strip avatar refs.
//   - reference images → AtlasCloud → fal (full refs).
//   - text-only        → AtlasCloud → fal.
function buildChain(opts: { productId?: string | null; avatarId?: string | null; image_urls: string[] }): Provider[] {
  const chain: Provider[] = [];
  if (ATLAS_KEY) chain.push('atlascloud');
  if (FAL_KEY) chain.push('fal');
  return chain;
}

async function submitWithFallback(opts: {
  prompt: string;
  image_urls: string[];
  audio_urls: string[];
  ratio: string;
  duration: number;
  resolution: string;
  productId?: string | null;
  avatarId?: string | null;
}): Promise<{ provider: Provider; requestId: string; endpoint: string } | { error: string; details: unknown; stage: string }> {
  const chain = buildChain(opts);
  if (chain.length === 0) return { error: 'no_providers_configured', details: null, stage: 'submit' };

  let lastErr: unknown = null;
  const reasons: string[] = [];
  for (const provider of chain) {
    try {
      // Per fal + Atlas Seedance 2.0 docs both accept up to 9 reference_images
      // (avatar + product). Do not strip refs preemptively; only react to the
      // provider's own response.
      const r = provider === 'atlascloud' ? await submitAtlas(opts) : await submitFal(opts);
      const endpoint = providerEndpoint(provider, opts.image_urls.length > 0);
      if (r.ok && r.requestId) {
        log('INFO', 'submit: provider accepted', { provider, requestId: r.requestId, endpoint });
        return { provider, requestId: r.requestId, endpoint };
      }
      log('WARN', 'submit: provider rejected, trying next', { provider, raw: r.raw });
      lastErr = r.raw;
      const raw: any = r.raw;
      if (provider === 'atlascloud' && raw?.code === 402) {
        reasons.push('AtlasCloud: insufficient balance — top up at atlascloud.ai to continue.');
      } else if (provider === 'fal' && Array.isArray(raw?.detail) && raw.detail[0]?.type === 'content_policy_violation') {
        reasons.push('fal: content policy violation on reference image. Try a different photo.');
      } else {
        reasons.push(`${provider}: ${raw?.msg || raw?.detail?.[0]?.msg || raw?.message || 'rejected'}`);
      }
      if (provider === 'atlascloud' && opts.audio_urls.length > 0 && hasAudioUrlError(r.raw)) {
        const retry = await submitAtlas({ ...opts, audio_urls: [] });
        const endpoint = providerEndpoint(provider, opts.image_urls.length > 0);
        if (retry.ok && retry.requestId) {
          log('INFO', 'submit: provider accepted without audio ref', { provider, requestId: retry.requestId });
          return { provider, requestId: retry.requestId, endpoint };
        }
        lastErr = retry.raw;
      }
    } catch (e) {
      log('ERROR', 'submit: provider threw, trying next', {
        provider,
        err: e instanceof Error ? e.message : String(e),
      });
      lastErr = e instanceof Error ? e.message : String(e);
      reasons.push(`${provider}: ${e instanceof Error ? e.message : 'threw'}`);
    }
  }
  return { error: reasons.join(' | ') || 'all_providers_failed', details: lastErr, stage: 'submit' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json();

    // ---- POLL ----
    if (body.poll) {
      const { data: row } = await admin
        .from('ms_generations')
        .select('*')
        .eq('id', body.poll)
        .maybeSingle();

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
      if (!row.fal_request_id || !row.provider) {
        return new Response(JSON.stringify({ ...row, status: 'queued_pending_persist' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const startedAt = Date.parse(row.updated_at || row.created_at || '') || Date.now();
      const timeoutMs = providerTimeoutMs(row.duration_seconds);
      if (Date.now() - startedAt > timeoutMs) {
        const timeoutMessage = `Timed out after ${Math.round(timeoutMs / 60000)} minutes at provider ${row.provider} (${row.fal_request_id}). Submit a retry to create a fresh job.`;
        const { data: updated } = await admin
          .from('ms_generations')
          .update({ status: 'failed', stage: 'failed', error: timeoutMessage })
          .eq('id', row.id)
          .select()
          .single();
        return new Response(JSON.stringify(updated), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const result =
        row.provider === 'atlascloud'
          ? await pollAtlas(row.fal_request_id)
          : await pollFal(row.fal_request_id, row.provider_endpoint || providerEndpoint('fal', (row.reference_paths || []).length > 0));

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
          .update({ status: 'failed', stage: 'failed', error: result.error ?? 'failed' })
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

    // ---- RETRY ----
    if (body.retry) {
      const { data: row } = await admin
        .from('ms_generations')
        .select('*')
        .eq('id', body.retry)
        .maybeSingle();
      if (!row) {
        return new Response(JSON.stringify({ error: 'not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // Re-sign stored private assets on every retry. fal requires publicly accessible URLs;
      // Atlas docs recommend uploading media first, which submitAtlas handles after this step.
      const refs = await gatherFreshReferenceUrls(admin, {
        productId: row.product_id,
        avatarId: row.avatar_id,
        keyframePath: row.keyframe_path,
        keyframeUrl: row.keyframe_url,
        fallbackUrls: row.reference_paths || [],
      });
      const audio_urls: string[] = [];
      if (row.avatar_id) {
        const { data: av } = await admin.from('ms_avatars').select('voice_sample_url').eq('id', row.avatar_id).maybeSingle();
        if (isValidHttpUrl(av?.voice_sample_url)) audio_urls.push(String(av?.voice_sample_url).trim());
      }
      if (String(row.format).toLowerCase() === 'podcast') {
        const secondVoice = await ensurePodcastSecondVoiceUrl(admin);
        if (secondVoice && !audio_urls.includes(secondVoice)) audio_urls.push(secondVoice);
      }
      const result = await submitWithFallback({
        prompt: row.prompt,
        image_urls: refs,
        audio_urls,
        ratio: aspectToRatio(row.aspect),
        duration: row.duration_seconds || 8,
        resolution: normalizeRes(row.resolution),
        productId: row.product_id,
        avatarId: row.avatar_id,
      });
      if ('error' in result) {
        await admin
          .from('ms_generations')
          .update({ status: 'failed', error: `Retry failed: ${result.error}` })
          .eq('id', row.id);
        return new Response(JSON.stringify({ id: row.id, status: 'failed', error: result.error, details: result.details, fallback: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: updated } = await admin
        .from('ms_generations')
        .update({
          status: 'queued',
          stage: 'videoing',
          provider: result.provider,
          provider_endpoint: result.endpoint,
          fal_request_id: result.requestId,
          error: null,
          video_url: null,
        })
        .eq('id', row.id)
        .select()
        .single();
      log('INFO', 'retry: submitted', {
        jobId: row.id,
        provider: result.provider,
        endpoint: result.endpoint,
      });
      return new Response(JSON.stringify(updated), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ---- SUBMIT ----
    const {
      prompt,
      image_urls = [],
      keyframe_url,
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

    const duration = clampDuration(duration_seconds);
    const resolutionN = normalizeRes(resolution);
    const ratio = aspectToRatio(aspect);

    // Re-sign stored private assets and send the composed keyframe first, then raw
    // product/avatar refs so Seedance keeps identity and product fidelity.
    const finalImageUrls = await gatherFreshReferenceUrls(admin, {
      productId,
      avatarId,
      keyframeUrl: keyframe_url,
      fallbackUrls: keyframe_url ? [keyframe_url, ...image_urls] : image_urls,
      maxProductImages: 1,
    });

    // Pull the avatar's pre-generated reference voice clip. For Podcast Mode A
    // we ALSO append a smooth-warm Jessica clip as the second-speaker reference
    // so Seedance doesn't invent a default high-pitched voice for speaker B.
    const audio_urls: string[] = [];
    if (avatarId) {
      const { data: av } = await admin
        .from('ms_avatars')
        .select('voice_sample_url')
        .eq('id', avatarId)
        .maybeSingle();
      if (isValidHttpUrl(av?.voice_sample_url)) audio_urls.push(String(av?.voice_sample_url).trim());
    }
    if (String(format).toLowerCase() === 'podcast') {
      const secondVoice = await ensurePodcastSecondVoiceUrl(admin);
      if (secondVoice && !audio_urls.includes(secondVoice)) audio_urls.push(secondVoice);
    }

    // 1) Persist row immediately (so client polling has a real id) — or reuse one created by the orchestrator
    let row: any;
    if (reuseGenerationId) {
      const { data: updated, error: updErr } = await admin
        .from('ms_generations')
        .update({
          prompt,
          script_text: script_text ?? null,
          keyframe_url: keyframe_url ?? null,
          reference_paths: finalImageUrls,
          status: 'queued',
          stage: 'videoing',
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
          reference_paths: finalImageUrls,
          status: 'queued',
          stage: 'videoing',
        })
        .select()
        .single();
      if (insErr) {
        log('ERROR', 'submit: insert failed', { err: insErr.message });
        throw insErr;
      }
      row = inserted;
    }
    log('INFO', 'submit: row persisted', {
      jobId: row.id,
      refs: finalImageUrls.length,
      audio: audio_urls.length,
    });

    // 2) Pre-flight: ask the health endpoint whether providers are usable.
    //    If both are unhealthy we fail fast with an actionable message instead
    //    of submitting and watching the queue reject every card.
    try {
      const healthRes = await fetch(`${SUPABASE_URL}/functions/v1/marketing-provider-health`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
      });
      const health = await healthRes.json().catch(() => null);
      if (health?.blockGeneration) {
        const msg = `All providers unavailable. Atlas: ${health.atlas?.status} (${health.atlas?.message}). fal: ${health.fal?.status} (${health.fal?.message}).`;
        await admin
          .from('ms_generations')
          .update({ status: 'failed', stage: 'failed', error: msg })
          .eq('id', row.id);
        return new Response(
          JSON.stringify({ id: row.id, status: 'failed', error: msg, blocked: true, health }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    } catch (e) {
      log('WARN', 'submit: health check failed, proceeding anyway', { err: e instanceof Error ? e.message : String(e) });
    }

    // 3) Try providers in order
    const result = await submitWithFallback({
      prompt,
      image_urls: finalImageUrls,
      audio_urls,
      ratio,
      duration,
      resolution: resolutionN,
      productId,
      avatarId,
    });

    if ('error' in result) {
      await admin
        .from('ms_generations')
        .update({ status: 'failed', stage: 'failed', error: result.error })
        .eq('id', row.id);
      return new Response(
        JSON.stringify({ id: row.id, status: 'failed', error: result.error, details: result.details, fallback: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: updated } = await admin
      .from('ms_generations')
      .update({ provider: result.provider, provider_endpoint: result.endpoint, fal_request_id: result.requestId })
      .eq('id', row.id)
      .select()
      .single();

    log('INFO', 'submit: done', {
      jobId: row.id,
      provider: result.provider,
      endpoint: result.endpoint,
    });

    return new Response(
      JSON.stringify({
        id: updated.id,
        provider: result.provider,
        fal_request_id: result.requestId,
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
