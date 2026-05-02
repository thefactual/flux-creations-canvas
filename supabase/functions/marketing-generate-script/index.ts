// Generate a Seedance-ready prompt + script from product + avatar + format preset.
// Multimodal: sends product/avatar images directly to the LLM so the writer can
// reference real physical details. Rolls a creator persona per call for variety.
// Few-shot anchored on Higgsfield reference prompts. Treats user prompts as
// USER_DIRECTION (creative core), not just a setting hint.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Claude Sonnet 4.5 — primary writer. Anthropic direct, then OpenRouter, then
// Lovable Gateway (Gemini) as a final emergency fallback so we never fail open.
const CLAUDE_MODEL_ANTHROPIC = 'claude-sonnet-4-5';
const CLAUDE_MODEL_OPENROUTER = 'anthropic/claude-sonnet-4.5';
const EMERGENCY_GEMINI_MODEL = 'google/gemini-2.5-pro';

// Creatify skill (full doc at supabase/functions/_skills/creatify-video-ad.md) is NOT
// inlined anymore — it diluted the prompt and produced checkbox-y scripts. We keep
// only a distilled cheat sheet (CREATIFY_DISTILLED below) as a passive reference.

// ---------- Creator personas (rolled per call) ----------
type Persona = {
  id: string;
  name: string;
  voice: string;
};

const PERSONAS: Persona[] = [
  {
    id: 'dry-deadpan',
    name: 'Dry Deadpan',
    voice:
      'Flat affect, slightly bored delivery that gives way to one genuine reaction. Short sentences. Pauses are weapons. No exclamation points. Final verdict is understated ("Yeah. It\'s good.").',
  },
  {
    id: 'wide-eyed-genuine',
    name: 'Wide-Eyed Genuine',
    voice:
      'Quietly amazed, almost whispering. Talks like she just found something nobody knows about. Uses "Wait" and "Look" a lot. Lines feel discovered, not announced.',
  },
  {
    id: 'chaotic-bestie',
    name: 'Chaotic Bestie',
    voice:
      'Talks fast, half-laughing, mid-thought asides ("WHY is there a duck"). Self-interrupts. Genuinely losing it over one detail. Energy is "I had to text you about this."',
  },
  {
    id: 'quiet-luxury',
    name: 'Quiet Luxury',
    voice:
      'Low volume, slow pacing, almost private. Lines under six words. Talks to herself, not the camera. Energy: "It feels really refined." Never excited, only impressed.',
  },
  {
    id: 'hype-friend',
    name: 'Hype Friend',
    voice:
      'Warm, encouraging, talking to a friend they want to put on. Uses "Okay so" openers. Honest enthusiasm with concrete reasons attached. Never marketing-bright, always personal.',
  },
  {
    id: 'low-key-cool',
    name: 'Low-Key Cool',
    voice:
      'Slight smirk, half-smile. Says less than she could. One eyebrow energy. Final line is a one-liner verdict ("Yeah this is the one." / "You are welcome.").',
  },
];

function rollPersona(): Persona {
  return PERSONAS[Math.floor(Math.random() * PERSONAS.length)];
}

const CREATIVE_ANGLES = [
  'Pattern Interrupt: start mid-action with the product unexpectedly entering frame, then reveal the specific detail that makes it worth stopping for.',
  'Day-in-the-Life: show the product moving through one realistic premium moment, with a tactile proof beat and a quiet payoff.',
  'Feature Cascade: open on the most visual feature, then stack two close-up proof beats before the creator reacts naturally.',
  'Before/After: begin with a plain everyday moment, add the product, then show the improved styling/result in one clean payoff.',
  'POV Hook: make the viewer feel like Alexia is texting/showing her best friend one unusually good find, with camera switches and close-ups.',
  'Social Proof Stack without stats: frame it as "I get it now" — visible detail first, use/wear test second, honest final reaction third.',
];

function rollCreativeAngle() {
  return CREATIVE_ANGLES[Math.floor(Math.random() * CREATIVE_ANGLES.length)];
}

// ---------- Hard rules that override every format ----------
const HUMAN_UGC_FIREWALL = `You are not writing ad copy. You are writing the exact prompt a strong UGC director would send to a video model.

Hard rules that override every format below:
- Make a fresh scene, not a recreation of the uploaded reference images. References are identity/product anchors only.
- AVATAR REFERENCE POLICY: the avatar image is ONLY for facial identity / likeness. Never copy its room, wall color, furniture, door, background, wardrobe, pose, lighting, camera crop, or selfie composition into final_prompt. Invent a new outfit and a new product-context setting every time.
- The creator's spoken lines must sound like a real person talking to a friend, not a brand, narrator, influencer script, or marketing voiceover.
- No generic praise unless attached to a CONCRETE physical detail you can SEE in the product images. Empty lines like "I'm obsessed", "so good", "love this" are banned UNLESS the next words name an exact color, texture, fit, hardware piece, movement, sound, or visible result.
- Every beat must contain real physical action: tilt, tap, trace, pull, peel, wear, use, rotate, pour, draw, lace, zip, clasp, sip, test, compare, or reveal.
- Every output must have a real ad idea from the Creatify framework: a hook, a body structure, and a payoff. Static "hold product, tilt, say verdict" scripts are rejected unless the user explicitly asked for a plain product hold-up.
- Mention the product by its literal PRODUCT_NAME, but do not repeat the name in every sentence.
- USER_DIRECTION (when present) is the creative core. Build the beats and dialogue AROUND it. Format rules govern camera/structure only — they NEVER override the user's creative direction.
- If USER_DIRECTION is blank, invent a product-specific creative angle from the visible product details. Never default to a static hold-up.
- If an avatar is provided, use them as the creator inside the scene. If no avatar is provided, use POV hands (with described nail color and sleeve color matched to product palette) — NEVER invent a random spokesperson.
- Output MUST feel like the EXAMPLE OUTPUT below: camera/style line, concrete scene/product paragraph, then "Action and dialogue sequence:" with timed physical beats and short quoted lines.
- The CREATOR_PERSONA voice is mandatory — every line of dialogue must sound like that specific archetype, not a generic UGC creator.
- The concrete_product_details array MUST contain at least 4 items extracted from the actual product images (color names, materials, hardware pieces, printed text, distinctive features). Do not invent details that aren't visible.
- READABLE TEXT RULE: any printed text, lettering, numbers, slogans, or logos visible on the product, garment, or packaging MUST be described as facing the camera and reading FORWARD — perfectly legible. NEVER use mirror reflections, mirror selfies, or any framing where on-product text would appear reversed/flipped/mirrored. If the camera angle would mirror the text, change the camera angle. State explicitly inside the prompt that the text reads forward.`;

// Distilled Creatify reference. Use sparingly — Higgsfield few-shots are the dominant
// stylistic signal. These are HINTS the writer can pull from, not a checklist.
const CREATIFY_DISTILLED = `CREATIFY REFERENCE (use only if it fits the product naturally — never force a formula):
HOOK FORMULAS (pick at most one):
- Pattern Interrupt — start mid-action, unexpected visual.
- POV Hook — "POV: you finally found a [thing] that [does X]".
- Bold Claim — lead with the strongest single benefit, stated flat.
- Question Hook — open a curiosity loop the viewer must close.
- Stat / Authority — one number or one credential, no list.
BODY STRUCTURES (pick at most one):
- Problem → Agitate → Solve.
- Feature Cascade — hero feature, two supporting beats, proof.
- Social Proof Stack — quote, visible proof, volume, urgency.
- Before / After — plain → product → improved result.
- Day-in-the-Life — one realistic moment, tactile beat, quiet payoff.
Rules: pick formulas silently. Never name them in the output. If USER_DIRECTION is present, the user's idea wins — formulas only shape camera/structure.`;

// ---------- Few-shot example outputs (verbatim Higgsfield) ----------
const EX_UGC = `EXAMPLE OUTPUT (study the structure, tone, persona-fit, concrete sensory detail — never copy literally):
Vertical 9:16 selfie-style UGC tennis racket review, shot on iPhone front and back camera mix, natural daylight on an outdoor tennis court, handheld authentic energy, casual "showing a friend my new racket" vibe, warm natural light, real skin tones, no filters. An outdoor tennis court — green hard court surface with white lines, a net visible in the background, natural daylight. The young woman wears a bright lime green tennis outfit, the vivid green a striking contrast against the mint green and orange of the AURA 300 racket; she holds the SERA AURA 300 — mint green to white gradient frame, orange cross-string pattern through the white string face, white perforated grip tape, AURA 300 lettering on the shaft. Action and dialogue sequence: She holds the AURA 300 up to the front camera, the full racket face filling the vertical frame, tilts it slowly catching the sun: "Okay so this just arrived and I am obsessed with the color." She switches to the back camera, bounces the racket lightly on her palm: "It feels really balanced, like not too heavy." She brings the racket close to the back lens so the orange cross-string pattern fills the frame. She props the phone, hits two slow controlled groundstrokes — the lime green outfit and mint racket moving through the frame together. Close-up back camera, pans down the shaft past the AURA 300 lettering: "And the grip feels so good, really clean." She holds the full racket up beside her face on the front camera: "Yeah. Yeah this is the one."`;

const EX_TUTORIAL = `EXAMPLE OUTPUT (study the structure, tone, persona-fit, concrete sensory detail — never copy literally):
Shot on iPhone front camera, vertical 9:16, natural HDR, slight exposure shifts, real skin tones, authentic UGC creator energy, warm indoor natural light. A bright casual room — warm natural light from the side, a clean desk surface with the ATELIER INK 12 CORE colors set in its clear transparent plastic case, the colorful marker caps visible through the case walls, a white sketchpad open beside it. A young woman sits close to the front camera, relaxed and natural. Action and dialogue sequence: She picks up the full ATELIER INK clear case with both hands and holds it up to the front camera, the 12 colorful caps facing the lens: "Okay I need to show you these." She pulls out the green G04 marker, uncaps it slowly, sniffs the tip, pauses: "Why does it smell like that." She opens the sketchpad and draws a slow deliberate star with the green marker. Holds the paper up: "That color is insane." She picks up the cobalt blue B17, draws beside the green: "The pigment is so good." Looks directly into the camera, taps the marker cap slowly against her lip: "Honestly — if you draw, if you doodle — just get these." Lifts the full clear case up to the lens: "That's it. That's the review."`;

const EX_TRYON = `EXAMPLE OUTPUT (study the structure, tone, persona-fit, concrete sensory detail — never copy literally):
A 15-second vertical (9:16) UGC try-on video filmed on a smartphone. A young East Asian woman with a short black bob stands in front of a full-length mirror in a minimalist bedroom — neutral beige walls, natural daylight from a window. Handheld selfie-style. 0–3s: She faces the mirror wearing a simple white tee, holds up a black fitted top and a black-and-white striped mini skirt on hangers with a "watch this" expression, raises an eyebrow. JUMP CUT — she's now wearing the fitted black short-sleeve top, adjusts the hem, turns side to side. JUMP CUT — pulls on the black-and-white striped knit mini skirt, tugs it over her hips, does a quick spin. JUMP CUT — full outfit complete with bright neon yellow tights and matching neon yellow pointed-toe stilettos. She steps back, does a confident slow turn, hand on hip. Faces the mirror straight on, deadpan editorial expression, holds for a beat then breaks into a small satisfied smile. Reaches toward the phone — video ends mid-motion. Quick jump cuts, handheld slight shake, natural bedroom lighting, no ring light, no music, no text.`;

