// Composes ONE photoreal 9:16 still frame using Nano Banana Pro (with Nano
// Banana 2 fallback). The frame shows the avatar IN the scene Claude described,
// holding/wearing the product. Seedance then animates THIS frame instead of
// inventing the scene from a headshot — which is the root cause of "avatar
// reference photo gets animated" slop.
//
// POST { generation_id } -> { ok: true, keyframe_url } | { ok: false, error }
// Always graceful: on total failure, sets keyframe_url=null and stage=videoing
// so the orchestrator can still proceed with the legacy reference order.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const PRIMARY_MODEL = 'google/gemini-3-pro-image-preview';   // Nano Banana Pro
const FALLBACK_MODEL = 'google/gemini-3.1-flash-image-preview'; // Nano Banana 2

// Route every reference image through wsrv.nl with a width/quality cap so we
// stay well under the multimodal payload limit. Same pattern we use for Claude.
function proxyImage(url: string, width = 1280, quality = 82) {
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=${width}&output=jpg&q=${quality}`;
}

function proxyAvatar(url: string) {
  // Square 640x640 top-cropped headshot — same crop the video function uses for
  // facial-identity references.
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=640&h=640&fit=cover&a=top&output=jpg`;
}

async function fetchAvatarUrl(admin: any, avatarId: string): Promise<string | null> {
  const { data } = await admin
    .from('ms_avatars')
    .select('public_url, storage_path')
    .eq('id', avatarId)
    .maybeSingle();
  if (!data) return null;
  if (data.public_url) return data.public_url as string;
  if (data.storage_path) {
    const { data: signed } = await admin.storage
      .from('ms-avatars')
      .createSignedUrl(data.storage_path, 3600);
    return signed?.signedUrl ?? null;
  }
  return null;
}

async function fetchProductImageUrls(admin: any, productId: string, max = 3): Promise<string[]> {
  const { data } = await admin
    .from('ms_product_images')
    .select('storage_path, is_primary')
    .eq('product_id', productId)
    .order('is_primary', { ascending: false })
    .limit(max);
  if (!data) return [];
  const out: string[] = [];
  for (const row of data) {
    if (!row?.storage_path) continue;
    const { data: signed } = await admin.storage
      .from('ms-products')
      .createSignedUrl(row.storage_path, 3600);
    if (signed?.signedUrl) out.push(signed.signedUrl);
  }
  return out;
}

function buildKeyframePrompt(scene: string, camera: string, productName: string, hasAvatar: boolean): string {
  const subject = hasAvatar
    ? 'The person in image 1 is in this scene'
    : 'A pair of natural hands (no face visible) appear in this scene';
  const productRef = hasAvatar ? 'images 2 and after' : 'images 1 and after';
  const identityLine = hasAvatar
    ? `- The person in image 1 is the SUBJECT. Their face, skin tone, hair color, hair texture, eye shape, and facial structure must be rendered with exact precision. This is not a stylized portrait — it is a photorealistic identity lock. The face in this frame will be used as the primary identity reference for video generation. Any drift in facial features invalidates the entire frame. Render the face first, then place them in the scene described below.
- The person must be physically IN the scene, not composited onto a background.`
    : '- Render only natural hands holding/using the product. No face, no full body.';

  return `Compose ONE photoreal still frame, vertical 9:16 aspect ratio.

${subject}: ${scene || 'a real lived-in setting that fits the product'}.
They are holding, wearing, or using the ${productName} shown in ${productRef}.
Camera: ${camera || 'iPhone selfie-style, natural daylight, slight handheld feel'}.

CRITICAL RULES:
- Render the product with EXACT colors, text, hardware, and surface details visible in the source images. No invented colors. No invented logos. Any text on the product must read FORWARD and be perfectly legible (never mirrored).
${identityLine}
- One single composed frame — no collage, no grid, no multiple panels, no split-screen.
- No text overlays, no captions, no watermarks, no borders.
- Photoreal lighting and skin. Real fabric folds. Real shadows.
- This IS the first frame Seedance will animate — make it cinematically loaded but plausibly natural.`;
}

type ImagePart = { type: 'image_url'; image_url: { url: string } };

