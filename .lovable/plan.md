## What's broken

Your prompt was:

> replace the bracelet which is on the right hand of the girl in **@video_1** to this **@image_1** hermes watch

The video came back unchanged (no Hermès watch swapped in) because the `@video_1` / `@image_1` tokens are sent to Seedance **as raw text**. Seedance 2.0 has no concept of `@video_1`, so it reads the prompt as gibberish references and falls back to: "use the reference video, ignore the rest". That's why you got the original hairspray clip back untouched.

The previous Tommy-jacket video worked because that prompt didn't use @-tags — Seedance just remixed the single reference video naturally.

The fix is: **resolve the @-tokens into language Seedance understands before submitting**, in both the client store and the edge function (so retries also work).

## Plan

### 1. Resolve @-tags in `src/store/seedanceStore.ts`

Before calling the edge function, rewrite the prompt:

- `@image_1` → `the first reference image`
- `@image_2` → `the second reference image`
- `@video_1` → `the reference video`
- `@video_2` → `the second reference video`
- `@audio_1` → `the reference audio`

Map each tag to its 1-based index in the upload order (matches what the prompt bar shows). Use ordinals up to 9 ("first", "second", … "ninth"); fall back to "image N" beyond that.

Also: if the user wrote an edit-style prompt (regex match for `replace|swap|change|put|add` + `@image_N`), prepend a small instruction so Seedance treats it as a video edit:

> "Edit the reference video: <user prompt>. Keep everything else identical to the reference video."

This is the single most important change — it tells Seedance "this is an edit of the reference video, not a free generation".

### 2. Mirror the resolution in the edge function

`supabase/functions/seedance-generate-video/index.ts` — add the same resolver right before `atlasSubmit` runs. Reason: the retry path (visual-only fallback) re-uses `promptText` from the request body. If the client ever sends raw tokens, the edge function still sanitizes them.

### 3. Validate edit prompts client-side

In `seedanceStore.ts` `generate()`, if the prompt contains `@video_N` but no reference video is attached (or `@image_N` exceeds attached image count), show a toast like "You referenced @video_1 but no reference video is attached" and abort before burning credits.

### 4. Keep the prompt log readable

Log the resolved prompt in the edge function (`log('INFO', 'submit', …)`) so future debugging shows exactly what Seedance received.

## Technical details

**Files changed:**
- `src/store/seedanceStore.ts` — add `resolvePromptTags()` helper, call before submit, add validation.
- `supabase/functions/seedance-generate-video/index.ts` — add identical resolver, apply to `promptText` before `atlasSubmit`, log resolved prompt.

**No DB / schema changes. No new dependencies.**

**Why not use AtlasCloud's own @-syntax?** Seedance 2.0 docs don't define one — references are passed via the `reference_images` / `reference_videos` arrays only, and the prompt is plain natural language. So natural-language resolution ("the first reference image") is the correct path.

**Why prepend "Edit the reference video"?** Seedance's reference-to-video endpoint defaults to "use the reference video as motion/style guidance" not "edit it". Edit-style prompts need to be explicit, otherwise the model just regenerates the original scene — exactly what happened to you.

## Expected behavior after fix

Prompt: `replace the bracelet which is on the right hand of the girl in @video_1 to this @image_1 hermes watch`

Becomes (sent to Seedance):
> Edit the reference video: replace the bracelet which is on the right hand of the girl in the reference video to this the first reference image hermes watch. Keep everything else identical to the reference video.

(We'll also lightly clean the doubled article — final string: "…to the first reference image, a Hermès watch.")

Result: Seedance treats it as a targeted edit of the reference video, swapping the bracelet for the watch from `@image_1`, instead of returning the original clip untouched.
