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

// Seedance reference-to-video aggressively replicates the composition,
// background, and framing of the FIRST reference image (usually the avatar
// portrait the user uploaded). That makes every generation look like the
// same selfie photo just lightly animated. We counter this by prepending an
// explicit identity-only directive plus a randomized scene seed that forces
// the model to compose a fresh environment from the script description
// instead of copying the reference photo's pixels.
const SCENE_SEEDS = [
  'a boutique hotel vanity with marble counter, brass lamp, and soft morning side light',
  'a stylish elevator lobby with stone walls, brushed metal doors, and clean overhead highlights',
  'a sunlit city cafe table by a large window, glassware sparkle, warm street reflections',
  'a luxury walk-in closet with walnut shelves, cream rug, and soft directional spotlights',
  'a rooftop terrace at golden hour with pale concrete, plants, and city blur far behind',
  'a clean studio table setup with linen backdrop, negative space, and controlled softbox light',
  'a modern car passenger seat in natural daylight, leather texture, city movement outside',
  'a boutique dressing-room corner with velvet curtain, brass hooks, and flattering warm light',
  'a minimal gallery hallway with white walls, polished floor, and a single shaft of daylight',
  'a bright hotel bathroom mirror-free vanity angle with warm bulbs and textured stone',
];
function pickSceneSeed() {
  return SCENE_SEEDS[Math.floor(Math.random() * SCENE_SEEDS.length)];
}

