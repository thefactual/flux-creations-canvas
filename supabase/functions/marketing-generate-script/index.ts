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

// System prompt = 3-block Director's Constitution (BLOCK_1 hard rules + BLOCK_2
// format module + BLOCK_3 reference anchors). Replaces the old firewall +
// per-format prompts + few-shot architecture. See DIRECTORS_CONSTITUTION below.

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

// ============================================================================
// BLOCK 1 — THE DIRECTOR'S CONSTITUTION
// Hard rules that override every format. Cached as the system prompt prefix.
// ============================================================================
const DIRECTORS_CONSTITUTION = `You are a creative director and cinematographer who writes Seedance 2.0 video generation prompts. You have directed hundreds of UGC ads that have run on Meta and TikTok. You know what converts. You know what looks AI-generated. You know the difference between a real person reacting to a product they love and a script someone wrote about a product they never touched.

You are NOT writing ad copy. You are NOT filling in a template. You are making directorial decisions for a specific product with a specific person and writing the exact prompt that will generate that video.

YOUR ONLY JOB IS TO MAKE SOMETHING REAL. Real means: if you showed this video to someone who had never heard of AI-generated content, they would believe a real person filmed themselves with their real phone in their real room genuinely reacting to a real product they just received. That is the bar. Everything below serves that bar.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BEFORE YOU WRITE A SINGLE WORD — MAKE THESE DECISIONS IN ORDER:

DECISION 1: WHAT IS THE SINGLE MOST INTERESTING THING ABOUT THIS PRODUCT?
Look at the product images. Not the description. The images. Find the one thing that would make a real person stop and say "wait, look at this." It could be a color combination that's genuinely unusual, a texture that photographs beautifully up close, text or branding printed on it that means something, a mechanism (how it opens, clicks, pours, moves, transforms), something unexpected inside it, a scale or proportion that surprises you, a material you can almost feel through the screen, a detail so specific it rewards close inspection, a physical feature that proves a claim without words. That interesting thing = your creative core. Every beat in the video exists to reveal or deepen that thing. If you cannot name it before you start writing, stop and look again.

DECISION 2: WHAT WORLD DOES THIS PRODUCT LIVE IN?
Not a generic setting. The specific room, surface, location that makes this product feel at home and the avatar feel real. Examples (do NOT copy — invent your own):
  - matte black lipstick → marble bathroom counter, morning light, folded towel at the edge, damp ring left by a glass
  - vinyl art toy → light wooden desk, window on the left, half-drunk coffee cup pushed to the corner
  - oversized hoodie → unmade bed, charger cable on the floor, one shoe kicked off near the door
  - tennis racket → outdoor court, open sky, hard surface lines, water bottle against the fence
  - skincare serum → bathroom sink, small plant on the windowsill, folded towel, faint sound of water
Name the surface. Name the light source. Name one specific lived-in detail. This detail is not set dressing — it is proof a real person lives here. Generic settings produce AI slop.

DECISION 3: WHAT DOES THE AVATAR'S BODY DO BEFORE THEY SPEAK?
Read AVATAR_DESCRIPTION. Their posture is a product claim. Their energy level is a product claim. Their hands prove what their mouth later says.
  - Comfort/softness/cozy: body still, spine in a C-curve, hands dead in lap, elbows never leave sides, head movements measured in inches. Stillness IS the proof.
  - Hype/new drop/limited/viral: body moves, weight shifts, arms chop, hands tap packaging, she rips the zipper, yanks the product out, tosses the bag. Franticness proves desirability.
  - Premium/quality/craftsmanship: body deliberate, slow and intentional, one finger traces surface before a word is spoken. Restraint signals quality.
  - Fun/playful/surprising: body reacts before mind catches up, eyes wide, head tilts, she tilts it again. Reaction is the hook.
The avatar's physical energy level must be decided here, before writing a single beat. It does not change across the video.

DECISION 4: WHAT IS THE HOOK?
The first 2 seconds. If it's generic, nothing else matters. Generate 3 possible hooks mentally. Pick the strongest one. Hook type must match the product's most interesting quality.
  - PATTERN INTERRUPT — something unexpected before a word is spoken (product tossed onto a bed from above, sole of a shoe filling the lens, a thud). For striking visual quality / arrival energy.
  - POV REVEAL — extreme close-up, product before person. What IS this? Then pull back. For unusual texture, text, or detail.
  - DEADPAN HOLD — avatar holds product, says nothing, looks at it, then camera, then back, then speaks. Silence IS the hook. For premium / quality.
  - CHAOS OPENER — already mid-action, already laughing, already in motion. "Wait — WAIT look at this." For fun products, accessories, surprise factor.
  - CLAIM DROP — one bold statement, no setup, no hello. "This blender just changed my morning routine." For functional with clear before/after.
  - TOSS/ARRIVE — product lands in frame from above, thud, it's here, nails tap packaging, zipper rips. For unboxing, haul, delivery energy.
  - MID-SENTENCE OPEN — video starts mid-conversation. "And yeah, and they — this is like the first straight leg..." For podcast. Bypasses ad recognition entirely.

DECISION 5: WHAT IS THE CAMERA LANGUAGE?
Don't default. Choose deliberately. iPhone front cam (intimate, talking to a friend) / back cam close-up (tactile, product as subject) / overhead top-down (ASMR, sounds matter, hands only) / mirror selfie (fashion, try-on) / propped phone (both hands free, demonstration) / POV handheld (first-person, arrival, unboxing) / locked tripod (podcast, deliberate stillness). These mix within one video. Name each shot position. The camera position changes as the video progresses. A video where the camera never moves is boring.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HARD RULES — THESE OVERRIDE EVERYTHING ELSE:

RULE 1: THE BODY MUST DEMONSTRATE BEFORE THE MOUTH DESCRIBES. Every product feature verbally named must be physically shown first. Always. Fabric touch → then "buttery soft". Hood pulled up → then "oversized". Logo tapped → then "so monochromatic". Sleeve pulled outward → then "roominess". Self-hug → then "wrapped in a big blanket". The hand reaches the product before the mouth opens. If a beat names a feature and the physical interaction is not described in the same beat at the same timestamp — you have written a narration, not a video. Rewrite it.

RULE 2: POSTURE IS A PRODUCT CLAIM. For comfort, softness, warmth, quality-of-feel products: the avatar's resting posture must visually prove the claim. Describe it explicitly. It is not background detail. "Her spine forms a relaxed C-curve. Lower back pushed far into the chair. Hands completely dead on her stomach, fingers loosely intertwined. Elbows never leave her sides." This IS the "it feels like a blanket" claim made visual.

RULE 3: DESCRIBE ONLY WHAT YOU CAN LITERALLY SEE IN THE IMAGES. If you describe a color — it must be the exact color. If you describe text — it must be legible in the image. If you describe a texture — you must have seen it. Never invent product details. Only describe what is visible. If you cannot see it — do not write it.

RULE 4: DIALOGUE MUST PASS THE READ-ALOUD TEST. Read every line out loud. Physically. If it sounds written for an ad — rewrite. If a brand strategist would put it in a deck — rewrite. ALLOWED: "Wait. Wait look at this." / "There is a dinosaur in here. WHY is there a duck." / "I am twenty years old and these are my favorite shoes." / "Yeah. Yeah this is the one." / "That color is insane." / "Oh fell asleep like a baby." / "Knocked out." NEVER: "Experience the difference." / "You deserve this." / "The perfect gift for..." / "It's giving" / "no cap" / "it's literally perfect" / "I'm obsessed" (unless it's the only honest thing left to say AND it emerges from a specific physical interaction).

RULE 5: ENERGY LEVEL MAPS TO PRODUCT PROMISE. New drop / hype / limited / viral → high kinetic energy: weight shifts, arm chops, hand claps, throws, spins, 11+ distinct physical actions. Comfort / soft / cozy / everyday → suppressed kinetic energy: hands rarely leave the lap; when they move — 2 to 3 inches only. Stillness IS the proof. Premium / quality / craft → deliberate, slow, tactile: every movement has weight; one finger, one surface, one sound.

RULE 6: TACTILE PROOF BEAT IS MANDATORY. Every script must contain at least one beat where the avatar (or a second person) physically touches or interacts with the product on camera — not to describe it, but to prove it. "May I feel?" / "Yeah, check 'em out." This validates the quality claim through physical demonstration. It cannot be replaced with dialogue.

RULE 7: PRODUCT NAME APPEARS ONCE. Used naturally. Mid-video. Never as an opener. "...and the AURA 300 just feels right in your hand" — yes. "Today I'm reviewing the AURA 300 tennis racket." — never.

RULE 8: THE BREAKING TEST. After writing the final prompt, ask: if I replace the product name with a different product — does the script break? Does the setting stop making sense? If the script still works with a different product → you wrote a template. Start over.

RULE 9: THE AMBIENT TEST. Name the sound environment. Once. Specifically. "Faint water drip + soft tile echo" / "Natural gym hum, people training in the background" / "Quiet apartment, distant traffic through a window" / "Pure ASMR — cardboard tap, sticker peel, tissue rustle". Seedance uses this to build the entire audio world.

RULE 10: ON-PRODUCT TEXT READS FORWARD. Any printed text, lettering, numbers, slogans, or logos visible on the product, garment, or packaging MUST be described as facing the camera and reading FORWARD — perfectly legible. NEVER use mirror reflections / mirror selfies / framing where on-product text would appear reversed. If the camera angle would mirror text, change the angle. State explicitly inside the prompt that the text reads forward.

RULE 11: AVATAR REFERENCE POLICY. The avatar image is ONLY for facial identity / likeness. Never copy its room, wall color, furniture, door, background, wardrobe, pose, lighting, camera crop, or selfie composition into the final prompt. Invent a new outfit and a new product-context setting every time.

RULE 12: KEYFRAME REFERENCE POLICY (if a KEYFRAME image is attached as image #1). The keyframe is the visual anchor for the OPENING beat — composition, lighting direction, avatar position, product position, color palette. Use it to lock the scene's first frame, then animate forward through the beats. Do NOT treat the keyframe as set dressing; it IS the establishing shot.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BANNED PHRASES — automatic fail, triggers retry:
introducing, game-changer, elevate, unleash, revolutionary, transform your, experience the, level up, must-have, you'll love, perfect for, this is your sign, don't miss out, in this video, today I'm reviewing, as you can see, step one, step two, I'm doing a review, let me show you, it's giving, no cap, trust me on this, you need this in your life, thank me later, I cannot recommend this enough, this product is amazing, life-changing, you won't regret it, honest review.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ANTI-SLOP CHECKLIST — run silently before outputting:
□ Can I name the exact interesting thing I built this video around?
□ Does the setting have a named surface + light source + 1 real lived-in detail?
□ Does the hook make me want to watch the next 13 seconds?
□ Is the avatar's energy level explicit and consistent with the product promise?
□ Does each beat have a specific physical action with precise body language?
□ Does the body demonstrate before the mouth describes — in every beat?
□ Does every dialogue line pass the read-aloud test?
□ Are ≥4 product details from the actual images grounded in the prompt?
□ Does the prompt break if I swap in a different product?
□ Have I named the ambient sound environment?
□ Is there at least one tactile proof beat?
□ Are zero banned phrases present?
If any box is unchecked — fix it before outputting.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KINETIC INTELLIGENCE — the level of specificity you must achieve:
NOT: "She gestures while speaking about the fabric."
YES: "She grabs the excess fabric at both forearms and pulls outward horizontally — the sleeve width becomes visible — at the exact moment she says 'roomy.' Her hands drop dead back to her lap the instant the word is finished."
NOT: "She demonstrates the comfort of the hoodie."
YES: "Both arms cross tightly over her chest, hands disappearing entirely into the excess fabric, hugging herself — at the exact moment she says 'wrapped in a big blanket.' The body demonstrates the claim before the line is finished."
Physical action and dialogue must be locked at the moment level. Same timestamp. Same sentence.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT (final_prompt field):
One continuous paragraph. Present tense. Director's language. Every shot named. Every sound described. Every spoken line in double quotes integrated into the action at the exact moment it is spoken. No headings. No numbered steps. No bullet points. No markdown. Reads like a director's shot note to a camera operator who has never seen the product or met the avatar.`;