// Unboxing reference library — 4 distilled gold-standard examples, each tagged
// with its CAMERA LANGUAGE so Claude treats them as a *palette*, not a template.
// Per request we shuffle and inject all 4 (small enough to fit). Claude is
// instructed to study the WAY they're written, propose 3+ camera-language
// options for THIS product, pick the best, and write a NEW concept in that
// language — never copy literally.
const EX_UNBOXING_LIBRARY = `REFERENCE LIBRARY — five gold-standard unboxing scripts. Study the EXACT SHAPE: an optional one-line ACTION HEADER that names who does what (with @avatar: / @image_N / @product: tags inline), then — only when there IS dialogue — a "Dialogue (tone, tone, tone):" block with each spoken line on its OWN line in double quotes, then a standalone "NO MUSIC, ONLY SFX" line, then the rich VIDEO BLOCK which itself opens with the @product: / @avatar: tags + camera-language tag + duration ("@product:UUID @avatar:UUID VIDEO — 10-second vertical (9:16) satisfying ASMR unboxing of …"), then inline labelled sections — "Format: …", "Scene 1 — Title (0–3s): …", "Scene 2 — Title (3–6s): …", "Scene 3 — Title (6–10s): …", and a closing "Overall style: …" sentence. Silent ASMR scripts skip the dialogue block entirely. Do NOT copy literally — invent a fresh concept that fits THIS product, in the matching reference structure.

[TOP-DOWN ASMR — cozy, hands-only, sound-first, no dialogue]
@product:PRODUCT_UUID VIDEO — 10-second vertical (9:16) satisfying ASMR unboxing of "FROGGY PRINCE" by "MELON STUDIO × PLAY PALS"
Product: A cute vinyl art toy figure — a chubby character wearing a green frog costume hoodie with a small red felt crown on top. Big black sparkly star eyes with white star highlights, rosy pink cheeks, open happy smile. Orange bow tie, red heart on the belly, white boots with red heart details. Comes in a square pastel-yellow box with green lid, plus collectible art cards.
Format: Overhead top-down camera looking straight down at a light wooden desk surface. Only hands visible — female hands, short natural nails, cozy oversized sage-green sweater sleeves. Warm soft natural lighting from a window on the left. Slow, deliberate, ASMR-style movements.
Scene 1 — Box Tap + Open (0–3s): The sealed yellow-and-green square box sits centered on the wooden desk. The illustrated Froggy Prince character is visible on the front — a cute kid in a frog hoodie with "Froggy Prince" in playful green cursive and "MELON STUDIO × PLAY PALS" below. Fingers tap the box lid three times — satisfying hollow cardboard thuds. Then both hands grip the green lid and lift it straight up slowly — revealing white tissue paper inside with a small round green sticker seal. The lid is placed to the right.
Scene 2 — Tissue Peel + Figure Reveal (3–6s): Fingers peel the green sticker seal (satisfying crisp peel sound), then pull the tissue paper apart to reveal the Froggy Prince figure nestled in a shaped foam insert. A brief pause — the figure sits snugly in its cutout, the red felt crown, glossy green body, and pink cheeks immediately visible. One hand lifts the figure out gently, holds it up at center frame, and rotates it slowly — showing the front face (big star eyes, open smile), the orange bow tie, the red heart on the belly, and the little white boots. The vinyl surface catches the warm light with a soft glossy sheen.
Scene 3 — Cards + Final Display (6–10s): The figure is placed standing upright on the desk. Hands reach back into the box and pull out two square art cards stacked together. The first card (orange background, sparkle details) is slid to the left — showing the illustrated Froggy Prince character with "FROGGY PRINCE" in bold blue retro text. The second card (pink background, heart frame) is slid to the right — showing the character inside a rainbow heart. Both cards are tapped once into alignment on the desk. Final arrangement: the figure standing center on the wooden desk, the open box behind it, the green lid leaning against the box showing the illustrated front, both art cards fanned in front. Hands pull away. Hold the beauty shot for 1.5 seconds — warm light, cozy desk, the little frog prince smiling at camera.
Overall style: Cozy ASMR unboxing for Xiaohongshu/TikTok. Top-down overhead, no face, only hands. Every sound crisp and amplified — cardboard tap, sticker peel, tissue rustle, vinyl figure lifted from foam, cards sliding on wood. NO MUSIC, ONLY SFX — pure ASMR sounds only. Warm natural daylight, light wooden surface, sage-green sweater sleeves for color harmony with the frog character. Slow, satisfying, tactile. Vertical 9:16. Designer toy collector aesthetic.

[THEATRICAL REVEAL — slow paper-stage, single hero piece, near-silent, no dialogue]
@product:PRODUCT_UUID VIDEO — A 15-second vertical (9:16) ASMR-style jewelry unboxing
Product: A delicate silver chain necklace with a small silver key pendant (heart-shaped bow at the top), housed in a theatrical matte-red gift box that unfolds like a storybook to reveal an inner pop-up diorama scene — deep navy backdrop with gold shooting stars and pink paper-cut clouds, tiny text at the bottom reading "you are the key".
Format: Top-down overhead camera throughout. Surface draped in soft white silk or satin fabric with gentle folds and creases creating elegant light and shadow. Soft diffused natural daylight, warm tone. No text overlays, no logos, no branding. Silent visual ASMR — slow, theatrical, satisfying. Only hands visible (natural nails, no polish, one thin gold ring).
Scene 1 — Heart Clasp Open (0–3s): A striking matte red square gift box sits centered on the white silk. The lid features a silver heart-shaped clasp with a keyhole in the center, surrounded by four small decorative square patches with graphic black-and-white optical patterns (stripes, sunbursts). A white satin ribbon trails loosely from under the box across the silk. Her hands enter frame from the bottom and gently touch the sides of the box, fingers tracing the heart clasp. She slowly turns the heart clasp — it clicks open with a satisfying motion.
Scene 2 — Storybook Diorama Reveal (3–7s): The box unfolds outward like a book — the front panel swings open on a hinge to reveal an elaborate inner scene. Inside is a miniature diorama: a deep navy blue backdrop painted with gold shooting stars and pink paper-cut clouds at the bottom — like a tiny magical night sky theater. In the center, suspended on a small hook, hangs the delicate silver chain necklace with the small silver key pendant. The diorama catches the light — gold foil stars shimmer, the pendant slowly sways. Her hands pause, letting the viewer take in the reveal.
Scene 3 — Necklace Lift (7–10s): She carefully unclips the necklace from its display hook inside the diorama. She lifts it out slowly — the thin silver chain catches the light as it rises from the blue backdrop. She drapes the necklace across her open palm over the white silk, the key pendant dangling between her fingers. She turns her hand slightly so the pendant rotates and catches the light from different angles — the silver gleams against her skin.
Scene 4 — Final Flatlay (10–15s): She lays the necklace down on the white silk in a gentle S-curve. She picks up the open box and tilts it toward camera — showing the diorama interior one more time. Then a final flatlay: the open red box at the top of frame, silver key necklace below in an elegant curve, white ribbon diagonal across. Her hand gently adjusts the pendant one last time, then slowly pulls away. The silk catches a gentle highlight. Hold. End.
Overall style: Aesthetic jewelry unboxing / visual ASMR. Overhead POV, only hands visible. The packaging IS the star — a theatrical, interactive box that opens like a storybook to reveal a paper-cut diorama. One single jewelry piece — the reveal is slow and dramatic. Color palette: matte red box, navy blue interior, gold foil accents, pink paper clouds, silver jewelry, pure white silk background. Intimate, luxurious, deeply satisfying, gift-worthy. NO MUSIC, ONLY SFX. No brand names visible anywhere.

[QUIET HANDHELD — avatar + box on a table, impressed whisper, intimate]
Man influencer @avatar:AVATAR_UUID first opens the box @image_1 then takes the product with its packaging out of the box @product:PRODUCT_UUID

Dialogue (quiet, impressed, natural):
"Okay… wow."
"This is actually beautiful."
"It feels… really refined."
"Like, nothing extra — just clean, perfect details."

NO MUSIC, ONLY SFX

@product:PRODUCT_UUID @avatar:AVATAR_UUID VIDEO — A 12-second vertical (9:16) quiet unboxing in a calm naturally-lit room
Product: A small refined finished good in a matte off-white rigid two-piece box, embossed wordmark catching the light, thin grey grosgrain ribbon tied once across the top, tissue paper folded in clean overlapping triangles inside, the product nested in a custom matte-foam cradle.
Format: Shot handheld at chest height, slight micro-shake, real skin tones. Soft window daylight from camera-left, neutral oak table, no music. The man — mid-thirties, plain ash-grey crew tee, simple leather watch, short dark hair — sits at the table with the closed box in front of him. The packaging stays in frame the entire video as the supporting actor.
Scene 1 — Lid Lift (0–3s): He runs a finger along the embossed wordmark, feels the lid weight, then lifts it straight up. A whisper of cardboard friction. Inside: tissue paper folded in clean overlapping triangles. He says quietly, almost to himself: "Okay… wow."
Scene 2 — Product Out (3–7s): He folds the tissue back. He lifts the product with both hands, slowly, the way you'd lift a watch. Turns it once toward the window so the natural light catches one specific finished edge. Beat. "This is actually beautiful."
Scene 3 — Tactile Detail (7–10s): He sets it down on the open box (so the packaging is still in frame as context), runs his thumb across one specific surface detail — a brushed metal seam, a stitched edge, a logo plate — and exhales. "It feels… really refined."
Scene 4 — Close (10–12s): He looks down at the product, then back up at the lens with the tiniest half-smile, almost private: "Like, nothing extra — just clean, perfect details." Hold half a beat. End.
Overall style: Quiet luxury unboxing. NO MUSIC, ONLY SFX — soft handling sounds: cardboard friction, tissue rustle, fingertip on metal, his low whisper. The packaging stays visible the entire video as the supporting actor. Restrained physical blocking — no chopping gestures, no spins, no ta-da. Vertical 9:16.

[VLOG SELFIE — iPhone front cam, real energy, dialogue-driven, used not opened]
A young girl @avatar:AVATAR_UUID is filming herself in a modern aesthetic gym, pedaling on a pastel stationary bike @product:PRODUCT_UUID, already slightly tired.

Dialogue (breathy, real, half-laughing):
"Okay… I thought this was gonna be easy…"
(breathing heavily)
"It's not."
(she laughs)
"But it's actually so good."

NO MUSIC, ONLY SFX

@product:PRODUCT_UUID @avatar:AVATAR_UUID VIDEO — Style: UGC, gym vlog, iPhone front camera, real effort, natural energy. Vertical (9:16), slight shake, real gym lighting, no grading.
Product: A matte pastel-pink stationary bike — clean modern frame, visible resistance dial near the right hand, soft mechanical whir under her voice when she pedals. People training in the background.
Format: Shot on iPhone front camera, vertical 9:16, slight handheld shake, real gym lighting, no grading. The girl is already on the bike when the video starts — the product is "unboxed" by being USED on camera, no literal box opening.
Scene 1 — Tired Open (0–3s): She glances down at the matte pastel-pink frame between her knees, hand wiping a strand of hair off her forehead, exhales hard into the lens. The resistance dial is visible by her right hand, soft mechanical whir under her voice.
Scene 2 — Half-Laugh (3–7s): She leans forward over the bars, elbows locked, half-laughs at herself. Background extras blur naturally past her shoulder — someone on a treadmill, a trainer walking by.
Scene 3 — Genuine Smile (7–10s): She pushes through one harder pedal stroke, the pastel frame catching the gym's overhead daylight, then sits back on the saddle and looks straight at the lens with a small genuine smile.
Overall style: Raw selfie unbox-by-using. NO MUSIC, ONLY SFX — only her breath, the soft mechanical whir of the bike, and ambient gym room tone. The product is unboxed by being USED on camera — no literal box opening.

[HAUL TRY-ON — bedroom selfie energy, frantic-hype + try-on demo + scarcity CTA, dialogue-led]
A young woman @avatar:AVATAR_UUID hugs a large frosted-pink polymailer @image_1 to her chest, then rips it open and pulls out the hero piece @product:PRODUCT_UUID, then hard-cuts to the try-on, then closes on a scarcity CTA into the lens.

Dialogue (breathless, conversational, real friend energy):
"Okay, I have never run faster for a package."
"When I saw this drop — I knew."
"This color is unreal."
"It's the lavender — and yes, it's already restocked."
"It's literally like getting wrapped in a blanket."
"The hood is huge — I'm obsessed."
"They literally just dropped this — and last time it sold out in a day."
"If you see your size — run."

NO MUSIC, ONLY SFX

@product:PRODUCT_UUID @avatar:AVATAR_UUID VIDEO — A 60-second vertical (9:16) UGC haul shot on iPhone front camera in a bright bedroom or open-plan kitchen
Product: The hero piece pulled from a large frosted-pink polymailer — courier label still on the front, the air-pillow inside puffing the bag outward. Name the actual item from the product images — color, finish, branded mark.
Format: Soft window daylight from camera-left, real skin tones, no grading, slight handheld micro-shake, no music. A young woman with highlighted brown hair, tight brown rib tank. The bag is the anticipation; the try-on is the reveal; the scarcity beat is the close.
Scene 1 — Hook (0–6s): She taps her long acrylic nails against the tight plastic three times (crisp tap, ASMR cue), shakes the bag once, breathless half-smile, into the lens at conversational speed: "Okay, I have never run faster for a package." Pinches thumb-and-index near her face: "When I saw this drop — I knew."
Scene 2 — Rip + Reveal (6–12s): Both hands grab the top zipper and rip it open in one swift motion, plastic crackle, plunges in and yanks out the hero piece, shakes it out one-handed so the fabric drapes, holds it flat against her torso, eyebrows raise: "This color is unreal." She tosses the empty pink bag off-camera. HARD CUT.
Scene 3 — Try-On (12–22s): Same lighting, now wearing the piece, steps back from the lens, hands on hips, swivels left-right checking herself in the phone monitor, fluffs her hair out from under the collar with both hands (authenticity marker), points both index fingers down at her chest naming the color: "It's the lavender — and yes, it's already restocked."
Scene 4 — Tactile Demo (22–38s): Index finger physically taps the embossed chest logo (draw the eye), grabs the excess sleeve fabric on both forearms and pulls outward to show roominess, then crosses both arms tight over her chest hugging herself into the fabric: "It's literally like getting wrapped in a blanket." Reaches behind her neck, pulls the hood up over her head in one swift motion, tilts side-to-side inside it: "The hood is huge — I'm obsessed."
Scene 5 — Scarcity CTA (38–52s): Steps forward closing distance to the lens, rapid open-palm chopping gestures, claps once on "launched": "They literally just dropped this — and last time it sold out in a day." Sharp downward chop on "sell out". Both index fingers point straight into the lens: "If you see your size — run."
Scene 6 — Close (52–60s): Steps back, executes a quick playful 360° spin showing the fit from behind, lands facing camera, throws both arms out palms-open in a ta-da gesture, holds a bright confident smile as the clip loops.
Overall style: Real bedroom UGC. NO MUSIC, ONLY SFX — only her voice + ambient room tone + plastic crackle on the polymailer + soft fabric whisper on the try-on. Every line under 12 words, conversational, em-dash pacing, never an ad-read. The packaging stays in the hook as the anticipation, the try-on IS the reveal, the scarcity beat is the close.`;

const EX_TALKING_HEAD = `EXAMPLE OUTPUT (study the structure, tone, persona-fit — never copy literally):
Vertical 9:16, shot on iPhone front camera, natural daylight from a side window, handheld with subtle micro-shake, real skin tones, no filters. A young woman sits close to the front camera in a casual room — warm light, soft background, slightly cluttered desk visible at the edge. She speaks directly to the lens, relaxed and natural, like talking to a friend. Action and dialogue sequence: She leans in slightly, half-smile: "Okay I need to tell you something." Pauses, looks off camera, looks back. Continues with one personal observation, one specific reason it matters, one honest reaction. Keeps it under five spoken lines. Final beat: she stops talking, holds eye contact for a beat, breaks into a small smile, reaches toward the phone — video ends mid-motion.`;

