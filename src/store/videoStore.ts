import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import { resolveAllToUrls } from '@/lib/uploadToStorage';
import { toast } from 'sonner';

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export type GeneratedVideo = {
  id: string;
  prompt: string;
  referenceImages: string[];
  model: string;
  mode: 'text-to-video' | 'image-to-video' | 'motion-control' | 'video-edit';
  aspectRatio: string;
  duration: string;
  status: 'generating' | 'complete' | 'failed' | 'nsfw';
  videoUrl?: string;
  thumbnailUrl?: string;
  createdAt: number;
  error?: string;
  progress?: number;
  characterOrientation?: 'video' | 'image';
  projectId?: string | null;
  liked?: boolean;
};

export const VIDEO_MODELS = [
  { id: 'kling-v3-pro', name: 'Kling 3.0 Pro', desc: 'Top-tier cinematic visuals, fluid motion, audio', featured: true, badge: 'NEW' as const, provider: 'fal', modes: ['text-to-video', 'image-to-video'] as const },
  { id: 'ev-kling-v3-motion', name: 'Kling 3.0 Motion', desc: 'Cheapest & fastest motion control — recommended', featured: true, badge: 'TOP' as const, provider: 'evolink', modes: ['motion-control'] as const },
  { id: 'kling-v3-motion', name: 'Kling 3.0 Motion Pro', desc: 'High-fidelity motion transfer', featured: true, provider: 'fal', modes: ['motion-control'] as const },
  { id: 'kling-v2.6-motion-pro', name: 'Kling 2.6 Motion Pro', desc: 'Pro-quality motion transfer', featured: true, provider: 'fal', modes: ['motion-control'] as const },
  { id: 'kling-v2.6-motion-std', name: 'Kling 2.6 Motion Std', desc: 'Standard motion control', featured: false, provider: 'fal', modes: ['motion-control'] as const },
  { id: 'kling-o3-pro', name: 'Kling O3 Pro', desc: 'Start+end frame animation with style guidance', featured: true, badge: 'NEW' as const, provider: 'fal', modes: ['image-to-video'] as const },
  { id: 'kling-v2.5-turbo-pro', name: 'Kling 2.5 Turbo Pro', desc: 'Fast cinematic video, great prompt precision', featured: true, provider: 'fal', modes: ['text-to-video', 'image-to-video'] as const },
  { id: 'kling-v2.6-pro', name: 'Kling 2.6 Pro', desc: 'High-quality image-to-video with audio', featured: false, provider: 'fal', modes: ['image-to-video'] as const },
  { id: 'veo-3.1', name: 'Veo 3.1', desc: 'Google\'s most advanced video model, with sound', featured: true, badge: 'NEW' as const, provider: 'fal', modes: ['text-to-video', 'image-to-video'] as const },
  { id: 'veo-3.1-fast', name: 'Veo 3.1 Fast', desc: 'Faster Veo 3.1 for quick iterations', featured: true, provider: 'fal', modes: ['text-to-video', 'image-to-video'] as const },
  { id: 'veo-3.1-lite', name: 'Veo 3.1 Lite', desc: 'Balanced quality and speed', featured: false, provider: 'fal', modes: ['text-to-video', 'image-to-video'] as const },
  { id: 'minimax-video', name: 'MiniMax Hailuo', desc: 'Generate video clips from prompts', featured: true, provider: 'fal', modes: ['text-to-video', 'image-to-video'] as const },
  { id: 'pixverse-v6', name: 'PixVerse V6', desc: 'Lifelike physics and striking visuals', featured: true, badge: 'NEW' as const, provider: 'fal', modes: ['text-to-video', 'image-to-video'] as const },
  { id: 'ltx-2-19b', name: 'LTX-2 19B', desc: 'Video with audio from images', featured: false, provider: 'fal', modes: ['text-to-video', 'image-to-video'] as const },
  { id: 'rw-seedance-1.5-pro', name: 'Seedance 1.5 Pro', desc: 'ByteDance motion control video', featured: true, badge: 'NEW' as const, provider: 'runware', modes: ['text-to-video', 'image-to-video', 'motion-control'] as const },
  // Video edit (video-to-video)
  { id: 'kling-omni-edit', name: 'Kling 3.0 Omni Edit', desc: 'Edit videos with text prompts', featured: true, badge: 'EXCLUSIVE' as const, provider: 'fal', modes: ['video-edit'] as const },
  { id: 'kling-o1-edit-pro', name: 'Kling O1 Video Edit', desc: 'Generate with elements and references', featured: true, provider: 'fal', modes: ['video-edit'] as const },
  { id: 'grok-imagine-edit', name: 'Grok Imagine Edit', desc: 'Edit videos with text prompts', featured: true, badge: 'NEW' as const, provider: 'runware', modes: ['video-edit'] as const },
  { id: 'rw-runway-gen4.5', name: 'Runway Gen-4.5', desc: 'Advanced multimodal video generation', featured: true, provider: 'runware', modes: ['text-to-video', 'image-to-video'] as const },
  { id: 'rw-sora-2', name: 'Sora 2', desc: 'OpenAI video generation', featured: true, provider: 'runware', modes: ['text-to-video', 'image-to-video'] as const },
  { id: 'rw-kling-2.5', name: 'Kling 2.5 Turbo Pro Unfiltered', desc: 'Kling without content filter', featured: false, provider: 'runware', modes: ['text-to-video', 'image-to-video'] as const },
  { id: 'rw-veo-3.1', name: 'Veo 3.1 Alt', desc: 'Google Veo alternative route', featured: false, provider: 'runware', modes: ['text-to-video', 'image-to-video'] as const },
  { id: 'rw-veo-3.1-fast', name: 'Veo 3.1 Fast Alt', desc: 'Fast Veo alternative route', featured: false, provider: 'runware', modes: ['text-to-video', 'image-to-video'] as const },
  { id: 'grok-imagine', name: 'Grok Imagine', desc: 'Perfect motion with advanced video control', featured: true, badge: 'NEW' as const, provider: 'runware', modes: ['text-to-video', 'image-to-video'] as const },
];

