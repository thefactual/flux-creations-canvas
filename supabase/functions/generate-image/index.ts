import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FAL_BASE = "https://fal.run";
const RUNWARE_BASE = "https://api.runware.ai/v1";
const EVOLINK_BASE = "https://api.evolink.ai";
const ATLAS_BASE = "https://api.atlascloud.ai/api/v1/model";

type ModelConfig = {
  type: "nano" | "fal" | "runware";
  // Nano-banana cascade endpoints
  falModel?: string;          // also used as fal endpoint for nano text-to-image
  falImageModel?: string;     // also used as fal endpoint for nano image-to-image (edit)
  evolinkModel?: string;      // EvoLink model id (e.g. gemini-3-pro-image-preview)
  atlasModel?: string;        // AtlasCloud model id (e.g. google/nano-banana-pro/text-to-image)
  atlasEditModel?: string;    // AtlasCloud edit model id (image-to-image)
  apiModel?: string;
  runwareModel?: string;
  supportsImageInput?: boolean;
  isMultiRef?: boolean;
  requiresImage?: boolean;
  textFallback?: string;
  lora?: string;
  fallbackModel?: string; // model ID to retry with if all primary providers fail
};

// All models route through fal.ai (with EvoLink + AtlasCloud cascade for nano banana family).
// Each entry has a text-to-image endpoint and (optionally) an edit/image-to-image endpoint
// that's used automatically when reference images are provided.
const MODEL_MAP: Record<string, ModelConfig> = {
  // Google Nano Banana family — cascade: fal.ai → EvoLink → AtlasCloud, then fall back to Seedream
  "nano-banana-pro": {
    type: "nano",
    falModel: "fal-ai/nano-banana-pro",
    falImageModel: "fal-ai/nano-banana-pro/edit",
    evolinkModel: "gemini-3-pro-image-preview",
    atlasModel: "google/nano-banana-pro/text-to-image",
    atlasEditModel: "google/nano-banana-pro/image-to-image",
    supportsImageInput: true, isMultiRef: true, fallbackModel: "seedream-4",
  },
  "nano-banana-2": {
    type: "nano",
    falModel: "fal-ai/nano-banana-2",
    falImageModel: "fal-ai/nano-banana-2/edit",
    evolinkModel: "gemini-3.1-flash-image-preview",
    atlasModel: "google/nano-banana-2/text-to-image",
    atlasEditModel: "google/nano-banana-2/image-to-image",
    supportsImageInput: true, isMultiRef: true, fallbackModel: "seedream-4",
  },

  // ByteDance Seedream — fal.ai
  "seedream-4": {
    falModel: "fal-ai/bytedance/seedream/v4/text-to-image",
    falImageModel: "fal-ai/bytedance/seedream/v4/edit",
    type: "fal", supportsImageInput: true, isMultiRef: true,
  },
  "seedream-5-lite": {
    falModel: "fal-ai/bytedance/seedream/v5/lite/text-to-image",
    falImageModel: "fal-ai/bytedance/seedream/v5/lite/edit",
    type: "fal", supportsImageInput: true, isMultiRef: true,
  },

  // xAI Grok Imagine — fal.ai (text-to-image only)
  "grok-imagine": {
    falModel: "xai/grok-imagine-image",
    type: "fal", supportsImageInput: false,
  },

  // Kling Image V3 — fal.ai
  "kling": {
    falModel: "fal-ai/kling-image/v3/text-to-image",
    falImageModel: "fal-ai/kling-image/v3/image-to-image",
    type: "fal", supportsImageInput: true,
  },

  // Black Forest Labs Flux 2 Pro — fal.ai
  "flux": {
    falModel: "fal-ai/flux-pro/v1.1",
    falImageModel: "fal-ai/flux-2-pro/edit",
    type: "fal", supportsImageInput: true,
  },

  // Wan 2.2 (14B) — fal.ai
  "wan": {
    falModel: "fal-ai/wan/v2.2-a14b/text-to-image",
    falImageModel: "fal-ai/wan/v2.2-a14b/image-to-image",
    type: "fal", supportsImageInput: true,
  },
};


const QUALITY_MAP: Record<string, string> = { "1K": "1K", "2K": "2K", "4K": "4K" };

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

import { assertUrlIsPublic, isAllowedImageContentType } from "../_shared/ssrf.ts";

