I found the current breakage: Atlas Cloud is rejecting the submitted `image-to-video` input with `input image may contain real person`.

The regression is that the recent Atlas-only integration routes any avatar+product job into `bytedance/seedance-2.0/image-to-video` using a generated keyframe that contains a realistic person. Atlas Cloud’s Seedance image-to-video moderation is rejecting that first-frame image. So the API key/balance is not the issue anymore; the request is reaching Atlas and Atlas is refusing that input shape.

Plan to fix it:

1. Re-route avatar formats away from moderated `image-to-video`
   - For `avatar + product` jobs, stop sending a human-containing keyframe as the `image` field to `bytedance/seedance-2.0/image-to-video`.
   - Use `bytedance/seedance-2.0/reference-to-video` instead for avatar/person jobs, because Atlas docs define that endpoint for reference images/audio and multimodal generation.
   - Upload references through `/api/v1/model/uploadMedia` before submission, as the current integration already does.

2. Keep product-only and text-only routing correct
   - `product only` → `reference-to-video` with product refs.
   - `text only` → `text-to-video`.
   - `avatar only` → avoid raw human `image-to-video`; use `reference-to-video` or text fallback depending on available refs.

3. Preserve the generated keyframe without letting it break generation
   - Keep keyframe generation optional/diagnostic for thumbnails or future use.
   - Do not let a rejected human keyframe become the only video input.
   - If keyframe generation succeeds, include it as an extra reference only where safe, not as the required first frame for image-to-video.

4. Add moderation-aware retry inside `marketing-generate-video`
   - Detect Atlas errors containing `real person` / `input image may contain real person`.
   - If the first attempt used `image-to-video`, retry once with `reference-to-video` using product/avatar/reference URLs where available.
   - Preserve the original Atlas error in logs/details instead of hiding it.

5. Fix reference passing end-to-end
   - `marketing-orchestrate` already sends `image_urls: refs`, but `marketing-generate-video` currently ignores those refs when building its bundle.
   - Update `marketing-generate-video` to accept and include `image_urls`/extra refs so Tutorial, Unboxing, UGC, Try-On, Podcasting all share the same routing logic instead of format-specific guessing.

6. Make provider health less destructive
   - The health probe currently submits a real paid text-to-video generation just to check Atlas.
   - Replace it with a lighter/non-generating check if Atlas docs support one, or make the probe clearly optional/cached and not block valid user generations based on stale/balance-style errors.

Technical target files:
- `supabase/functions/marketing-generate-video/index.ts`
- `supabase/functions/marketing-orchestrate/index.ts`
- `supabase/functions/marketing-provider-health/index.ts` if needed

Expected result:
- Atlas Cloud remains the main provider.
- Avatar/person jobs no longer fail because a human keyframe is sent to Seedance image-to-video.
- Tutorial works the same way as UGC/Podcasting because routing is based on actual inputs, not the format label.
- Atlas errors become actionable instead of showing a huge raw provider blob in the UI.