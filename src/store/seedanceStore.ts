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

function probeMediaDuration(file: File, kind: 'video' | 'audio'): Promise<number> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const el = document.createElement(kind);
      el.preload = 'metadata';
      el.onloadedmetadata = () => {
        const d = el.duration || 0;
        URL.revokeObjectURL(url);
        resolve(Number.isFinite(d) ? d : 0);
      };
      el.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
      el.src = url;
    } catch {
      resolve(0);
    }
  });
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
  generateAudio: true,
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
    if (kind !== 'image') {
      const dur = await probeMediaDuration(file, kind);
      if (dur && dur > MAX_MEDIA_SECONDS + 0.5) {
        toast.error(`${kind} must be ≤ ${MAX_MEDIA_SECONDS}s (got ${dur.toFixed(1)}s)`);
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

    // Insert a row up-front so the Create Video grid shows a placeholder.
    try {
      await (supabase as any).from('video_generations').upsert({
        id: videoId,
        prompt: promptText || '(reference only)',
        model: 'seedance-2.0',
        mode: hasRefs ? 'image-to-video' : 'text-to-video',
        aspect_ratio: s.ratio === 'adaptive' ? '16:9' : s.ratio,
        duration: String(s.duration),
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

    // Use the dedicated seedance edge function (handles asset registration).
    const { data, error } = await supabase.functions.invoke('seedance-generate-video', {
      body: {
        action: 'submit',
        videoId,
        projectId,
        prompt: promptText,
        imageUrls,
        videoUrls,
        audioUrls,
        duration: Number(s.duration),
        resolution: s.resolution,
        ratio: s.ratio,
        generateAudio: s.generateAudio,
        variant: s.variant,
      },
    });

    if (error) {
      set({ isSubmitting: false });
      toast.error(error.message || 'Seedance submit failed');
      return;
    }
    if (data?.error) {
      set({ isSubmitting: false });
      toast.error(data.error);
      return;
    }
    if (!data?.taskId) {
      set({ isSubmitting: false });
      toast.error('AtlasCloud did not return a task id.');
      return;
    }

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
            body: { action: 'poll', predictionId: data.taskId, videoId },
          });
          if (poll?.status === 'complete') return;
          if (poll?.status === 'failed') return;
        } catch { /* keep polling */ }
      }
    })();
  },
}));