// =====================================================================
// VIDEO_CATALOG — Curated, user-facing list for the Create Video tab.
// One display name per model, no provider names. Backend routing is
// handled in supabase/functions/generate-video using the `id` field.
// =====================================================================
export type UploadLayout = 'none' | 'start-end' | 'single-required' | 'single-optional';

export type VideoCatalogEntry = {
  id: string;                 // backend model key (must exist in VIDEO_MODEL_MAP)
  name: string;               // display name (no provider)
  family: string;             // grouping key
  familyLabel: string;        // display label for the family
  familyDesc: string;         // 1-line family description
  featured?: boolean;
  badge?: 'NEW' | 'EXCLUSIVE';
  resolution: string;         // chip text e.g. '720p' | '1080p' | '4K'
  durationRange: string;      // chip text e.g. '3s-15s'
  hasAudio?: boolean;
  uploadLayout: UploadLayout;
  modes: readonly ('text-to-video' | 'image-to-video')[];
};

export const VIDEO_CATALOG: VideoCatalogEntry[] = [
  // ---------- Featured ----------
  { id: 'rw-seedance-1.5-pro', name: 'Seedance 2.0', family: 'seedance', familyLabel: 'Seedance', familyDesc: 'Cinematic, multi-shot video creation', featured: true, badge: 'NEW', resolution: '720p', durationRange: '4s-15s', uploadLayout: 'single-optional', modes: ['text-to-video', 'image-to-video'] },
  { id: 'kling-v3-pro', name: 'Kling 3.0', family: 'kling', familyLabel: 'Kling', familyDesc: 'Perfect motion with advanced video control', featured: true, badge: 'EXCLUSIVE', resolution: '4K', durationRange: '3s-15s', hasAudio: true, uploadLayout: 'start-end', modes: ['text-to-video', 'image-to-video'] },
  { id: 'veo-3.1-lite', name: 'Google Veo 3.1 Lite', family: 'veo', familyLabel: 'Google Veo', familyDesc: 'Precision video with sound control', featured: true, badge: 'NEW', resolution: '1080p', durationRange: '4s-8s', hasAudio: true, uploadLayout: 'single-required', modes: ['text-to-video', 'image-to-video'] },
  { id: 'grok-imagine', name: 'Grok Imagine', family: 'grok', familyLabel: 'Grok Imagine', familyDesc: 'Perfect motion with advanced video control', featured: true, resolution: '720p', durationRange: '1s-15s', uploadLayout: 'single-optional', modes: ['text-to-video', 'image-to-video'] },

  // ---------- All models ----------
  { id: 'minimax-video', name: 'Minimax Hailuo', family: 'hailuo', familyLabel: 'Minimax Hailuo', familyDesc: 'High-dynamic, VFX-ready, fastest and most affordable', resolution: '720p', durationRange: '5s-10s', uploadLayout: 'single-optional', modes: ['text-to-video', 'image-to-video'] },
  { id: 'kling-v2.6-pro', name: 'Kling 2.6', family: 'kling', familyLabel: 'Kling', familyDesc: 'Perfect motion with advanced video control', resolution: '1080p', durationRange: '5s-10s', hasAudio: true, uploadLayout: 'start-end', modes: ['text-to-video', 'image-to-video'] },
  { id: 'kling-v2.5-turbo-pro', name: 'Kling 2.5 Turbo Pro', family: 'kling', familyLabel: 'Kling', familyDesc: 'Perfect motion with advanced video control', resolution: '1080p', durationRange: '5s-10s', uploadLayout: 'start-end', modes: ['text-to-video', 'image-to-video'] },
  { id: 'rw-sora-2', name: 'OpenAI Sora 2', family: 'sora', familyLabel: 'OpenAI Sora 2', familyDesc: 'Multi-shot video with sound generation', resolution: '1080p', durationRange: '5s-10s', hasAudio: true, uploadLayout: 'single-optional', modes: ['text-to-video', 'image-to-video'] },
  { id: 'veo-3.1', name: 'Google Veo 3.1', family: 'veo', familyLabel: 'Google Veo', familyDesc: 'Precision video with sound control', resolution: '1080p', durationRange: '4s-8s', hasAudio: true, uploadLayout: 'start-end', modes: ['text-to-video', 'image-to-video'] },
  { id: 'veo-3.1-fast', name: 'Google Veo 3.1 Fast', family: 'veo', familyLabel: 'Google Veo', familyDesc: 'Precision video with sound control', resolution: '1080p', durationRange: '4s-8s', hasAudio: true, uploadLayout: 'start-end', modes: ['text-to-video', 'image-to-video'] },
  { id: 'rw-runway-gen4.5', name: 'Runway Gen-4.5', family: 'runway', familyLabel: 'Runway', familyDesc: 'Advanced multimodal video generation', resolution: '1080p', durationRange: '5s-10s', uploadLayout: 'single-optional', modes: ['text-to-video', 'image-to-video'] },
  { id: 'pixverse-v6', name: 'PixVerse V6', family: 'pixverse', familyLabel: 'PixVerse', familyDesc: 'Lifelike physics and striking visuals', resolution: '1080p', durationRange: '5s-10s', uploadLayout: 'start-end', modes: ['text-to-video', 'image-to-video'] },
  { id: 'ltx-2-19b', name: 'LTX-2', family: 'ltx', familyLabel: 'LTX', familyDesc: 'Video with audio from images', resolution: '1080p', durationRange: '5s-10s', hasAudio: true, uploadLayout: 'start-end', modes: ['text-to-video', 'image-to-video'] },
];