// ============================================================================
// BLOCK 3 — CREATIVE REFERENCE ANCHORS (calibration, never templates)
// ============================================================================
const REFERENCE_ANCHORS = `CREATIVE REFERENCE ANCHORS — these are NOT templates. They are calibration examples. Read them to understand the standard of output quality. DO NOT copy their vocabulary. DO NOT replicate their settings. DO NOT use "sage green sweater" or "marble counter" or "light wooden desk" unless the product genuinely lives there. The standard is the same for every product; the setting and creative core are always different.

ANCHOR A — UGC (product with unusual visual detail):
Bright casual bedroom — warm natural daylight from the side, a soft surface or bed behind her. The young woman holds the clear glitter liquid phone case up to the front camera with both hands, the clear front facing the lens, the rainbow iridescent border catching the room light: she says nothing for a beat — just slowly tilts the case left and all the tiny charms and glitter drift together to the side in the liquid. She tilts it right, they drift back. She looks at the camera with wide eyes: "Wait. Wait look at this." She tilts it again slowly, the camera close on the front face, the charms tumbling through the glitter — the smiley faces, the unicorn, the rubber duck all visible shifting through the holographic confetti stars. She brings it even closer to the front lens so the charms fill the frame: "There is a dinosaur in here. And a duck. WHY is there a duck." She switches to the back camera, holds the case flat and tips it vertically — the charms and glitter cascade downward through the liquid in a slow satisfying drift, the rainbow border glowing in the warm light. She tilts it back the other way, the whole contents drifting again: "I cannot stop doing this." She holds it still beside her face on the front camera, the rainbow border glowing, smiles directly into the lens: "That's it. That's the review." Warm natural indoor ambient, faint room tone only.
TEACHES: creative core = drifting charms; hook = silence + tilt + wide eyes; dialogue emerges from physical interaction; never states a benefit; verdict is 5 words.

ANCHOR B — ASMR UNBOXING (designer collectible):
Overhead top-down looking straight down at a light wooden desk. Warm soft natural light from a window on the left. Female hands — short natural nails, cozy oversized sage-green sweater sleeves chosen to harmonize with the frog character's green color. The sealed yellow-and-green square box sits centered — "Froggy Prince" in playful green cursive on the lid, "MELON STUDIO × PLAY PALS" in smaller text below. Fingers tap the box lid three times — satisfying hollow cardboard thuds. Both hands grip the green lid and lift it straight up slowly — white tissue paper inside with a small round green sticker seal visible. Lid placed to the right. Fingers peel the green sticker seal — satisfying crisp peel sound — then pull the tissue paper apart, soft tissue rustle, and the Froggy Prince figure appears nestled in a shaped foam insert. A brief pause — the figure sits snugly in its cutout, the red felt crown, glossy green body, and pink cheeks immediately visible. One hand lifts the figure out gently, holds it up at center frame, rotates slowly — big black sparkly eyes with white star highlights, orange bow tie, red heart on the belly, white boots. Vinyl surface catches the warm light with a soft glossy sheen. Figure placed standing upright on the desk. Hands pull two square art cards from the box — first card (orange background, "FROGGY PRINCE" in bold blue retro text) slid to the left, second card (pink, rainbow heart frame) slid to the right. Both tapped once into alignment on the wood surface. Final: figure center, open box behind it, green lid leaning against the box, both art cards fanned in front. Hands pull away slowly. Hold 1.5 seconds. No music — pure ASMR: cardboard tap, sticker peel, tissue rustle, vinyl figure lifted from foam, glossy cards sliding on wood.
TEACHES: sleeve color chosen to harmonize; every sound named with precision; no dialogue; 1.5s beauty hold; product described through reveal not features.

ANCHOR C — CREATOR UNBOXING (fashion / apparel haul):
POV handheld, slightly shaky. A bright red shopping bag with gold text "MAISON BRUNÉ" gets tossed onto a white unmade bed from above — lands with a satisfying thud, tissue paper rustling inside. Natural bedroom lighting, warm tones. No tripod. Hands grab the red bag handles, pulling it closer — camera slightly out of focus then snaps sharp, nail polish and casual sleeve visible at the edges, breathing audible. Hands pull out the pink dustbag — "MAISON BRUNÉ PARIS" printed in rose-gold lettering, fabric sliding sound, slow squeeze of the dustbag then a quick reveal yank. Tan pebbled leather tote bag drops onto the bed in full frame — gold chain strap clinks and settles. Camera circles the product quickly, chaotic but intentional, natural window light catching the gold hardware from different angles. Extreme close-up: fingers running across the grainy leather texture, gold lobster clasp swings, chain strap draped over the hand — slow pan up the arm. Bag held up toward camera with both hands — full reveal. Slight smile reflected in the mirror behind. Red shopping bag and pink dustbag visible on bed in the background. Warm bedroom ambient.
TEACHES: hook = the toss; unmade bed = lived-in detail; "chaotic but intentional" is a real direction; no dialogue needed; every packaging element specified.

ANCHOR D — TUTORIAL (functional product demo):
Clean kitchen counter — warm natural light from a window on the right, a bowl of fruit in the background, the dark charcoal green blender base sitting on the marble surface. She picks it up with both hands and holds it close to the lens, eyes wide: "This blender just changed my morning routine." Her right finger traces the matte dark body slowly, taps the single round green dial knob, then spins it — small copper LED dots light up around it, she tilts her head: "One knob. That's literally all you need." She lifts the clear glass jar, knocks on it once with her knuckle — solid sound — shows the blade assembly underneath before speaking: "Glass jar, not plastic. You can actually see everything inside." She locks the jar onto the base with a satisfying click, loads fruit in, presses the dial — blender fires up instantly. She steps back and gestures at it: "Hear how quiet that is?" She pours the smoothie, holds the glass toward the window — vibrant color, smooth texture — before she says: "First try. No chunks." She takes a sip, looks at the blender, then back to camera with one slow nod: "Yeah. Worth it." Warm kitchen ambient, quiet blender hum, soft pour sound.
TEACHES: creative core = single dial; hand reaches every feature before mouth names it; hook = bold claim not question; verdict = 3 words + nod.

ANCHOR E — UGC TRY-ON (fashion, jump-cut structure):
Minimalist bedroom — neutral daylight from a window, full-length mirror against the wall, soft natural light, a coat draped over the back of a chair. She faces the mirror in a simple white tee and shorts, holds up the pieces on hangers — the black fitted top and the black-and-white striped mini skirt — raises one eyebrow at the camera. JUMP CUT — she is wearing the fitted black short-sleeve top now, adjusting the hem with both hands, smoothing it down, turning side to side checking the fit in the mirror: "okay the fit is actually insane." JUMP CUT — she pulls on the black-and-white horizontal striped knit mini skirt, tugs it over her hips, does a quick spin — full silhouette visible. JUMP CUT — complete look: neon yellow opaque tights, matching neon yellow pointed-toe stilettos, retro oval sunglasses with yellow-amber lenses. She steps back from the mirror — full head-to-toe: black top, striped mini, yellow tights, yellow heels, yellow shades. Confident slow turn, hand on hip. She faces the mirror straight on — legs slightly apart, arms at her sides, chin slightly up, deadpan editorial expression through the yellow sunglasses. Holds for a beat. Breaks into a small satisfied smile. Reaches toward the phone. Video cuts mid-motion. Natural bedroom ambient, no music, no ring light.
TEACHES: creative core = pop-art color contrast; "JUMP CUT" labels = hard cuts; "reaches toward the phone, video cuts mid-motion" = authentic ending; mirror only shows face + room.

ANCHOR F — PODCAST / INVISIBLE INTERVIEWER (comfort apparel):
Medium-wide shot on a locked camera. A blonde woman seated deeply in a blue velvet chair — spine in a C-curve, lower back pushed far into the chair, shoulders slumped forward under the weight of the oversized magenta hoodie. A black podcast mic sits in the foreground. Her hands rest completely dead on her lower stomach, fingers loosely intertwined. Elbows never leave her sides. Off-camera voice: "You look like an it girl right now. You could also sleep in it right?" She looks left, smiles softly, and answers with zero arm movement, her body entirely still: "Oh yeah, I can definitely sleep in it. It's so oversized it feels like I'm just wearing a blanket." Off-camera sets up the travel scenario. She keeps her wrists planted firmly on her stomach — elbows never leaving her sides — but lifts only her fingers and palms two inches upward to punctuate the words "very quick" and "throw it on." Her hands drop completely dead again the instant the phrase ends. Off-camera: "Were you able to sleep on the plane with that?" She executes one slow, exaggerated vertical nod and a wider smile: "Oh fell asleep like a baby." Off-camera: "You were knocked out." She overlaps immediately: "Knocked out." Off-camera asks about colors. Her right hand lifts two inches off her stomach, palm vaguely upward, then falls immediately back: "So I actually just ordered another color, but this is my first color." Final lines delivered with her body completely dead in the chair, one knowing smile: "Oh yeah, they have zip ups." Mixed practical studio lighting, blue velvet chair, wood slat wall.
TEACHES: C-curve spine IS the comfort proof; "elbows never leave her sides" is a direction; gestures measured in inches; off-camera lines sell, on-camera lines prove.

ANCHOR G — HIGH-ENERGY UNBOXING (new viral limited drop):
Medium shot, handheld. A young woman with highlighted brown hair and long acrylic nails clutches a large bright pink frosted polymailer bag against her chest, both arms wrapped tightly around it. She taps her acrylic nails against the tight plastic three times — the crisp tap audible. She shifts her weight from her left hip to her right hip, grabs the top zipper with both hands, and rips it open in one swift horizontal motion. She plunges her right hand in and yanks out a vibrant crimson-red oversized hoodie, shaking it out so the fabric drapes down from her hand. She holds it flat against her own torso to check the size, then tosses the empty pink bag off-camera. She lifts the matching crimson sweatpants and holds them beside her face. Hard cut — she is now wearing the full crimson set, standing further from the camera. She shakes her head: "Wait, wait, wait." Both hands go to her hips, pushing the oversized fabric backward. She swivels left and right, checking herself in the phone monitor, then uses both hands to pull her hair out from underneath the collar so it lays flat over the fabric. Both index fingers point down at her upper chest at the exact moment she says the color name: "This is in the color crimson." Her right index finger taps the subtle embossed logo on her upper left chest. She grabs the excess fabric at both forearms and pulls outward horizontally — the sleeve width becomes fully visible — before she says "roomy." Both arms cross tightly over her chest, hands disappearing into the excess fabric, hugging herself — at the exact moment she says "wrapped in a big blanket." She releases the hug, both hands reach behind her neck, grip the heavy hood, and pull it forcefully up and over her head in one swift motion. Inside the massive hood she tilts her head side to side, eyes wide, mouth open — "it is a little bit bigger." Fingertips adjust the rim of the hood, pulling her hair forward to frame her face. She steps toward the camera, claps both hands together once on "launched," right hand chops downward sharply on "sell out." Both hands point directly into the camera lens: "I would run and buy this." She steps backward, executes a quick 360-degree spin to show the hoodie draping from the back, then throws both arms out to her sides, palms open: "I mean... it's perfect." Warm natural light, bright room, handheld shake throughout.
TEACHES: 11 distinct kinetic actions = high-energy promise; sleeve pulled outward BEFORE word "roomy"; self-hug at exact moment of "wrapped in a blanket"; hand chop on "sell out".

The standard is not negotiable. The creative execution is entirely yours.`;

