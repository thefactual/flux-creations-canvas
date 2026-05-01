// Generate a Seedance-ready prompt + script from product + avatar + format preset.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const HUMAN_UGC_FIREWALL = `You are not writing ad copy. You are writing the exact prompt a strong UGC director would send to a video model.

Hard rules that override every format below:
- Make a fresh scene, not a recreation of the uploaded product/avatar reference images. References are identity/product anchors only.
- The creator's spoken lines must sound like a real person talking to a friend, not a brand, narrator, influencer script, or marketing voiceover.
- No generic praise unless it is attached to a concrete physical detail. Avoid empty lines like "I'm obsessed", "so good", "love this" unless the next words name the exact color, texture, fit, hardware, movement, sound, or result.
- Every beat must contain real physical action: tilt, tap, trace, pull, peel, wear, use, rotate, pour, draw, lace, zip, clasp, sip, test, compare, or reveal.
- Mention the product by its literal PRODUCT_NAME, but do not repeat the name in every sentence.
- If the user prompt is blank, invent a product-specific creative angle from PRODUCT_DESCRIPTION and product type. Never default to a static hold-up.
- If an avatar is provided, use them as the creator inside the scene. If no avatar is provided, use POV hands or product-only UGC, not a random invented spokesperson.
- Output should feel like the Higgsfield examples: camera/style line, concrete scene/product paragraph, then an action and dialogue sequence with timed physical beats.`;

const UGC_PROMPT = `You write Seedance 2.0 video generation prompts for UGC-style product review videos. Your output is a single continuous paragraph of 220–380 words. No headings, no bullet points, no numbered steps, no emojis, no hashtags.

The video is vertical 9:16, shot on iPhone front and back camera mix, natural daylight or warm indoor light, real skin tones, no filters, no color grading, slight handheld micro-shake. The energy is "showing a friend my new thing" — casual, unpolished, genuinely excited.

You will receive:
- PRODUCT_NAME, PRODUCT_COLOR, PRODUCT_MATERIAL, PRODUCT_DESCRIPTION
- AVATAR_NAME, AVATAR_GENDER, AVATAR_DESCRIPTION
- SETTING_HINT (optional — if blank, pick a setting that matches the product naturally)

Your prompt must contain in this order:

1. SETTING — one sentence describing the room or location. Concrete. Natural light source named. Matches the product (outdoor court for sports, casual bedroom for accessories, kitchen for food/drink, etc).

2. AVATAR APPEARANCE — what [AVATAR_NAME] is wearing. Real colors, real fabrics. The outfit should create a visible contrast or harmony with the product color.

3. PRODUCT IN HAND — describe the product held up to the front camera lens. Use PRODUCT_NAME exactly. Describe the color, material, any printed text visible, any hardware, texture. Be precise enough that a model could render it.

4. FOUR BEATS:
   BEAT 1 (0–3s): Front camera. Avatar holds product up, full face in frame. First reaction line in quotes. Should feel like a genuine surprised response — not a scripted opener. The product is angled slightly to catch the light.
   BEAT 2 (3–7s): Switches to back camera or brings product close to front lens for a detail close-up. Second line in quotes. Focus on one specific physical detail — a texture, a string pattern, a hardware detail, a surface. Name it specifically.
   BEAT 3 (7–12s): Avatar uses, wears, or demonstrates the product in real motion. Phone propped against something or back-cam handheld. No dialogue during action — let the product do the work. Describe the motion precisely.
   BEAT 4 (12–15s): Front camera returns. Avatar holds product beside their face. Final verdict line in quotes. Short. Blunt. Certain.