export const VIDEO_ASPECT_RATIOS = ['16:9', '9:16', '1:1'];
export const VIDEO_DURATIONS = ['5', '10'];

// Per-model duration choices (verified from fal.ai / Runware docs).
// Falls back to VIDEO_DURATIONS when no entry exists.
export const MODEL_DURATIONS: Record<string, string[]> = {
  'kling-v3-pro':         ['3','4','5','6','7','8','9','10','11','12','13','14','15'],
  'kling-v3-motion':      ['5','10'],
  'ev-kling-v3-motion':   ['5','10'],
  'kling-o3-pro':         ['5','10'],
  'kling-v2.5-turbo-pro': ['5','10'],
  'kling-v2.6-pro':       ['5','10'],
  'kling-v2.6-motion-std':['5','10'],
  'kling-v2.6-motion-pro':['5','10'],
  'veo-3.1':              ['4','6','8'],
  'veo-3.1-fast':         ['4','6','8'],
  'veo-3.1-lite':         ['4','6','8'],
  'minimax-video':        ['5'],            // ignored by API but locked for UI honesty
  'pixverse-v6':          ['5','8'],
  'ltx-2-19b':            ['5','10'],
  'rw-seedance-1.5-pro':  ['5','10','12','15'],
  'rw-runway-gen4.5':     ['5','10'],
  'rw-sora-2':            ['8'],
  'rw-kling-2.5':         ['5','10'],
  'rw-veo-3.1':           ['8'],
  'rw-veo-3.1-fast':      ['8'],
  'grok-imagine':         ['6'],
  'grok-imagine-edit':    ['6'],
  'kling-omni-edit':      ['5','10'],
  'kling-o1-edit-pro':    ['5','10'],
};