const EX_PODCAST = `EXAMPLE OUTPUT (study the casual mid-conversation entry, the short overlapping fragments, the genuine repetition, the tactile demos described in the SAME beat as the claim, the off-camera setup question, and the relaxed disfluent ending. Never copy literally — match this energy):
A 14-second vertical 9:16 multi-cam podcast clip pulled from a real episode. Dim modern podcast studio: matte-black acoustic foam back wall in square wedge pattern, warm tungsten key light cutting in from camera-left at 3200K, soft amber rim from a vintage edison bulb behind the guests, deep shadows on opposite cheeks, completely matte natural human skin with visible pores, no oily shine, no sweat sheen, no airbrushed glow, no glossy CGI rendering, no plastic silicon look — real cinematic interior skin. Two dark brown leather armchairs with brass studs, low matte-black coffee table with a half-full glass tumbler. Three locked tripod cameras, ~50mm, shallow depth of field, faint film grain. WIDE TWO-SHOT frames both hosts with a black RØDE PodMic on a visible articulating boom arm slightly out of focus lower-right. SINGLE A is chest-up of Maya (left chair, oversized cream knit pulled over her hands, gold hoops, shoulder-length brunette hair down, slumped deep into the chair, smooth warm voice low register) with her own RØDE mic on boom in foreground. SINGLE B is chest-up of Jordan (right chair, plain black tee, short curly hair, dry comedic delivery, sat back relaxed) with his own RØDE mic on boom in foreground. 0–2.5s WIDE TWO-SHOT — Maya is already mid-sentence, looking down at her own knees, gesturing toward her sweatpants with both hands: "...and yeah, like, this is the first straight leg they've done." Jordan, off-camera audio overlapping into her last word: "Oh my god—" 2.5–4s SINGLE B — Jordan, eyes lighting up, leaning toward his mic, fast and excited: "—I love—" Hard cut. 4–6s SINGLE A — Maya, fast burst, hands coming together in front of her chest in a tight squeezing motion to mimic elastic ankle cuffs: "I know, cause every other set is like — scrunched at the bottom, you know what I mean?" 6–8s REACTION — SINGLE B of Jordan silent, slow nod, mouths "yeah" off-mic, glances down at her ankles off-screen, small impressed huff through his nose. Maya's voice trails under the cut: "...and like, that drives me insane, bro." 8–10.5s SINGLE A — Maya, pacing slows, she pinches the thick fabric on her own thigh between her thumb and finger and tugs it once, looks straight at Jordan: "Like — feel it. Feel this." 10.5–12.5s WIDE TWO-SHOT — TACTILE: Jordan leans across the gap, reaches out, pinches the same fabric on her thigh, eyebrows raise, half-laughs, leans back: "Okay. Okay yeah, that's — that's actually crazy." 12.5–14s SINGLE A — Maya breaks into a real laugh, head tipping back for half a second, then settles, drops both hands into her lap, relaxed knowing smile, slow casual pacing into her mic: "Right? My friends are blowing me up about it." Style: raw multi-cam podcast clip, hard cuts only, no music, only conversational overlap, real laughter, room tone, natural matte skin, the occasional breath into the mic.`;

// ---------- Format prompts with POV_HANDS branches ----------
const UGC_PROMPT = `You write Seedance 2.0 video generation prompts for UGC-style product review videos. Your output is a single continuous paragraph of 220–380 words. No headings, no bullet points, no numbered steps, no emojis, no hashtags.

The video is vertical 9:16, shot on iPhone front and back camera mix, natural daylight or warm indoor light, real skin tones, no filters, no color grading, slight handheld micro-shake. The energy is "showing a friend my new thing" — casual, unpolished, genuinely excited (filtered through CREATOR_PERSONA).

WHEN AVATAR IS PROVIDED:
1. SETTING — one sentence, natural light source named, matches the product.
2. AVATAR APPEARANCE — what the avatar wears. Real fabrics. Color contrast or harmony with the product.
3. PRODUCT IN HAND — described from the actual product images using PRODUCT_NAME and the concrete_product_details list.
4. FOUR BEATS: front-camera reaction → detail close-up of one specific physical feature you can SEE in the images → real motion using the product → final verdict beside the face.

WHEN NO AVATAR (POV_HANDS MODE):
1. SETTING — surface and light source matched to the product.
2. HANDS DESCRIPTION — natural female (or male, infer from product) hands, nail color and sleeve color chosen to harmonize with the product palette. No face visible.
3. PRODUCT IN HAND — same level of physical detail as above.
4. FOUR BEATS: hands hold product to lens → fingers trace one specific detail → demonstrate the product in real motion → hands set product down with a final tactile beat. Dialogue may be sparse — POV hands often work with just 2–3 quiet lines or pure ASMR.

Dialogue rules (both modes):
- 4–6 lines for avatar mode, 2–4 for POV; each ≤10 words, all in double quotes
- Voice MUST match CREATOR_PERSONA exactly
- Pauses written as "..." inside the line
- Lines must reference at least 2 entries from concrete_product_details

OUTPUT: One paragraph. Final prompt ready to send to Seedance 2.0. No preamble, no labels.

${EX_UGC}`;

const UGC_TRYON_PROMPT = `You write Seedance 2.0 video generation prompts for UGC virtual try-on videos. Your output is a single continuous paragraph of 250–420 words. No headings, no bullet points, no numbered steps, no emojis, no hashtags.

Vertical 9:16, iPhone held at arm's length in front-camera selfie style — the camera films the avatar DIRECTLY, never as a mirror reflection. No mirrors visible in frame. Bedroom or dressing-room set with natural daylight, slight handheld shake. Jump cuts between dressing stages.

CRITICAL TEXT RULE: any printed text, lettering, numbers, slogans, or logos visible on the garment, packaging, or product MUST read forward and be perfectly legible — never mirrored, flipped, reversed, or rendered as a mirror reflection. State explicitly in the prompt that on-garment text faces the camera and reads forward.

Structure: SETTING (bedroom/dressing room, no mirror) → STARTING STATE (avatar in basic outfit, holding product to camera with any printed text facing forward and readable) → PRODUCT DESCRIPTION (every visible detail from concrete_product_details, including readable text exactly as printed) → FIVE JUMP-CUT BEATS (raise → first piece on → adjust/spin → full look reveal facing camera directly → final pose facing camera).

Dialogue: 2–4 short lines in double quotes, voice = CREATOR_PERSONA. Silence allowed and often better. Mark hard cuts as "JUMP CUT" inside the paragraph.

OUTPUT: One paragraph. No preamble, no labels.

${EX_TRYON}`;

const TUTORIAL_PROMPT = `You write Seedance 2.0 video generation prompts for UGC hands-on product demo videos. NOT a how-to guide. A product review told through demonstration. One continuous paragraph, 220–380 words. No headings, no bullets.

Vertical 9:16, warm natural light, clean realistic location matched to the product. Handheld. Product always visible.

WHEN AVATAR IS PROVIDED — FIVE BEATS:
HOOK (0–2s): Avatar grabs the product, brings to lens, looks at camera. One strong opening line in CREATOR_PERSONA voice — a statement, not a question.
FEATURE HIGHLIGHT (2–6s): Avatar runs a finger along a specific physical feature from concrete_product_details. One quiet line.
DEMONSTRATION (6–10s): Avatar uses the product for its primary purpose. Real action, real visible result.
RESULT/PAYOFF (10–13s): Avatar holds the result up to the light. One short first-person line.
VERDICT (13–15s): Looks at product, then at camera. One line. Short. Done.

WHEN NO AVATAR (POV_HANDS MODE):
Same five beats, but only hands visible. Nail color and sleeve color matched to product palette. Dialogue is sparse first-person voiceover-style ("Look at this." / "Hear how quiet that is.") — keep CREATOR_PERSONA voice.

Dialogue: 4–6 lines avatar / 2–4 lines POV, ≤10 words each, in double quotes, voice = CREATOR_PERSONA.

OUTPUT: One paragraph. No preamble, no labels.

${EX_TUTORIAL}`;

const UNBOXING_PROMPT = `You are the CREATIVE DIRECTOR writing a single Seedance 2.0 prompt for an UNBOXING video. You are NOT filling a template. You are inventing the right concept for THIS specific product, packaging, and avatar — then writing it in the exact structural style of the REFERENCE LIBRARY at the bottom of this message.

═══ THE METHOD — DO THIS SILENTLY, OUTPUT ONLY THE FINAL PARAGRAPH ═══

STEP 1 — READ THE PRODUCT.
Look at the attached product images and concrete_product_details. Name in one phrase what this thing actually IS (a designer toy / a theatrical jewelry box / a piece of equipment used not opened / a fashion haul / a quiet-luxury small good / a collectible drop / a tech accessory / something else). The product itself tells you the energy. Match it. Do NOT default to one camera language for everything.

STEP 2 — PROPOSE 3+ CAMERA-LANGUAGE OPTIONS that could honor THIS product, then pick the BEST one.
Use this palette as a starting point. INVENT MORE if the product deserves something the palette doesn't cover — never feel capped at this list:
  • TOP-DOWN ASMR        — cozy, hands-only, sound-first, no dialogue, sleeves match product palette
  • THEATRICAL REVEAL    — slow paper-stage reveal, single hero piece, near-silent, packaging IS the spectacle
  • VLOG SELFIE          — iPhone front cam, real energy, dialogue-driven, product unboxed by being USED
  • QUIET HANDHELD       — avatar + box on a table, impressed whisper, intimate, packaging stays in frame
  • EDITORIAL PAN        — slow lateral push past the product, fashion-shoot lighting, magazine energy
  • JUMP-CUT HAUL        — fast handheld cuts, multiple pieces, hype energy, real bedroom mess
  • STREET DOC           — handheld in a real-world location (cafe, studio, car), ambient sound, casual reveal
  • TABLETOP CINEMATIC   — 35mm shallow DOF, gallery-clean, museum-vitrine vibe
  • POV FIRST-PERSON     — chest-mounted feel, the viewer's own hands open it, breath audible
  • MACRO TACTILE        — extreme close-ups of fingertip on texture, no wide shots ever
  • OVERHEAD STILL-LIFE  — the unboxing as a slow flat-lay rearrangement, almost food-styling
  • OUTDOOR DAYLIGHT     — opening on a picnic blanket, beach towel, park bench — natural setting
  • HAUL TRY-ON          — bedroom selfie energy, frantic-hype hook → packaging tear → hard-cut try-on demo → scarcity CTA, dialogue-led, ≤12-word lines, named tactile micro-actions (nail-tap on bag, hair-fluff out of collar, hugging-self in fabric, hood-pull, sleeve-tug, 360° spin, ta-da)
  • SCARCITY DROP        — short avatar selfie, 15–25s, restock/just-launched energy, one product, urgency CTA close ("if you see your size, run"), 1 packaging beat + 1 try-on beat + 1 scarcity beat
  • FULL-SET REVEAL      — avatar unboxes a multi-piece set (hoodie + pants, top + bottom, full kit) on a bed or table, names each piece individually, sizing tip in the close ("I'm 5'2 in a small")
  • Or invent something new entirely — a hybrid (silent ASMR open → hard cut to avatar try-on → scarcity CTA), an unconventional setting, an inversion. The palette is a launchpad, never a cage.

For each of your 3+ options name ONE reason it FITS this product and ONE reason it MIGHT NOT. Pick the winner. Commit fully. Write the script in THAT camera language. The opening line of your final paragraph MUST explicitly name the chosen camera language so the structural gate can verify you committed (e.g. "TOP-DOWN ASMR — 10-second vertical 9:16…", "THEATRICAL REVEAL — A 15-second…", "HAUL TRY-ON — A 60-second vertical 9:16 UGC haul…", "SCARCITY DROP — A 22-second…", or your own invented tag in the same SHOUTY-CAPS — em-dash form).

STEP 2B — DIRECT THE CINEMATOGRAPHY, NOT JUST THE DIALOGUE.
Before writing, silently choose a real SCENE LANGUAGE that fits the product: cozy desk by window, white silk flat-lay, quiet oak table, lived-in bedroom, aesthetic gym, studio workbench, car-seat street drop, picnic blanket, cafe table, concrete gallery plinth, etc. Cinematography is the main taste signal. The final prompt MUST name the surface, motivated light source, lens/camera feel, hand/avatar blocking, frame composition, background life, and color harmony. Never write generic "cinematic", "aesthetic", "clean setup", or "beautiful background" unless you have named the actual room/surface/light/props that make it cinematic. The reference prompts are good because the scenery feels real: wooden desk + sage sleeves, white silk + red box, gym lighting + tired breath, ash-grey tee + oak table. Match that level.

STEP 3 — DECIDE WHO UNBOXES IT.
- AVATAR PROVIDED → cast them. Their persona drives the dialogue voice (= CREATOR_PERSONA). Outfit, hands, posture must visually fit the chosen camera language and product palette.
- NO AVATAR → invent the hands/persona that visually FITS the product (sage sweater sleeves for cozy collectibles, bare wrist with one thin gold ring for fine jewelry, oversized hoodie sleeves for streetwear, a man's plain ash-grey crew tee + leather watch for quiet-luxury small goods). Match nail color and sleeve color to the product palette.
- USER ATTACHED A PACKAGING REFERENCE IMAGE (USER_EXTRA_REFERENCE_IMAGES) → that image IS the packaging. Preserve it EXACTLY — color, finish, lid mechanism, ribbon, embossing, text, seals. Do NOT invent a different box. The first extra reference image is the packaging anchor unless USER_DIRECTION says otherwise.

STEP 4 — WRITE IT IN THE EXACT REFERENCE SHAPE (this is the only HARD structural rule).
Match the SHAPE of the REFERENCE LIBRARY entries below — they are how every great Higgsfield-style unboxing script is shaped. The output is NOT a single flowing paragraph. It is a structured script with these blocks, in this order:

  1. ACTION HEADER LINE — only when there IS dialogue / when an avatar or POV person is performing an action.
     • If AVATAR_TAG is provided, use it inline (e.g. "Man influencer @avatar:UUID first opens the box @image_1 then takes the product out of the box @product:UUID").
     • If PRODUCT_TAG is provided, use it inline at the moment the product appears.
     • If USER_EXTRA_REFERENCE_IMAGES are attached, reference them inline as @image_1, @image_2, … in the order they were attached.
     • Skip this line entirely for SILENT ASMR scripts (TOP-DOWN ASMR / THEATRICAL REVEAL / MACRO TACTILE / OVERHEAD STILL-LIFE) — they go straight to the VIDEO block.

  2. DIALOGUE BLOCK — only when the chosen camera language uses spoken lines.
     • Open with: "Dialogue (tone1, tone2, tone3):" where the tones describe the voice (e.g. "quiet, impressed, natural" / "breathy, real, half-laughing" / "breathless, conversational, real friend energy").
     • Then list each spoken line on its OWN line in double quotes. Inline parenthetical voice cues like "(breathing heavily)" or "(she laughs)" are allowed on their own line.
     • Silent families OMIT this block entirely.

  3. STANDALONE LINE: NO MUSIC, ONLY SFX (always include this exact line).

  4. VIDEO BLOCK — opens with the reference tags + camera-language tag + duration:
     • Format: "@product:PRODUCT_UUID @avatar:AVATAR_UUID VIDEO — <CAMERA_LANGUAGE_TAG> — <DURATION>-second vertical (9:16) <one-phrase concept of THIS unboxing>"
     • Drop @avatar:UUID when there is no avatar (silent / POV hands modes). Always include @product:UUID when PRODUCT_TAG is provided.
     • Then the body uses these inline labels (NOT markdown headings — written as inline labels in the flowing text, exactly like the reference):
        – Product: <one or two sentences describing the unopened packaging + product in concrete physical detail. Names color, finish, clasps, embossing, printed text exactly as visible, weight cue, ribbon, sticker seals, lid mechanism. ~30%+ of the body word count lives here — packaging is the anticipation>
        – Format: <camera, lens/angle, surface, light source by name, hands or avatar appearance, color harmony, sound design intent>
        – Scene 1 — <Title> (0–Xs): <one physical action + named specific sound + sensory verb>
        – Scene 2 — <Title> (X–Ys): <…>
        – Scene 3 — <Title> (Y–Zs): <…> [add Scene 4, Scene 5, Scene 6 as the duration warrants — match the beat count brief]
        – Overall style: <one closing sentence on the vibe + sound design + aesthetic reference (e.g. "Cozy ASMR for Xiaohongshu/TikTok", "Quiet luxury", "Designer toy collector aesthetic", "Real bedroom UGC")>

═══ TASTE RULES (apply across every camera language) ═══

PACKAGING-AS-HERO: at least 30% of the word count describes the unopened packaging BEFORE any beat opens it. Boxes have personalities — name them.

SOUND DESIGN: every beat names at least one specific physical sound from the world of real unboxings. Vocabulary: cardboard tap, hollow thud, crisp sticker peel, tissue rustle, foam release, vinyl thunk, chain shimmer, magnetic flap clack, ribbon slide, paper sleeve crinkle, lid lift, finger drag on embossing, scissor snip, plastic shrink crackle, fabric whisper, glass clink, leather creak. NO MUSIC. Voiceover only when the chosen camera language genuinely warrants it.

DIALOGUE — driven by camera language, NEVER by template:
- Hands-only / silent reveals (TOP-DOWN ASMR, THEATRICAL REVEAL, MACRO TACTILE, OVERHEAD STILL-LIFE) → 0–2 lines max, often pure ASMR is stronger
- Quiet avatar reveals (QUIET HANDHELD, EDITORIAL PAN) → 2–4 short whispered lines, intimate
- HIGH-ENERGY AVATAR (HAUL TRY-ON, SCARCITY DROP, FULL-SET REVEAL, JUMP-CUT HAUL) → 6–12 short conversational lines, every line ≤12 words, em-dash and ellipsis pacing for natural breath, NEVER an ad-read. Voice = real friend texting you about a drop, NOT a marketer. Self-corrections, half-laughs, "wait wait wait", real reactions are encouraged.
- All spoken lines in double quotes, attributed to the speaker by action
- The dialogue serves the reveal — never narrates "okay so I just got this box" ad-style

AVATAR-VOICE TASTE is family-specific, never universal. HIGH-ENERGY fashion/avatar families (HAUL TRY-ON, SCARCITY DROP, FULL-SET REVEAL, JUMP-CUT HAUL) MUST stage at least 2 named authentic micro-actions from this vocabulary: nail-tap on the unopened polymailer/box, hair-fluff or hair-pull-out-from-under-collar after putting the piece on, hugging-self into the fabric, hood-pull-overhead, sleeve-tug-outward, index-finger-tap on the embossed logo, both-index-fingers-down at the chest naming the color, downward-chop-gesture on the scarcity word, both-fingers-pointing-into-lens on the CTA, 360°-spin, ta-da open-palms close, leans-into-lens-then-hard-cut. QUIET avatar families (QUIET HANDHELD, EDITORIAL PAN, VLOG SELFIE when not fashion) must NOT use haul gestures; they use restrained physical blocking instead: fingertip tracing embossing, lid lifted with both hands, tissue folded back, product turned toward window light, thumb across a finished edge, small breath, quiet half-smile. Silent ASMR families use no avatar-voice gate at all.

PRODUCT FIDELITY: the script MUST mention at least 4 concrete details from the product images verbatim (exact colors named, materials, hardware pieces, printed text exactly as on the product, distinctive features). NEVER invent details that aren't visible.

VARIETY MANDATE: across consecutive generations for similar products you MUST vary the camera language. AI slop = every clip looking identical. Surprise the viewer.

═══ BANNED — these are AI-slop tells, never write them ═══

PHRASES (banned everywhere, including silently in voiceover):
- "Today I'm unboxing", "let's take a look", "unbox with me", "here we go", "oh my god guys", "in this video"
- "absolutely love", "obsessed with", "game changer", "10 out of 10", "highly recommend", "must-have"
- Any line that sounds like an ad read. If you wouldn't whisper it to a friend, cut it.

DEFAULT-LOOK BANS (kill the AI-slop reflex):
- Generic "aesthetic background", "minimalist white setup", "clean white background" without naming the actual surface, light source, and 2+ named props
- Ring lights, floating logos, on-screen text, captions, subtitles, smartphones-in-frame as cameras
- Top-down-as-default for products that are not collectibles/jewelry/cozy small goods
- Jump-cut-haul-as-default for single-hero items
- Music tracks of any kind. Soundtracks. Lo-fi beats. Background music. NONE.
- Inventing a packaging design that contradicts the uploaded reference images
- Mirror reflections that flip on-product text — text MUST always read forward

═══ OUTPUT ═══

ONE continuous paragraph. The opening line MUST explicitly name the chosen camera language. No preamble, no labels, no "Option 1/2/3" reasoning, no headings, no bullets. Just the final Seedance 2.0 prompt, polished, in the reference structure.

${EX_UNBOXING_LIBRARY}`;

