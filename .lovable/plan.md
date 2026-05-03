# Bulletproof provider routing — full backend rewire

Goal: every option in the prompt nav bar (image, video Create/Edit/Motion, marketing) reaches the right provider, with verified endpoints, normalized payloads, deterministic polling, and a multi-tier fallback chain. No silent failures.

---

## 1. Source-of-truth model registry

Create `supabase/functions/_shared/modelRegistry.ts` so the UI label, the provider routing, and the fallback chain live in **one** place (today they're split across `generatorStore.ts`, `videoStore.ts`, and the two edge functions, which is why slugs drift).

```ts
export type ProviderId = 'fal' | 'runware' | 'evolink' | 'apiyi' | 'atlas';
export type ImageEntry = {
  id: string;                 // UI key e.g. "nano-banana-pro"
  label: string;              // "Nano Banana Pro"
  primary:   { provider: ProviderId; model: string; edit?: string };
  fallbacks: { provider: ProviderId; model: string; edit?: string }[];
  maxRefs: number;
};
export type VideoEntry = {
  id: string;
  label: string;
  modes: ('text-to-video'|'image-to-video'|'motion-control'|'video-edit')[];
  primary:   { provider: ProviderId; t2v?: string; i2v?: string; motion?: string; edit?: string; durationFormat: ... };
  fallbacks: { ... }[];
  startEndFrames?: boolean;
};
```

Both edge functions and both Zustand stores import from this file via a thin `// @ts-ignore deno` re-export so the client gets the labels and the server gets the routing.

---

## 2. Verified endpoint matrix (after re-reading docs)

### Images
| UI label | Primary | Fallback 1 | Fallback 2 |
|---|---|---|---|
| Nano Banana Pro | apiyi `gemini-3-pro-image-preview` | fal `fal-ai/bytedance/seedream/v4/text-to-image` | runware `google:4@1` |
| Nano Banana 2 | apiyi `gemini-3.1-flash-image-preview` | fal seedream-4 | runware `google:4@2` |
| Seedream 4.0 | fal `fal-ai/bytedance/seedream/v4/text-to-image` (+ `/edit`) | runware `bytedance:seedream@4` | — |
| Seedream 5.0 Lite | fal `fal-ai/bytedance/seedream/v5/lite/text-to-image` | fal seedream-4 | — |
| Grok Imagine | fal `fal-ai/grok-imagine` | runware `xai:grok-imagine@image` | — |
| Kling Image V3 | fal `fal-ai/kling/v2.1/standard/text-to-image` | runware `klingai:image@1` | — |
| Flux 2 Pro | fal `fal-ai/flux-pro/v1.1-ultra` (+ `fal-ai/flux-pro/kontext` for edit) | runware `bfl:2@2` | — |
| Wan 2.2 | fal `fal-ai/wan/v2.2-a14b/text-to-image` | runware `wan:2.2@a14b` | — |

### Video — Create
| Label | Primary | Fallback |
|---|---|---|
| Seedance 2.0 | runware `bytedance:seedance@1.5-pro` | fal `fal-ai/bytedance/seedance/v1/pro/text-to-video` |
| Kling 3.0 | fal `fal-ai/kling-video/v3/pro/text-to-video` & `image-to-video` (+ `tail_image_url` for end frame) | runware `klingai:6@1` |
| Google Veo 3.1 | fal `fal-ai/veo3.1` (drop `aspect_ratio` when image is provided) | runware `google:3@2` |
| Veo 3.1 Fast | fal `fal-ai/veo3.1/fast` | runware `google:3@3` |
| Veo 3.1 Lite | fal `fal-ai/veo3.1/lite` | — |
| Sora 2 | runware `openai:3@1` | — |
| Runway Gen-4.5 | runware `runwayml:gen@4.5` | — |
| PixVerse V6 | fal `fal-ai/pixverse/v6/...` | — |
| Hailuo (MiniMax) | fal `fal-ai/minimax/video-01-live/...` | — |
| LTX-2 | fal `fal-ai/ltx-2-19b/...` | — |
| Grok Imagine | runware `xai:grok-imagine@video` | — |

### Video — Edit
- Kling 3.0 Omni Edit → fal `fal-ai/kling-video/v1/pro/effects` (verified slug)
- Kling O1 Video Edit → fal `fal-ai/kling-video/v1.6/pro/elements`
- Grok Imagine Edit → runware `xai:grok-imagine@video`

### Video — Motion Control
- Default = ev-kling-v3-motion (Evolink) → fallback fal `fal-ai/kling-video/v3/pro/motion-control`
- Kling 2.6 Motion Pro / Std → fal slugs as today
- Seedance Motion → runware with `frameImages` + `referenceVideos`

---

## 3. Edge function rewrite

### `supabase/functions/generate-image/index.ts`
- Accept `{prompt, refs, modelId, quality, aspectRatio}`.
- Resolve `modelId` → registry entry → try `[primary, ...fallbacks]` in order.
- Per-provider adapters: `callApiyi()`, `callFal()`, `callRunware()` — each returns `{url}` or throws a typed error (`ProviderError(kind: 'nsfw'|'rate'|'auth'|'badRequest'|'transient', message)`).
- Only `nsfw` and explicit `auth` errors abort; `transient`/`badRequest` advance to next fallback.
- Always return `{imageUrl}` (never base64) to avoid the 6 MB worker limit.

### `supabase/functions/generate-video/index.ts`
Major fixes:
1. **Runware poll**: replace the broken re-submit loop with the documented poll task:
   ```json
   [{ "taskType": "getResponse", "taskUUID": "<id>" }]
   ```
   Read `data[0].videoURL` / `status`.
2. **Runware motion-control**: handle `mode === 'motion-control'` for `rw-seedance-1.5-pro` — emit `frameImages: [{imageURL: characterImg}]` + `referenceVideos: [motionVideo]`.
3. **Kling start+end frame**: switch end-frame field from `end_image_url` to `tail_image_url` for the Kling family. Veo/PixVerse keep `end_image_url`.
4. **Veo image-to-video**: drop `aspect_ratio` when `image_url` set (Veo derives from image).
5. **Edit endpoints**: replace stale Kling Omni/O1 edit slugs with verified `effects` / `elements`.
6. **Submit fallback**: if primary submit returns 4xx/5xx, automatically try fallback provider before bubbling the error.
7. **Background polling**: move polling out of the client into the edge function using `EdgeRuntime.waitUntil` + DB writes — client just subscribes via realtime on `video_generations`. This kills the 10-min client timeout problem and works at 1M users.
8. **Realtime**: add `ALTER PUBLICATION supabase_realtime ADD TABLE public.video_generations;` so the grid updates without polling.

### `supabase/functions/marketing-orchestrate/index.ts`
- Keep AtlasCloud `asset://` registration for avatars (per memory rule).
- Re-host product images from signed URLs to `ms-products` permanent path before submitting to fal Seedance (long signed URLs occasionally trip moderation).

---

## 4. Client store changes

`src/store/videoStore.ts`
- Drop the in-store polling loop entirely — just insert the row and subscribe to `video_generations` realtime updates.
- Remove the 120 × 5s timeout.
- Keep the optimistic placeholder in the grid.

`src/store/generatorStore.ts`
- No structural change; just ensure model IDs match the new registry (no UI text change).

---

## 5. Database migration

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.video_generations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.generations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ms_generations;
ALTER TABLE public.video_generations REPLICA IDENTITY FULL;
ALTER TABLE public.generations REPLICA IDENTITY FULL;
ALTER TABLE public.ms_generations REPLICA IDENTITY FULL;

-- Track which provider actually served each request (for debugging fallbacks)
ALTER TABLE public.generations        ADD COLUMN IF NOT EXISTS provider_used text;
ALTER TABLE public.video_generations  ADD COLUMN IF NOT EXISTS provider_used text;
ALTER TABLE public.video_generations  ADD COLUMN IF NOT EXISTS attempts jsonb DEFAULT '[]'::jsonb;
```

---

## 6. Smoke test (after deploy)

I'll call each surface once via `supabase--curl_edge_functions` and report a checklist:
- Image: nano-banana-pro, seedream-4, grok-imagine, flux, kling, wan
- Video Create: kling-v3-pro (start+end), veo-3.1 (image), seedance (Runware), pixverse, ltx
- Video Edit: kling-omni-edit
- Motion: ev-kling-v3-motion, rw-seedance
- Marketing: 1 Seedance UGC

Each row gets ✅/❌ with the actual provider that served it (so you can see fallbacks firing).

---

## Files touched
- `supabase/functions/_shared/modelRegistry.ts` (new — single source of truth)
- `supabase/functions/generate-image/index.ts` (rewrite via registry + fallback chain)
- `supabase/functions/generate-video/index.ts` (registry + fixed Runware poll + background polling + correct Kling/Veo fields + edit slugs)
- `supabase/functions/marketing-orchestrate/index.ts` (re-host product images)
- `src/store/videoStore.ts` (drop client polling, use realtime)
- `src/store/generatorStore.ts` (consume registry labels)
- New SQL migration (realtime + provider_used + attempts log)

## Out of scope (already correct or explicitly deferred)
- Auth (skipped per your earlier choice)
- Per-project `/create/:slug` rendering (already wired)
- Reference-image strip / @-mentions