function applyAntiReplicationDirective(prompt: string, opts: { hasAvatar: boolean; hasProduct: boolean }) {
  if (!prompt || typeof prompt !== 'string') return prompt;
  const seed = pickSceneSeed();
  const refsLine = opts.hasAvatar && opts.hasProduct
    ? 'The reference images provide ONLY the creator\'s facial identity / likeness and the product\'s exact appearance. They are NOT the scene, background, framing, lighting, wardrobe, or composition.'
    : opts.hasAvatar
      ? 'The reference image provides ONLY the creator\'s facial identity / likeness. It is NOT the scene, background, framing, lighting, wardrobe, or composition.'
      : 'The reference images provide ONLY the product\'s exact appearance. They are NOT the scene, background, framing, lighting, or composition.';
  const preamble = [
    'IDENTITY-ONLY REFERENCES — DO NOT COPY THE REFERENCE PHOTOS:',
    refsLine,
    'Build a NEW scene from scratch using the description below. The environment, camera angles, framing, wardrobe, pose, background objects, wall color, doors, furniture, and lighting must NOT match the avatar reference image.',
    `If the description does not specify a location, use this fresh setting: ${seed}.`,
    'Vary wardrobe, hair styling, expression, distance from camera, and pose from the reference photo. The creator should be wearing different clothes than in the reference image unless the script explicitly says otherwise.',
    'Do not animate the avatar upload as a still portrait. Use it only to preserve facial likeness while directing a new UGC ad with multiple shot types, product close-ups, and a payoff beat.',
    '',
  ].join('\n');
  return `${preamble}${prompt}`;
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
    header = `Vertical 9:16 UGC try-on, shot on iPhone held at arm's length in front-camera selfie style (NOT a mirror reflection — camera films the subject directly), soft natural daylight in an aesthetic bedroom, handheld slight micro-shake, real skin tones, no color grading, no filters, confident playful "watch this" energy. No mirrors visible in frame. Any printed text, lettering, logos, or graphics on the product or clothing must read forward and be perfectly legible — never mirrored, flipped, or reversed.`;
    beats = `${avatarName ? avatarName : avatarSubject} stands holding the phone at arm's length, front camera pointed directly at ${avatarPronoun === 'he' ? 'him' : 'her'}${productName ? `, holds up the ${productName}${productDesc ? ` (${productDesc})` : ''} on a hanger to camera with a small raised-eyebrow smile — any text on the garment faces the lens forward and is fully readable` : ''}. Quick natural cut: ${avatarPronoun} is now wearing the outfit, smooths the fabric down, turns side to side checking the fit, does one slow confident spin so the fabric catches the light. Final beat: ${avatarPronoun} stands relaxed facing the camera directly, strikes an editorial pose, holds it for a beat, then breaks into a small satisfied smile. All printed text on the garment reads forward, never mirrored.`;
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
    'Action and dialogue sequence must create a new scene using the references only as anchors. Do not recreate the exact uploaded product/avatar image. No split-screens, no text overlays, no logos baked in, no music, only natural ambient sound. Avoid words like introducing, game-changer, elevate, must-have. Keep dialogue short, casual, real, and tied to visible physical details. CRITICAL: any printed text, lettering, numbers, or logos visible on the product, packaging, or clothing must always read forward and be perfectly legible — never mirrored, flipped, reversed, or rendered as a mirror reflection. Avoid mirror reflections entirely; film the subject and product directly with the camera.',
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
      extraRefImages = [],
      extraRefNames = [],
    } = await req.json();
    const userExtraRefs: string[] = uniqueValidUrls(Array.isArray(extraRefImages) ? extraRefImages : []);
    const userExtraNames: string[] = (Array.isArray(extraRefNames) ? extraRefNames : []).map((n: any) => String(n || '').trim());

    // Podcast multi-cam shuffle physically cannot fit in <12s — short durations
    // produce the "AI slop" frozen wide shot. Force a minimum.
    let effectiveDuration = Number(duration_seconds) || 8;
    if (String(format).toLowerCase() === 'podcast' && effectiveDuration < 12) {
      effectiveDuration = 12;
    }
    // Use effectiveDuration for the rest of the pipeline.
    const duration_seconds_final = effectiveDuration;

    const ratio = aspectToRatio(aspect);
    const userPromptTrimmed = (userPrompt || '').trim();

    if (!userPromptTrimmed && !productId && !avatarId && userExtraRefs.length === 0) {
      return new Response(JSON.stringify({ error: 'prompt required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1) Resolve product/avatar thumb cheaply for the placeholder row. Full
    // reference URL gathering happens inside the background pipeline so the
    // HTTP response can return in <500ms.
    let thumb: string | null = null;
    try {
      if (productId) {
        const { data: imgs } = await admin
          .from('ms_product_images')
          .select('storage_path, is_primary')
          .eq('product_id', productId)
          .order('is_primary', { ascending: false })
          .limit(1);
        const path = (imgs?.[0] as any)?.storage_path;
        if (path) {
          const { data: signed } = await admin.storage.from('ms-products').createSignedUrl(path, 3600);
          thumb = signed?.signedUrl ?? null;
        }
      } else if (avatarId) {
        const { data: av } = await admin
          .from('ms_avatars')
          .select('public_url, storage_path')
          .eq('id', avatarId)
          .maybeSingle();
        thumb = (av as any)?.public_url ?? null;
        if (!thumb && (av as any)?.storage_path) {
          const { data: signed } = await admin.storage.from('ms-avatars').createSignedUrl((av as any).storage_path, 3600);
          thumb = signed?.signedUrl ?? null;
        }
      }
    } catch (e) {
      console.warn('[orchestrate] thumb resolve failed', e);
    }

    // 2) Decide effective format (Scenario E routing) so we persist the right
    // value on the placeholder row.
    let effectiveFormat = format;
    if (!productId && avatarId && userPromptTrimmed) {
      effectiveFormat = 'AVATAR_TALKING_HEAD';
    }

    // 3) Persist a placeholder row IMMEDIATELY so the client gets a real id
    // to poll. Stage starts at 'scripting' — the rest of the pipeline runs in
    // the background via EdgeRuntime.waitUntil.
    const { data: row, error: insErr } = await admin
      .from('ms_generations')
      .insert({
        user_id: null,
        project_id: projectId ?? null,
        product_id: productId ?? null,
        avatar_id: avatarId ?? null,
        format: effectiveFormat,
        surface,
        aspect: ratio,
        duration_seconds: duration_seconds_final,
        resolution,
        prompt: userPromptTrimmed || '(generating script…)',
        script: { source: 'pending' },
        script_text: userPromptTrimmed || '',
        thumb_url: thumb,
        status: 'queued',
        stage: 'scripting',
      })
      .select()
      .single();
    if (insErr) throw insErr;

    const generationId = row.id;

    // 4) Background pipeline: gather refs, run script writer, then submit to
    // the video function. All slow work happens here AFTER we've already
    // responded to the client.
    const runPipeline = async () => {
      try {
        // 4a) Gather full reference URLs + product/avatar metadata.
        const { refs: baseRefs, product, avatar } = await gatherReferenceUrls(admin, {
          productId,
          avatarId,
          maxProductImages: 6,
        });
        // Append user-supplied extra reference images (drag/drop / @mention).
        const refs = uniqueValidUrls([...baseRefs, ...userExtraRefs]);

        // 4b) One-time vision backfill for the product.
        if (productId && refs.length > 0) {
          try {
            const { data: prodRow } = await admin
              .from('ms_products')
              .select('vision_analysis')
              .eq('id', productId)
              .maybeSingle();
            if (prodRow && !(prodRow as any).vision_analysis) {
              const visRes = await invokeFn('marketing-analyze-product', { image_url: refs[0] });
              if (visRes.ok && visRes.json?.visual_facts) {
                await admin
                  .from('ms_products')
                  .update({ vision_analysis: visRes.json.visual_facts })
                  .eq('id', productId);
              }
            }
          } catch (e) {
            console.warn('[orchestrate] vision backfill failed', e);
          }
        }

        // 4c) Decide whether to pass the user's prompt through verbatim or
        // route it through the Claude script writer.
        const looksLikeFullScript = (() => {
          const t = userPromptTrimmed;
          if (!t) return false;
          if (t.length >= 220) return true;
          if (/\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}/.test(t)) return true;
          if (/"[^"\n]{2,160}"/.test(t) && t.length >= 120) return true;
          if (/\b(BEAT|HOOK|CTA|JUMP CUT|VOICEOVER|VO:|SCENE)\b/i.test(t)) return true;
          return false;
        })();

        let scriptPayload: any = null;
        let finalPrompt = userPromptTrimmed;
        let scriptPersona: string | null = null;
        if (looksLikeFullScript) {
          finalPrompt = `${userPromptTrimmed}\n\nCRITICAL: any printed text, lettering, numbers, or logos visible on the product, packaging, or clothing must always read forward and be perfectly legible — never mirrored, flipped, reversed, or rendered as a mirror reflection.`;
          scriptPayload = { source: 'user_raw', final_prompt: finalPrompt, voiceover_script: extractSpokenLines(userPromptTrimmed) };
          scriptPersona = 'user-supplied';
        } else if (productId || avatarId || userExtraRefs.length > 0) {
          const scriptRes = await invokeFn('marketing-generate-script', {
            productId,
            avatarId,
            format: effectiveFormat,
            surface,
            aspect: ratio,
            duration: duration_seconds_final,
            userPrompt: userPromptTrimmed,
            userDirection: userPromptTrimmed,
            extraRefImages: userExtraRefs,
            extraRefNames: userExtraNames,
          });
          const candidate = scriptRes.ok ? scriptRes.json?.prompt : null;
          scriptPayload = scriptRes.ok ? scriptRes.json?.script : { error: scriptRes.text };
          scriptPersona = scriptRes.ok ? (scriptRes.json?.script_persona ?? null) : null;
          const details: string[] = scriptRes.ok ? (scriptRes.json?.concrete_product_details ?? []) : [];
          const candidateStr = typeof candidate === 'string' ? candidate : '';
          const lacksDetails = productId && details.length > 0 && !details.some((d) => d && candidateStr.toLowerCase().includes(String(d).toLowerCase().split(' ').slice(0, 2).join(' ')));
          finalPrompt = (isWeakGeneratedScript(candidate) || lacksDetails)
            ? buildFallbackPrompt({
                format: effectiveFormat,
                product,
                avatar,
                userPrompt: userPromptTrimmed,
                hasProduct: !!productId,
                hasAvatar: !!avatarId,
              })
            : String(candidate).trim();
        }
        finalPrompt = applyAntiReplicationDirective(finalPrompt, { hasAvatar: !!avatarId, hasProduct: !!productId });
        const voiceoverText = scriptPayload?.voiceover_script || extractSpokenLines(finalPrompt);

        // 4d) Persist script + advance stage to 'videoing' so the UI knows
        // we're moving on.
        await admin
          .from('ms_generations')
          .update({
            prompt: finalPrompt,
            script: scriptPayload ?? { final_prompt: finalPrompt, voiceover_script: voiceoverText },
            script_text: voiceoverText || finalPrompt,
            script_persona: scriptPersona,
            reference_paths: refs,
            stage: 'videoing',
          })
          .eq('id', generationId);

        let keyframeUrl: string | null = null;
        if (productId && avatarId) {
          const keyframeRes = await invokeFn('marketing-generate-keyframe', { generationId });
          if (keyframeRes.ok && keyframeRes.json?.keyframeUrl) {
            keyframeUrl = String(keyframeRes.json.keyframeUrl);
          }
        }

        // 4e) Submit to the video function (still synchronous from its own POV
        // but we're already in the background).
        const vidRes = await invokeFn('marketing-generate-video', {
          reuseGenerationId: generationId,
          prompt: finalPrompt,
          image_urls: refs,
          keyframe_url: keyframeUrl,
          aspect: ratio,
          duration_seconds: duration_seconds_final,
          resolution,
          productId,
          avatarId,
          format: effectiveFormat,
          surface,
          projectId,
          script_text: voiceoverText || finalPrompt,
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
      JSON.stringify({ id: generationId, stage: 'scripting', status: 'queued' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'unknown' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