async function callLovableImage(
  model: string,
  imageParts: ImagePart[],
  prompt: string,
): Promise<string | null> {
  const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      modalities: ['image', 'text'],
      messages: [
        {
          role: 'user',
          content: [...imageParts, { type: 'text', text: prompt }],
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${model} ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  const url = json?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url || typeof url !== 'string') return null;
  return url;
}

async function dataUrlToBytes(dataUrl: string): Promise<Uint8Array> {
  if (dataUrl.startsWith('data:')) {
    const comma = dataUrl.indexOf(',');
    const b64 = dataUrl.slice(comma + 1);
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const r = await fetch(dataUrl);
  return new Uint8Array(await r.arrayBuffer());
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  let generationId: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    generationId = body?.generation_id ?? body?.generationId ?? null;
    if (!generationId) {
      return new Response(JSON.stringify({ error: 'generation_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: gen, error: genErr } = await admin
      .from('ms_generations')
      .select('id, product_id, avatar_id, script, prompt')
      .eq('id', generationId)
      .maybeSingle();
    if (genErr) throw genErr;
    if (!gen) {
      return new Response(JSON.stringify({ error: 'generation not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const script = (gen.script || {}) as Record<string, any>;
    const sceneDescription =
      script.scene_description || script.setting || script.scene || '';
    const cameraNotes = script.camera_notes || script.camera || '';

    // Resolve product name for the prompt.
    let productName = 'the product';
    if (gen.product_id) {
      const { data: prod } = await admin
        .from('ms_products')
        .select('name')
        .eq('id', gen.product_id)
        .maybeSingle();
      if (prod?.name) productName = prod.name;
    }

    // Build image array: avatar first (face lock), then up to 3 product images.
    const imageParts: ImagePart[] = [];
    let avatarUrl: string | null = null;
    if (gen.avatar_id) {
      avatarUrl = await fetchAvatarUrl(admin, gen.avatar_id);
      if (avatarUrl) imageParts.push({ type: 'image_url', image_url: { url: proxyAvatar(avatarUrl) } });
    }
    if (gen.product_id) {
      const productUrls = await fetchProductImageUrls(admin, gen.product_id, 3);
      for (const u of productUrls) imageParts.push({ type: 'image_url', image_url: { url: proxyImage(u) } });
    }

    if (imageParts.length === 0) {
      // Nothing to compose against — degrade gracefully.
      await admin
        .from('ms_generations')
        .update({ stage: 'videoing' })
        .eq('id', generationId);
      return new Response(JSON.stringify({ ok: false, skipped: true, reason: 'no_references' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const prompt = buildKeyframePrompt(sceneDescription, cameraNotes, productName, !!avatarUrl);

    // Try primary, then fallback.
    let imageUrl: string | null = null;
    try {
      imageUrl = await callLovableImage(PRIMARY_MODEL, imageParts, prompt);
    } catch (e) {
      console.warn('[keyframe] primary failed:', e instanceof Error ? e.message : e);
    }
    if (!imageUrl) {
      try {
        imageUrl = await callLovableImage(FALLBACK_MODEL, imageParts, prompt);
      } catch (e) {
        console.warn('[keyframe] fallback failed:', e instanceof Error ? e.message : e);
      }
    }

    if (!imageUrl) {
      // Total failure → graceful degrade.
      await admin
        .from('ms_generations')
        .update({ stage: 'videoing' })
        .eq('id', generationId);
      return new Response(JSON.stringify({ ok: false, error: 'both_providers_failed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Upload to ms-keyframes/<gen_id>.png
    const bytes = await dataUrlToBytes(imageUrl);
    const path = `${generationId}.png`;
    const { error: upErr } = await admin.storage
      .from('ms-keyframes')
      .upload(path, bytes, { contentType: 'image/png', upsert: true });
    if (upErr) throw new Error(`upload failed: ${upErr.message}`);

    const { data: signed, error: signErr } = await admin.storage
      .from('ms-keyframes')
      .createSignedUrl(path, 60 * 60); // 1 hour
    if (signErr || !signed?.signedUrl) throw new Error(`sign url failed: ${signErr?.message ?? 'no url'}`);

    await admin
      .from('ms_generations')
      .update({
        keyframe_url: signed.signedUrl,
        keyframe_path: path,
        stage: 'keyframe_ready',
      })
      .eq('id', generationId);

    return new Response(
      JSON.stringify({ ok: true, keyframe_url: signed.signedUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error('[keyframe] fatal:', msg);
    if (generationId) {
      try {
        await admin
          .from('ms_generations')
          .update({ stage: 'videoing' })
          .eq('id', generationId);
      } catch { /* noop */ }
    }
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 200, // 200 so orchestrator's await doesn't throw — graceful degrade
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
