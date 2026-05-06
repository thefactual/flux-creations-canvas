import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FAL_QUEUE = "https://queue.fal.run";
const RUNWARE_BASE = "https://api.runware.ai/v1";
const EVOLINK_BASE = "https://api.evolink.ai";
const APIYI_BASE = "https://api.apiyi.com";

type DurationFormat = "kling-str" | "veo-str" | "pixverse-int" | "minimax-none" | "ltx-frames";
type ImageField = "image_url" | "start_image_url";

type VideoModelConfig = {
  type: "fal" | "runware" | "evolink" | "apiyi";
  textToVideo?: string;
  imageToVideo?: string;
  motionControl?: string;
  videoEdit?: string;
  runwareModel?: string;
  evolinkModel?: string;
  // For apiyi: base model id without orientation/fl suffixes (e.g. "veo-3.1", "veo-3.1-fast")
  apiyiBaseModel?: string;
  durationFormat?: DurationFormat;
  imageField?: ImageField;
};

const VIDEO_MODEL_MAP: Record<string, VideoModelConfig> = {
  "kling-v3-pro": { type: "fal", textToVideo: "fal-ai/kling-video/v3/pro/text-to-video", imageToVideo: "fal-ai/kling-video/v3/pro/image-to-video", durationFormat: "kling-str", imageField: "start_image_url" },
  "kling-v3-motion": { type: "fal", motionControl: "fal-ai/kling-video/v3/pro/motion-control", durationFormat: "kling-str" },
  "ev-kling-v3-motion": { type: "evolink", evolinkModel: "kling-v3-motion-control" },
  "kling-o3-pro": { type: "fal", imageToVideo: "fal-ai/kling-video/o3/standard/image-to-video", durationFormat: "kling-str", imageField: "start_image_url" },
  "kling-v2.5-turbo-pro": { type: "fal", textToVideo: "fal-ai/kling-video/v2.5-turbo/pro/text-to-video", imageToVideo: "fal-ai/kling-video/v2.5-turbo/pro/image-to-video", durationFormat: "kling-str", imageField: "image_url" },
  "kling-v2.6-pro": { type: "fal", imageToVideo: "fal-ai/kling-video/v2.6/pro/image-to-video", durationFormat: "kling-str", imageField: "start_image_url" },
  "kling-v2.6-motion-std": { type: "fal", motionControl: "fal-ai/kling-video/v2.6/standard/motion-control", durationFormat: "kling-str" },
  "kling-v2.6-motion-pro": { type: "fal", motionControl: "fal-ai/kling-video/v2.6/pro/motion-control", durationFormat: "kling-str" },
  // Google Veo via APIYI (官逆 — only provider for these 3 models, no fallback)
  // Note: APIYI exposes `veo-3.1` and `veo-3.1-fast`. We map "lite" → fast (cheapest tier).
  "veo-3.1": { type: "apiyi", apiyiBaseModel: "veo-3.1" },
  "veo-3.1-fast": { type: "apiyi", apiyiBaseModel: "veo-3.1-fast" },
  "veo-3.1-lite": { type: "apiyi", apiyiBaseModel: "veo-3.1-fast" },
  "minimax-video": { type: "fal", textToVideo: "fal-ai/minimax/video-01-live", imageToVideo: "fal-ai/minimax/video-01-live/image-to-video", durationFormat: "minimax-none", imageField: "image_url" },
  "pixverse-v6": { type: "fal", textToVideo: "fal-ai/pixverse/v6/text-to-video", imageToVideo: "fal-ai/pixverse/v6/image-to-video", durationFormat: "pixverse-int", imageField: "image_url" },
  "ltx-2-19b": { type: "fal", textToVideo: "fal-ai/ltx-2-19b/text-to-video", imageToVideo: "fal-ai/ltx-2-19b/image-to-video", durationFormat: "ltx-frames", imageField: "image_url" },
  "rw-seedance-1.5-pro": { type: "runware", runwareModel: "bytedance:seedance@1.5-pro" },
  "rw-runway-gen4.5": { type: "runware", runwareModel: "runwayml:gen@4.5" },
  "rw-sora-2": { type: "runware", runwareModel: "openai:3@1" },
  "rw-kling-2.5": { type: "runware", runwareModel: "klingai:6@1" },
  "rw-veo-3.1": { type: "runware", runwareModel: "google:3@2" },
  "rw-veo-3.1-fast": { type: "runware", runwareModel: "google:3@3" },
  // Video edit (video-to-video)
  "kling-omni-edit": { type: "fal", videoEdit: "fal-ai/kling-video/o3/pro/video-to-video/edit" },
  "kling-o1-edit-pro": { type: "fal", videoEdit: "fal-ai/kling-video/o1/video-to-video/edit" },
  "grok-imagine-edit": { type: "runware", runwareModel: "xai:grok-imagine@video" },
  "grok-imagine": { type: "runware", runwareModel: "xai:grok-imagine@video" },
};

