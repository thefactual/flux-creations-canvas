import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const APIYI_BASE = "https://api.apiyi.com";
const FAL_BASE = "https://fal.run";
const RUNWARE_BASE = "https://api.runware.ai/v1";

type ModelConfig = {
  type: "gemini" | "fal" | "runware";
  falModel?: string;
  falImageModel?: string;
  apiModel?: string;
  runwareModel?: string;
  supportsImageInput?: boolean;
  isMultiRef?: boolean;
  requiresImage?: boolean;
  textFallback?: string;
  lora?: string;
  fallbackModel?: string; // model ID to retry with if this one fails
};

const MODEL_MAP: Record<string, ModelConfig> = {
  // Gemini models (via apiyi, fallback to fal/runware)
  "gemini-3.1-flash-image": { apiModel: "gemini-3.1-flash-image-preview", type: "gemini", supportsImageInput: true, isMultiRef: true, fallbackModel: "rw-flux-2-pro" },
  "gemini-3-pro-image": { apiModel: "gemini-3-pro-image-preview", type: "gemini", supportsImageInput: true, isMultiRef: true, fallbackModel: "rw-flux-2-pro" },
  "gemini-2.5-flash-image": { apiModel: "gemini-2.5-flash-image", type: "gemini", supportsImageInput: true, isMultiRef: true, fallbackModel: "flux-schnell" },

  // Flux Kontext (via fal.ai) — editing models
  "flux-kontext-pro": { falModel: "fal-ai/flux-pro/kontext", type: "fal", supportsImageInput: true, requiresImage: true, textFallback: "fal-ai/flux-pro/v1.1" },
  "flux-kontext-max": { falModel: "fal-ai/flux-pro/kontext/max", type: "fal", supportsImageInput: true, requiresImage: true, textFallback: "fal-ai/flux-pro/v1.1" },
  "flux-kontext-multi": { falModel: "fal-ai/flux-pro/kontext/multi", type: "fal", supportsImageInput: true, isMultiRef: true, requiresImage: true, textFallback: "fal-ai/flux-pro/v1.1" },

  // Flux 2 (via fal.ai)
  "flux-2-pro": { falModel: "fal-ai/flux-2-pro/edit", type: "fal", supportsImageInput: true, requiresImage: true, textFallback: "fal-ai/flux-pro/v1.1" },
  "flux-2-max": { falModel: "fal-ai/flux-2-max/edit", type: "fal", supportsImageInput: true, requiresImage: true, textFallback: "fal-ai/flux-pro/v1.1" },
  "flux-2-flex": { falModel: "fal-ai/flux-2-flex/edit", type: "fal", supportsImageInput: true, isMultiRef: true, requiresImage: true, textFallback: "fal-ai/flux-pro/v1.1" },
  "flux-2-dev": { falModel: "fal-ai/flux-2/edit", type: "fal", supportsImageInput: true, requiresImage: true, textFallback: "fal-ai/flux/dev" },

  // Flux 1 (via fal.ai) — text-to-image
  "flux-schnell": { falModel: "fal-ai/flux/schnell", type: "fal", supportsImageInput: false },
  "flux-uncensored-v2": { falModel: "fal-ai/flux-lora", falImageModel: "fal-ai/flux-lora/image-to-image", type: "fal", supportsImageInput: true, isMultiRef: false, lora: "https://huggingface.co/enhanceaiteam/Flux-Uncensored-V2/resolve/main/lora.safetensors" },
  "flux-dev": { falModel: "fal-ai/flux/dev", type: "fal", supportsImageInput: false },
  "flux-pro-v1.1": { falModel: "fal-ai/flux-pro/v1.1", type: "fal", supportsImageInput: false },

  // Other fal.ai models
  "recraft-v3": { falModel: "fal-ai/recraft-v3", type: "fal", supportsImageInput: false },
  "ideogram-v3": { falModel: "fal-ai/ideogram/v3", type: "fal", supportsImageInput: false },

  // Runware Flux models (uncensored)
  "rw-flux-1-dev": { runwareModel: "runware:100@1", type: "runware", supportsImageInput: true },
  "rw-flux-1-schnell": { runwareModel: "runware:100@1", type: "runware", supportsImageInput: false },
  "rw-flux-2-pro": { runwareModel: "bfl:5@1", type: "runware", supportsImageInput: true },
  "rw-flux-2-flex": { runwareModel: "bfl:6@1", type: "runware", supportsImageInput: true },
  "rw-flux-2-dev": { runwareModel: "runware:400@1", type: "runware", supportsImageInput: true },
  "rw-flux-1.1-pro": { runwareModel: "bfl:2@1", type: "runware", supportsImageInput: false },
  "rw-flux-1.1-pro-ultra": { runwareModel: "bfl:2@2", type: "runware", supportsImageInput: false },
  "rw-flux-kontext-dev": { runwareModel: "runware:101@1", type: "runware", supportsImageInput: true },
};