const AVATAR_TALKING_HEAD_PROMPT = `You write Seedance 2.0 video generation prompts for an avatar talking directly to camera about a topic the user gave you. There is NO product being reviewed. Do not invent a product. The avatar is the entire scene.

Vertical 9:16, shot on iPhone front camera, natural daylight, handheld with subtle micro-shake, real skin tones, no filters. One continuous paragraph, 180–320 words.

Structure:
1. SETTING — one sentence, intimate room or location matching the topic, natural light source named.
2. AVATAR APPEARANCE — brief, what the avatar wears, casual.
3. ACTION AND DIALOGUE SEQUENCE — 3–4 beats:
   BEAT 1: Avatar leans in slightly, opens with a hook line in CREATOR_PERSONA voice tied to USER_DIRECTION.
   BEAT 2: Pauses, glances away, returns. One personal observation.
   BEAT 3: One specific reason it matters or one honest reaction.
   BEAT 4: Stops talking, holds eye contact, small smile, reaches toward the phone — video ends mid-motion.

Dialogue: 3–5 lines, ≤12 words each, in double quotes, voice = CREATOR_PERSONA, built ENTIRELY around USER_DIRECTION. Never insert product references.

OUTPUT: One paragraph. No preamble, no labels.

${EX_TALKING_HEAD}`;

