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
};

export const VIDEO_MODELS = [
  { id: 'kling-v3-pro', name: 'Kling 3.0 Pro', desc: 'Top-tier cinematic visuals, fluid motion, audio', featured: true, badge: 'NEW' as const, provider: 'fal', modes: ['text-to-video', 'image-to-video'] as const },
  { id: 'ev-kling-v3-motion', name: 'Kling 3.0 Motion (Evolink)', desc: 'Cheapest & fastest motion control — recommended', featured: true, badge: 'TOP' as const, provider: 'evolink', modes: ['motion-control'] as const },
  { id: 'kling-v3-motion', name: 'Kling 3.0 Motion (fal.ai)', desc: 'Motion control via fal.ai (fallback)', featured: true, provider: 'fal', modes: ['motion-control'] as const },
  { id: 'kling-v2.6-motion-pro', name: 'Kling 2.6 Motion Pro', desc: 'Pro-quality motion transfer via fal.ai', featured: true, provider: 'fal', modes: ['motion-control'] as const },
  { id: 'kling-v2.6-motion-std', name: 'Kling 2.6 Motion Std', desc: 'Standard motion control via fal.ai', featured: false, provider: 'fal', modes: ['motion-control'] as const },
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
  { id: 'rw-runway-gen4.5', name: 'Runway Gen-4.5', desc: 'Advanced multimodal video generation', featured: true, provider: 'runware', modes: ['text-to-video', 'image-to-video'] as const },
  { id: 'rw-sora-2', name: 'Sora 2', desc: 'OpenAI video generation', featured: true, provider: 'runware', modes: ['text-to-video', 'image-to-video'] as const },
  { id: 'rw-kling-2.5', name: 'RW Kling 2.5 Turbo Pro', desc: 'Kling via Runware, no filter', featured: false, provider: 'runware', modes: ['text-to-video', 'image-to-video'] as const },
  { id: 'rw-veo-3.1', name: 'RW Veo 3.1', desc: 'Google Veo via Runware', featured: false, provider: 'runware', modes: ['text-to-video', 'image-to-video'] as const },
  { id: 'rw-veo-3.1-fast', name: 'RW Veo 3.1 Fast', desc: 'Fast Veo via Runware', featured: false, provider: 'runware', modes: ['text-to-video', 'image-to-video'] as const },
];

export const VIDEO_ASPECT_RATIOS = ['16:9', '9:16', '1:1'];
export const VIDEO_DURATIONS = ['5', '10'];

type VideoState = {
  prompt: string;
  motionPrompt: string;
  referenceImages: string[];
  motionVideo: string | null;
  model: string;
  mode: 'text-to-video' | 'image-to-video' | 'motion-control';
  aspectRatio: string;
  duration: string;
  characterOrientation: 'video' | 'image';
  videos: GeneratedVideo[];
  selectedVideoId: string | null;
  setPrompt: (p: string) => void;
  setMotionPrompt: (p: string) => void;
  addReferenceImage: (img: string) => void;
  setReferenceImageAt: (idx: number, img: string) => void;
  removeReferenceImage: (idx: number) => void;
  setMotionVideo: (v: string | null) => void;
  setModel: (m: string) => void;
  setMode: (m: 'text-to-video' | 'image-to-video' | 'motion-control') => void;
  setAspectRatio: (ar: string) => void;
  setDuration: (d: string) => void;
  setCharacterOrientation: (value: 'video' | 'image') => void;
  setSelectedVideoId: (id: string | null) => void;
  generate: () => void;
  retryVideo: (id: string) => void;
  deleteVideo: (id: string) => void;
  loadHistory: () => Promise<void>;
  _historyLoaded: boolean;
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

      const maxAttempts = 120;
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, 5000));
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
          // Update progress in memory (don't save to DB for every tick)
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
  videos: [],
  selectedVideoId: null,
  _historyLoaded: false,

  setPrompt: (prompt) => set({ prompt }),
  setMotionPrompt: (motionPrompt) => set({ motionPrompt }),
  addReferenceImage: (img) => {
    const refs = get().referenceImages;
    if (refs.length < 3) set({ referenceImages: [...refs, img] });
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
  setModel: (model) => set({ model }),
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
  setSelectedVideoId: (selectedVideoId) => set({ selectedVideoId }),

  generate: () => {
    const { prompt, motionPrompt, referenceImages, model, mode, aspectRatio, duration, characterOrientation } = get();
    const effectivePrompt = mode === 'motion-control' ? motionPrompt.trim() : prompt.trim();

    if (!effectivePrompt && mode === 'text-to-video') return;
    if (mode === 'image-to-video' && referenceImages.length === 0) return;
    if (mode === 'motion-control' && (!referenceImages[0] || !referenceImages[1])) return;

    const newVideo: GeneratedVideo = {
      id: crypto.randomUUID(),
      prompt: effectivePrompt,
      referenceImages: [...referenceImages],
      model,
      mode,
      aspectRatio,
      duration,
      status: 'generating',
      createdAt: Date.now(),
      characterOrientation: mode === 'motion-control' ? characterOrientation : undefined,
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

  loadHistory: async () => {
    if (get()._historyLoaded) return;
    try {
      const { data } = await (supabase as any)
        .from('video_generations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (data && data.length > 0) {
        const loaded: GeneratedVideo[] = data.map((row: any) => ({
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
        }));
        // Merge with any in-memory videos (active generations)
        const existingIds = new Set(get().videos.map(v => v.id));
        const newOnes = loaded.filter(v => !existingIds.has(v.id));
        set({ videos: [...get().videos, ...newOnes], _historyLoaded: true });
      } else {
        set({ _historyLoaded: true });
      }
    } catch (e) {
      console.error('Failed to load video history:', e);
      set({ _historyLoaded: true });
    }
  },
}));
