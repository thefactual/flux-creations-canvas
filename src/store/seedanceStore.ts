// Seedance 2.0 dedicated store — multimodal (image/video/audio) inputs.
// Submits to the seedance-generate-video edge function and persists to
// the same video_generations table the Create Video grid reads from.
import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import { resolveAllToUrls } from '@/lib/uploadToStorage';
import { toast } from 'sonner';

// Asset kinds we tag in the prompt bar. Each upload gets a stable @id so the
// user (and later the @-tag system) can address it directly in the prompt.
export type SeedanceAssetKind = 'image' | 'video' | 'audio';

export type SeedanceAsset = {
  id: string;          // stable @tag id, e.g. "image_1"
  kind: SeedanceAssetKind;
  name: string;        // original filename for display
  url: string;         // data: URL (resolved to https before submit)
  durationSec?: number;
};

export type SeedanceVariant =
  | 'bytedance/seedance-2.0/reference-to-video'
  | 'bytedance/seedance-2.0/text-to-video'
  | 'bytedance/seedance-2.0-fast/text-to-video';

export const SEEDANCE_RESOLUTIONS = ['480p', '720p', '1080p'] as const;
export const SEEDANCE_RATIOS = ['adaptive', '16:9', '9:16', '1:1', '4:3', '3:4', '21:9'] as const;
export const SEEDANCE_DURATIONS = ['4', '5', '6', '8', '10', '12', '15'] as const;

export const MAX_IMAGES = 9;
export const MAX_VIDEOS = 3;
export const MAX_AUDIOS = 3;
export const MAX_MEDIA_SECONDS = 15;

type SeedanceState = {
  prompt: string;
  images: SeedanceAsset[];
  videos: SeedanceAsset[];
  audios: SeedanceAsset[];
  variant: SeedanceVariant;
  resolution: string;
  ratio: string;
  duration: string;
  generateAudio: boolean;
  isSubmitting: boolean;

  setPrompt: (p: string) => void;
  addAsset: (kind: SeedanceAssetKind, file: File) => Promise<void>;
  removeAsset: (id: string) => void;
  setVariant: (v: SeedanceVariant) => void;
  setResolution: (r: string) => void;
  setRatio: (a: string) => void;
  setDuration: (d: string) => void;
  setGenerateAudio: (v: boolean) => void;
  reset: () => void;
  generate: () => Promise<void>;
};

function readFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function probeMedia(file: File, kind: 'video' | 'audio'): Promise<{ duration: number; width?: number; height?: number }> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const el = document.createElement(kind);
      el.preload = 'metadata';
      el.onloadedmetadata = () => {
        const d = el.duration || 0;
        const video = el as HTMLVideoElement;
        URL.revokeObjectURL(url);
        resolve({
          duration: Number.isFinite(d) ? d : 0,
          width: kind === 'video' ? video.videoWidth : undefined,
          height: kind === 'video' ? video.videoHeight : undefined,
        });
      };
      el.onerror = () => { URL.revokeObjectURL(url); resolve({ duration: 0 }); };
      el.src = url;
    } catch {
      resolve({ duration: 0 });
    }
  });
}

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth'];

function ordinal(n: number, kind: 'image' | 'video' | 'audio'): string {
  const word = n >= 1 && n <= 9 ? ORDINALS[n - 1] : `${n}th`;
  return `the ${word} reference ${kind}`;
}

/**
 * Resolve @image_N / @video_N / @audio_N tokens to natural language Seedance
 * understands. Also wraps edit-style prompts in an explicit "Edit the reference
 * video" frame so the model performs a targeted edit instead of regenerating.
 */
export function resolvePromptTags(
  prompt: string,
  counts: { images: number; videos: number; audios: number },
): { resolved: string; missing: string[] } {
  const missing: string[] = [];
  let out = prompt;

  out = out.replace(/@(image|video|audio)_(\d+)/gi, (match, kindRaw: string, idxRaw: string) => {
    const kind = kindRaw.toLowerCase() as 'image' | 'video' | 'audio';
    const idx = parseInt(idxRaw, 10);
    const cap = kind === 'image' ? counts.images : kind === 'video' ? counts.videos : counts.audios;
    if (!Number.isFinite(idx) || idx < 1 || idx > cap) {
      missing.push(match);
      return match;
    }
    if (kind === 'video' && cap === 1) return 'the reference video';
    if (kind === 'audio' && cap === 1) return 'the reference audio';
    return ordinal(idx, kind);
  });

  // If the prompt looks like a video edit (verbs of replacement/addition + a
  // reference video attached), frame it explicitly so Seedance keeps the rest
  // of the clip intact instead of free-generating.
  const hasEditVerb = /\b(replace|swap|change|put|add|remove|insert|turn|make .* into)\b/i.test(prompt);
  if (hasEditVerb && counts.videos > 0) {
    out = `Edit the reference video: ${out}. Keep everything else identical to the reference video — same person, same setting, same motion, same lighting.`;
  }

  // Tidy doubled articles introduced by the substitution ("to this the first…")
  out = out.replace(/\b(this|that|these|those)\s+the\s+(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)\s+reference\s+(image|video|audio)\b/gi,
    (_m, _det, ord, kind) => `the ${ord} reference ${kind}`);
  out = out.replace(/\bto\s+this\s+the\s+reference\s+(video|audio)\b/gi, 'to the reference $1');

  return { resolved: out.trim(), missing };
}