// Per-model resolution choices.
// Empty list = model has no resolution param (don't render the chip).
export const MODEL_RESOLUTIONS: Record<string, string[]> = {
  'kling-v3-pro':         ['4K'],
  'kling-v2.6-pro':       ['1080p'],
  'kling-v2.5-turbo-pro': ['1080p'],
  'minimax-video':        ['720p'],
  'pixverse-v6':          ['360p','540p','720p','1080p'],
  'veo-3.1':              ['720p','1080p'],
  'veo-3.1-fast':         ['720p','1080p'],
  'veo-3.1-lite':         ['720p','1080p'],
  'rw-seedance-1.5-pro':  ['480p','720p'],
  'grok-imagine':         ['480p','720p'],
  'grok-imagine-edit':    ['480p','720p'],
  'rw-runway-gen4.5':     ['720p','1080p'],
  'rw-kling-2.5':         ['720p','1080p'],
  'rw-veo-3.1':           ['720p','1080p'],
  'rw-veo-3.1-fast':      ['720p','1080p'],
  'rw-sora-2':            ['720p'],
  'ev-kling-v3-motion':   ['720p','1080p'],
  'ltx-2-19b':            ['1080p'],
};

export function getDurationsForModel(model: string): string[] {
  return MODEL_DURATIONS[model] ?? VIDEO_DURATIONS;
}
export function getResolutionsForModel(model: string): string[] {
  return MODEL_RESOLUTIONS[model] ?? [];
}

type VideoState = {
  prompt: string;
  motionPrompt: string;
  referenceImages: string[];
  motionVideo: string | null;
  model: string;
  mode: 'text-to-video' | 'image-to-video' | 'motion-control' | 'video-edit';
  aspectRatio: string;
  duration: string;
  characterOrientation: 'video' | 'image';
  keepAudio: boolean;
  resolution: string;
  videos: GeneratedVideo[];
  selectedVideoId: string | null;
  setPrompt: (p: string) => void;
  setMotionPrompt: (p: string) => void;
  addReferenceImage: (img: string) => void;
  setReferenceImageAt: (idx: number, img: string) => void;
  removeReferenceImage: (idx: number) => void;
  setMotionVideo: (v: string | null) => void;
  setModel: (m: string) => void;
  setMode: (m: 'text-to-video' | 'image-to-video' | 'motion-control' | 'video-edit') => void;
  setAspectRatio: (ar: string) => void;
  setDuration: (d: string) => void;
  setCharacterOrientation: (value: 'video' | 'image') => void;
  setKeepAudio: (v: boolean) => void;
  setResolution: (r: string) => void;
  setSelectedVideoId: (id: string | null) => void;
  generate: () => void;
  retryVideo: (id: string) => void;
  deleteVideo: (id: string) => void;
  toggleLike: (id: string) => void;
  loadHistory: (projectId?: string | null) => Promise<void>;
  _historyLoaded: boolean;
  _loadedProjects?: Set<string>;
};