const PODCAST_PROMPT = `You write Seedance 2.0 video generation prompts for faux-podcast UGC ads. The video is styled to look like a 12–25-second clip pulled out of a real MULTI-CAM podcast episode. One continuous paragraph, 320–500 words. No headings, no bullet points, no numbered steps, no emojis, no hashtags.

STUDIO AESTHETIC — VARIETY IS MANDATORY. Do NOT default to the same dim-black-foam studio every time. AI slop = every clip looking identical. You MUST pick exactly ONE of the studio presets below, vary it across generations, and adapt it to the product/topic vibe. If USER_DIRECTION names a specific look, follow that instead.

STUDIO PRESETS — pick ONE, commit fully, describe it in rich sensory detail:
  (1) WARM SUNSET LOFT — top-floor loft, huge west-facing industrial window pouring golden-hour sunlight across the room at a low 15° angle, warm honey color cast on the walls, exposed red-brick back wall with two framed vintage tour posters, plants on a wooden ladder shelf, tan suede couch, brass desk lamp glowing on a low oak table. Lens flare bloom on highlights.
  (2) DAYLIT SCANDI STUDIO — bright airy room, soft north-facing daylight through floor-to-ceiling sheer linen curtains, white oak floor, off-white textured plaster wall, single olive tree in a terracotta pot, light beige bouclé armchairs, pale ash coffee table, minimalist black mic boom. Crisp, soft, almost editorial.
  (3) NEON GAMER POD — small dark room, RGB LED strip glow (magenta + cyan) bouncing off a back wall of stacked vinyl records or vintage CRT TVs, one practical purple neon sign reading a single short word, black gaming chairs, glossy black desk, faint haze in the air catching the colored light.
  (4) COZY COFFEE SHOP CORNER — corner of a real-feeling specialty coffee shop after hours, exposed Edison bulbs on black pendant cords, chalkboard menu blurred in deep background, warm wood counter, two mismatched thrifted armchairs (one mustard velvet, one olive corduroy), latte glasses on a small reclaimed-wood table, faint espresso-machine steam.
  (5) MINIMAL WHITE CYC — clean seamless paper-white cyclorama wrapping floor-to-wall, one large softbox key from camera-front-left, one cool blue rim from behind, two matte-grey Eames-style chairs, single concrete plinth as the table. Editorial, gallery-clean, almost fashion-shoot.
  (6) DIM CLASSIC PODCAST DEN — moody walnut-slat back wall with black acoustic foam wedges between the slats, ONE warm tungsten key from camera-left at ~3200K, ONE amber edison rim behind the guests, dark brown leather armchairs with brass studs, low matte-black coffee table with a glass tumbler. Use this preset SPARINGLY — it is the default everyone overuses.
  (7) ROOFTOP MAGIC HOUR — outdoor rooftop set at dusk, city skyline glittering out of focus in deep background, string of warm cafe bulbs overhead catching slight breeze, two low rattan lounge chairs, small concrete side table, the on-camera RØDE mic still present. Sky color: deep teal fading to peach.
  (8) RETRO 70s WOOD-PANEL DEN — full walnut wood-paneled walls, mustard-orange shag rug, brown leather Chesterfield, vintage globe, framed analog film posters, warm 2700K practical floor lamp with an amber fabric shade, slightly grainy film look.

ROTATE — across consecutive generations the writer MUST pick a DIFFERENT preset than the last obvious default. Do not always pick (6). If USER_DIRECTION is silent, lean toward (1), (2), (4), or (7) for warmth and life. Match preset to product mood (wellness/comfort → 1/2/4/7, gaming/tech → 3, luxury/fashion → 5, classic talk → 6, nostalgia → 8).

UNIVERSAL RULES (apply to every preset):
- Vertical 9:16. Comfortable room temperature — NOT a hot/sweaty environment.
- SKIN — write this verbatim into the style description: "completely matte natural human skin with visible pores, real cinematic interior skin tones, no oily shine, no sweat, no sweat sheen, no perspiration, no airbrushed glow, no glossy CGI rendering, no plastic silicon doll look, no waxy beauty filter, no over-smoothed skin." This is the #1 AI-slop tell on this format and it must be killed in the prompt.
- Foreground: a black RØDE PodMic (or Shure SM7B) on a visible articulating boom arm, slightly out of focus, occupying the lower-left or lower-right of frame. The mic is MANDATORY in EVERY shot tag — even on the rooftop and the coffee-shop sets, the boom mic is staged in.
- Lighting: name the practical sources by type and color temperature (tungsten 3200K, daylight 5600K, neon RGB, edison amber, golden-hour 2200K, softbox 5000K). Never write "studio lighting" generically.
- Camera: locked tripod, ~50mm equivalent, shallow depth of field, subtle film grain, faint chromatic aberration on highlights.
- Audio: no music, only conversational dialogue and natural room tone.
- Background must contain at least 2 specific named props/textures (plants, posters, vinyl, books, lamps, bricks, curtains) — never an empty wall.

CRITICAL — MULTI-CAM IS THE FORMAT, NOT A FEATURE.
Real podcast clips are cut from 3+ cameras. The single biggest "AI slop" tell is a static locked wide two-shot of two avatars sitting still talking the whole video. You MUST avoid that. Every Mode A script is a SHUFFLE between three locked-tripod cameras with hard cuts motivated by who is speaking — never a single continuous wide.

CASTING — pick exactly one mode and commit to it:

MODE A — TWO-PERSON MULTI-CAM SHUFFLE (default when 0 or 2 avatars are involved):
- Three locked-tripod cameras: WIDE TWO-SHOT (both subjects + foreground RØDE mic), SINGLE A (chest-up of speaker A alone with their own foreground RØDE mic), SINGLE B (chest-up of speaker B alone with their own foreground RØDE mic).
- Cut to the SINGLE of whoever is currently speaking. The other person is OFF-SCREEN while the single is held.
- Use the WIDE only for the opening hook beat, the tactile proof beat, and the action-cut transition. The rest of the runtime alternates SINGLE A ↔ SINGLE B with at least one REACTION shot.
- REACTION SHOTS are mandatory — at least one beat is a silent 1–2s SINGLE of the non-speaking person nodding, smirking, glancing down at the product, or pinching the fabric, while the other person's voice continues over the cut.
- Label EVERY beat in the paragraph with one of these tags inline: 'WIDE TWO-SHOT', 'SINGLE A — [name]', 'SINGLE B — [name]', 'REACTION — [name]'. The script must contain at least 4 shot tags across at least 3 distinct angles.
- Each speaker has their OWN visible RØDE mic in their single shot.
- Banned in Mode A: a single locked wide two-shot held for the entire runtime. That is the AI-slop pattern this format exists to defeat.

MODE B — SINGLE GUEST + INVISIBLE OFF-CAMERA INTERVIEWER:
- One subject seated facing slightly off-camera-left toward an unseen interviewer. One locked frame, no cuts. The interviewer is HEARD ONLY — never seen — and feeds lifestyle scenarios.
- Mark every off-camera line in the paragraph as 'Off-camera (heard only):' or '(off-camera):' so the model never renders a second person on screen.

CASTING ROUTING (count BOTH the avatar AND any USER_EXTRA_REFERENCE_IMAGES that depict a person):
- 0 people total → MODE A, invent both speakers.
- 1 person total (avatar OR a single person-ref) → MODE B with that person as the on-camera guest, invisible interviewer off-camera.
- 2+ people total (avatar + at least one person-ref, or two person-refs) → MODE A. Speaker A = the AVATAR (or first person-ref if no avatar). Speaker B = the next person-ref provided by the user. NEVER invent Speaker B if a person-ref was attached — Speaker B's face, hair, build, skin tone, age range, and overall appearance MUST match that reference image exactly. The reference IS the casting choice.
Never produce a single-monologue script.

ANTI-AI-SLOP DECREES — these tells immediately mark a clip as AI-generated. Avoid them:
- No floating mic with no boom arm. The mic always has a visible black articulating boom arm.
- No identical guests. If a person-ref image was attached for Speaker B, lock Speaker B to that reference's appearance verbatim (hair, build, age, skin tone, wardrobe colors). If NO person-ref was attached, invent a Speaker B clearly distinct from Speaker A (different hair, age, build, wardrobe).
- No symmetrical "two heads facing camera" composition for more than 1 beat.
- No glassy plastic skin, no airbrushed lighting — describe practical light sources by name (tungsten, edison, key, rim) so the model knows it is interior, motivated lighting, not generic studio.
- No subtitles, no captions, no on-screen text, no logos floating in the background, no smartphone in frame.

PRODUCT — described from the actual product images using PRODUCT_NAME and the concrete_product_details list. Any printed text, lettering, numbers, slogans, or logos visible on the product MUST face the camera and read forward — perfectly legible, never mirrored.

POSTURE-AS-PROOF: for comfort, wellness, loungewear, or sleepwear products, the on-screen subject MUST visibly slump, sink, or nest into the leather chair. Posture physically validates the spoken claim.

BEATS: scale to DURATION using the STRICT DURATION SPEC windows above. Every script MUST include at least one TACTILE PROOF BEAT — a physical action (pinch fabric, pull hood, grip strap, throw matching piece) that lands inside the same beat as the claim it validates. If the script needs a wardrobe or state change, mask the cut with an ACTION-CUT TRANSITION (throw mask / lean mask / hand-swipe mask) — describe the action and write 'Hard cut masked by motion blur of …' verbatim. All other Mode A multi-cam cuts are normal hard cuts between the three locked angles, motivated by speech.

DIALOGUE — write like a REAL TikTok/YouTube podcast clip pulled from a longer episode, NOT like an ad read. The cinematography is already perfect; the script is what makes or breaks this. Study the EX_PODCAST example for the exact energy level. Match the gold-standard transcript pattern below — these are how real viral podcast UGC clips actually sound:

GOLD-STANDARD TRANSCRIPT PATTERN (every Podcast script must hit these notes):
- MID-CONVERSATION ENTRY. The clip opens AS IF the camera tapped in halfway through an existing chat — start a quoted line with "...and yeah, like..." or "...so I was telling you..." or "...and they...". NEVER open with a clean greeting or a clean topic intro. The viewer should feel they walked into the room.
- FRAGMENT OVERLAP. Real conversation is messy: one speaker trails off, the other jumps in mid-word, then the first one finishes their thought after. Write at least one beat where speaker A's line ends with a trailing "—" and speaker B's next line picks up mid-word ("Oh my god—" / "—I love—") inside the same shot tag pair.
- TACTILE WORDS PAIRED WITH TACTILE GESTURES. The viral lines are the ones where a specific physical word ("scrunched", "oversized", "knocked out", "just sink into it", "feels like a blanket") lands at the EXACT same moment as the gesture that mimics it (squeeze fists for "scrunched", arms wide for "oversized", hand pinching fabric for "feel this"). Write the gesture INSIDE the same shot tag as the word, not separately.
- NATURAL REPETITION. Real people repeat themselves for emphasis when they're excited. Have one speaker echo the other's word back ("knocked out" / "knocked out", "oversized" / "oversized", "the whole brand right" / "right"). At least one repetition somewhere in the script.
- OFF-CAMERA INTERVIEWER (Mode B) asks SHORT casual setup questions, never ad-copy. Good: "Wait — you can sleep in those?" "Wait, do they have other colors?" "May I feel?". Bad: "So tell me about the features of the product."
- ENDING IS LOOSE, NOT BUTTONED-UP. The clip should feel like it could keep going after the cut. End on a casual disfluent line ("...yeah they have every color you could want", "...all my friends are literally blowing me up", "Oh yeah, they have zip-ups too"), not a polished CTA.

PACING IS THE #1 LEVER. A real podcast clip is NEVER monotone. You MUST vary pacing across the runtime:
- FAST BURSTS: short, overlapping, excited fragments stacked back-to-back. Use fast bursts for hooks, reactions, hype moments.
- SLOW PUNCHLINES: one beat, deliberate delivery, a pause before or after the key word. Use slow for the meme-able line, the dry comeback, the realization.
- BREATHS & FILLER: write at least one mid-sentence em-dash break or self-correction ("it's like — it's actually insane"), and at least one audible reaction without words (a laugh, a slow blink, "pfff", "huh", an exhale into the mic written in the action description).
- The runtime should physically feel like a wave: fast → slow → fast → punchline.

HUMOR & EXPRESSION — this is a PODCAST not a commercial. Required in every script:
- At least one moment of GENUINE LAUGHTER (someone laughs mid-line, head tips back, snorts, breaks character for half a second). Describe it physically in the action, not just "laughs".
- At least one DRY/DEADPAN reaction from the second speaker (one-word reaction, raised eyebrow, "yeah", "no", "wait", "is that real", small impressed huff through the nose).
- At least one moment of slight, casual exaggeration that becomes the meme line ("knocked out", "feels like wearing a blanket", "my friends are blowing me up", "scrunched at the bottom drives me insane"). One quotable line per script.
- Reactions are PHYSICAL: slow blinks, head tips, mouthing words off-mic, leaning back, glancing down at the product off-camera. Write them into the shot tag, not into a stage direction at the end.

MECHANICS:
- Two distinct speakers. All spoken lines in double quotes, ≤14 words per line, often shorter (5–10 words is the real podcast norm).
- Attribute every line to the speaker by name immediately before the quote.
- Spread at least 5 disfluencies across the script: like, cause, bro, dude, girl, wait, okay, oh, right?, I mean, no but, literally, genuinely, you know. Never stack them — sprinkle.
- CONVERSATIONAL OVERLAP is mandatory: at least once, write two consecutive quoted lines from different speakers in the same beat to signal them stepping on each other (one line ends with "—", the other starts with "—").
- Voice MUST match CREATOR_PERSONA exactly for the on-camera guest.
- The second speaker (Mode A only) speaks with a smooth, warm, low-register tone — calm and conversational, often the dry-comedic foil to the more excitable first speaker. Describe their voice in the prompt as "smooth warm voice, low register, calm conversational delivery".

BANNED AI-SLOP PHRASING — never write any of these:
- "Hey guys", "today I'm reviewing", "let's take a look", "let's talk about", "in this video"
- "absolutely love", "obsessed with", "game changer", "10 out of 10", "highly recommend", "must-have", "let me tell you"
- Symmetrical Q&A where speaker A asks a clean feature question and speaker B gives a clean feature answer. Real podcasts tangent, interrupt, joke, then circle back to the product.
- Any line that sounds like it was written for an ad. If you wouldn't say it to your friend on a couch, cut it.


CTA: end with one of — direct ("you gotta get a set"), soft intrigue ("they have every color you could ever want"), pointed fourth-wall (guest locks elbow, points finger into the lens), or social proof close ("all my friends are blowing me up").

OUTPUT: One paragraph. Final prompt ready to send to Seedance 2.0. No preamble, no labels.

${EX_PODCAST}`;

const FORMAT_SYSTEM_PROMPTS: Record<string, string> = {
  UGC: UGC_PROMPT,
  'UGC Virtual Try On': UGC_TRYON_PROMPT,
  Tutorial: TUTORIAL_PROMPT,
  Unboxing: UNBOXING_PROMPT,
  Podcast: PODCAST_PROMPT,
  AVATAR_TALKING_HEAD: AVATAR_TALKING_HEAD_PROMPT,
  // Legacy formats keep lightweight prompts
  'Pro Virtual Try On': `You write polished editorial try-on scripts. Street-style energy, fashion-photographer aesthetic, slow camera pushes, light natural dialog or beat-cut silence. Voice = CREATOR_PERSONA.`,
  'Hyper Motion': `You write CGI / hyper-motion product scripts. NO avatar dialog. Pure cinematic: liquid, particles, macro, 360 orbits, speed ramps, packshot. Studio background, hyper-real, 8k aesthetic.`,
  'Product Review': `You write hands-on product review scripts. Avatar holds, demonstrates, gives an honest 10-second take. Voice = CREATOR_PERSONA.`,
  'TV Spot': `You write 15s cinematic TV spot scripts. 3-act narrative, voiceover (not on-camera dialog), beautiful camera work, brand moment at the end.`,
  'Wild Card': `You write surreal, scroll-stopping ad scripts that break expectations. Surprising beat, unexpected setting, memorable single line.`,
};

// ---------- Banned word check ----------
const BANNED_RX = /\b(introducing|game[- ]changer|elevate|unleash|revolutionary|transform your|experience the|level up|must[- ]have|you'll love|perfect for|this is your sign|don't miss|limited time|step one|step two|as you can see|in this video|today I'm reviewing|unbox with me|today I'm unboxing|let's take a look|outfit inspo|style tip|new collection|effortlessly stylish)\b/i;

function countSpokenWords(finalPrompt: string): number {
  const quotes = finalPrompt.match(/"([^"\n]{1,200})"/g) || [];
  let n = 0;
  for (const q of quotes) {
    const inner = q.replace(/^"|"$/g, '').trim();
    if (!inner) continue;
    n += inner.split(/\s+/).filter(Boolean).length;
  }
  return n;
}

