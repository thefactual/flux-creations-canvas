import { create } from 'zustand';

export type PromptMode = 'image' | 'video';
export type VideoSubMode = 'text-to-video' | 'image-to-video' | 'motion-control';

interface PromptModeState {
  mode: PromptMode;
  videoSubMode: VideoSubMode;
  setMode: (m: PromptMode) => void;
  setVideoSubMode: (s: VideoSubMode) => void;
}

export const usePromptModeStore = create<PromptModeState>((set) => ({
  mode: 'image',
  videoSubMode: 'text-to-video',
  setMode: (mode) => set({ mode }),
  setVideoSubMode: (videoSubMode) => set({ videoSubMode, mode: 'video' }),
}));