async function saveVideoToDb(video: GeneratedVideo) {
  try {
    await (supabase as any).from('video_generations').upsert({
      id: video.id,
      prompt: video.prompt,
      model: video.model,
      mode: video.mode,
      aspect_ratio: video.aspectRatio,
      duration: video.duration,
      status: video.status === 'generating' ? 'processing' : video.status,
      video_url: video.videoUrl || null,
      thumbnail_url: video.thumbnailUrl || null,
      reference_images: video.referenceImages.filter(Boolean),
      error: video.error || null,
      project_id: video.projectId ?? null,
      create_project_id: video.projectId ?? null,
    }, { onConflict: 'id' });
  } catch (e) {
    console.error('Failed to save video to DB:', e);
  }
}

function updateVideoAndSave(videoId: string, updates: Partial<GeneratedVideo>, get: () => VideoState, set: (s: Partial<VideoState>) => void) {
  const videos = get().videos.map(v => v.id === videoId ? { ...v, ...updates } : v);
  set({ videos });
  const updated = videos.find(v => v.id === videoId);
  if (updated) saveVideoToDb(updated);
}

async function callGenerate(payload: Record<string, unknown>, videoId: string, get: () => VideoState, set: (s: Partial<VideoState>) => void) {
  const refs = payload.referenceImages as string[] | undefined;

  if (refs && refs.length > 0) {
    try {
      const resolvedRefs = await resolveAllToUrls(refs, (index, originalSize, finalSize) => {
        toast.info(`Image ${index + 1} auto-compressed`, {
          description: `${formatBytes(originalSize)} → ${formatBytes(finalSize)} to meet provider limits`,
        });
      });
      payload.referenceImages = resolvedRefs;
      set({
        videos: get().videos.map((video) =>
          video.id === videoId ? { ...video, referenceImages: resolvedRefs } : video,
        ),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown upload error';
      updateVideoAndSave(videoId, { status: 'failed', error: `Upload failed: ${message}` }, get, set);
      return;
    }
  }

  try {
    const { data, error } = await supabase.functions.invoke('generate-video', { body: { ...payload, action: 'submit' } });

    if (error) {
      let errMsg = error.message;
      try {
        const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
        if (ctx && typeof ctx.json === 'function') {
          const body = await ctx.json();
          if (body?.error) errMsg = body.error;
        }
      } catch {}
      updateVideoAndSave(videoId, { status: 'failed', error: errMsg }, get, set);
      return;
    }

    if (data?.error) {
      const isNsfw = data.filtered;
      updateVideoAndSave(videoId, { status: isNsfw ? 'nsfw' : 'failed', error: data.error }, get, set);
      return;
    }

    if (data?.videoUrl || data?.status === 'complete') {
      updateVideoAndSave(videoId, { status: 'complete', videoUrl: data.videoUrl }, get, set);
      return;
    }

    if (data?.submitted && data?.provider && data?.taskId) {
      // Save provider/task info to DB for potential recovery
      saveVideoToDb({ ...get().videos.find(v => v.id === videoId)! });

      const pollBody: Record<string, unknown> = {
        action: 'poll',
        provider: data.provider,
        taskId: data.taskId,
      };
      if (data.responseUrl) pollBody.responseUrl = data.responseUrl;
      if (data.statusUrl) pollBody.statusUrl = data.statusUrl;

      const maxAttempts = 360; // ~30 min budget for slow models (Kling 3.0 Pro, Veo 3.1)
      let delay = 4000;
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, delay));
        delay = Math.min(8000, delay + 250); // gentle backoff, cap at 8s
        try {
          const { data: pollData, error: pollError } = await supabase.functions.invoke('generate-video', { body: pollBody });
          if (pollError) continue;
          if (pollData?.status === 'complete' && pollData?.videoUrl) {
            updateVideoAndSave(videoId, { status: 'complete', videoUrl: pollData.videoUrl, progress: 100 }, get, set);
            return;
          }
          if (pollData?.status === 'failed') {
            updateVideoAndSave(videoId, { status: 'failed', error: pollData.error || 'Generation failed' }, get, set);
            return;
          }
          const prog = pollData?.progress;
          if (typeof prog === 'number' && prog > 0) {
            const videos = get().videos.map(v => v.id === videoId ? { ...v, progress: Math.round(prog) } : v);
            set({ videos });
          }
        } catch {}
      }
      updateVideoAndSave(videoId, { status: 'failed', error: 'Video generation timed out' }, get, set);
      return;
    }

    updateVideoAndSave(videoId, { status: 'complete', videoUrl: data?.videoUrl }, get, set);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown generation error';
    updateVideoAndSave(videoId, { status: 'failed', error: message }, get, set);
  }
}