async function fetchImageAsDataUri(src: string): Promise<string | null> {
  try {
    if (src.startsWith("data:")) return src;
    if (src.startsWith("http://") || src.startsWith("https://")) {
      let parsed: URL;
      try { parsed = new URL(src); } catch { return null; }
      const ssrfErr = await assertUrlIsPublic(parsed);
      if (ssrfErr) {
        console.warn(`Blocked reference image fetch: ${ssrfErr} (${parsed.hostname})`);
        return null;
      }
      const resp = await fetch(src);
      if (!resp.ok) return null;
      const mimeType = resp.headers.get("content-type") || "";
      if (!isAllowedImageContentType(mimeType)) {
        console.warn(`Rejected non-image content-type: ${mimeType}`);
        return null;
      }
      const buf = await resp.arrayBuffer();
      const bytes = new Uint8Array(buf);
      return `data:${mimeType.split(';')[0].trim()};base64,${bytesToBase64(bytes)}`;
    }
    return null;
  } catch {
    return null;
  }
}

function toBase64DataUri(bytes: Uint8Array, mimeType: string): string {
  return `data:${mimeType};base64,${bytesToBase64(bytes)}`;
}

// Map aspect ratio string to width/height for Runware
// Flux Ultra has fixed dimension pairs
const ULTRA_DIMS: Record<string, [number, number]> = {
  "21:9": [3136, 1344], "16:9": [2752, 1536], "4:3": [2368, 1792],
  "3:2": [2496, 1664], "1:1": [2048, 2048], "2:3": [1664, 2496],
  "3:4": [1792, 2368], "9:16": [1536, 2752], "5:4": [2368, 1792], "4:5": [1792, 2368],
};

function snap64(n: number): number {
  return Math.min(2048, Math.max(128, Math.round(n / 64) * 64));
}