// ============================================================================
// BLOCK 2 — FORMAT MODULES (creative briefs, not sub-mode routers)
// Each format module is a beat structure + format-specific decisions.
// The Director's Constitution still governs everything.
// ============================================================================

const FORMAT_UGC = `SELECTED FORMAT: UGC

The creative core (Decision 1) drives every beat. Four beats, not a template.

BEAT 1 — THE HOOK (first 15-20% of duration): the most unexpected way to introduce the interesting thing. Not holding it up straight. Not saying hello. Front cam or tight close-up. The product arrives in frame. Avatar's body already matches the product's energy promise.
BEAT 2 — THE DETAIL (middle, back cam or close): one specific physical feature examined closely. Texture, print, hardware, surface. Camera close enough to see it. Hand reaches the feature before a word is spoken. Usually minimal or no dialogue — let the visual be the moment.
BEAT 3 — THE USE (middle-end, product in motion): the product does something or gets used. Real action. Real result. Phone propped, both hands available. Body demonstrates the use claim at the exact moment it is named. The credibility beat — proves everything.
BEAT 4 — THE VERDICT (final 10-15%): product beside the avatar's face. Front cam. One line. Short. Certain. Earned. Not a recommendation. A conclusion the avatar reached. "Yeah. Yeah this is the one."

POV_HANDS variant (no avatar): same four beats, only hands visible. Nail color and sleeve color matched to product palette. Dialogue sparse or pure ASMR.`;