Dialogue rules:
- 4–6 lines total, each ≤10 words, all in double quotes
- Conversational American English, mid-20s energy
- Pauses are written as "..." inside the line
- May start with "Okay" or "Wait" or "So" — these are natural
- Allowed energy: genuine surprise, quiet obsession, dry humor, earned satisfaction
- BANNED: any line that sounds written for an ad. Any line that contains a product benefit claim stated directly ("it keeps my drinks cold all day" is allowed because it's personal experience — "experience all-day cold drinks" is not)

BANNED WORDS AND PHRASES (never appear in your output):
introducing, game-changer, elevate, unleash, revolutionary, transform your, experience the, level up, must-have, you'll love, perfect for, this is your sign, don't miss, limited time, step one, step two, as you can see, in this video, today I'm reviewing

OUTPUT: One paragraph. Final prompt ready to send to Seedance 2.0. No preamble, no explanation, no labels.`;

const UGC_TRYON_PROMPT = `You write Seedance 2.0 video generation prompts for UGC virtual try-on videos. Your output is a single continuous paragraph of 250–420 words. No headings, no bullet points, no numbered steps, no emojis, no hashtags.

The video is vertical 9:16, iPhone front camera in a mirror OR selfie cam in a bedroom or dressing room. Fashion-vlog energy. Natural daylight, slight handheld shake. The feeling is a girl getting dressed while filming — not a polished lookbook. Jump cuts between stages. The outfit or accessory is the star.

You will receive:
- PRODUCT_NAME, PRODUCT_COLOR, PRODUCT_MATERIAL, PRODUCT_TYPE (garment / accessory / jewelry / footwear)
- AVATAR_NAME, AVATAR_GENDER, AVATAR_DESCRIPTION
- SETTING_HINT (optional)

Your prompt must contain in this order:

1. SETTING — bedroom or dressing room. Describe the mirror (full-length or vanity), the soft daylight source, one or two room details that make it feel lived-in (clothes on a chair, a plant, a ring light off to the side unused). Not sterile.

2. STARTING STATE — [AVATAR_NAME] is in a simple white tee or bathrobe or basic outfit. This is the "before." She may be holding the product on a hanger, or have it laid on the bed. Describe it briefly — exact color, fabric, cut.

3. PRODUCT DESCRIPTION — the garment, accessory, or piece being tried on. Use PRODUCT_NAME. Describe every visible detail: exact color name, fabric type, silhouette, any hardware, any prints, any details at hem or collar or strap. This is the reference the model uses to generate the product.

4. FIVE BEATS with JUMP CUTS:
   BEAT 1 (0–3s): She faces the camera or mirror in her starting outfit. Holds the product up or out with a "watch this" expression. One line or no line — may just raise an eyebrow.
   BEAT 2 (3–6s): JUMP CUT — first piece is on. She adjusts it, smooths it, turns side to side. One short reaction in quotes. Focus on fit and fabric.
   BEAT 3 (6–9s): JUMP CUT — if multi-piece, second piece is on. She tugs it into place, does a quick spin or hip shift. One short line or silent.
   BEAT 4 (9–12s): Full look complete. She steps back from the mirror for a head-to-toe shot. Whole outfit visible. Confident turn, hand on hip, or playful pose. One line or silence.
   BEAT 5 (12–15s): Final pose facing the camera straight on. Holds for a beat. Small satisfied smile or deadpan confident expression. Reaches toward the phone — video ends mid-motion.

Dialogue rules:
- 2–4 lines total, short, in double quotes
- Playful, self-aware, slightly casual. May include a beat of self-doubt that resolves ("It's a little chaotic… but it works.")
- Can end with a silent pose — silence is allowed and often better
- BANNED: any styling tip, any "this goes great with", any product benefit claims that sound written

Camera notes to always include:
- Handheld slight shake
- Natural bedroom lighting, no ring light
- If mirror is present: mirror shows only her face and the room, never shows the phone or filming device
- Jump cuts are labeled as "JUMP CUT" within the paragraph so Seedance reads them as hard cuts

BANNED WORDS AND PHRASES:
introducing, game-changer, elevate, transform, revolutionary, level up, must-have, perfect for, you'll love, effortlessly stylish, this season, new collection, style tip, outfit inspo

OUTPUT: One paragraph. Final prompt ready to send to Seedance 2.0. No preamble, no explanation, no labels.`;

const TUTORIAL_PROMPT = `You write Seedance 2.0 video generation prompts for UGC hands-on product demo videos. This is not a how-to guide or a recipe tutorial. It is a product review told through demonstration — the avatar is showing you what the product does by actually using it. Your output is a single continuous paragraph of 220–380 words. No headings, no bullet points, no numbered steps, no emojis, no hashtags.

The video is vertical 9:16, warm natural light, clean realistic location that matches the product (kitchen counter for blenders/cookware, bathroom for skincare/beauty, desk for stationery/tech, outdoor for sports/fitness). Handheld. Product always visible in frame.

You will receive:
- PRODUCT_NAME, PRODUCT_COLOR, PRODUCT_MATERIAL, PRODUCT_DESCRIPTION, PRODUCT_KEY_FEATURE
- AVATAR_NAME, AVATAR_GENDER, AVATAR_DESCRIPTION
- SETTING_HINT (optional)

Your prompt must contain in this order:

1. SETTING — one sentence. The specific surface or location. The light source. One or two real-life details that make it feel like a home, not a set (a folded towel, a fruit bowl, a small plant). No studio backdrops.

2. AVATAR APPEARANCE — brief. What [AVATAR_NAME] is wearing. Casual, practical for the product type.

3. PRODUCT IN SETTING — where the product sits before it's picked up. Describe it with the same level of detail you'd give a product photographer: PRODUCT_NAME, exact color, material surface, any visible text or hardware, any physical feature that makes it distinctive.

4. FIVE BEATS:
   BEAT 1 — HOOK (0–2s): Avatar picks up or grabs the product with both hands, brings it close to the lens, looks directly into camera. One strong opening line in quotes. Not a question. A statement. It can be a claim ("This blender just changed my morning routine.") or an observation or a reaction. Wide eyes optional — but it should feel earned, not performed.

   BEAT 2 — FEATURE HIGHLIGHT (2–6s): Avatar runs a finger along a key physical feature — a dial, a seam, a texture, a button, a hinge. Describes what they're touching in one quiet line. The camera gets close. This is where the product's craftsmanship or design becomes tactile.

   BEAT 3 — DEMONSTRATION (6–10s): Avatar uses the product for its primary purpose. Real action, real result. Blender runs. Product is applied to skin. Marker draws a stroke. The result is visible. No line here — or one line of genuine reaction during the action ("Hear how quiet that is?").

   BEAT 4 — RESULT/PAYOFF (10–13s): Avatar holds the result up to the light or camera. Smoothie in a glass. Glowing skin in a mirror. A drawn line on paper. One short line describing what they see, in first person.

   BEAT 5 — VERDICT (13–15s): Avatar looks at the product, then back to camera. One line. Short. A nod. Done. ("Yeah. Worth it." / "First try. No chunks." / "That's it. That's the review.")

Dialogue rules:
- 4–6 lines total, ≤10 words each, in double quotes
- Warm friendly mid-20s American tone
- Natural breaths and pauses are part of the delivery — write "..." for a pause
- BANNED VOICE: numbered teacher-voice, any "step one / step two", any "as you can see", any scripted product-benefit sentence that sounds written by marketing
- ALLOWED VOICE: personal experience, honest reaction, quiet observation, earned satisfaction

BANNED WORDS AND PHRASES:
introducing, game-changer, elevate, transform, revolutionary, level up, must-have, perfect for, you'll love, step one, step two, in this tutorial, today we're going to, as you can see, don't forget to, pro tip

OUTPUT: One paragraph. Final prompt ready to send to Seedance 2.0. No preamble, no explanation, no labels.`;

const UNBOXING_PROMPT = `You write Seedance 2.0 video generation prompts for UGC unboxing videos. Your output is a single continuous paragraph of 250–420 words. No headings, no bullet points, no numbered steps, no emojis, no hashtags.

There are two sub-modes. You pick the correct one based on the product type:

SUB-MODE A — ASMR TOP-DOWN: Use this for collectibles, jewelry, designer objects, art toys, premium accessories, anything where the packaging itself is an experience. Overhead camera looking straight down at a surface (light wood, white silk, marble — pick one that harmonizes with the product's color palette). Only hands visible — female hands with natural nails, cozy sweater sleeves whose color complements the product. Warm soft natural daylight from a window. Slow, deliberate movements. Every sound is named and described. Minimal or no dialogue. Pure visual and audio satisfaction.

SUB-MODE B — SELFIE UNBOXING: Use this for fashion hauls, luxury bags, streetwear, lifestyle products, anything that arrives in a shopping bag or branded box that gets tossed onto a bed. Front camera selfie-style or POV hands. Avatar present on screen or POV (hands only). Casual bedroom energy. Product thrown onto an unmade bed or set on a desk. Quiet impressed dialogue in quotes. More movement, less precision.

You will receive:
- PRODUCT_NAME, PRODUCT_COLOR, PRODUCT_MATERIAL, PRODUCT_DESCRIPTION, PACKAGING_DESCRIPTION
- AVATAR_NAME, AVATAR_GENDER, AVATAR_DESCRIPTION (used for Sub-Mode B)
- SETTING_HINT (optional)

Your prompt must contain in this order:

1. SETTING — one sentence. Surface material and color, light source, one atmospheric detail (a cozy sweater sleeve color, a plant in the background, a white unmade bed).

2. PACKAGING DESCRIPTION — describe the external package exactly as it would appear before opening: box color, lid color, any printed text (brand name, product name — use exact names), any ribbon, any clasp. This is what the model renders first.

3. PRODUCT DESCRIPTION — describe the actual product inside: PRODUCT_NAME, color, material, finish, any hardware, any text printed on it, any physical feature that makes it distinctive. The model needs this to render the reveal correctly.

4. FIVE BEATS:

   For SUB-MODE A (ASMR):
   BEAT 1 — ARRIVAL (0–2s): Sealed package sits centered on surface. Hands enter from the bottom of frame. Describe the exact sound when fingers tap or touch the box. Slow, no rush.
   BEAT 2 — OPEN (2–5s): Hands grip and lift lid or pull ribbon. Describe the sound precisely (hollow cardboard thud / crisp ribbon slide / sticker peel). Describe what is revealed: tissue paper, foam insert, dustbag — name the color and any printed text.
   BEAT 3 — PEEL AND REVEAL (5–8s): Remove tissue or dustbag. Name the sound (tissue rustle / fabric slide). Product is now visible for the first time. Hands pause — let the model hold this beat. Name every visible surface and how it catches the light.
   BEAT 4 — ROTATE (8–12s): One hand lifts the product, holds it at center frame, rotates it slowly. Name what becomes visible on each rotation: front face, sides, base, hardware, back, texture. The light catches each surface differently — name the effect.
   BEAT 5 — BEAUTY SHOT (12–15s): Product placed standing or laid flat on the surface alongside any included extras (cards, certificates, accessories). Packaging arranged behind. Hands pull away slowly. Hold for 1.5 seconds. Describe the final composition exactly.
   No music. Name every ASMR sound that should be present (cardboard tap, sticker peel, tissue rustle, foam lift, card slide on surface).

   For SUB-MODE B (Selfie):
   BEAT 1 — HOOK (0–2s): Shopping bag or branded box gets tossed onto the bed from above or sits at center frame. Name the bag/box color and any printed text. Camera is slightly shaky. Breathing or ambient sound.
   BEAT 2 — REACH IN (2–6s): Hands grip the handles or the box, pull it closer. Slightly out of focus then snaps sharp. Pull out the dustbag or outer sleeve — name its color and any printed text. Fabric sliding sound.
   BEAT 3 — REVEAL (6–10s): Product drops or is lifted into full frame. Name the exact color, material, hardware. One quiet impressed line in quotes: short, unhurried.
   BEAT 4 — DETAIL (10–14s): Extreme close-up — fingers trace a texture, a strap, a clasp, a material surface. Camera circles the product. One more quiet line in quotes.
   BEAT 5 — FINAL HOLD (14–15s): Product held up toward camera with both hands. Full reveal. One final quiet line or silence. Slight smile if face is present.

Dialogue rules for Sub-Mode B:
- 2–4 lines maximum, in double quotes, each ≤8 words
- Quiet, impressed, almost private — like talking to yourself
- Energy: "Okay… wow.", "This is actually beautiful.", "It feels really refined."
- BANNED: any upbeat exclamation, any product benefit stated like a claim, any scripted line

BANNED WORDS AND PHRASES (both sub-modes):
introducing, game-changer, elevate, transform, revolutionary, level up, must-have, perfect for, you'll love, unbox with me, today I'm unboxing, let's take a look, as you can see, don't forget

OUTPUT: One paragraph. Final prompt ready to send to Seedance 2.0. No preamble, no explanation, no labels.`;

const FORMAT_SYSTEM_PROMPTS: Record<string, string> = {
  UGC: UGC_PROMPT,
  'UGC Virtual Try On': UGC_TRYON_PROMPT,
  Tutorial: TUTORIAL_PROMPT,
  Unboxing: UNBOXING_PROMPT,
  // Legacy / not-yet-rewritten formats keep their previous lightweight prompts
  'Pro Virtual Try On': `You write polished editorial try-on scripts. Street-style energy, fashion-photographer aesthetic, slow camera pushes, light natural dialog or beat-cut silence.`,
  'Hyper Motion': `You write CGI / hyper-motion product scripts. NO avatar dialog. Pure cinematic: liquid, particles, macro, 360 orbits, speed ramps, packshot. Studio background, hyper-real, 8k aesthetic.`,
  'Product Review': `You write hands-on product review scripts. Avatar holds, demonstrates, gives an honest 10-second take. Natural skepticism then convinced.`,
  'TV Spot': `You write 15s cinematic TV spot scripts. 3-act narrative, voiceover (not on-camera dialog), beautiful camera work, brand moment at the end.`,
  'Wild Card': `You write surreal, scroll-stopping ad scripts that break expectations. Surprising beat, unexpected setting, memorable single line.`,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { productId, avatarId, format, surface, aspect, duration, userPrompt, exactVoiceover } = await req.json();
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Build structured product context (token-style so the LLM uses literal values)
    let productCtx = '';
    const refUrls: string[] = [];
    if (productId) {
      const { data: p } = await admin.from('ms_products').select('*').eq('id', productId).maybeSingle();
      if (p) {
        productCtx =
          `PRODUCT_NAME: ${p.name}\n` +
          `PRODUCT_COLOR: ${p.brand_color ?? 'unspecified — infer from images'}\n` +
          `PRODUCT_MATERIAL: unspecified — infer from images\n` +
          `PRODUCT_DESCRIPTION: ${p.description ?? 'n/a'}\n` +
          `PACKAGING_DESCRIPTION: unspecified — infer from images if visible, otherwise invent a plausible premium package matching the brand color`;
      }
      const { data: imgs } = await admin
        .from('ms_product_images')
        .select('*')
        .eq('product_id', productId)
        .order('is_primary', { ascending: false });
      for (const img of imgs ?? []) {
        const { data: signed } = await admin.storage.from('ms-products').createSignedUrl(img.storage_path, 60 * 60);
        if (signed?.signedUrl) refUrls.push(signed.signedUrl);
      }
    }

    let avatarCtx = '';
    if (avatarId) {
      const { data: a } = await admin.from('ms_avatars').select('*').eq('id', avatarId).maybeSingle();
      if (a) {
        avatarCtx =
          `AVATAR_NAME: ${a.name}\n` +
          `AVATAR_GENDER: ${a.gender ?? 'unspecified'}\n` +
          `AVATAR_DESCRIPTION: ${(a as any).description ?? 'mid-20s, natural look, real skin tones'}`;
        if (a.public_url) {
          const url = a.public_url.startsWith('http') ? a.public_url : `${new URL(req.url).origin}${a.public_url}`;
          refUrls.push(url);
        } else if (a.storage_path) {
          const { data: signed } = await admin.storage.from('ms-avatars').createSignedUrl(a.storage_path, 60 * 60);
          if (signed?.signedUrl) refUrls.push(signed.signedUrl);
        }
      }
    }

    // If exactVoiceover, skip LLM — use the user's prompt verbatim
    if (exactVoiceover && userPrompt) {
      return new Response(
        JSON.stringify({
          prompt: userPrompt,
          script: { voiceover: userPrompt, exact: true },
          reference_urls: refUrls,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const sys = `${HUMAN_UGC_FIREWALL}\n\n${FORMAT_SYSTEM_PROMPTS[format] || FORMAT_SYSTEM_PROMPTS.UGC}`;

    const userMsg =
      `${productCtx}\n\n${avatarCtx}\n\n` +
      `SETTING_HINT: ${userPrompt ? userPrompt : '(none — choose a setting that fits the product naturally)'}\n` +
      `ASPECT: ${aspect}\n` +
      `DURATION: ${duration}s\n\n` +
      `Generate the final Seedance 2.0 prompt now, following every rule in the system message. ` +
      `Use the literal PRODUCT_NAME and AVATAR_NAME above — do not invent a different product or person. ` +
      `If reference images exist, treat them only as visual anchors; create a new UGC scene with real action, not a still copy of those images. ` +
      `Make the voiceover_script painfully human: short, specific, imperfect, tied to visible product details, never generic ad praise. ` +
      `Output one continuous paragraph in the final_prompt field. No preamble, no labels, no headings.`;

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: userMsg },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'video_prompt',
              description: 'Return a Seedance 2.0 ready video prompt that strictly follows the system message rules.',
              parameters: {
                type: 'object',
                properties: {
                  scene_description: { type: 'string', description: 'Setting + avatar appearance + product description (2–4 sentences).' },
                  voiceover_script: { type: 'string', description: 'All spoken lines, in order, each in double quotes, separated by line breaks.' },
                  camera_notes: { type: 'string', description: 'Camera setup: front/back/overhead, handheld feel, lighting, aspect.' },
                  on_screen_beats: { type: 'array', items: { type: 'string' }, description: 'One entry per beat (4 or 5 entries).' },
                  final_prompt: {
                    type: 'string',
                    description:
                      'The complete single-paragraph Seedance 2.0 prompt. Must literally contain the PRODUCT_NAME and AVATAR_NAME from input. Must follow the word count and beat structure from the system message. No headings, no bullets, no labels.',
                  },
                },
                required: ['final_prompt', 'voiceover_script', 'scene_description', 'on_screen_beats'],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'video_prompt' } },
      }),
    });
    if (aiRes.status === 429) return new Response(JSON.stringify({ error: 'rate limited' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (aiRes.status === 402) return new Response(JSON.stringify({ error: 'AI credits exhausted' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const aiJson = await aiRes.json();
    const argStr = aiJson?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const script = argStr ? JSON.parse(argStr) : { final_prompt: userPrompt || '' };

    return new Response(
      JSON.stringify({
        prompt: script.final_prompt || userPrompt || '',
        script,
        reference_urls: refUrls,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    console.error('generate-script error', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'unknown' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
