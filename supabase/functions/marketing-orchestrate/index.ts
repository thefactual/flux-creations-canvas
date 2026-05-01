// Orchestrate the marketing-video pipeline as one call.
// Generates a human, format-specific UGC script first, then submits the
// resulting Seedance prompt to the video provider. Reference images are used
// only as product/avatar anchors, not as the creative idea.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

function aspectToRatio(a: string) {
  if (!a || a === 'Auto') return 'adaptive';
  return a;
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

function uniqueValidUrls(urls: unknown[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    if (!isValidHttpUrl(raw)) continue;
    const url = String(raw).trim();
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

async function invokeFn(name: string, body: unknown) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ANON_KEY}`,
      apikey: ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  return { ok: res.ok, status: res.status, json, text };
}

async function signedStorageUrl(admin: any, bucket: string, path: string) {
  const { data } = await admin.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24);
  return data?.signedUrl ?? null;
}

type ProductMeta = { name?: string | null; description?: string | null; brand_color?: string | null } | null;
type AvatarMeta = { name?: string | null; description?: string | null; gender?: string | null } | null;

async function gatherReferenceUrls(admin: any, opts: {
  productId?: string | null;
  avatarId?: string | null;
  maxProductImages?: number;
}): Promise<{ refs: string[]; thumb: string | null; product: ProductMeta; avatar: AvatarMeta }> {
  const refs: string[] = [];
  let thumb: string | null = null;
  let product: ProductMeta = null;
  let avatar: AvatarMeta = null;
  const productCap = Math.max(1, opts.maxProductImages ?? 999);

  if (opts.productId) {
    const { data: prod } = await admin
      .from('ms_products')
      .select('name, description, brand_color')
      .eq('id', opts.productId)
      .maybeSingle();
    product = (prod as any) ?? null;

    const { data: imgs } = await admin
      .from('ms_product_images')
      .select('storage_path, is_primary')
      .eq('product_id', opts.productId)
      .order('is_primary', { ascending: false });
    let added = 0;
    for (const img of imgs ?? []) {
      if (added >= productCap) break;
      const url = await signedStorageUrl(admin, 'ms-products', (img as any).storage_path);
      if (url) {
        refs.push(url);
        if (!thumb) thumb = url;
        added++;
      }
    }
  }

  if (opts.avatarId) {
    const { data: av } = await admin
      .from('ms_avatars')
      .select('name, description, gender, public_url, storage_path, is_builtin')
      .eq('id', opts.avatarId)
      .maybeSingle();
    if (av) {
      avatar = { name: (av as any).name, description: (av as any).description, gender: (av as any).gender };
      const url = (av as any).public_url
        || ((av as any).storage_path ? await signedStorageUrl(admin, 'ms-avatars', (av as any).storage_path) : null);
      if (url) {
        refs.push(url);
        if (!thumb) thumb = url;
      }
    }
  }

  return { refs: uniqueValidUrls(refs), thumb, product, avatar };
}

function extractSpokenLines(text: string) {
  const matches = [...text.matchAll(/"([^"\n]{2,160})"/g)].map((m) => m[1].trim());
  return matches.slice(0, 6).join('\n');
}

function isWeakGeneratedScript(text: unknown) {
  if (typeof text !== 'string') return true;
  const t = text.trim();
  if (t.length < 450) return true;
  if (!/Action and dialogue sequence|BEAT|0[–-]|JUMP CUT|HOOK/i.test(t)) return true;
  if (!/"[^"\n]{2,120}"/.test(t)) return true;
  if (/introducing|game-changer|elevate|revolutionary|level up|must-have|perfect for|you'll love/i.test(t)) return true;
  return false;
}

// Deterministic fallback only if the AI script writer is unavailable. This is
// intentionally specific and action-led, but the normal path is the AI writer.
function buildFallbackPrompt(args: {
  format?: string;
  product: ProductMeta;
  avatar: AvatarMeta;
  userPrompt?: string;
  hasProduct: boolean;
  hasAvatar: boolean;
}) {
  const fmt = (args.format || 'UGC').trim();
  const fmtLower = fmt.toLowerCase();
  const productName = args.product?.name?.trim();
  const productDesc = args.product?.description?.trim();
  const avatarName = args.avatar?.name?.trim();
  const avatarPronoun = (args.avatar?.gender || '').toLowerCase() === 'male' ? 'he' : 'she';
  const avatarSubject = (args.avatar?.gender || '').toLowerCase() === 'male' ? 'a young man' : 'a young woman';
  const userExtra = (args.userPrompt || '').trim();

  // Format-specific cinematography header.
  let header = '';
  let beats = '';

  if (fmtLower.includes('unboxing')) {
    header = `Vertical 9:16 satisfying ASMR unboxing, overhead top-down camera looking straight down at a light wooden desk, only hands visible — natural female hands with short nails, cozy oversized sweater sleeves, warm soft natural daylight from a window on the left, slow deliberate ASMR-style movements, no music, only crisp natural sounds (cardboard tap, sticker peel, tissue rustle), real skin tones, no filters.`;
    beats = productName
      ? `Hands tap the box lid three times — soft hollow cardboard thuds. Both hands lift the lid straight up slowly, revealing tissue paper inside. Fingers peel the seal with a crisp peel sound, pull the tissue apart, and lift out the ${productName}${productDesc ? ` — ${productDesc}` : ''}. Hands rotate it slowly at center frame, catching the warm light on every surface and detail. Final beat: the ${productName} placed upright on the desk beside the open box, hands pull away, hold the beauty shot for one and a half seconds.`
        : `Hands slowly open the box, peel the tissue, and lift out the product. Rotate it gently at center frame in warm light, then place it upright on the desk for a final beauty shot.`;
  } else if (fmtLower.includes('try on') || fmtLower.includes('try-on')) {
    header = `Vertical 9:16 UGC try-on, shot on iPhone front camera in mirror-selfie style, soft natural daylight in an aesthetic bedroom, handheld slight micro-shake, real skin tones, no color grading, no filters, confident playful "watch this" energy.`;
    beats = `${avatarName ? avatarName : avatarSubject} stands in front of the mirror holding the phone${productName ? `, holds up the ${productName}${productDesc ? ` (${productDesc})` : ''} on a hanger to camera with a small raised-eyebrow smile` : ''}. Quick natural cut: ${avatarPronoun} is now wearing the outfit, smooths the fabric down, turns side to side checking the fit, does one slow confident spin so the fabric catches the light. Final beat: ${avatarPronoun} faces the mirror straight on, strikes a relaxed editorial pose, holds it for a beat, then breaks into a small satisfied smile.`;
  } else if (fmtLower.includes('tutorial')) {
    header = `Vertical 9:16 authentic UGC demo, shot on iPhone front camera, soft natural daylight from a window, handheld with subtle micro-shake, real smartphone-lens look, no cinematic grading, real skin tones, no filters. The phone, camera, or any reflection of a phone must never be visible.`;
    beats = `Extreme close-up of ${avatarName ? avatarName + "'s" : 'her'} face, lit by soft window light, ${avatarPronoun} leans in with wide eyes and a half-smile: "okay wait —". Quick cut: ${avatarPronoun} brings the ${productName ?? 'product'} up next to ${avatarPronoun === 'he' ? 'his' : 'her'} cheek, turning it once so the label catches the light, says casually: "I literally cannot believe how good this is." Tight close-up of hands using the ${productName ?? 'product'} — real texture, real motion${productDesc ? `, ${productDesc}` : ''}. Final beat: medium shot of ${avatarPronoun === 'he' ? 'his' : 'her'} face, soft small smile, holds the ${productName ?? 'product'} up beside ${avatarPronoun === 'he' ? 'his' : 'her'} face: "okay, I'm obsessed."`;
  } else if (fmtLower.includes('hyper') || fmtLower.includes('motion')) {
    header = `High-energy cinematic single-shot product commercial, dynamic camera moves — macro tracking, smooth 360-degree orbit around the product, speed-ramped reveal from slow-motion to real-time, professional studio lighting with subtle lens flares, polished hyper-realistic 8k aesthetic.`;
    beats = `Camera orbits the ${productName ?? 'product'}${productDesc ? ` (${productDesc})` : ''} in one continuous take, pushing in for a macro detail of texture and material, then pulling back for a clean hero shot of the full product centered in frame. No cuts, no edits — one continuous flowing camera move.`;
  } else if (fmtLower.includes('tv') || fmtLower.includes('spot')) {
    header = `Premium TV commercial single continuous take, cinematic lighting, smooth dolly and crane camera movement, polished color, real skin tones.`;
    beats = `${avatarName ? avatarName : avatarSubject} interacts naturally with the ${productName ?? 'product'}${productDesc ? ` (${productDesc})` : ''} in one continuous flowing shot — the camera glides around them, holds on a clean hero beauty frame of the product at the end.`;
  } else {
    // Default: UGC selfie review — the highest-success template per the reference set.
    header = `Vertical 9:16 selfie-style UGC review, shot on iPhone front and back camera mix, natural daylight, handheld authentic energy, casual "showing a friend" vibe, warm natural light, real skin tones, no filters.`;
    if (args.hasAvatar && args.hasProduct) {
      beats = `${avatarName ? avatarName : avatarSubject} holds the ${productName ?? 'product'} up to the front camera with one hand${productDesc ? ` — ${productDesc}` : ''}, tilts it slowly so the light catches every surface, speaking naturally and warmly: "okay so this just arrived and I am obsessed." ${avatarPronoun.charAt(0).toUpperCase() + avatarPronoun.slice(1)} turns it to show another side, brings it close to the lens for a detail beat, then holds it up beside ${avatarPronoun === 'he' ? 'his' : 'her'} face one final time, smiles directly into the lens: "yeah, this is the one."`;
    } else if (args.hasProduct) {
      beats = `Hands hold the ${productName ?? 'product'}${productDesc ? ` (${productDesc})` : ''} up to the front camera, rotate it slowly so the light catches every surface and detail, then bring it close to the lens for a tactile macro beat of the texture and finish. Final beat: the product centered in frame, held still in soft natural light.`;
    } else {
      beats = `${avatarName ? avatarName : avatarSubject} sits close to the front camera, speaks warmly and naturally to a friend, gestures lightly with ${avatarPronoun === 'he' ? 'his' : 'her'} hands, smiles at the end of the beat.`;
    }
  }

  const userLine = userExtra
    ? `\nCreator note (weave in naturally, do not break the single continuous shot): ${userExtra}`
    : '';

  return [
    header,
    beats,
    'Action and dialogue sequence must create a new scene using the references only as anchors. Do not recreate the exact uploaded product/avatar image. No split-screens, no text overlays, no logos baked in, no music, only natural ambient sound. Avoid words like introducing, game-changer, elevate, must-have. Keep dialogue short, casual, real, and tied to visible physical details.',
  ].join('\n') + userLine;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const {
      productId,
      avatarId,
      format,
      surface,
      aspect = '9:16',
      duration_seconds = 8,
      resolution = '720p',
      userPrompt = '',
      projectId,
    } = await req.json();

    const ratio = aspectToRatio(aspect);
    const userPromptTrimmed = (userPrompt || '').trim();

    if (!userPromptTrimmed && !productId && !avatarId) {
      return new Response(JSON.stringify({ error: 'prompt required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1) Resolve refs + product/avatar metadata up front so we can build a
    // concrete Higgsfield-style prompt anchored on real visual details.
    // When the user did NOT type a prompt, cap product refs to 1 (primary
    // image only). Sending every reference image makes Seedance frame-blend
    // them into a static AI-slop output instead of directing a real scene.
    const { refs, thumb, product, avatar } = await gatherReferenceUrls(admin, {
      productId,
      avatarId,
      maxProductImages: userPromptTrimmed ? 6 : 1,
    });

    // 2) Use the AI script writer for human, format-specific UGC. If it fails
    // or returns weak copy, fall back to a deterministic Higgsfield-style prompt
    // instead of sending raw user text or static reference-image instructions.
    let scriptPayload: any = null;
    let finalPrompt = userPromptTrimmed;
    if (productId || avatarId) {
      const scriptRes = await invokeFn('marketing-generate-script', {
        productId,
        avatarId,
        format,
        surface,
        aspect: ratio,
        duration: duration_seconds,
        userPrompt: userPromptTrimmed,
      });
      const candidate = scriptRes.ok ? scriptRes.json?.prompt : null;
      scriptPayload = scriptRes.ok ? scriptRes.json?.script : { error: scriptRes.text };
      finalPrompt = isWeakGeneratedScript(candidate)
        ? buildFallbackPrompt({
            format,
            product,
            avatar,
            userPrompt: userPromptTrimmed,
            hasProduct: !!productId,
            hasAvatar: !!avatarId,
          })
        : String(candidate).trim();
    }
    const voiceoverText = scriptPayload?.voiceover_script || extractSpokenLines(finalPrompt);

    // 2) Persist row immediately at stage=videoing — no scripting step anymore.
    const { data: row, error: insErr } = await admin
      .from('ms_generations')
      .insert({
        user_id: null,
        project_id: projectId ?? null,
        product_id: productId ?? null,
        avatar_id: avatarId ?? null,
        format,
        surface,
        aspect: ratio,
        duration_seconds,
        resolution,
        prompt: finalPrompt,
        script_text: finalPrompt,
        reference_paths: refs,
        thumb_url: thumb,
        status: 'queued',
        stage: 'videoing',
      })
      .select()
      .single();
    if (insErr) throw insErr;

    const generationId = row.id;

    // Respond immediately. Video submission runs in background so the UI
    // gets a real id to poll without waiting on the provider handshake.
    const runPipeline = async () => {
      try {
        const vidRes = await invokeFn('marketing-generate-video', {
          reuseGenerationId: generationId,
          prompt: finalPrompt,
          image_urls: refs,
          aspect: ratio,
          duration_seconds,
          resolution,
          productId,
          avatarId,
          format,
          surface,
          projectId,
          script_text: finalPrompt,
        });
        if (!vidRes.ok) {
          throw new Error(`video submit failed: ${vidRes.text.slice(0, 300)}`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await admin
          .from('ms_generations')
          .update({ status: 'failed', stage: 'failed', error: msg.slice(0, 500) })
          .eq('id', generationId);
      }
    };

    // @ts-ignore - EdgeRuntime is available in Supabase Deno runtime
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(runPipeline());
    } else {
      runPipeline();
    }

    return new Response(
      JSON.stringify({ id: generationId, stage: 'videoing', status: 'queued' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'unknown' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