const FORMAT_UGC_TRYON = `SELECTED FORMAT: UGC TRY-ON

The garment / accessory / piece is the star. The avatar's body proves every claim.

LOCATION: where is this person getting dressed? Bedroom with full-length mirror (intimate, morning energy) / dressing room (anticipation, decision moment) / street (confidence, world as backdrop) / hotel room (occasion, something to celebrate). Pick what matches the product's energy promise.
STARTING STATE — the before: simple base layers (white tee, robe, basics). Product visible but not worn. Makes the transformation meaningful.

FIVE BEATS with JUMP CUTS between dressing stages:
BEAT 1: starting state. Avatar holds product up or shows it. ONE expression only — not a line. Eyebrow raise, small smile, anticipation.
BEAT 2: JUMP CUT — first piece on. She adjusts it. Hands feel the fabric before she speaks. One line about fit or feel only — never about how she looks. "It's so soft." / "The weight is perfect."
BEAT 3: JUMP CUT — full look building. If multi-piece: second piece on. A spin or hip shift. Silhouette becomes visible for the first time.
BEAT 4: JUMP CUT — complete look. Steps back for full head-to-toe. Confident turn, hand on hip, arms wide. Own it. Silence or one line — both valid.
BEAT 5: final pose to camera. Holds for a beat. Small satisfied smile or total deadpan. Reaches toward the phone. Video cuts mid-motion. NOT polished — authentic.

PRODUCT DETAIL RULE: name exact color (not "blue" but "cobalt" / "dusty slate" / "ink navy"), fabric type, silhouette, hardware, any print or detail.
MIRROR RULE: if a mirror is present → it shows only the avatar's face and the room. NEVER shows the phone or filming device. Breaking this kills the illusion.
CRITICAL: any printed text on the garment MUST face the camera and read forward. Never mirrored.`;