function nextTagId(list: SeedanceAsset[], kind: SeedanceAssetKind) {
  const used = new Set(list.map(a => a.id));
  for (let i = 1; i < 100; i++) {
    const id = `${kind}_${i}`;
    if (!used.has(id)) return id;
  }
  return `${kind}_${Date.now()}`;
}

export const useSeedanceStore = create<SeedanceState>((set, get) => ({
  prompt: '',
  images: [],
  videos: [],
  audios: [],
  variant: 'bytedance/seedance-2.0/reference-to-video',
  resolution: '720p',
  ratio: 'adaptive',
  duration: '5',
  generateAudio: false,
  isSubmitting: false,

  setPrompt: (prompt) => set({ prompt }),

  addAsset: async (kind, file) => {
    const state = get();
    const list =
      kind === 'image' ? state.images :
      kind === 'video' ? state.videos : state.audios;
    const cap =
      kind === 'image' ? MAX_IMAGES :
      kind === 'video' ? MAX_VIDEOS : MAX_AUDIOS;
    if (list.length >= cap) {
      toast.error(`Max ${cap} ${kind}${cap > 1 ? 's' : ''}`);
      return;
    }

    // ---- Client-side validation: surface errors BEFORE we burn credits ----
    const SIZE_CAPS: Record<SeedanceAssetKind, number> = {
      image: 10 * 1024 * 1024,   // 10 MB
      video: 50 * 1024 * 1024,   // 50 MB
      audio: 20 * 1024 * 1024,   // 20 MB
    };
    const ALLOWED_MIME: Record<SeedanceAssetKind, RegExp> = {
      image: /^image\/(jpeg|jpg|png|webp)$/i,
      video: /^video\/(mp4|quicktime)$/i,
      audio: /^audio\/(mpeg|mp3|wav|x-wav|aac|m4a|x-m4a|ogg)$/i,
    };
    if (file.size > SIZE_CAPS[kind]) {
      toast.error(`${kind} too large`, {
        description: `Max ${(SIZE_CAPS[kind] / 1024 / 1024).toFixed(0)} MB — got ${(file.size / 1024 / 1024).toFixed(1)} MB.`,
      });
      return;
    }
    if (file.type && !ALLOWED_MIME[kind].test(file.type)) {
      toast.error(`Unsupported ${kind} format`, {
        description: kind === 'image'
          ? 'Use JPG, PNG, or WEBP.'
          : kind === 'video'
            ? 'Use MP4 or MOV.'
            : 'Use MP3, WAV, AAC, M4A, or OGG.',
      });
      return;
    }

    if (kind !== 'image') {
      const media = await probeMedia(file, kind);
      const dur = media.duration;
      if (dur && dur > MAX_MEDIA_SECONDS) {
        toast.error(`${kind} too long`, {
          description: `Seedance accepts ≤ ${MAX_MEDIA_SECONDS}s — got ${dur.toFixed(1)}s. Trim and re-upload.`,
        });
        return;
      }
      const url = await readFileToDataUrl(file);
      const asset: SeedanceAsset = {
        id: nextTagId(list, kind), kind, name: file.name, url, durationSec: dur,
      };
      set({ [kind === 'video' ? 'videos' : 'audios']: [...list, asset] } as any);
      return;
    }
    const url = await readFileToDataUrl(file);
    const asset: SeedanceAsset = { id: nextTagId(list, kind), kind, name: file.name, url };
    set({ images: [...list, asset] });
  },

  removeAsset: (id) => set((s) => ({
    images: s.images.filter(a => a.id !== id),
    videos: s.videos.filter(a => a.id !== id),
    audios: s.audios.filter(a => a.id !== id),
  })),

  setVariant: (variant) => set({ variant }),
  setResolution: (resolution) => set({ resolution }),
  setRatio: (ratio) => set({ ratio }),
  setDuration: (duration) => set({ duration }),
  setGenerateAudio: (generateAudio) => set({ generateAudio }),

  reset: () => set({ prompt: '', images: [], videos: [], audios: [] }),

  generate: async () => {
    const s = get();
    if (s.isSubmitting) return;
    const promptText = s.prompt.trim();
    const hasRefs = s.images.length + s.videos.length + s.audios.length > 0;
    if (!promptText && !hasRefs) {
      toast.error('Add a prompt or at least one reference.');
      return;
    }
    if (s.audios.length > 0 && s.images.length === 0 && s.videos.length === 0) {
      toast.error('Audio references require at least one image or video.');
      return;
    }

    // Validate @-tags BEFORE we burn credits/upload bytes.
    const { resolved: resolvedPrompt, missing } = resolvePromptTags(promptText, {
      images: s.images.length, videos: s.videos.length, audios: s.audios.length,
    });
    if (missing.length > 0) {
      toast.error('Reference tag has no upload', {
        description: `${missing.join(', ')} — attach the matching reference or remove the tag.`,
      });
      return;
    }

    set({ isSubmitting: true });

    // Resolve all data URIs to public storage URLs.
    let imageUrls: string[] = [];
    let videoUrls: string[] = [];
    let audioUrls: string[] = [];
    try {
      imageUrls = await resolveAllToUrls(s.images.map(a => a.url));
      videoUrls = await resolveAllToUrls(s.videos.map(a => a.url));
      audioUrls = await resolveAllToUrls(s.audios.map(a => a.url));
    } catch (e: any) {
      set({ isSubmitting: false });
      toast.error(`Upload failed: ${e?.message ?? 'unknown'}`);
      return;
    }

    // Resolve project so the result lands in the active /create workspace.
    const { useCreateProjectsStore } = await import('@/store/createProjectsStore');
    const projStore = useCreateProjectsStore.getState();
    let projectId: string | null = projStore.activeProjectId;
    if (!projectId) {
      const name = promptText.split(/\s+/).slice(0, 5).join(' ').slice(0, 60) || 'Seedance';
      try { projectId = (await projStore.createProject(name)).id; } catch { projectId = null; }
    }

    const videoId = crypto.randomUUID();
    const allRefs = [...imageUrls, ...videoUrls, ...audioUrls];
    const effectiveDuration = s.duration;

    // Insert a row up-front so the Create Video grid shows a placeholder.
    try {
      await (supabase as any).from('video_generations').upsert({
        id: videoId,
        prompt: promptText || '(reference only)',
        model: 'seedance-2.0',
        mode: hasRefs ? 'image-to-video' : 'text-to-video',
        aspect_ratio: s.ratio === 'adaptive' ? '16:9' : s.ratio,
        duration: effectiveDuration,
        resolution: s.resolution,
        status: 'processing',
        reference_images: allRefs,
        provider: 'atlascloud',
        project_id: projectId ?? null,
        create_project_id: projectId ?? null,
      });
    } catch (e) {
      console.error('Failed to insert seedance row', e);
    }

    // Helper: write stage to the row so the grid can render the step label.
    const setStage = async (stage: string, extra: Record<string, unknown> = {}) => {
      try {
        await (supabase as any).from('video_generations')
          .update({ stage, ...extra }).eq('id', videoId);
      } catch { /* non-fatal */ }
    };

    await setStage('submitted');

    // Use the dedicated seedance edge function (handles asset registration).
    const { data, error } = await supabase.functions.invoke('seedance-generate-video', {
      body: {
        action: 'submit',
        videoId,
        projectId,
        prompt: resolvedPrompt,
        imageUrls,
        videoUrls,
        audioUrls,
        duration: Number(effectiveDuration),
        resolution: s.resolution,
        ratio: s.ratio,
        generateAudio: s.generateAudio,
        variant: s.variant,
      },
    });

    if (error) {
      set({ isSubmitting: false });
      await setStage('failed', { status: 'failed', error: error.message ?? 'Submit failed' });
      toast.error(error.message || 'Seedance submit failed');
      return;
    }
    if (data?.error || data?.status === 'failed') {
      set({ isSubmitting: false });
      const msg = data.error || 'Seedance rejected the request';
      await setStage('failed', { status: 'failed', error: msg });
      toast.error(msg);
      return;
    }
    if (!data?.taskId) {
      set({ isSubmitting: false });
      await setStage('failed', { status: 'failed', error: 'No task id returned' });
      toast.error('AtlasCloud did not return a task id.');
      return;
    }

    if (data?.audioFallbackUsed) {
      toast.message('Audio disabled', {
        description: 'Seedance moderation rejected the audio track — retried as visual-only.',
      });
    }
    if (data?.usedFallback) {
      toast.message('Switched to BytePlus', {
        description: 'AtlasCloud was unavailable — generating directly via ByteDance ModelArk.',
      });
    }

    const usedProvider: string = data?.provider ?? 'atlascloud';

    // Reset UI for next prompt; polling continues in background.
    set({ isSubmitting: false });
    get().reset();
    toast.success('Seedance 2.0 — generating…');

    // Poll until complete. The edge function patches video_generations as it
    // progresses so the Create Video grid auto-updates via realtime / refetch.
    (async () => {
      const maxAttempts = 360;
      let delay = 4000;
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, delay));
        delay = Math.min(8000, delay + 250);
        try {
          const { data: poll } = await supabase.functions.invoke('seedance-generate-video', {
            body: { action: 'poll', predictionId: data.taskId, videoId, provider: usedProvider },
          });
          if (poll?.status === 'complete') return;
          if (poll?.status === 'failed') {
            toast.error(poll.error || 'Seedance generation failed');
            return;
          }
        } catch { /* keep polling */ }
      }
      await setStage('failed', { status: 'failed', error: 'Generation timed out after 30 min' });
      toast.error('Seedance timed out. Try a shorter clip or fewer references.');
    })();
  },
}));