function jsonResp(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeClientFacingError(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : "Internal server error";
  if (rawMessage.includes("file_too_large")) {
    return { message: "Reference image exceeds the provider 10MB limit. Upload a smaller image.", status: 400 };
  }
  if (rawMessage.includes("Result fetch failed: 422")) {
    return { message: rawMessage, status: 400 };
  }
  return { message: rawMessage, status: 500 };
}

// ============================================================
// POLL action — check status of a previously submitted task
// ============================================================

async function handlePoll(body: Record<string, unknown>) {
  const provider = body.provider as string;
  const taskId = body.taskId as string;

  if (!provider || !taskId) {
    return jsonResp({ error: "poll requires provider and taskId" }, 400);
  }

  // ---- FAL poll ----
  if (provider === "fal") {
    const FAL_KEY = Deno.env.get("FAL_KEY");
    if (!FAL_KEY) return jsonResp({ error: "FAL_KEY not configured" }, 500);

    const responseUrl = body.responseUrl as string;
    const statusUrl = body.statusUrl as string | undefined;
    const headers = { Authorization: `Key ${FAL_KEY}`, Accept: "application/json" };

    // Check status first if we have a status URL
    if (statusUrl) {
      const resp = await fetch(statusUrl, { method: "GET", headers });
      if (resp.ok) {
        const data = await resp.json();
        if (data.status === "COMPLETED") {
          const resultResp = await fetch(responseUrl, { method: "GET", headers });
          if (!resultResp.ok) {
            const rb = await resultResp.text();
            return jsonResp({ error: `Result fetch failed: ${resultResp.status} ${rb}` }, 502);
          }
          const result = await resultResp.json();
          const payload = result?.data ?? result;
          const vid = payload?.video?.url || payload?.video;
          const videoUrl = vid ? (typeof vid === "string" ? vid : vid.url) : undefined;
          if (videoUrl) return jsonResp({ status: "complete", videoUrl });
          return jsonResp({ error: "No video in fal.ai response" }, 502);
        }
        if (data.status === "FAILED") {
          return jsonResp({ status: "failed", error: data.error || "Video generation failed" });
        }
        return jsonResp({ status: "processing", progress: data.progress || 0 });
      }
      if (resp.status === 202) {
        return jsonResp({ status: "processing" });
      }
    }

    // Try response URL directly
    const resp = await fetch(responseUrl, { method: "GET", headers });
    if (resp.status === 202) {
      return jsonResp({ status: "processing" });
    }
    if (!resp.ok) {
      const t = await resp.text();
      if (resp.status === 400 && t.includes("in progress")) {
        return jsonResp({ status: "processing" });
      }
      return jsonResp({ error: `Poll error: ${resp.status} ${t}` }, 502);
    }
    const result = await resp.json();
    const payload = result?.data ?? result;
    const vid = payload?.video?.url || payload?.video;
    const videoUrl = vid ? (typeof vid === "string" ? vid : vid.url) : undefined;
    if (videoUrl) return jsonResp({ status: "complete", videoUrl });
    return jsonResp({ status: "processing" });
  }

  // ---- EVOLINK poll ----
  if (provider === "evolink") {
    const EVOLINK_API_KEY = Deno.env.get("EVOLINK_API_KEY");
    if (!EVOLINK_API_KEY) return jsonResp({ error: "EVOLINK_API_KEY not configured" }, 500);

    const resp = await fetch(`${EVOLINK_BASE}/v1/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${EVOLINK_API_KEY}` },
    });
    if (!resp.ok) {
      const t = await resp.text();
      return jsonResp({ error: `Evolink task check failed: ${resp.status} ${t}` }, 502);
    }
    const data = await resp.json();
    if (data.status === "completed") {
      const results = data?.results;
      let videoUrl: string | undefined;
      if (Array.isArray(results) && results.length > 0) {
        videoUrl = typeof results[0] === "string" ? results[0] : results[0]?.url;
      }
      if (videoUrl) return jsonResp({ status: "complete", videoUrl });
      return jsonResp({ error: "No video in Evolink response" }, 502);
    }
    if (data.status === "failed") {
      return jsonResp({ status: "failed", error: data.error?.message || "Evolink task failed" });
    }
    return jsonResp({ status: "processing", progress: data.progress || 0 });
  }

  // ---- RUNWARE poll ----
  // Per Runware docs: poll async tasks via the `getResponse` task type.
  // https://runware.ai/docs/platform/task-polling
  if (provider === "runware") {
    const RUNWARE_API_KEY = Deno.env.get("RUNWARE_API_KEY");
    if (!RUNWARE_API_KEY) return jsonResp({ error: "RUNWARE_API_KEY not configured" }, 500);

    const pollResp = await fetch(RUNWARE_BASE, {
      method: "POST",
      headers: { Authorization: `Bearer ${RUNWARE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify([{ taskType: "getResponse", taskUUID: taskId }]),
    });
    if (!pollResp.ok) {
      const t = await pollResp.text();
      console.error("Runware poll error:", pollResp.status, t);
      // Don't fail the whole job on a transient poll error — keep polling.
      return jsonResp({ status: "processing" });
    }
    const pollData = await pollResp.json();
    // Look at both `data` (in-progress + completed) and `errors`
    const completed = pollData?.data?.find((d: any) => d.status === "success" && d.videoURL);
    if (completed?.videoURL) {
      return jsonResp({ status: "complete", videoUrl: completed.videoURL });
    }
    const errored = pollData?.errors?.find?.((e: any) => e.taskUUID === taskId);
    if (errored) {
      return jsonResp({ status: "failed", error: errored.message || errored.code || "Runware task failed" });
    }
    const errorRow = pollData?.data?.find((d: any) => d.status === "error");
    if (errorRow) {
      return jsonResp({ status: "failed", error: errorRow.message || "Runware task failed" });
    }
    return jsonResp({ status: "processing" });
  }

  return jsonResp({ error: `Unknown provider: ${provider}` }, 400);
}

// ============================================================
// SUBMIT action — submit task to provider, return task info
// ============================================================

async function handleSubmit(body: Record<string, unknown>) {
  const prompt = typeof body?.prompt === "string" ? body.prompt : "";
  const referenceImages = Array.isArray(body?.referenceImages)
    ? body.referenceImages.filter((img: unknown): img is string => typeof img === "string" && img.length > 0)
    : [];
  const model = typeof body?.model === "string" ? body.model : "kling-v2.5-turbo-pro";
  const mode = typeof body?.mode === "string" ? body.mode : "text-to-video";
  const aspectRatio = typeof body?.aspectRatio === "string" ? body.aspectRatio : "16:9";
  const duration = typeof body?.duration === "string" ? body.duration : "5";

  const config = VIDEO_MODEL_MAP[model];
  if (!config) return jsonResp({ error: `Unknown video model: ${model}` }, 400);

  // ========== EVOLINK SUBMIT ==========
  if (config.type === "evolink") {
    const EVOLINK_API_KEY = Deno.env.get("EVOLINK_API_KEY");
    if (!EVOLINK_API_KEY) return jsonResp({ error: "EVOLINK_API_KEY not configured" }, 500);

    const motionVideo = referenceImages[0];
    const characterImage = referenceImages[1];
    if (!motionVideo || !characterImage) {
      return jsonResp({ error: "Motion control requires a motion video (slot 0) and a character image (slot 1)" }, 400);
    }

    // Validate image size
    try {
      const headResp = await fetch(characterImage, { method: "HEAD" });
      const contentLength = parseInt(headResp.headers.get("content-length") || "0");
      if (contentLength > 10 * 1024 * 1024) {
        return jsonResp({ error: `Character image is ${(contentLength / 1048576).toFixed(1)}MB — Evolink limit is 10MB. Upload a smaller image.` }, 400);
      }
    } catch (e) {
      console.log("Could not check image size, proceeding:", e);
    }

    const evolinkQuality = (body?.resolution === "1080p" || body?.quality === "1080p") ? "1080p" : "720p";
    const durSec = Math.min(10, Math.max(5, parseInt(duration) || 5));
    const evolinkBody: Record<string, unknown> = {
      model: config.evolinkModel,
      image_urls: [characterImage],
      video_urls: [motionVideo],
      quality: evolinkQuality,
      duration: durSec,
      model_params: {
        character_orientation: body?.characterOrientation === "image" ? "image" : "video",
        duration: durSec,
      },
    };
    if (prompt) evolinkBody.prompt = prompt;

    console.log(`Submitting Evolink task: model=${config.evolinkModel}, quality=${evolinkQuality}`);

    const submitResp = await fetch(`${EVOLINK_BASE}/v1/videos/generations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${EVOLINK_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(evolinkBody),
    });

    if (!submitResp.ok) {
      const errText = await submitResp.text();
      console.error("Evolink submit error:", submitResp.status, errText);
      // Fallback to fal.ai Kling v3 motion-control on any Evolink failure (402, 5xx, etc.)
      const FAL_KEY_FB = Deno.env.get("FAL_KEY");
      if (FAL_KEY_FB) {
        console.log("Falling back to fal.ai kling-v3 motion-control");
        const falEndpoint = "fal-ai/kling-video/v3/pro/motion-control";
        const falBody: Record<string, unknown> = {
          prompt: prompt || "",
          image_url: characterImage,
          video_url: motionVideo,
          duration: (parseInt(duration) || 5) >= 10 ? "10" : "5",
        };
        const falResp = await fetch(`https://queue.fal.run/${falEndpoint}`, {
          method: "POST",
          headers: { Authorization: `Key ${FAL_KEY_FB}`, "Content-Type": "application/json" },
          body: JSON.stringify(falBody),
        });
        if (falResp.ok) {
          const falData = await falResp.json();
          const requestId = falData.request_id;
          if (requestId) {
            console.log(`Fal fallback submitted: ${requestId}`);
            return jsonResp({
              submitted: true,
              provider: "fal",
              taskId: requestId,
              statusUrl: falData.status_url,
              responseUrl: falData.response_url,
              endpoint: falEndpoint,
            });
          }
        } else {
          const fbErr = await falResp.text();
          console.error("Fal fallback failed:", falResp.status, fbErr);
        }
      }
      if (submitResp.status === 402) {
        return jsonResp({ error: "Motion-control provider out of credits and fallback failed. Please try again later." }, 402);
      }
      return jsonResp({ error: `Evolink API error: ${submitResp.status}`, details: errText }, 502);
    }

    const submitData = await submitResp.json();
    const taskId = submitData.id;
    if (!taskId) return jsonResp({ error: "No task ID in Evolink response" }, 502);

    console.log(`Evolink task submitted: ${taskId}`);
    return jsonResp({ submitted: true, provider: "evolink", taskId });
  }

  // ========== FAL.AI SUBMIT ==========
  if (config.type === "fal") {
    const FAL_KEY = Deno.env.get("FAL_KEY");
    if (!FAL_KEY) return jsonResp({ error: "FAL_KEY not configured" }, 500);

    const isMotionControl = mode === "motion-control";
    const isVideoEdit = mode === "video-edit";
    const isImageMode = mode === "image-to-video" && referenceImages.length > 0;

    let endpoint: string | undefined;
    if (isMotionControl) {
      endpoint = config.motionControl;
      if (!endpoint) return jsonResp({ error: `Model ${model} does not support motion control` }, 400);
    } else if (isVideoEdit) {
      endpoint = config.videoEdit;
      if (!endpoint) return jsonResp({ error: `Model ${model} does not support video editing` }, 400);
    } else if (isImageMode) {
      endpoint = config.imageToVideo;
      if (!endpoint) return jsonResp({ error: `Model ${model} does not support image to video` }, 400);
    } else {
      endpoint = config.textToVideo;
      if (!endpoint) return jsonResp({ error: `Model ${model} does not support text to video` }, 400);
    }

    const input: Record<string, unknown> = {};
    const durNum = parseInt(duration) || 5;
    const durFormat = config.durationFormat || "kling-str";
    const imgField = config.imageField || "image_url";

    if (isMotionControl) {
      const motionVideo = referenceImages[0];
      const characterImage = referenceImages[1];
      if (!motionVideo || !characterImage) {
        return jsonResp({ error: "Motion control requires a motion video (slot 0) and a character image (slot 1)" }, 400);
      }
      input.image_url = characterImage;
      input.video_url = motionVideo;
      input.character_orientation = body?.characterOrientation === "image" ? "image" : "video";
      input.keep_original_sound = body?.keepOriginalSound !== false;
      if (prompt) input.prompt = prompt;
    } else if (isVideoEdit) {
      const sourceVideo = referenceImages[0];
      if (!sourceVideo) {
        return jsonResp({ error: "Video edit requires a reference video in slot 0" }, 400);
      }
      if (!prompt) {
        return jsonResp({ error: "Video edit requires a text prompt" }, 400);
      }
      input.video_url = sourceVideo;
      input.prompt = prompt;
      const extras = referenceImages.slice(1).filter(Boolean).slice(0, 4);
      if (extras.length > 0) input.image_urls = extras;
      input.keep_audio = body?.keepAudio === true;
    } else {
      input.prompt = prompt;
      const resolution = typeof body?.resolution === "string" ? body.resolution : undefined;

      if (durFormat === "veo-str") {
        // Veo accepts "4s" / "6s" / "8s"
        input.duration = durNum <= 4 ? "4s" : durNum <= 6 ? "6s" : "8s";
        // Veo accepts resolution: 720p | 1080p | 4k
        if (resolution && ["720p", "1080p", "4k"].includes(resolution.toLowerCase())) {
          input.resolution = resolution.toLowerCase();
        }
      } else if (durFormat === "pixverse-int") {
        input.duration = Math.max(1, Math.min(15, durNum));
        // PixVerse accepts: 360p | 540p | 720p | 1080p
        if (resolution && ["360p", "540p", "720p", "1080p"].includes(resolution)) {
          input.resolution = resolution;
        }
      } else if (durFormat === "ltx-frames") {
        input.num_frames = durNum <= 5 ? 121 : 241;
        input.video_size = aspectRatio === "9:16" ? "portrait_16_9" : aspectRatio === "1:1" ? "square" : "landscape_16_9";
      } else if (durFormat === "minimax-none") {
        input.prompt_optimizer = true;
      } else {
        // Kling family: duration is "5" | "10" string. No resolution param exists.
        input.duration = String(durNum);
      }

      // aspect_ratio: only applies when no image is provided.
      // Veo i2v ignores aspect_ratio (derived from image); Kling i2v accepts it but the start image already constrains it.
      if (durFormat !== "ltx-frames" && durFormat !== "minimax-none" && !isImageMode) {
        input.aspect_ratio = aspectRatio;
      }

      if (durFormat !== "minimax-none" && durFormat !== "ltx-frames") {
        input.negative_prompt = "blur, distort, and low quality";
      }

      if (isImageMode) {
        input[imgField] = referenceImages[0];
        // Only Kling v3/2.6 i2v support a paired end frame (end_image_url).
        // Veo / PixVerse / Hailuo / LTX do not — silently drop the second image.
        const supportsEndFrame = model.startsWith("kling-v3") || model.startsWith("kling-v2.6");
        if (referenceImages.length > 1 && supportsEndFrame && imgField === "start_image_url") {
          input.end_image_url = referenceImages[1];
        }
      }
    }

    console.log(`Submitting to fal.ai queue: ${endpoint}, mode=${mode}`);

    const submitResp = await fetch(`${FAL_QUEUE}/${endpoint}`, {
      method: "POST",
      headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(input),
    });

    if (!submitResp.ok) {
      const errText = await submitResp.text();
      console.error("Fal submit error:", submitResp.status, errText);
      return jsonResp({ error: `Fal API error: ${submitResp.status}`, details: errText }, 502);
    }

    const submitData = await submitResp.json();
    const responseUrl = submitData.response_url;

    // If response came immediately (unlikely for video)
    if (!responseUrl) {
      const payload = submitData?.data ?? submitData;
      const vid = payload?.video?.url || payload?.video;
      if (vid) {
        const videoUrl = typeof vid === "string" ? vid : vid.url;
        return jsonResp({ submitted: true, provider: "fal", taskId: "immediate", status: "complete", videoUrl });
      }
    }

    console.log(`Fal.ai task submitted: request_id=${submitData.request_id}`);
    return jsonResp({
      submitted: true,
      provider: "fal",
      taskId: submitData.request_id,
      responseUrl,
      statusUrl: submitData.status_url || null,
    });
  }

  // ========== RUNWARE SUBMIT ==========
  if (config.type === "runware") {
    const RUNWARE_API_KEY = Deno.env.get("RUNWARE_API_KEY");
    if (!RUNWARE_API_KEY) return jsonResp({ error: "RUNWARE_API_KEY not configured" }, 500);

    const isMotionControl = mode === "motion-control";
    const isVideoEdit = mode === "video-edit";
    const reqResolution = (body?.resolution as string) || "720p";

    // Models that accept the `resolution` preset directly (Runware docs).
    const RUNWARE_RESOLUTION_MODELS = new Set([
      "bytedance:seedance@1.5-pro",
      "bytedance:seedance@2.0",
      "xai:grok-imagine@video",
      "klingai:6@1",
      "google:3@2",
      "google:3@3",
      "runwayml:gen@4.5",
    ]);

    const arDims: Record<string, Record<string, [number, number]>> = {
      "720p": { "16:9": [1280, 720], "9:16": [720, 1280], "1:1": [960, 960], "4:3": [1112, 834], "3:4": [834, 1112] },
      "1080p": { "16:9": [1920, 1080], "9:16": [1080, 1920], "1:1": [1080, 1080] },
      "480p": { "16:9": [864, 496], "9:16": [496, 864], "1:1": [640, 640] },
    };
    const dims = (arDims[reqResolution] || arDims["720p"])[aspectRatio] || (arDims[reqResolution] || arDims["720p"])["16:9"];
    const [rwWidth, rwHeight] = dims;

    const taskUUID = crypto.randomUUID();
    const task: Record<string, unknown> = {
      taskType: "videoInference",
      taskUUID,
      model: config.runwareModel,
      positivePrompt: prompt || "video",
      duration: parseInt(duration) || 5,
      outputFormat: "MP4",
      outputType: "URL",
      // Async delivery so we can poll via getResponse without holding the connection.
      // https://runware.ai/docs/platform/task-polling
      deliveryMethod: "async",
    };

    // Use `resolution` preset when supported (Runware auto-matches AR from input media);
    // otherwise fall back to explicit width/height. Never send both — Runware rejects it.
    const supportsResolutionPreset = RUNWARE_RESOLUTION_MODELS.has(config.runwareModel || "");
    const hasFrameInput = (mode === "image-to-video" && referenceImages.length > 0) || isMotionControl;
    if (supportsResolutionPreset && hasFrameInput) {
      task.resolution = reqResolution;
    } else {
      task.width = rwWidth;
      task.height = rwHeight;
    }

    if (isVideoEdit) {
      const sourceVideo = referenceImages[0];
      if (!sourceVideo) return jsonResp({ error: "Video edit requires a reference video in slot 0" }, 400);
      if (!prompt) return jsonResp({ error: "Video edit requires a text prompt" }, 400);
      task.inputs = { referenceVideos: [sourceVideo] };
    } else if (isMotionControl) {
      // Motion control on Runware (e.g. Seedance): pass motion video + character image
      const motionVideo = referenceImages[0];
      const characterImage = referenceImages[1];
      if (!motionVideo || !characterImage) {
        return jsonResp({ error: "Motion control requires a motion video (slot 0) and a character image (slot 1)" }, 400);
      }
      task.inputs = { referenceVideos: [motionVideo] };
      task.frameImages = [{ imageURL: characterImage }];
    } else if (referenceImages.length > 0 && mode === "image-to-video") {
      task.frameImages = referenceImages.filter(Boolean).map((url: string) => ({ imageURL: url }));
    }

    console.log(`Calling Runware video: model=${config.runwareModel}, async`);

    const response = await fetch(RUNWARE_BASE, {
      method: "POST",
      headers: { Authorization: `Bearer ${RUNWARE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify([task]),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Runware video error:", response.status, errText);
      return jsonResp({ error: `Runware API error: ${response.status}`, details: errText }, 502);
    }

    const resData = await response.json();
    // Async submit ack: data[0] echoes our taskUUID with status "processing"
    const ackRow = resData?.data?.find((d: any) => d.taskUUID === taskUUID) ?? resData?.data?.[0];
    const completed = resData?.data?.find((d: any) => d.videoURL);

    if (completed?.videoURL) {
      return jsonResp({ submitted: true, provider: "runware", taskId: taskUUID, status: "complete", videoUrl: completed.videoURL });
    }

    const erroredAck = resData?.errors?.[0];
    if (erroredAck) {
      return jsonResp({ error: `Runware: ${erroredAck.message || erroredAck.code || "submit failed"}` }, 502);
    }

    console.log(`Runware task submitted (async): ${taskUUID}`);
    return jsonResp({ submitted: true, provider: "runware", taskId: ackRow?.taskUUID || taskUUID });
  }

  return jsonResp({ error: "Unknown provider type" }, 500);
}

// ============================================================
// Main handler
// ============================================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const action = typeof body?.action === "string" ? body.action : "submit";

    if (action === "poll") {
      return await handlePoll(body);
    }

    return await handleSubmit(body);
  } catch (e) {
    const { message, status } = normalizeClientFacingError(e);
    console.error("Video generation error:", e);
    return jsonResp({ error: message }, status);
  }
});