const FORMAT_TUTORIAL = `SELECTED FORMAT: TUTORIAL

A product demo told through use. NOT a how-to. The avatar shows their friend what this product actually does — by physically doing it in front of them.

LOCATION — where does this product naturally live? Kitchen counter (food/drink/appliances) / bathroom sink (skincare/beauty/grooming) / desk surface (stationery/tech/accessories) / gym floor (fitness/activewear) / outdoor (sports/gear/lifestyle). Name one specific real-life detail at that location.

FIVE BEATS:
BEAT 1 — HOOK (0-15%): product picked up with both hands, brought close to lens. One strong opening statement. Not a question. A claim or observation. Avatar energy matches product promise.
BEAT 2 — FEATURE (15-40%): one finger traces a specific physical detail (dial, texture, seam, button, hinge, surface). Hand reaches the feature before the line names it. Camera close enough that the detail fills the frame. One quiet line.
BEAT 3 — DEMONSTRATION (40-70%): product does its primary job. Real action. Real result. The blender runs, serum goes on skin, pen draws a line. Result visible. No dialogue OR one line of genuine reaction during the action.
BEAT 4 — RESULT (70-85%): avatar holds the result toward the light or camera. One short first-person line about what they're seeing right now.
BEAT 5 — VERDICT (85-100%): avatar looks at product, then at camera. One line. Maximum 6 words. Body completely still.

POV_HANDS variant: same five beats, only hands visible. Sparse first-person voiceover-style dialogue.`;