export const useVideoStore = create<VideoState>()((set, get) => ({
  prompt: '',
  motionPrompt: '',
  referenceImages: [],
  motionVideo: null,
  model: 'kling-v3-pro',
  mode: 'text-to-video',
  aspectRatio: '16:9',
  duration: '5',
  characterOrientation: 'video',
  keepAudio: false,
  resolution: '720p',
  videos: [],
  selectedVideoId: null,
  _historyLoaded: false,

  setPrompt: (prompt) => set({ prompt }),
  setMotionPrompt: (motionPrompt) => set({ motionPrompt }),
  addReferenceImage: (img) => {
    const refs = get().referenceImages;
    if (refs.length < 5) set({ referenceImages: [...refs, img] });
  },
  setReferenceImageAt: (idx, img) => {
    const refs = [...get().referenceImages];
    while (refs.length <= idx) refs.push('');
    refs[idx] = img;
    set({ referenceImages: refs });
  },
  removeReferenceImage: (idx) => {
    const refs = [...get().referenceImages];
    refs[idx] = '';
    while (refs.length > 0 && refs[refs.length - 1] === '') refs.pop();
    set({ referenceImages: refs });
  },
  setMotionVideo: (motionVideo) => set({ motionVideo }),
  setModel: (model) => set((state) => {
    const durations = getDurationsForModel(model);
    const resolutions = getResolutionsForModel(model);
    const next: Partial<VideoState> = { model };
    if (!durations.includes(state.duration)) next.duration = durations[0];
    if (resolutions.length > 0 && !resolutions.includes(state.resolution)) {
      next.resolution = resolutions.includes('720p') ? '720p' : resolutions[0];
    }
    return next as VideoState;
  }),
  setMode: (mode) => set((state) => {
    const currentModel = VIDEO_MODELS.find(m => m.id === state.model);
    if (currentModel && (currentModel.modes as readonly string[]).includes(mode)) {
      return { mode };
    }
    const fallbackModel =
      VIDEO_MODELS.find(m => m.featured && (m.modes as readonly string[]).includes(mode))?.id ??
      VIDEO_MODELS.find(m => (m.modes as readonly string[]).includes(mode))?.id ??
      state.model;
    return { mode, model: fallbackModel };
  }),
  setAspectRatio: (aspectRatio) => set({ aspectRatio }),
  setDuration: (duration) => set({ duration }),
  setCharacterOrientation: (characterOrientation) => set({ characterOrientation }),
  setKeepAudio: (keepAudio) => set({ keepAudio }),
  setResolution: (resolution) => set({ resolution }),
  setSelectedVideoId: (selectedVideoId) => set({ selectedVideoId }),

  generate: async () => {
    const { prompt, motionPrompt, referenceImages, model, mode, aspectRatio, duration, characterOrientation, keepAudio, resolution } = get();
    const effectivePrompt = mode === 'motion-control' ? motionPrompt.trim() : prompt.trim();

    if (!effectivePrompt && mode === 'text-to-video') return;
    if (mode === 'image-to-video' && referenceImages.length === 0) return;
    if (mode === 'motion-control' && (!referenceImages[0] || !referenceImages[1])) return;
    if (mode === 'video-edit' && (!referenceImages[0] || !effectivePrompt)) return;

    // Resolve the active /create project so the resulting card lands in the
    // correct workspace. Auto-create one if none exists yet.
    const { useCreateProjectsStore } = await import('@/store/createProjectsStore');
    const projStore = useCreateProjectsStore.getState();
    let projectId: string | null = projStore.activeProjectId;
    if (!projectId) {
      const name = effectivePrompt.split(/\s+/).slice(0, 5).join(' ').slice(0, 60) || 'New project';
      try {
        const proj = await projStore.createProject(name);
        projectId = proj.id;
      } catch { projectId = null; }
    }

    const newVideo: GeneratedVideo = {
      id: crypto.randomUUID(),
      prompt: effectivePrompt,
      referenceImages: [...referenceImages],
      model,
      mode,
      aspectRatio,
      duration,
      resolution,
      status: 'generating',
      createdAt: Date.now(),
      characterOrientation: mode === 'motion-control' ? characterOrientation : undefined,
      projectId,
    };

    set({ videos: [newVideo, ...get().videos] });
    saveVideoToDb(newVideo);
    callGenerate({
      prompt: effectivePrompt,
      referenceImages: [...referenceImages],
      model,
      mode,
      aspectRatio,
      duration,
      characterOrientation,
      keepAudio,
      resolution,
    }, newVideo.id, get, set);
  },

  retryVideo: (id) => {
    const video = get().videos.find(v => v.id === id);
    if (!video) return;

    set({ videos: get().videos.map(v => v.id === id ? { ...v, status: 'generating', error: undefined } : v) });
    callGenerate({
      prompt: video.prompt,
      referenceImages: [...video.referenceImages],
      model: video.model,
      mode: video.mode,
      aspectRatio: video.aspectRatio,
      duration: video.duration,
      resolution: video.resolution ?? resolution,
      characterOrientation: video.characterOrientation ?? 'video',
    }, id, get, set);
  },

  deleteVideo: (id) => {
    set({
      videos: get().videos.filter(v => v.id !== id),
      selectedVideoId: get().selectedVideoId === id ? null : get().selectedVideoId,
    });
    (supabase as any).from('video_generations').delete().eq('id', id).then(() => {});
  },

  toggleLike: (id) => {
    const next = !get().videos.find((v) => v.id === id)?.liked;
    set({ videos: get().videos.map((v) => (v.id === id ? { ...v, liked: next } : v)) });
    (supabase as any).from('video_generations').update({ liked: next }).eq('id', id).then(() => {});
  },

  loadHistory: async (projectId?: string | null) => {
    const key = projectId ?? '__all__';
    const loaded = (get() as any)._loadedProjects as Set<string> | undefined;
    if (loaded?.has(key)) return;
    try {
      let q = (supabase as any)
        .from('video_generations')
        .select('id,prompt,model,mode,aspect_ratio,duration,status,video_url,thumbnail_url,reference_images,error,created_at,liked,project_id,create_project_id')
        .order('created_at', { ascending: false })
        .limit(100);
      if (projectId) q = q.or(`create_project_id.eq.${projectId},project_id.eq.${projectId}`);
      const { data } = await q;
      const rows: GeneratedVideo[] = (data || []).map((row: any) => ({
        id: row.id,
        prompt: row.prompt || '',
        referenceImages: row.reference_images || [],
        model: row.model,
        mode: row.mode as GeneratedVideo['mode'],
        aspectRatio: row.aspect_ratio,
        duration: row.duration,
        status: row.status === 'processing' ? 'generating' : row.status as GeneratedVideo['status'],
        videoUrl: row.video_url || undefined,
        thumbnailUrl: row.thumbnail_url || undefined,
        createdAt: new Date(row.created_at).getTime(),
        error: row.error || undefined,
        liked: !!row.liked,
        projectId: row.create_project_id ?? row.project_id ?? null,
      }));
      const existingIds = new Set(get().videos.map(v => v.id));
      const newOnes = rows.filter(v => !existingIds.has(v.id));
      const nextLoaded = new Set(loaded ?? []);
      nextLoaded.add(key);
      set({ videos: [...get().videos, ...newOnes], _historyLoaded: true, _loadedProjects: nextLoaded } as any);
    } catch (e) {
      console.error('Failed to load video history:', e);
    }
  },
}));