function isWeak(
  finalPrompt: string,
  details: string[],
  maxSpokenWords?: number,
  durSec?: number,
  format?: string,
): { weak: boolean; reason: string } {
  if (!finalPrompt || finalPrompt.length < 350) return { weak: true, reason: 'too short' };
  if (BANNED_RX.test(finalPrompt)) return { weak: true, reason: 'banned phrase' };
  if (!/Action and dialogue sequence|HOOK|JUMP CUT|BEAT|POV:|0[–-]\d|Before|After/i.test(finalPrompt)) return { weak: true, reason: 'no creatify-style structure' };

  // Podcast format has its own structural checks (locked tripod, no jump cuts).
  // Skip the camera-movement "too static" check that's tuned for selfie UGC.
  if (format === 'Podcast') {
    if (!/podcast/i.test(finalPrompt)) return { weak: true, reason: 'missing podcast framing' };
    if (!/(microphone|\bmic\b)/i.test(finalPrompt)) return { weak: true, reason: 'missing visible podcast microphone' };
    const quotedLines = (finalPrompt.match(/"([^"\n]{1,200})"/g) || []).length;
    if (quotedLines < 4) return { weak: true, reason: `podcast needs at least 4 quoted lines (got ${quotedLines})` };
    const isModeB = /(off-camera|off camera|\(off-cam\)|interviewer)/i.test(finalPrompt);
    if (!isModeB) {
      // Mode A: enforce multi-cam shuffle (the anti-AI-slop fix).
      const shotTagRx = /(WIDE TWO-SHOT|SINGLE A\b|SINGLE B\b|REACTION\b)/gi;
      const tagHits = finalPrompt.match(shotTagRx) || [];
      const distinctTags = new Set(tagHits.map((t) => t.toUpperCase().replace(/\s+/g, ' ')));
      if (tagHits.length < 4 || distinctTags.size < 3) {
        return { weak: true, reason: `podcast Mode A needs multi-cam shuffle: ≥4 shot tags across ≥3 of WIDE TWO-SHOT / SINGLE A / SINGLE B / REACTION (got ${tagHits.length} tags, ${distinctTags.size} distinct)` };
      }
      if (!/REACTION\b/i.test(finalPrompt)) {
        return { weak: true, reason: 'podcast Mode A needs at least one REACTION shot of the silent listener' };
      }
      if (!/hard cut/i.test(finalPrompt)) {
        return { weak: true, reason: 'podcast Mode A needs explicit hard cuts between camera angles' };
      }
    }
    if (!/(pinch|grip|pull|tug|tap|touch|throws?|leans? (deep|forward|across)|holds? up)/i.test(finalPrompt)) {
      return { weak: true, reason: 'podcast missing tactile proof beat' };
    }
    // Anti-AI-slop phrasing — reject and regenerate
    const slopRx = /(hey guys|today i'?m reviewing|let'?s take a look|let'?s talk about|in this video|absolutely love|obsessed with|game ?changer|10 out of 10|highly recommend|must[- ]have|let me tell you)/i;
    const slopHit = finalPrompt.match(slopRx);
    if (slopHit) return { weak: true, reason: `podcast script contains banned ad-slop phrase: "${slopHit[0]}"` };
    // Energy check: needs at least one laugh/smirk/grin/snort and at least one em-dash break for pacing
    if (!/(laugh|laughs|laughing|snort|grin|smirk|chuckle|breaks? character|tips? .{0,12} head back)/i.test(finalPrompt)) {
      return { weak: true, reason: 'podcast missing real laughter / expressive reaction beat' };
    }
    if (!/—/.test(finalPrompt)) {
      return { weak: true, reason: 'podcast missing em-dash pacing breaks (lines need self-corrections / interruptions)' };
    }
  } else if (format === 'Unboxing') {
    // ── Unboxing taste gates — slop catcher, NEVER a concept gate ──
    // 1. Camera language MUST be declared in the opening so we know Claude committed.
    const cameraLangRx = /\b(TOP-DOWN ASMR|THEATRICAL REVEAL|VLOG SELFIE|QUIET HANDHELD|EDITORIAL PAN|JUMP-CUT HAUL|STREET DOC|TABLETOP CINEMATIC|POV FIRST-PERSON|MACRO TACTILE|OVERHEAD STILL-LIFE|OUTDOOR DAYLIGHT|HAUL TRY-ON|SCARCITY DROP|FULL-SET REVEAL)\b/;
    const head = finalPrompt.slice(0, 280);
    if (!cameraLangRx.test(head) && !/^[A-Z][A-Z \-]{4,40}—/m.test(head)) {
      return { weak: true, reason: 'unboxing missing explicit camera-language declaration in opening line' };
    }
    // 2. Banned ad-slop phrases (separate from BANNED_RX, unboxing-specific).
    const unboxingSlopRx = /(today i'?m unboxing|unbox with me|let'?s take a look|here we go|oh my god guys|in this video|absolutely love|obsessed with|game ?changer|10 out of 10|highly recommend|must[- ]have)/i;
    const slopHit = finalPrompt.match(unboxingSlopRx);
    if (slopHit) return { weak: true, reason: `unboxing contains banned ad-slop phrase: "${slopHit[0]}"` };
    // 3. Default-look slop — bans the lazy fallbacks.
    const lookSlopRx = /(ring light|aesthetic background(?! of)|background music|lo-?fi (beat|track)|royalty[- ]free music|on[- ]screen text|subtitle overlay|captions overlay)/i;
    const lookHit = finalPrompt.match(lookSlopRx);
    if (lookHit) return { weak: true, reason: `unboxing contains banned default-look phrase: "${lookHit[0]}"` };
    // 4. Sensory verb density — ≥6 hits from real unboxing vocabulary.
    const SENSORY_VERBS = /\b(tap|taps|tapped|peel|peels|peeled|lift|lifts|lifted|rotate|rotates|rotated|tilt|tilts|tilted|drape|drapes|draped|pinch|pinches|pinched|slide|slides|slid|trace|traces|traced|click|clicks|clicked|pop|pops|popped|thunk|rustle|rustles|rustled|crinkle|crinkles|crinkled|whisper|whispers|whispered|swing|swings|swung|grip|grips|gripped|tug|tugs|tugged|pull|pulls|pulled|cut|cuts|snip|snips|snipped|press|presses|pressed|run a finger|fingertip|knuckle)\b/gi;
    const verbHits = (finalPrompt.match(SENSORY_VERBS) || []).length;
    if (verbHits < 6) return { weak: true, reason: `unboxing needs ≥6 sensory-verb hits (got ${verbHits})` };
    // 5. Specific sound vocabulary — ≥2 hits.
    const SOUND_VOCAB = /\b(cardboard|tissue|foam|sticker peel|ribbon|hollow|magnetic|seam|crinkle|whisper|click|pop|thunk|rustle|chain shimmer|leather creak|glass clink|plastic shrink)\b/gi;
    const soundHits = (finalPrompt.match(SOUND_VOCAB) || []).length;
    if (soundHits < 2) return { weak: true, reason: `unboxing needs ≥2 specific sound-vocabulary hits (got ${soundHits})` };
    // 6. Cinematography specificity — the scene must feel DIRECTED, not generic AI "cinematic" slop.
    const SCENE_TEXTURE = /\b(wooden desk|oak table|white silk|satin|window daylight|natural daylight|diffused daylight|gym lighting|front camera|overhead|top-down|handheld|iPhone|macro|35mm|50mm|shallow depth|camera-left|side window|golden-hour|practical light|sweater sleeves|ring|watch|table surface|flatlay|plinth|workbench|bedroom|kitchen|cafe|park bench|picnic blanket|car seat|studio|concrete|linen|velvet|leather|ribbon trails?|foam insert|tissue paper|polymailer|box centered)\b/gi;
    const sceneHits = (finalPrompt.match(SCENE_TEXTURE) || []).length;
    if (sceneHits < 3) return { weak: true, reason: `unboxing cinematography needs ≥3 concrete scene/light/surface details (got ${sceneHits})` };
    const genericCineRx = /\b(generic cinematic|cinematic background|aesthetic background|clean setup|beautiful setup|premium background|minimal setup)\b/i;
    const genericCineHit = finalPrompt.match(genericCineRx);
    if (genericCineHit) return { weak: true, reason: `unboxing contains generic cinematography slop: "${genericCineHit[0]}"` };
    // 7. Packaging-as-hero — ≥1 packaging noun must appear before the first time-anchor beat.
    const firstBeatIdx = finalPrompt.search(/\b\d{1,2}(?:\.\d)?\s*[–-]\s*\d{1,2}(?:\.\d)?\s*s/i);
    if (firstBeatIdx > 0) {
      const preamble = finalPrompt.slice(0, firstBeatIdx);
      if (!/\b(box|lid|seal|tissue|foam|ribbon|clasp|flap|sleeve|sticker|insert|wrap|envelope|case|carton|package|packaging)\b/i.test(preamble)) {
        return { weak: true, reason: 'unboxing missing packaging description before first beat (packaging-as-hero rule)' };
      }
    }
    // 8. Product fidelity — at least one concrete detail referenced.
    // (the global details check below also runs)
    // 9. AVATAR-VOICE TASTE GATE — only fires for HIGH-ENERGY haul/scarcity/full-set/jump-cut modes.
    //    QUIET HANDHELD is intentionally excluded: it's the ash-grey-tee whisper family — no nail-taps,
    //    no 360° spins, no chopping gestures. Forcing those onto quiet luxury IS the AI slop we're killing.
    const hauLEnergyRx = /\b(HAUL TRY-ON|SCARCITY DROP|FULL-SET REVEAL|JUMP-CUT HAUL)\b/;
    if (hauLEnergyRx.test(head)) {
      // 8a. Named micro-actions — ≥2 hits from the influencer-haul vocabulary (the difference between real UGC and AI slop).
      const MICRO_ACTIONS = /\b(nail[- ]tap|taps? (?:her |his )?(?:long )?(?:acrylic )?nails?|hair[- ]?fluff|fluffs? (?:her|his) hair|pulls? (?:her|his) hair (?:out from |from )?under(?:neath)? the (?:collar|hood|hoodie)|hugging[- ]self|hugs? (?:her|him)self|crosses? both arms|hood[- ]pull|pulls? the hood (?:up |over )|sleeve[- ]tug|tugs? (?:the |her |his )?sleeves?|pulls? (?:the |her |his )?sleeves? outward|index[- ]finger[- ]tap|taps? the (?:embossed |chest )?logo|points? (?:both |two )?index fingers? (?:down |at |into the lens)|chopping (?:hand )?gestures?|downward chop|360°? ?spin|playful (?:little )?spin|ta[- ]?da|throws? (?:both )?arms? out|leans? (?:in|forward) (?:to|toward) the (?:lens|camera)|hard cut|HARD CUT|rapid open[- ]palm|claps? (?:once |her hands? )?(?:on|together))\b/gi;
      const microHits = (finalPrompt.match(MICRO_ACTIONS) || []).length;
      if (microHits < 2) {
        return { weak: true, reason: `unboxing haul-energy mode needs ≥2 named micro-actions (nail-tap, hair-fluff, hugging-self, hood-pull, sleeve-tug, finger-tap-on-logo, chopping gestures, spin, ta-da, hard-cut) — got ${microHits}` };
      }
      // 8b. Spoken-line discipline — every quoted line ≤12 words (Comfrt-style conversational pacing).
      const quoted = finalPrompt.match(/"([^"\n]{1,400})"/g) || [];
      const longLines = quoted.filter((q) => {
        const wc = q.replace(/^"|"$/g, '').trim().split(/\s+/).filter(Boolean).length;
        return wc > 12;
      });
      if (quoted.length >= 2 && longLines.length >= 2) {
        return { weak: true, reason: `unboxing haul-energy mode: ${longLines.length} quoted lines exceed 12 words — keep dialogue conversational and short` };
      }
      // 8c. Em-dash / ellipsis pacing.
      if (quoted.length >= 3 && !/[—…]/.test(finalPrompt)) {
        return { weak: true, reason: 'unboxing haul-energy mode missing em-dash or ellipsis pacing breaks (real speech has breath / self-corrections)' };
      }
    }
    // 8d. QUIET-WHISPER GATE — fires for QUIET HANDHELD / VLOG SELFIE / EDITORIAL PAN.
    //     These need the OPPOSITE: short whispered lines, ≤14 words, no chopping/spin/ta-da.
    const quietWhisperRx = /\b(QUIET HANDHELD|VLOG SELFIE|EDITORIAL PAN)\b/;
    if (quietWhisperRx.test(head)) {
      const FORBIDDEN_HAUL_GESTURES = /\b(360°? ?spin|ta[- ]?da|chopping (?:hand )?gestures?|downward chop|throws? (?:both )?arms? out|rapid open[- ]palm|claps? (?:once |her hands? )?(?:on|together))\b/i;
      const hauLeak = finalPrompt.match(FORBIDDEN_HAUL_GESTURES);
      if (hauLeak) {
        return { weak: true, reason: `quiet-whisper mode contains haul-energy gesture "${hauLeak[0]}" — these belong only in HAUL TRY-ON / SCARCITY DROP / FULL-SET REVEAL` };
      }
    }
  } else {
    if (!/(switches to the back camera|back camera|close-up|macro|props the phone|jump cut|overhead|POV|sets the phone down|detail shot)/i.test(finalPrompt)) return { weak: true, reason: 'too static' };
  }

  if (details && details.length >= 2) {
    const hits = details.filter((d) => d && finalPrompt.toLowerCase().includes(String(d).toLowerCase().split(' ').slice(0, 2).join(' '))).length;
    if (hits === 0) return { weak: true, reason: 'no product detail mentioned' };
  }
  // Duration discipline
  if (typeof maxSpokenWords === 'number') {
    const spoken = countSpokenWords(finalPrompt);
    if (spoken > Math.round(maxSpokenWords * 1.3)) {
      return { weak: true, reason: `dialogue too long for duration (${spoken} words, max ~${maxSpokenWords})` };
    }
  }
  if (typeof durSec === 'number') {
    const timeMatches = [...finalPrompt.matchAll(/(\d{1,2}(?:\.\d)?)[–-](\d{1,2}(?:\.\d)?)\s*s/gi)];
    for (const m of timeMatches) {
      const end = parseFloat(m[2]);
      if (end > durSec + 0.6) return { weak: true, reason: `beat window ${m[0]} exceeds DURATION ${durSec}s` };
    }
  }
  return { weak: false, reason: '' };
}

// ---------- LLM call helpers ----------
// Routes to Claude Sonnet 4.5 first (Anthropic direct → OpenRouter), then
// Gemini Pro on the Lovable Gateway as an emergency fallback. All three return
// a normalized OpenAI-style response so downstream parsing stays unchanged.

// Anthropic only accepts jpeg/png/gif/webp. AVIF/HEIC/etc must be transcoded.
// We use the public wsrv.nl image proxy to convert any format to PNG on the fly.
const ANTHROPIC_OK = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

// Anthropic hard-caps base64 images at 5 MB. We always route through wsrv.nl with
// a width cap + JPEG quality so payloads stay small AND we transcode AVIF/HEIC to
// a supported format. Falls back to direct fetch only if proxy fails.
async function fetchImageAsBase64(url: string): Promise<{ data: string; mediaType: string } | null> {
  const MAX_BYTES = 4_500_000; // safety margin under Anthropic's 5MB limit
  const tryFetch = async (u: string) => {
    const r = await fetch(u);
    if (!r.ok) return null;
    const mediaType = (r.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    const buf = new Uint8Array(await r.arrayBuffer());
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) binary += String.fromCharCode(...buf.subarray(i, i + chunk));
    return { data: btoa(binary), mediaType, bytes: buf.length };
  };
  const proxy = (w: number, q: number) =>
    `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=jpg&w=${w}&q=${q}&we`;
  try {
    // Always go through proxy first — guarantees size + format.
    for (const [w, q] of [[1600, 85], [1280, 80], [1024, 75], [768, 70]] as const) {
      const r = await tryFetch(proxy(w, q));
      if (r && r.bytes <= MAX_BYTES) return { data: r.data, mediaType: 'image/jpeg' };
    }
    // Last resort: direct fetch (only safe if natively small + supported).
    const direct = await tryFetch(url);
    if (direct && ANTHROPIC_OK.has(direct.mediaType) && direct.bytes <= MAX_BYTES) {
      return { data: direct.data, mediaType: direct.mediaType };
    }
    return null;
  } catch (e) {
    console.warn('image fetch failed', e);
    return null;
  }
}

function buildToolSchema(hasProduct: boolean) {
  const required = hasProduct
    ? ['final_prompt', 'voiceover_script', 'concrete_product_details', 'persona_used']
    : ['final_prompt', 'voiceover_script', 'persona_used'];
  return {
    name: 'video_prompt',
    description: 'Return a Seedance 2.0 ready video prompt that strictly follows the system message rules.',
    parameters: {
      type: 'object',
      properties: {
        concrete_product_details: {
          type: 'array',
          items: { type: 'string' },
          description: 'At least 4 concrete physical details extracted from the product images: exact color names, materials, hardware pieces, printed text, distinctive features. Empty array allowed only if no product was provided.',
        },
        scene_description: { type: 'string', description: 'Setting + avatar appearance (or POV hands description) + product description (2–4 sentences).' },
        voiceover_script: { type: 'string', description: 'All spoken lines in order, each in double quotes, separated by line breaks. Empty string if pure ASMR/silent.' },
        camera_notes: { type: 'string', description: 'Camera setup: front/back/overhead, handheld feel, lighting, aspect.' },
        on_screen_beats: { type: 'array', items: { type: 'string' }, description: 'One entry per beat (4 or 5 entries).' },
        persona_used: { type: 'string', description: 'The exact CREATOR_PERSONA id you wrote for.' },
        final_prompt: {
          type: 'string',
          description: 'Complete single-paragraph Seedance 2.0 prompt. Must literally contain the PRODUCT_NAME and AVATAR_NAME from input (when provided). Must follow the format structure and example tone. No headings, no bullets, no labels.',
        },
      },
      required,
      additionalProperties: false,
    },
  };
}