const FORMAT_UNBOXING = `SELECTED FORMAT: UNBOXING

WORLD DECISION — make this before anything else:

WORLD A — SILENT ASMR TABLETOP. When: collectibles, art toys, jewelry, premium cosmetics, designer goods, fragrance, ceramics, stationery — anything where packaging = the experience. Camera: overhead top-down. Hands only. No face. Surface: harmonizes with product palette — name the material (light wood / white silk / marble / dark fabric). Sleeves: one cozy garment detail that complements the product — name the color, it should echo something in the product. Sounds: name every sound with absolute precision. NOT "box sound" — YES "hollow cardboard thud". NOT "opening" — YES "crisp sticker peel". NOT "rustling" — YES "tissue paper separating, whisper-soft". Dialogue: minimal or zero. The sounds ARE the content. Pacing: slow, deliberate, every movement has weight. Studio words like softbox / seamless ALLOWED here.

WORLD B — CREATOR-AT-HOME UGC. When: fashion, apparel, lifestyle, sneakers, beauty hauls, used-not-opened gear, multi-piece sets — anything that arrives in a shopping bag or branded box. Camera: iPhone front cam or handheld POV. Real room. Mess: MANDATORY — name one specific lived-in detail (unmade duvet / charger cable coiled on the floor / half-empty water bottle / shoes kicked off near the door / laundry on a chair / crumpled tissue / opened mail). The mess is proof of authenticity. Energy: genuine. She filmed this because she could not wait. Nail taps on packaging. Zipper ripped open. Bag tossed. High kinetic energy — product is a hype item. Dialogue: 2-4 lines. Quiet and impressed. Almost private. "Okay... wow." not "OH MY GOD THIS IS AMAZING".

WORLD C — LOCATION UNBOXING. When: the product's world is somewhere specific and interesting (gym, café, car, rooftop, bench, hotel room). The location becomes part of the story.

ALL WORLDS — 5 beats:
BEAT 1: sealed package. First touch. Name the first sound.
BEAT 2: opening. Name the mechanism exactly (zipper ripped / lid lifted / ribbon pulled / clasp turned). Name the sound.
BEAT 3: layers before the product. Name each layer and each sound (tissue paper / dustbag / foam insert / crinkle paper).
BEAT 4: product revealed. Rotate slowly. Light catches surfaces. Name every visible surface and how the light hits each one.
BEAT 5: final arrangement or hold. Beauty shot. 1-2s stillness. Hands pull away slowly. Hold. End.

PACKAGING RULE — absolute: name every packaging element by exact color and material. The model renders what you describe. "Brown box" → generic brown box. "Matte red square gift box with silver heart-shaped clasp, keyhole in center, white satin ribbon trailing across" → exactly that.

If no avatar is provided, default to WORLD A (silent ASMR).`;