function arToSize(ar: string, quality: string, runwareModel?: string): { width: number; height: number } {
  // Flux Ultra requires exact dimension pairs
  if (runwareModel === "bfl:2@2") {
    const [w, h] = ULTRA_DIMS[ar] || ULTRA_DIMS["1:1"];
    return { width: w, height: h };
  }
  const base = quality === "4K" ? 2048 : quality === "1K" ? 512 : 1024;
  const ratios: Record<string, [number, number]> = {
    "1:1": [1, 1], "3:4": [3, 4], "4:3": [4, 3], "2:3": [2, 3], "3:2": [3, 2],
    "9:16": [9, 16], "16:9": [16, 9], "5:4": [5, 4], "4:5": [4, 5], "21:9": [21, 9],
  };
  const [w, h] = ratios[ar] || [1, 1];
  const max = Math.max(w, h);
  return { width: snap64((w / max) * base), height: snap64((h / max) * base) };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const prompt = typeof body?.prompt === "string" ? body.prompt : "";
    const referenceImages = Array.isArray(body?.referenceImages)
      ? body.referenceImages.filter((img: unknown): img is string => typeof img === "string")
      : [];
    const model = typeof body?.model === "string" ? body.model : "nano-banana-pro";
    const quality = typeof body?.quality === "string" ? body.quality : "2K";
    const aspectRatio = typeof body?.aspectRatio === "string" ? body.aspectRatio : "1:1";

    if (!prompt.trim()) {
      return new Response(JSON.stringify({ error: "prompt is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let activeModel = model;
    let modelConfig = MODEL_MAP[activeModel];
    if (!modelConfig) {
      return new Response(JSON.stringify({ error: `Unknown model: ${activeModel}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let imageUrl: string | undefined;
    let imageBase64: string | undefined;
    const ar = aspectRatio === "Auto" ? "1:1" : aspectRatio;
    let nanoFailed = false;

    // ========== NANO BANANA CASCADE: fal.ai → EvoLink → AtlasCloud ==========
    if (modelConfig.type === "nano") {
      const FAL_KEY = Deno.env.get("FAL_KEY");
      const EVOLINK_API_KEY = Deno.env.get("EVOLINK_API_KEY");
      const ATLASCLOUD_API_KEY = Deno.env.get("ATLASCLOUD_API_KEY");

      const hasRefs = referenceImages.length > 0;
      const evolinkAr = ["1:1","1:4","4:1","1:8","8:1","2:3","3:2","3:4","4:3","4:5","5:4","9:16","16:9","21:9"].includes(ar) ? ar : "auto";
      const atlasAr = ["1:1","3:2","2:3","3:4","4:3","4:5","5:4","9:16","16:9","21:9"].includes(ar) ? ar : "1:1";
      const falImageSize = arToSize(ar, quality);

      type CheckedFiltered = { filtered: true };
      type ProviderResult =
        | { ok: true; imageUrl?: string; imageBase64?: string }
        | { ok: false; reason: string }
        | CheckedFiltered;

      // ---------- Provider 1: fal.ai ----------
      const callFal = async (): Promise<ProviderResult> => {
        if (!FAL_KEY) return { ok: false, reason: "FAL_KEY not configured" };
        try {
          const endpoint = hasRefs && modelConfig.falImageModel ? modelConfig.falImageModel : modelConfig.falModel!;
          const reqBody: Record<string, unknown> = { prompt, num_images: 1 };
          reqBody.image_size = falImageSize;
          if (ar !== "Auto") reqBody.aspect_ratio = ar;
          if (hasRefs) reqBody.image_urls = referenceImages.slice(0, 14);
          console.log(`[nano cascade] fal.ai → ${endpoint}, refs=${referenceImages.length}`);
          const resp = await fetch(`${FAL_BASE}/${endpoint}`, {
            method: "POST",
            headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify(reqBody),
          });
          if (!resp.ok) {
            const t = await resp.text();
            console.error(`[nano cascade] fal failed ${resp.status}: ${t.slice(0, 300)}`);
            return { ok: false, reason: `fal ${resp.status}` };
          }
          const data = await resp.json();
          if (data?.has_nsfw_concepts?.[0]) return { filtered: true };
          const out = data?.images?.[0] ?? data?.image;
          const url = typeof out === "string" ? out : out?.url;
          if (!url) return { ok: false, reason: "fal: no image in response" };
          return { ok: true, imageUrl: url };
        } catch (e) {
          return { ok: false, reason: `fal exception: ${e instanceof Error ? e.message : String(e)}` };
        }
      };

      // ---------- Provider 2: EvoLink ----------
      const callEvolink = async (): Promise<ProviderResult> => {
        if (!EVOLINK_API_KEY) return { ok: false, reason: "EVOLINK_API_KEY not configured" };
        try {
          const submitBody: Record<string, unknown> = {
            model: modelConfig.evolinkModel,
            prompt,
            size: evolinkAr,
            quality: QUALITY_MAP[quality] || "2K",
          };
          if (hasRefs) submitBody.image_urls = referenceImages.slice(0, 14);
          console.log(`[nano cascade] EvoLink → ${modelConfig.evolinkModel}, size=${evolinkAr}, refs=${referenceImages.length}`);
          const submit = await fetch(`${EVOLINK_BASE}/v1/images/generations`, {
            method: "POST",
            headers: { Authorization: `Bearer ${EVOLINK_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify(submitBody),
          });
          if (!submit.ok) {
            const t = await submit.text();
            console.error(`[nano cascade] EvoLink submit failed ${submit.status}: ${t.slice(0, 300)}`);
            return { ok: false, reason: `evolink submit ${submit.status}` };
          }
          const submitData = await submit.json();
          const taskId = submitData?.id;
          if (!taskId) return { ok: false, reason: "evolink: no task id" };

          // Poll up to ~90s
          for (let i = 0; i < 45; i++) {
            await new Promise((r) => setTimeout(r, 2000));
            const poll = await fetch(`${EVOLINK_BASE}/v1/tasks/${taskId}`, {
              headers: { Authorization: `Bearer ${EVOLINK_API_KEY}` },
            });
            if (!poll.ok) continue;
            const pollData = await poll.json();
            const status = pollData?.status;
            if (status === "completed") {
              const url = Array.isArray(pollData?.results) ? pollData.results[0] : undefined;
              if (!url) return { ok: false, reason: "evolink: no result url" };
              return { ok: true, imageUrl: url };
            }
            if (status === "failed") {
              const code = pollData?.error?.code;
              if (code === "content_policy_violation") return { filtered: true };
              return { ok: false, reason: `evolink failed: ${pollData?.error?.message || code || "unknown"}` };
            }
          }
          return { ok: false, reason: "evolink poll timeout" };
        } catch (e) {
          return { ok: false, reason: `evolink exception: ${e instanceof Error ? e.message : String(e)}` };
        }
      };

      // ---------- Provider 3: AtlasCloud ----------
      const callAtlas = async (): Promise<ProviderResult> => {
        if (!ATLASCLOUD_API_KEY) return { ok: false, reason: "ATLASCLOUD_API_KEY not configured" };
        try {
          const atlasModel = hasRefs && modelConfig.atlasEditModel ? modelConfig.atlasEditModel : modelConfig.atlasModel;
          const submitBody: Record<string, unknown> = {
            model: atlasModel,
            prompt,
            aspect_ratio: atlasAr,
            resolution: quality === "1K" ? "1k" : quality === "4K" ? "4k" : "2k",
            output_format: "default",
          };
          if (hasRefs) submitBody.image_urls = referenceImages.slice(0, 14);
          console.log(`[nano cascade] AtlasCloud → ${atlasModel}, ar=${atlasAr}, refs=${referenceImages.length}`);
          const submit = await fetch(`${ATLAS_BASE}/generateImage`, {
            method: "POST",
            headers: { Authorization: `Bearer ${ATLASCLOUD_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify(submitBody),
          });
          if (!submit.ok) {
            const t = await submit.text();
            console.error(`[nano cascade] AtlasCloud submit failed ${submit.status}: ${t.slice(0, 300)}`);
            return { ok: false, reason: `atlas submit ${submit.status}` };
          }
          const submitData = await submit.json();
          const predictionId = submitData?.data?.id ?? submitData?.id;
          if (!predictionId) return { ok: false, reason: "atlas: no prediction id" };

          // Poll up to ~90s
          for (let i = 0; i < 45; i++) {
            await new Promise((r) => setTimeout(r, 2000));
            const poll = await fetch(`${ATLAS_BASE}/prediction/${predictionId}`, {
              headers: { Authorization: `Bearer ${ATLASCLOUD_API_KEY}` },
            });
            if (!poll.ok) continue;
            const pollData = await poll.json();
            const status = pollData?.data?.status;
            if (status === "completed" || status === "succeeded") {
              const url = pollData?.data?.outputs?.[0];
              if (!url) return { ok: false, reason: "atlas: no output url" };
              return { ok: true, imageUrl: typeof url === "string" ? url : url?.url };
            }
            if (status === "failed") {
              return { ok: false, reason: `atlas failed: ${pollData?.data?.error || "unknown"}` };
            }
          }
          return { ok: false, reason: "atlas poll timeout" };
        } catch (e) {
          return { ok: false, reason: `atlas exception: ${e instanceof Error ? e.message : String(e)}` };
        }
      };

      const providers: Array<{ name: string; fn: () => Promise<ProviderResult> }> = [
        { name: "fal.ai", fn: callFal },
        { name: "EvoLink", fn: callEvolink },
        { name: "AtlasCloud", fn: callAtlas },
      ];

      const failures: string[] = [];
      for (const p of providers) {
        const res = await p.fn();
        if ("filtered" in res) {
          return new Response(JSON.stringify({ error: "Image was filtered due to content policy.", filtered: true }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (res.ok) {
          imageUrl = res.imageUrl;
          imageBase64 = res.imageBase64;
          console.log(`[nano cascade] ${p.name} succeeded`);
          break;
        }
        failures.push(`${p.name}: ${res.reason}`);
        console.warn(`[nano cascade] ${p.name} failed (${res.reason}), trying next provider`);
      }

      if (!imageUrl && !imageBase64) {
        nanoFailed = true;
        console.warn(`[nano cascade] all providers failed: ${failures.join(" | ")}`);
      }

      // If all 3 nano providers failed and we have a final fallback (e.g. seedream), switch to it
      if (nanoFailed && modelConfig.fallbackModel) {
        activeModel = modelConfig.fallbackModel;
        modelConfig = MODEL_MAP[activeModel];
        console.log(`[nano cascade] falling back to ${activeModel} (${modelConfig?.type})`);
        if (!modelConfig) {
          return new Response(JSON.stringify({ error: `Fallback model not found: ${activeModel}` }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else if (nanoFailed) {
        return new Response(JSON.stringify({ error: "Nano Banana generation failed across fal.ai, EvoLink, and AtlasCloud", details: failures.join(" | ") }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ========== FAL.AI MODELS ==========
    if (modelConfig.type === "fal") {
      const FAL_KEY = Deno.env.get("FAL_KEY");
      if (!FAL_KEY) {
        return new Response(JSON.stringify({ error: "FAL_KEY not configured" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const hasReferenceInput = modelConfig.supportsImageInput && referenceImages.length > 0;
      const falModel = hasReferenceInput && modelConfig.falImageModel
        ? modelConfig.falImageModel
        : modelConfig.falModel!;

      const imageSize = arToSize(ar, quality);
      const reqBody: Record<string, unknown> = { prompt, num_images: 1 };

      // Per-family request shapes (based on fal.ai docs)
      if (activeModel === "grok-imagine") {
        reqBody.aspect_ratio = ar === "Auto" ? "1:1" : ar;
        reqBody.resolution = quality === "1K" ? "1k" : "2k";
      } else if (activeModel === "kling") {
        reqBody.aspect_ratio = ["1:1","16:9","9:16","4:3","3:4","3:2","2:3","21:9"].includes(ar) ? ar : "1:1";
        reqBody.resolution = quality === "1K" ? "1K" : "2K";
        if (hasReferenceInput) reqBody.image_url = referenceImages[0];
      } else if (activeModel === "seedream-4" || activeModel === "seedream-5-lite") {
        reqBody.image_size = imageSize;
        reqBody.max_images = 1;
        if (hasReferenceInput) reqBody.image_urls = referenceImages.slice(0, 10);
      } else if (activeModel === "wan") {
        reqBody.image_size = imageSize;
        if (hasReferenceInput) reqBody.image_url = referenceImages[0];
      } else if (activeModel === "flux") {
        reqBody.output_format = "png";
        if (hasReferenceInput) {
          reqBody.image_url = referenceImages[0];
        } else {
          reqBody.image_size = imageSize;
          if (ar !== "Auto") reqBody.aspect_ratio = ar;
        }
      } else {
        reqBody.image_size = imageSize;
        if (hasReferenceInput) reqBody.image_url = referenceImages[0];
      }

      const endpoint = `${FAL_BASE}/${falModel}`;
      console.log(`Calling fal.ai: ${endpoint}, ar=${ar}, refs=${referenceImages.length}`);

      const submitResp = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });

      if (!submitResp.ok) {
        const errText = await submitResp.text();
        console.error("Fal error:", submitResp.status, errText);
        return new Response(JSON.stringify({ error: `Fal API error: ${submitResp.status}`, details: errText }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const resultData = await submitResp.json();

      if (resultData?.has_nsfw_concepts?.[0]) {
        return new Response(JSON.stringify({ error: "Image was filtered due to content policy.", filtered: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const outputImage = resultData?.images?.[0] ?? resultData?.image;
      const outUrl = typeof outputImage === "string" ? outputImage : outputImage?.url;
      if (outUrl) {
        // Always return the URL — let the client upload to our bucket.
        // Returning base64 from 4K renders blows past the 6MB edge worker limit.
        imageUrl = outUrl;
      } else {
        return new Response(JSON.stringify({ error: "No image in fal.ai response", details: JSON.stringify(resultData).slice(0, 500) }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }


    // ========== RUNWARE MODELS ==========
    if (modelConfig.type === "runware") {
      const RUNWARE_API_KEY = Deno.env.get("RUNWARE_API_KEY");
      if (!RUNWARE_API_KEY) {
        return new Response(JSON.stringify({ error: "RUNWARE_API_KEY not configured" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const size = arToSize(ar, quality, modelConfig.runwareModel);
      const taskUUID = crypto.randomUUID();

      const safePrompt = (prompt && prompt.trim().length >= 2)
        ? prompt.trim().slice(0, 32000)
        : (referenceImages.length > 0 ? "Edit this image" : "A high quality image");

      const task: Record<string, unknown> = {
        taskType: "imageInference",
        taskUUID,
        model: modelConfig.runwareModel,
        positivePrompt: safePrompt,
        width: size.width,
        height: size.height,
        numberResults: 1,
        outputFormat: "PNG",
        outputType: "URL",
        safety: { checkContent: false, mode: "none" },
      };

      // Add seed image if reference images provided and model supports it
      if (modelConfig.supportsImageInput && referenceImages.length > 0) {
        task.inputs = { seedImage: referenceImages[0] };
      }

      console.log(`Calling Runware: model=${modelConfig.runwareModel}, size=${size.width}x${size.height}, refs=${referenceImages.length}`);

      const response = await fetch(RUNWARE_BASE, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RUNWARE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([task]),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("Runware error:", response.status, errText);
        // Check for provider content moderation
        try {
          const rwErr = JSON.parse(errText);
          const providerErr = rwErr?.errors?.[0];
          if (providerErr?.code === "invalidProviderContent") {
            return new Response(JSON.stringify({ error: "Image was filtered by the model provider's safety system.", filtered: true }), {
              status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } catch { /* not JSON, fall through */ }
        return new Response(JSON.stringify({ error: `Runware API error: ${response.status}`, details: errText }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const resData = await response.json();
      console.log("Runware response keys:", JSON.stringify(resData).substring(0, 500));

      const imgResult = resData?.data?.find((d: any) => d.taskType === "imageInference");
      if (imgResult?.imageURL) {
        // Return URL directly — avoid proxying to base64 to prevent WORKER_LIMIT
        imageUrl = imgResult.imageURL;
      } else {
        const errMsg = resData?.error || "No image in Runware response";
        console.error("Runware no image:", JSON.stringify(resData).substring(0, 500));
        return new Response(JSON.stringify({ error: errMsg }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ imageUrl, imageBase64 }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-image error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