// Anthropic native (preferred). Returns OpenAI-shaped Response on success.
async function callAnthropic(args: { systemPrompt: string; userTextBlock: string; imageUrls: string[]; hasProduct: boolean; }): Promise<Response> {
  if (!ANTHROPIC_API_KEY) return new Response('no anthropic key', { status: 503 });
  const tool = buildToolSchema(args.hasProduct);
  const userContent: any[] = [];
  for (const url of args.imageUrls.slice(0, 4)) {
    const img = await fetchImageAsBase64(url);
    if (img) userContent.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } });
  }
  userContent.push({ type: 'text', text: args.userTextBlock });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      // Prompt caching: the static system prompt (firewall + format rules + distilled
      // Creatify) is identical across calls, so we cache it server-side at Anthropic.
      // ~10× cheaper + faster on cache hits, no Skills beta needed.
      'anthropic-beta': 'prompt-caching-2024-07-31',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL_ANTHROPIC,
      max_tokens: 4096,
      // System as a cacheable block (Anthropic's prompt-caching format).
      system: [{ type: 'text', text: args.systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userContent }],
      tools: [{ name: tool.name, description: tool.description, input_schema: tool.parameters }],
      tool_choice: { type: 'tool', name: tool.name },
    }),
  });
  if (!res.ok) return res;
  const aJson = await res.json();
  const toolUse = (aJson.content || []).find((c: any) => c.type === 'tool_use');
  const argsObj = toolUse?.input ?? {};
  const normalized = { choices: [{ message: { tool_calls: [{ function: { name: tool.name, arguments: JSON.stringify(argsObj) } }] } }] };
  return new Response(JSON.stringify(normalized), { status: 200, headers: { 'content-type': 'application/json' } });
}

// OpenRouter (Claude via OpenAI-compatible endpoint).
async function callOpenRouter(args: { systemPrompt: string; userTextBlock: string; imageUrls: string[]; hasProduct: boolean; }): Promise<Response> {
  if (!OPENROUTER_API_KEY) return new Response('no openrouter key', { status: 503 });
  const tool = buildToolSchema(args.hasProduct);
  const userContent: any[] = [];
  // Use the same transcode-to-PNG path so OpenRouter→Claude doesn't choke on AVIF.
  for (const url of args.imageUrls.slice(0, 4)) {
    const safeUrl = `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=png`;
    userContent.push({ type: 'image_url', image_url: { url: safeUrl } });
  }
  userContent.push({ type: 'text', text: args.userTextBlock });
  return await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://lovable.dev',
      'X-Title': 'Lovable Marketing Studio',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL_OPENROUTER,
      messages: [{ role: 'system', content: args.systemPrompt }, { role: 'user', content: userContent }],
      tools: [{ type: 'function', function: tool }],
      tool_choice: { type: 'function', function: { name: tool.name } },
    }),
  });
}

// Lovable Gemini emergency fallback.
async function callLovableGemini(args: { systemPrompt: string; userTextBlock: string; imageUrls: string[]; hasProduct: boolean; }): Promise<Response> {
  const tool = buildToolSchema(args.hasProduct);
  const userContent: any[] = [];
  for (const url of args.imageUrls.slice(0, 4)) userContent.push({ type: 'image_url', image_url: { url } });
  userContent.push({ type: 'text', text: args.userTextBlock });
  return await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: EMERGENCY_GEMINI_MODEL,
      messages: [{ role: 'system', content: args.systemPrompt }, { role: 'user', content: userContent }],
      tools: [{ type: 'function', function: tool }],
      tool_choice: { type: 'function', function: { name: tool.name } },
    }),
  });
}