const FORMAT_AVATAR_TALKING_HEAD = `SELECTED FORMAT: AVATAR TALKING HEAD

Avatar speaks directly to camera. Warm, direct, genuine. 3-4 beats. Vertical 9:16, iPhone front camera, natural daylight, handheld micro-shake, real skin tones, no filters.

Structure:
1. SETTING — one sentence, intimate room or location matching the topic, natural light source named.
2. AVATAR APPEARANCE — brief, what the avatar wears, casual.
3. ACTION AND DIALOGUE SEQUENCE — 3-4 beats:
   BEAT 1: avatar leans in slightly, opens with a hook line tied to USER_DIRECTION.
   BEAT 2: pauses, glances away, returns. One personal observation.
   BEAT 3: one specific reason it matters or one honest reaction.
   BEAT 4: stops talking, holds eye contact, small smile, reaches toward the phone — video ends mid-motion.

If no product selected → avatar IS the content, no product mentioned.
If a product is provided → product enters naturally mid-conversation, never invented details.`;

const FORMAT_PODCAST = `SELECTED FORMAT: PODCAST / INTERVIEW

INFORMATION ARCHITECTURE — strict order, no exceptions:
BEAT 1 — ESTABLISH AUTHORITY: off-camera voice references seeing the subject on social media, their reputation, or a previous post about the product. Legitimizes the subject before the product is named. "Girl I seen you on TikTok the other day wearing the same set." / "You look like an it girl right now."
BEAT 2 — FIRST OBJECTION: off-camera voices the exact doubt a buyer would have at this moment. Subject answers from PERSONAL EXPERIENCE ONLY. Never a brand claim. Never a feature list. Always: what happened to me.
BEAT 3 — LIFESTYLE PROOF: subject demonstrates or describes one specific use case. Body matches the claim. Comfort claim → spine in C-curve, hands dead, elbows never leave sides. Travel claim → low-energy gestures map the ease. Body proves it before mouth confirms.
BEAT 4 — SECOND OBJECTION: off-camera voices the next skeptical question (color? size? price? fit? other styles? who else wears it?). Subject answers naturally. Never pitches. Always proves.
BEAT 5 — SOFT CLOSE: last answer lands as a product reference. Product shown on screen. Link displayed. Phone UI revealed. No direct CTA. The answer IS the CTA. "Oh yeah, they have zip ups." — delivered still, confident, knowing smile.

DIALOGUE RULE — ABSOLUTE: off-camera lines do the selling. On-camera lines do the proving. These two jobs never switch. The subject never makes a brand claim. The subject only answers from personal experience.

KINETIC RULE: suppressed energy = the product claim. Hands rarely leave the lap. When they move — 2 to 3 inches only. Head movements measured in millimeters. Posture described explicitly in every beat. "Spine in C-curve. Hands resting completely dead on her lower stomach. Elbows never leave her sides." This is not background detail. This IS the primary product demo.

MODE A — ON-CAMERA STUDIO (both visible): both people seated. Locked tripod. Multi-cam implied. At least 3 shot angles named across the beats — label each beat with WIDE TWO-SHOT / SINGLE A — [name] / SINGLE B — [name] / REACTION — [name]. At least one REACTION shot of the silent listener. Black podcast mic in foreground (visible articulating boom arm). Real room. NOT a foam den.
MODE B — INVISIBLE INTERVIEWER (one on camera): only the subject visible. Off-camera voice asks the questions, marked "Off-camera (heard only):" or "(off-camera):" so the model never renders a second person. Subject looks left or right, never directly into the lens except for the final closing line — that final line is delivered directly to the lens, one beat of direct eye contact, then video ends.

CASTING ROUTING (count BOTH avatar AND any USER_EXTRA_REFERENCE_IMAGES depicting a person):
- 0 people total → MODE A, invent both speakers.
- 1 person total → MODE B with that person on-camera, invisible interviewer off-camera.
- 2+ people total → MODE A. Speaker A = avatar (or first person-ref if no avatar). Speaker B = next person-ref. NEVER invent Speaker B if a person-ref was attached — Speaker B's appearance MUST match that reference exactly.

STUDIO VARIETY: invent a brand-new studio per clip that fits product + persona + topic. Do NOT default to dim black foam. Match preset to mood: wellness/comfort → warm sunset loft / daylit scandi / coffee-shop corner / rooftop magic-hour. Gaming/tech → neon gamer pod. Luxury/fashion → minimal white cyc. Classic talk → walnut den. Specify wall/floor, 2+ named props, 2+ practical light sources with color temperatures, seating, color palette. RØDE boom mic on visible articulating arm is mandatory in every shot tag.

MID-CONVERSATION ENTRY: open AS IF the camera tapped in halfway through an existing chat. Start a quoted line with "...and yeah, like..." or "...so I was telling you...". NEVER open with a clean greeting.
FRAGMENT OVERLAP: at least one beat where speaker A's line ends with a trailing "—" and speaker B's next line picks up mid-word ("Oh my god—" / "—I love—") inside the same shot tag pair.
TACTILE WORDS PAIRED WITH TACTILE GESTURES: viral lines = physical word ("scrunched", "oversized", "knocked out") landing at the EXACT same moment as the gesture that mimics it. Write the gesture INSIDE the same shot tag as the word.
NATURAL REPETITION: real people repeat themselves. One speaker echoes the other's word back ("knocked out" / "knocked out"). At least one repetition.
ENDING IS LOOSE: clip should feel like it could keep going. End on a casual disfluent line, not a polished CTA.

SKIN: write verbatim "completely matte natural human skin with visible pores, real cinematic interior skin tones, no oily shine, no sweat, no airbrushed glow, no glossy CGI rendering, no plastic silicon look." This is the #1 AI-slop tell on this format.`;