const QUALITY_MAP: Record<string, string> = { "1K": "1K", "2K": "2K", "4K": "4K" };

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function fetchImageAsDataUri(src: string): Promise<string | null> {
  try {
    if (src.startsWith("data:")) return src;
    if (src.startsWith("http://") || src.startsWith("https://")) {
      const resp = await fetch(src);
      if (!resp.ok) return null;
      const buf = await resp.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const mimeType = resp.headers.get("content-type") || "image/jpeg";
      return `data:${mimeType};base64,${bytesToBase64(bytes)}`;
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
    const model = typeof body?.model === "string" ? body.model : "gemini-3.1-flash-image";
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
    let geminiFailed = false;

    // ========== GEMINI MODELS (via apiyi) ==========
    if (modelConfig.type === "gemini") {
      const APIYI_API_KEY = Deno.env.get("APIYI_API_KEY");
      if (!APIYI_API_KEY) {
        // No apiyi key — skip straight to fallback
        geminiFailed = true;
        console.log("APIYI_API_KEY not configured, will try fallback");
      } else {
        try {
          const parts: any[] = [];
          for (const refImg of referenceImages) {
            const dataUri = await fetchImageAsDataUri(refImg);
            if (!dataUri) continue;
            const match = dataUri.match(/^data:(image\/\w+);base64,(.+)$/);
            if (!match) continue;
            parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
          }
          parts.push({ text: prompt });

          const imageSize = QUALITY_MAP[quality] || "2K";
          const endpoint = `${APIYI_BASE}/v1beta/models/${modelConfig.apiModel}:generateContent`;
          console.log(`Calling Gemini: ${endpoint}, ar=${ar}, size=${imageSize}, refs=${referenceImages.length}`);

          const response = await fetch(endpoint, {
            method: "POST",
            headers: { Authorization: `Bearer ${APIYI_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts }],
              generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: ar, imageSize } },
            }),
          });

          if (!response.ok) {
            const errText = await response.text();
            console.error("Gemini error:", response.status, errText, "— will try fallback");
            geminiFailed = true;
          } else {
            const data = await response.json();
            const candidate = data?.candidates?.[0];
            const resParts = candidate?.content?.parts ?? [];
            const imgPart = resParts.find((p: any) => p.inlineData?.data);

            if (imgPart?.inlineData?.data) {
              imageBase64 = `data:${imgPart.inlineData.mimeType || "image/png"};base64,${imgPart.inlineData.data}`;
            } else {
              const isFiltered = candidate?.finishReason === "SAFETY" || candidate?.finishReason === "PROHIBITED_CONTENT";
              if (isFiltered) {
                // Content filtered — don't fallback, return filter result
                return new Response(JSON.stringify({ error: "Image was filtered due to content policy.", filtered: true }), {
                  status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
              }
              console.log("Gemini returned no image, will try fallback");
              geminiFailed = true;
            }
          }
        } catch (e) {
          console.error("Gemini exception:", e, "— will try fallback");
          geminiFailed = true;
        }
      }

      // If Gemini failed and we have a fallback, switch to it
      if (geminiFailed && modelConfig.fallbackModel) {
        activeModel = modelConfig.fallbackModel;
        modelConfig = MODEL_MAP[activeModel];
        console.log(`Gemini failed, falling back to: ${activeModel} (${modelConfig.type})`);
        if (!modelConfig) {
          return new Response(JSON.stringify({ error: `Fallback model not found: ${activeModel}` }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else if (geminiFailed) {
        return new Response(JSON.stringify({ error: "Gemini generation failed and no fallback configured" }), {
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

      const routedReferenceImages = activeModel === "flux-uncensored-v2"
        ? referenceImages.slice(0, 1)
        : referenceImages;
      const hasReferenceInput = modelConfig.supportsImageInput && routedReferenceImages.length > 0;
      if (activeModel === "flux-uncensored-v2" && referenceImages.length > 1) {
        console.log(`Flux Uncensored V2 supports a single fal.ai reference image; using the first of ${referenceImages.length}.`);
      }
      let falModel = hasReferenceInput && modelConfig.falImageModel
        ? modelConfig.falImageModel
        : modelConfig.falModel!;
      if (modelConfig.requiresImage && routedReferenceImages.length === 0 && modelConfig.textFallback) {
        falModel = modelConfig.textFallback;
        console.log(`No reference images for editing model, falling back to: ${falModel}`);
      }

      const reqBody: Record<string, unknown> = {
        prompt,
        num_images: 1,
        output_format: "png",
      };

      const imageSize = arToSize(ar, quality);
      reqBody.image_size = imageSize;
      reqBody.num_inference_steps = 28;
      reqBody.guidance_scale = 3.5;
      if (activeModel === "flux-uncensored-v2") reqBody.acceleration = "regular";

      // Add LoRA if configured + disable safety checker for LoRA models
      if (modelConfig.lora) {
        reqBody.loras = [{ path: modelConfig.lora, scale: 1.0 }];
        reqBody.enable_safety_checker = false;
      }
      if (activeModel !== "flux-uncensored-v2" && ar !== "Auto") reqBody.aspect_ratio = ar;

      if (hasReferenceInput) {
        if (falModel.includes("image-to-image")) {
          reqBody.image_url = routedReferenceImages[0];
          reqBody.strength = 0.85;
        } else if (modelConfig.isMultiRef && routedReferenceImages.length > 1) {
          reqBody.image_urls = routedReferenceImages;
        } else {
          reqBody.image_url = routedReferenceImages[0];
        }
      }

      const endpoint = `${FAL_BASE}/${falModel}`;
      console.log(`Calling fal.ai: ${endpoint}, ar=${ar}, refs=${routedReferenceImages.length}`);

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

      const outputImage = resultData?.images?.[0];
      if (outputImage?.url) {
        const imgResp = await fetch(outputImage.url);
        if (imgResp.ok) {
          const buf = await imgResp.arrayBuffer();
          imageBase64 = toBase64DataUri(new Uint8Array(buf), imgResp.headers.get("content-type") || "image/png");
        } else {
          imageUrl = outputImage.url;
        }
      } else {
        return new Response(JSON.stringify({ error: "No image in fal.ai response" }), {
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