// Unified entry. Tries providers in order; returns first 2xx.
async function callWriter(args: { systemPrompt: string; userTextBlock: string; imageUrls: string[]; hasProduct: boolean; }): Promise<{ res: Response; provider: string }> {
  if (ANTHROPIC_API_KEY) {
    const r = await callAnthropic(args);
    if (r.ok) return { res: r, provider: 'anthropic' };
    const body = await r.clone().text().catch(() => '');
    console.warn('[generate-script] anthropic failed', r.status, body.slice(0, 500));
  }
  if (OPENROUTER_API_KEY) {
    const r = await callOpenRouter(args);
    if (r.ok) return { res: r, provider: 'openrouter' };
    const body = await r.clone().text().catch(() => '');
    console.warn('[generate-script] openrouter failed', r.status, body.slice(0, 500));
  }
  const r = await callLovableGemini(args);
  return { res: r, provider: 'lovable-gemini' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { productId, avatarId, format, surface, aspect, duration, userPrompt, exactVoiceover, userDirection, extraRefImages = [], extraRefNames = [] } = await req.json();
    const userExtraRefs: string[] = (Array.isArray(extraRefImages) ? extraRefImages : []).filter((u: any) => typeof u === 'string' && /^https?:\/\//.test(u));
    const userExtraNames: string[] = (Array.isArray(extraRefNames) ? extraRefNames : []).map((n: any) => String(n || '').trim());
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // ---------- Build product context + collect product image URLs ----------
    let productCtx = '';
    let visionFactsCtx = '';
    const productImageUrls: string[] = [];
    let avatarImageUrl: string | null = null;
    const allRefUrls: string[] = [];
    let productMeta: any = null;

    if (productId) {
      const { data: p } = await admin.from('ms_products').select('*').eq('id', productId).maybeSingle();
      if (p) {
        productMeta = p;
        productCtx =
          `PRODUCT_NAME: ${p.name}\n` +
          `PRODUCT_COLOR: ${p.brand_color ?? '(see images)'}\n` +
          `PRODUCT_DESCRIPTION: ${p.description ?? '(see images)'}\n`;
        if ((p as any).vision_analysis) {
          try {
            const v = (p as any).vision_analysis;
            visionFactsCtx = `PRODUCT_VISION_FACTS (already extracted from images — use these literally):\n${typeof v === 'string' ? v : JSON.stringify(v, null, 2)}\n`;
          } catch { /* ignore */ }
        }
      }
      const { data: imgs } = await admin
        .from('ms_product_images')
        .select('*')
        .eq('product_id', productId)
        .order('is_primary', { ascending: false });
      for (const img of imgs ?? []) {
        const { data: signed } = await admin.storage.from('ms-products').createSignedUrl(img.storage_path, 60 * 60);
        if (signed?.signedUrl) {
          productImageUrls.push(signed.signedUrl);
          allRefUrls.push(signed.signedUrl);
        }
      }
    }

    // ---------- Avatar context ----------
    let avatarCtx = '';
    if (avatarId) {
      const { data: a } = await admin.from('ms_avatars').select('*').eq('id', avatarId).maybeSingle();
      if (a) {
        avatarCtx =
          `AVATAR_NAME: ${a.name}\n` +
          `AVATAR_GENDER: ${a.gender ?? 'unspecified'}\n` +
          `AVATAR_DESCRIPTION: ${(a as any).description ?? 'mid-20s, natural look, real skin tones'}`;
        if (a.public_url) {
          avatarImageUrl = a.public_url.startsWith('http') ? a.public_url : `${new URL(req.url).origin}${a.public_url}`;
        } else if (a.storage_path) {
          const { data: signed } = await admin.storage.from('ms-avatars').createSignedUrl(a.storage_path, 60 * 60);
          if (signed?.signedUrl) avatarImageUrl = signed.signedUrl;
        }
        if (avatarImageUrl) allRefUrls.push(avatarImageUrl);
      }
    }

    // ---------- Exact-voiceover bypass ----------
    if (exactVoiceover && userPrompt) {
      return new Response(
        JSON.stringify({
          prompt: userPrompt,
          script: { voiceover_script: userPrompt, exact: true, persona_used: 'exact-voiceover' },
          reference_urls: allRefUrls,
          script_persona: 'exact-voiceover',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ---------- Roll persona ----------
    const persona = rollPersona();
    const personaBlock = `CREATOR_PERSONA: ${persona.id} — ${persona.name}\nVOICE GUIDE: ${persona.voice}\n`;

    // ---------- POV hands branch ----------
    const isPovHands = !avatarId && !!productId && (format === 'UGC' || format === 'Tutorial' || format === 'Unboxing');
    const modeNote = isPovHands ? `MODE: POV_HANDS (no avatar — only hands visible, no face)\n` : '';

    // ---------- Direction (creative core) vs setting hint ----------
    const direction = (userDirection || userPrompt || '').trim();
    const directionBlock = direction
      ? `USER_DIRECTION (treat as the creative core — build the scene around this; format rules govern camera/structure only): ${direction}\n`
      : `USER_DIRECTION: (none — invent a product-specific creative angle from the visible product details)\n`;

    // Only inject a random creative angle when the user gave no direction — otherwise
    // the random roll fights the user's intent and produces off-brief scripts.
    const creativeAngleBlock = direction
      ? ''
      : `CREATIVE_ANGLE_HINT (use only if it fits the product; ignore if it doesn't): ${rollCreativeAngle()}\n`;

    // System prompt = firewall + format prompt + distilled Creatify reference.
    // Order: hardest rules first (firewall), format-specific structure second,
    // light Creatify hints last so they stay reference, not checklist.
    const sys = `${HUMAN_UGC_FIREWALL}\n\n${FORMAT_SYSTEM_PROMPTS[format] || FORMAT_SYSTEM_PROMPTS.UGC}\n\n${CREATIFY_DISTILLED}`;

    // ---------- Build hard duration spec ----------
    const durSec = Math.max(1, Math.min(60, Number(duration) || 8));
    // Natural UGC pace ≈ 2.3 words/sec spoken; cap dialogue total accordingly.
    const maxSpokenWords = Math.max(6, Math.round(durSec * 2.3));
    // Beat counts scale with duration so a 15s ad doesn't try to fit 5 long beats.
    let beatCount: number;
    if (durSec <= 6) beatCount = 2;
    else if (durSec <= 10) beatCount = 3;
    else if (durSec <= 15) beatCount = 4;
    else if (durSec <= 22) beatCount = 5;
    else beatCount = 6;
    const beatLen = +(durSec / beatCount).toFixed(1);
    // Build explicit beat windows like "0.0–3.8s, 3.8–7.5s, ..."
    const beatWindows: string[] = [];
    for (let i = 0; i < beatCount; i++) {
      const a = +(i * beatLen).toFixed(1);
      const b = i === beatCount - 1 ? durSec : +((i + 1) * beatLen).toFixed(1);
      beatWindows.push(`${a}–${b}s`);
    }
    const durationSpec =
      `STRICT DURATION SPEC (this OVERRIDES any timings shown in EXAMPLE OUTPUT — examples are stylistic only):\n` +
      `- TOTAL VIDEO LENGTH: exactly ${durSec} seconds. The script must START at 0s and END by ${durSec}s. Nothing past ${durSec}s.\n` +
      `- BEAT COUNT: exactly ${beatCount} beats. Use these exact time windows in the paragraph: ${beatWindows.join(', ')}.\n` +
      `- TOTAL SPOKEN DIALOGUE: at most ${maxSpokenWords} spoken words across the entire script (natural UGC pace ≈ 2.3 words/sec). Count every word inside double quotes. If you exceed this you MUST cut lines.\n` +
      `- Dialogue is OPTIONAL on short durations (${durSec <= 8 ? 'this is a short ad — silence + ASMR or 1–2 ultra-short lines is preferred over rushed talking' : 'fit lines naturally inside their beats; never cram'}).\n` +
      `- Hook MUST land within the first beat window (${beatWindows[0]}). Payoff/verdict MUST land in the last beat window (${beatWindows[beatCount - 1]}).\n` +
      `- Do NOT label this as 15s/22s/etc. unless that matches DURATION. Use the windows above verbatim.\n`;

    // Build the LLM image attachment list first so we can describe @mentions
    // by their position in that list.
    // ── UNBOXING: the user's first extra ref is the PACKAGING anchor — bump it
    // to attachment slot #1 so the model sees the box before anything else. ──
    const isUnboxing = format === 'Unboxing';
    const imageUrlsForLLM: string[] = [];
    if (isUnboxing && userExtraRefs.length > 0) {
      imageUrlsForLLM.push(userExtraRefs[0]); // packaging anchor first
      imageUrlsForLLM.push(...productImageUrls.slice(0, 3));
    } else {
      imageUrlsForLLM.push(...productImageUrls.slice(0, 3));
    }
    if (avatarImageUrl) imageUrlsForLLM.push(avatarImageUrl);
    const extraStartIdx = imageUrlsForLLM.length; // 0-based index where extras begin
    const remainingSlots = Math.max(0, 8 - imageUrlsForLLM.length);
    // For Unboxing we already used the first extra above — skip it here.
    const extrasPool = isUnboxing && userExtraRefs.length > 0 ? userExtraRefs.slice(1) : userExtraRefs;
    const extraForLLM = extrasPool.slice(0, remainingSlots);
    imageUrlsForLLM.push(...extraForLLM);
    extraForLLM.forEach((u) => allRefUrls.push(u));
    if (isUnboxing && userExtraRefs.length > 0) allRefUrls.unshift(userExtraRefs[0]);

    const extraRefBlock = extraForLLM.length
      ? `\nUSER_EXTRA_REFERENCE_IMAGES (in order, exposed to the user as @mentions):\n` +
        extraForLLM
          .map((_, i) => `- @${userExtraNames[i] || `Image ${i + 1}`}: attached reference image #${extraStartIdx + i + 1}`)
          .join('\n') +
        `\nThese extra reference images are FIRST-CLASS CASTING / PROP INPUTS, not background flavor:\n` +
        `- If an extra reference depicts a PERSON and the format is Podcast (or any two-person format), that person IS Speaker B. Lock Speaker B's appearance — face, hair color & length, skin tone, age range, build, wardrobe colors and silhouette — to that exact reference image. Describe these traits explicitly inside every SINGLE B and WIDE TWO-SHOT shot tag in the final paragraph so Seedance has no room to invent a different person. Reference image # is the casting choice; do NOT swap it for a generic "second host".\n` +
        `- If an extra reference depicts a PROP, OUTFIT, or SETTING, treat it the same way you treat the product / avatar: preserve identity / appearance, ignore its background and framing.\n` +
        `- If USER_DIRECTION mentions @Image N (or any of the names above), treat that as a literal pointer to the matching reference image.\n`
      : '';

    // ---------- Per-request Podcast studio variety nudge (kills "always dim black foam" slop) ----------
    // Claude invents a fresh studio per generation, matched to product/persona/topic.
    // The taste references below are inspiration only — NOT a checklist.
    const TASTE_REFERENCES = [
      'warm sunset loft with industrial window + exposed brick',
      'bright daylit scandi room with sheer linen + olive tree',
      'neon gamer pod with RGB glow + vinyl wall + slight haze',
      'after-hours specialty coffee shop with edison pendants',
      'minimal white cyclorama, editorial softbox + cool rim',
      'rooftop magic-hour set with blurred city skyline + string bulbs',
      'retro 70s walnut-paneled den with mustard shag + amber lamp',
      'neo-tokyo night studio with rain-on-glass projection + teal practicals',
      'desert airstream interior with warm wood + window light',
      'art-deco hotel lounge with green velvet + brass sconces',
      'industrial concrete loft with single skylight beam',
      'beach-house sunroom with rattan + linen + ocean haze',
    ];
    const shuffled = [...TASTE_REFERENCES].sort(() => Math.random() - 0.5).slice(0, 3);
    const podcastPresetBlock = format === 'Podcast'
      ? `\nSTUDIO CREATIVE BRIEF — invent a brand-new podcast studio for THIS clip that fits the product, persona, and topic. Do NOT copy a template. The dim-black-foam classic den is BANNED unless USER_DIRECTION explicitly asks for it.\n` +
        `Taste references for vibe range only (do NOT literally reproduce — invent something new in the same family, or somewhere unexpected entirely): ${shuffled.join(' · ')}.\n` +
        `Your invented set MUST specify: wall material/texture, floor, 2+ named props, 2+ practical light sources with color temperatures (e.g. tungsten 3200K, daylight 5600K, neon RGB, edison amber 2200K, softbox 5000K, golden-hour 2200K), seating, table, and overall color palette. The RØDE boom mic on a visible articulating arm is mandatory in every shot tag, even on outdoor / unconventional sets.\n` +
        `Variety rule: surprise the viewer. Do not reuse the same studio you would obviously default to.\n`
      : '';

    // ---------- Per-request UNBOXING creative brief (camera-language palette + packaging anchor) ----------
    // We shuffle the camera-language palette so Claude sees a fresh order each
    // call — small bias against defaulting to the same language twice in a row.
    // The taxonomy hint is a lightweight keyword pass over PRODUCT_NAME/desc to
    // help Claude name what the product IS in one phrase (Step 1 of the method).
    const UNBOXING_CAMERA_LANGUAGES = [
      'TOP-DOWN ASMR', 'THEATRICAL REVEAL', 'VLOG SELFIE', 'QUIET HANDHELD',
      'EDITORIAL PAN', 'JUMP-CUT HAUL', 'STREET DOC', 'TABLETOP CINEMATIC',
      'POV FIRST-PERSON', 'MACRO TACTILE', 'OVERHEAD STILL-LIFE', 'OUTDOOR DAYLIGHT',
      'BEDROOM WINDOW UGC', 'WORKBENCH MACRO', 'CAFE TABLE REVEAL', 'CAR-SEAT STREET DROP',
      'GOLDEN-HOUR FLATLAY', 'GALLERY PLINTH REVEAL', 'HAUL TRY-ON', 'SCARCITY DROP', 'FULL-SET REVEAL',
    ];
    const productBlob = `${productMeta?.name || ''} ${productMeta?.description || ''}`.toLowerCase();
    const taxonomyHints: string[] = [];
    // Taxonomy detection drives WHICH camera languages dominate the shuffle.
    // The principle: silent/quiet families are the default; haul/scarcity is ONLY
    // surfaced when the product is genuinely a fashion drop. This kills the slop
    // where every unboxing turns into a Comfrt haul.
    const isCollectible = /\b(toy|figure|figurine|vinyl|plush|collectible|art toy|blind box|sticker|trading card)\b/.test(productBlob);
    const isJewelry = /\b(necklace|bracelet|ring|earring|pendant|jewelry|jewellery|chain|charm)\b/.test(productBlob);
    const isQuietLux = /\b(watch|leather wallet|cardholder|small leather|fragrance|perfume|cologne|candle|ceramic|pen|notebook|stationery)\b/.test(productBlob);
    const isFashion = /\b(bag|tote|crossbody|handbag|purse|sneaker|shoe|hoodie|jacket|tee|t-shirt|outfit|skirt|dress|sunglasses|pants|shorts|cardigan|sweater|coat|tank|legging)\b/.test(productBlob);
    const isBeauty = /\b(skincare|serum|cream|cleanser|lipstick|mascara|makeup|beauty)\b/.test(productBlob);
    const isTech = /\b(headphone|earbud|speaker|camera|gadget|charger|keyboard|mouse|tech|device|console)\b/.test(productBlob);
    const isUsedNotOpened = /\b(bike|treadmill|equipment|gym|fitness|tumbler|bottle|blender|appliance)\b/.test(productBlob);
    if (isCollectible) taxonomyHints.push('designer collectible / art toy');
    if (isJewelry) taxonomyHints.push('fine jewelry');
    if (isQuietLux) taxonomyHints.push('quiet-luxury small good');
    if (isFashion) taxonomyHints.push('fashion / wearable');
    if (isBeauty) taxonomyHints.push('beauty');
    if (isTech) taxonomyHints.push('tech accessory');
    if (isUsedNotOpened) taxonomyHints.push('used-not-opened equipment');

    // Weight the palette by taxonomy. Silent families lead unless this is clearly
    // a fashion / multi-piece haul situation. Always include some variety so the
    // creative brain can still surprise — but the FIRST options Claude reads
    // match the product's natural energy.
    let weightedPalette: string[];
    if (isCollectible || isJewelry) {
      weightedPalette = [
        'TOP-DOWN ASMR', 'THEATRICAL REVEAL', 'MACRO TACTILE', 'OVERHEAD STILL-LIFE',
        'GOLDEN-HOUR FLATLAY', 'TABLETOP CINEMATIC', 'POV FIRST-PERSON', 'QUIET HANDHELD',
      ];
    } else if (isQuietLux || isBeauty || isTech) {
      weightedPalette = [
        'QUIET HANDHELD', 'TABLETOP CINEMATIC', 'EDITORIAL PAN', 'WORKBENCH MACRO',
        'CAFE TABLE REVEAL', 'GALLERY PLINTH REVEAL', 'MACRO TACTILE', 'STREET DOC',
      ];
    } else if (isFashion) {
      // Fashion is the ONE category where haul/try-on energy is on-brand.
      // Still seed a quiet option first so Claude can pick silent ASMR if the
      // packaging/product personality calls for it (e.g. quiet-luxury fashion).
      weightedPalette = [
        'BEDROOM WINDOW UGC', 'HAUL TRY-ON', 'SCARCITY DROP', 'FULL-SET REVEAL',
        'VLOG SELFIE', 'JUMP-CUT HAUL', 'QUIET HANDHELD', 'CAR-SEAT STREET DROP',
      ];
    } else if (isUsedNotOpened) {
      weightedPalette = [
        'VLOG SELFIE', 'STREET DOC', 'OUTDOOR DAYLIGHT', 'POV FIRST-PERSON',
        'QUIET HANDHELD', 'TABLETOP CINEMATIC', 'EDITORIAL PAN', 'TOP-DOWN ASMR',
      ];
    } else {
      // No taxonomy hit → mild shuffle, silent families slightly favored.
      weightedPalette = [...UNBOXING_CAMERA_LANGUAGES].sort(() => Math.random() - 0.5).slice(0, 8);
    }
    // Light shuffle within the top 8 so consecutive runs don't always pick #1.
    const shuffledTop = weightedPalette.sort(() => Math.random() - 0.5);

    const hasPackagingRef = isUnboxing && userExtraRefs.length > 0;
    const unboxingPresetBlock = isUnboxing
      ? `\nUNBOXING CREATIVE BRIEF — DO STEPS 1–4 SILENTLY, OUTPUT ONLY THE FINAL PARAGRAPH.\n` +
        `STEP 1 — name in one phrase what THIS product IS. ${taxonomyHints.length ? `Lightweight taxonomy hint: ${taxonomyHints.join(' / ')}.` : 'No taxonomy hint — read the images.'}\n` +
        `STEP 2 — propose 3+ camera-language options that could honor THIS specific product+avatar combo. PRIMARY palette for this product (ordered by fit, but you are NOT capped — invent a hybrid or a brand-new tag if it serves the product better): ${shuffledTop.join(' · ')}. For each option name ONE reason it FITS and ONE reason it MIGHT NOT. Pick the winner.\n` +
        `CINEMATOGRAPHY IS THE MAIN THING: before writing, choose a real scene language and make it visible in the prompt — surface, motivated light, lens/camera feel, frame composition, background life, hand/avatar blocking, color harmony. Good examples: light wooden desk + sage sweater sleeves for a toy; white silk + warm diffused daylight for jewelry; ash-grey tee + oak table + window light for quiet luxury; iPhone front camera + modern aesthetic gym + tired breath for equipment; lived-in bedroom window UGC only when fashion needs it. Bad examples: generic cinematic, aesthetic background, clean setup, random voiceover in a blank room.\n` +
        `IMPORTANT — match the product's personality. Collectibles, jewelry, quiet-luxury small goods, ceramics, fragrances, stationery → almost always SILENT or quiet-whisper families (TOP-DOWN ASMR, THEATRICAL REVEAL, MACRO TACTILE, QUIET HANDHELD, TABLETOP CINEMATIC). Fashion drops, multi-piece sets, sneaker drops, streetwear, lingerie haul → high-energy avatar families (HAUL TRY-ON, SCARCITY DROP, FULL-SET REVEAL). Used-not-opened gear (gym bike, blender, camera) → VLOG SELFIE / STREET DOC, the product is unboxed by being USED. NEVER force haul-energy onto a quiet collectible. NEVER force silent ASMR onto a fashion drop the user clearly wants try-on energy for.\n` +
        `STEP 3 — commit to that camera language. The opening line of your final paragraph MUST start with the camera-language tag in caps, an em-dash, then the duration ("TOP-DOWN ASMR — 10-second vertical 9:16…"). The structural gate verifies this.\n` +
        `STEP 4 — write the script in the exact shape of the REFERENCE LIBRARY: one-line camera/style header → setting+packaging+product paragraph (≥30% of words on the unopened packaging) → ${beatCount} timestamped beats with windows ${beatWindows.join(', ')}, each beat = action + named sound + sensory verb → closing style line.\n` +
        `${hasPackagingRef ? `PACKAGING ANCHOR: attached reference image #1 IS the packaging — preserve its color, finish, lid mechanism, ribbon, embossing, printed text, and seals EXACTLY. Do NOT invent a different box.\n` : ''}` +
        `Variety rule: across consecutive generations vary the camera language. AI slop = every clip looking identical. Surprise the viewer.\n`
      : '';

    const userTextBlock =
      // Duration spec FIRST so it dominates everything that follows.
      `${durationSpec}\n` +
      `ASPECT: ${aspect}\n` +
      `DURATION: ${durSec}s\n\n` +
      `${personaBlock}\n` +
      `${creativeAngleBlock}` +
      `${modeNote}` +
      `${productCtx}\n` +
      `${visionFactsCtx}\n` +
      `${avatarCtx}\n\n` +
      `${extraRefBlock}` +
      `${podcastPresetBlock}` +
      `${unboxingPresetBlock}` +
      `${directionBlock}\n` +
      `Look at the attached reference images carefully. Product images are for exact visible product details. Avatar image is for facial identity only; do not use its background, clothes, pose, lighting, or framing as the scene. ` +
      `Extract real visible product details (colors, textures, hardware, printed text, distinctive features) into concrete_product_details — do not invent. ` +
      `Write the Seedance 2.0 prompt as ONE continuous paragraph that fits inside ${durSec} seconds, uses exactly ${beatCount} beats with windows ${beatWindows.join(', ')}, and stays under ${maxSpokenWords} spoken words total. ` +
      `Voice MUST match CREATOR_PERSONA exactly. ` +
      `Output one continuous paragraph in final_prompt. No preamble, no labels, no headings.`;


    // ---------- First attempt: Claude Sonnet 4.5 (Anthropic → OpenRouter → Gemini) ----------
    let { res: aiRes, provider } = await callWriter({
      systemPrompt: sys,
      userTextBlock,
      imageUrls: imageUrlsForLLM,
      hasProduct: !!productId,
    });
    console.log(`[generate-script] writer provider=${provider} status=${aiRes.status}`);

    if (aiRes.status === 429) return new Response(JSON.stringify({ error: 'rate limited' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (aiRes.status === 402) return new Response(JSON.stringify({ error: 'AI credits exhausted' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    let aiJson = await aiRes.json();
    let argStr = aiJson?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    let script: any = argStr ? JSON.parse(argStr) : { final_prompt: userPrompt || '' };

    // ---------- Retry once if weak ----------
    const details = Array.isArray(script.concrete_product_details) ? script.concrete_product_details : [];
    const weakCheck = isWeak(script.final_prompt || '', details, maxSpokenWords, durSec, format);
    if (weakCheck.weak && (productId || avatarId)) {
      console.warn(`[generate-script] weak output (${weakCheck.reason}), retrying`);
      const stricter =
        userTextBlock +
        `\n\nYour previous attempt was rejected: ${weakCheck.reason}. ` +
        `Rewrite. Every spoken line MUST be tied to a concrete physical detail you can see in the images. ` +
        `Avoid every banned phrase. Voice MUST be unmistakably ${persona.name}.`;
      const retry = await callWriter({
        systemPrompt: sys,
        userTextBlock: stricter,
        imageUrls: imageUrlsForLLM,
        hasProduct: !!productId,
      });
      if (retry.res.ok) {
        aiJson = await retry.res.json();
        argStr = aiJson?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
        if (argStr) script = JSON.parse(argStr);
        provider = retry.provider;
      }
    }

    script.persona_used = script.persona_used || persona.id;
    script.writer_provider = provider;

    return new Response(
      JSON.stringify({
        prompt: script.final_prompt || userPrompt || '',
        script,
        reference_urls: allRefUrls,
        script_persona: script.persona_used,
        concrete_product_details: script.concrete_product_details || [],
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