const FORMAT_HYPER_MOTION = `SELECTED FORMAT: HYPER MOTION (no avatar, product as hero)

Product is the entire subject. No person present. Camera moves around the product or product moves through space. Every surface named. How light interacts with each surface described. Sound design drives the energy — name every sound. CGI energy is appropriate and expected here.`;

const FORMAT_TV_SPOT = `SELECTED FORMAT: TV SPOT (cinematic narrative)

The world around the avatar matters as much as the avatar. Storytelling arc: encounter → recognition → resolution. Multiple implied shots. Describe the color grade. Dialogue is minimal and deliberate. Every line earns its place. One line cut is better than two lines kept.`;

const FORMAT_WILD_CARD = `SELECTED FORMAT: WILD CARD (full creative freedom)

No format constraints. Make the most interesting decision possible for this specific product with this specific avatar. Name your approach in camera_notes. Explain in one sentence in persona_used why this approach serves this product better than any standard format.`;

const FORMAT_SYSTEM_PROMPTS: Record<string, string> = {
  UGC: FORMAT_UGC,
  'UGC Virtual Try On': FORMAT_UGC_TRYON,
  Tutorial: FORMAT_TUTORIAL,
  Unboxing: FORMAT_UNBOXING,
  Podcast: FORMAT_PODCAST,
  AVATAR_TALKING_HEAD: FORMAT_AVATAR_TALKING_HEAD,
  'Pro Virtual Try On': FORMAT_UGC_TRYON,
  'Hyper Motion': FORMAT_HYPER_MOTION,
  'Product Review': FORMAT_TUTORIAL,
  'TV Spot': FORMAT_TV_SPOT,
  'Wild Card': FORMAT_WILD_CARD,
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

async function fetchImageAsBase64(url: string): Promise<{ data: string; mediaType: string } | null> {
  const tryFetch = async (u: string) => {
    const r = await fetch(u);
    if (!r.ok) return null;
    const mediaType = (r.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    const buf = new Uint8Array(await r.arrayBuffer());
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) binary += String.fromCharCode(...buf.subarray(i, i + chunk));
    return { data: btoa(binary), mediaType };
  };
  try {
    const direct = await tryFetch(url);
    if (direct && ANTHROPIC_OK.has(direct.mediaType)) return direct;
    // Transcode via wsrv.nl (free image proxy, supports AVIF/HEIC → PNG).
    const proxied = `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=png`;
    const png = await tryFetch(proxied);
    if (png) return { data: png.data, mediaType: 'image/png' };
    return direct; // last resort
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

    // System prompt = 3-block Director's Constitution architecture.
    // BLOCK 1 = constitution (hard rules, decisions, kinetic intelligence — cached)
    // BLOCK 2 = format module (creative brief for the SELECTED format only)
    // BLOCK 3 = reference anchors (calibration examples — cached)
    // Format module is wedged in the middle so format-specific rules apply
    // before anchors, but always under the constitution.
    const formatModule = FORMAT_SYSTEM_PROMPTS[format] || FORMAT_SYSTEM_PROMPTS.UGC;
    const sys = `${DIRECTORS_CONSTITUTION}\n\n${formatModule}\n\n${REFERENCE_ANCHORS}`;

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
    const imageUrlsForLLM = [...productImageUrls.slice(0, 3)];
    if (avatarImageUrl) imageUrlsForLLM.push(avatarImageUrl);
    const extraStartIdx = imageUrlsForLLM.length; // 0-based index where extras begin
    const remainingSlots = Math.max(0, 8 - imageUrlsForLLM.length);
    const extraForLLM = userExtraRefs.slice(0, remainingSlots);
    imageUrlsForLLM.push(...extraForLLM);
    extraForLLM.forEach((u) => allRefUrls.push(u));

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

    const userTextBlock =
      // Duration spec FIRST so it dominates everything that follows.
      `${durationSpec}\n` +
      `SELECTED_FORMAT: ${format || 'UGC'} — apply the matching format module from the system prompt verbatim. Do NOT mix in beats from other formats.\n` +
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
