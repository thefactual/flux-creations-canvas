import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FAL_QUEUE = "https://queue.fal.run";
const RUNWARE_BASE = "https://api.runware.ai/v1";
const EVOLINK_BASE = "https://api.evolink.ai";

type DurationFormat = "kling-str" | "veo-str" | "pixverse-int" | "minimax-none" | "ltx-frames";
type ImageField = "image_url" | "start_image_url";

type VideoModelConfig = {
  type: "fal" | "runware" | "evolink";
  textToVideo?: string;
  imageToVideo?: string;
  motionControl?: string;
  videoEdit?: string;
  runwareModel?: string;
  evolinkModel?: string;
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
  "veo-3.1": { type: "fal", textToVideo: "fal-ai/veo3.1", imageToVideo: "fal-ai/veo3.1/image-to-video", durationFormat: "veo-str", imageField: "image_url" },
  "veo-3.1-fast": { type: "fal", textToVideo: "fal-ai/veo3.1/fast", imageToVideo: "fal-ai/veo3.1/fast/image-to-video", durationFormat: "veo-str", imageField: "image_url" },
  "veo-3.1-lite": { type: "fal", textToVideo: "fal-ai/veo3.1/lite", imageToVideo: "fal-ai/veo3.1/lite/image-to-video", durationFormat: "veo-str", imageField: "image_url" },
  "minimax-video": { type: "fal", textToVideo: "fal-ai/minimax/video-01-live", imageToVideo: "fal-ai/minimax/video-01-live/image-to-video", durationFormat: "minimax-none", imageField: "image_url" },
  "pixverse-v6": { type: "fal", textToVideo: "fal-ai/pixverse/v6/text-to-video", imageToVideo: "fal-ai/pixverse/v6/image-to-video", durationFormat: "pixverse-int", imageField: "image_url" },
  "ltx-2-19b": { type: "fal", textToVideo: "fal-ai/ltx-2-19b/text-to-video", imageToVideo: "fal-ai/ltx-2-19b/image-to-video", durationFormat: "ltx-frames", imageField: "image_url" },
  "rw-seedance-1.5-pro": { type: "runware", runwareModel: "bytedance:seedance@1.5-pro" },
  "rw-runway-gen4.5": { type: "runware", runwareModel: "runwayml:gen@4.5" },
  "rw-sora-2": { type: "runware", runwareModel: "openai:3@1" },
  "rw-kling-2.5": { type: "runware", runwareModel: "klingai:6@1" },
  "rw-veo-3.1": { type: "runware", runwareModel: "google:3@2" },
  "rw-veo-3.1-fast": { type: "runware", runwareModel: "google:3@3" },
  // Video edit (video-to-video) — fal only
  "kling-o1-edit-pro": { type: "fal", videoEdit: "fal-ai/kling-video/o1/video-to-video/edit" },
  "kling-o3-edit-std": { type: "fal", videoEdit: "fal-ai/kling-video/o3/standard/video-to-video/edit" },
  "kling-o3-edit-pro": { type: "fal", videoEdit: "fal-ai/kling-video/o3/pro/video-to-video/edit" },
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
  if (provider === "runware") {
    const RUNWARE_API_KEY = Deno.env.get("RUNWARE_API_KEY");
    if (!RUNWARE_API_KEY) return jsonResp({ error: "RUNWARE_API_KEY not configured" }, 500);

    const pollResp = await fetch(RUNWARE_BASE, {
      method: "POST",
      headers: { Authorization: `Bearer ${RUNWARE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify([{ taskType: "videoInference", taskUUID: taskId }]),
    });
    if (!pollResp.ok) {
      const t = await pollResp.text();
      return jsonResp({ status: "processing" }); // Runware may return errors during processing
    }
    const pollData = await pollResp.json();
    const result = pollData?.data?.find((d: any) => d.videoURL);
    if (result?.videoURL) {
      return jsonResp({ status: "complete", videoUrl: result.videoURL });
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

    const evolinkQuality = body?.quality === "1080p" ? "1080p" : "720p";
    const evolinkBody: Record<string, unknown> = {
      model: config.evolinkModel,
      image_urls: [characterImage],
      video_urls: [motionVideo],
      quality: evolinkQuality,
      model_params: {
        character_orientation: body?.characterOrientation === "image" ? "image" : "video",
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
      if (submitResp.status === 402) {
        return jsonResp({ error: "Insufficient Evolink credits. Please top up your Evolink account." }, 402);
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
    } else {
      input.prompt = prompt;

      if (durFormat === "veo-str") {
        input.duration = durNum <= 4 ? "4s" : durNum <= 6 ? "6s" : "8s";
      } else if (durFormat === "pixverse-int") {
        input.duration = Math.max(1, Math.min(15, durNum));
      } else if (durFormat === "ltx-frames") {
        input.num_frames = durNum <= 5 ? 121 : 241;
        input.video_size = aspectRatio === "9:16" ? "portrait_16_9" : aspectRatio === "1:1" ? "square" : "landscape_16_9";
      } else if (durFormat === "minimax-none") {
        input.prompt_optimizer = true;
      } else {
        input.duration = String(durNum);
      }

      if (durFormat !== "ltx-frames" && durFormat !== "minimax-none") {
        input.aspect_ratio = aspectRatio;
      }

      if (durFormat !== "minimax-none" && durFormat !== "ltx-frames") {
        input.negative_prompt = "blur, distort, and low quality";
      }

      if (isImageMode) {
        input[imgField] = referenceImages[0];
        if (referenceImages.length > 1) {
          const endField = imgField === "start_image_url" ? "end_image_url" : "tail_image_url";
          input[endField] = referenceImages[1];
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

    const { width: rwWidth, height: rwHeight } = aspectRatio === "9:16"
      ? { width: 720, height: 1280 }
      : aspectRatio === "1:1"
        ? { width: 1024, height: 1024 }
        : { width: 1280, height: 720 };

    const taskUUID = crypto.randomUUID();
    const task: Record<string, unknown> = {
      taskType: "videoInference",
      taskUUID,
      model: config.runwareModel,
      positivePrompt: prompt,
      duration: parseInt(duration) || 5,
      width: rwWidth,
      height: rwHeight,
      outputFormat: "MP4",
      outputType: "URL",
    };

    if (referenceImages.length > 0 && mode === "image-to-video") {
      task.frameImages = referenceImages.map((url: string) => ({ imageURL: url }));
    }

    console.log(`Calling Runware video: model=${config.runwareModel}`);

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
    const videoResult = resData?.data?.find((d: any) => d.taskType === "videoInference");
    const videoUrl = videoResult?.videoURL || videoResult?.outputURL;

    // If video came immediately
    if (videoUrl) {
      return jsonResp({ submitted: true, provider: "runware", taskId: taskUUID, status: "complete", videoUrl });
    }

    console.log(`Runware task submitted: ${taskUUID}`);
    return jsonResp({ submitted: true, provider: "runware", taskId: videoResult?.taskUUID || taskUUID });
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
