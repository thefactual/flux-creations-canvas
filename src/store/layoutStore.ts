import { create } from 'zustand';

type LayoutState = {
  zoom: number;
  setZoom: (z: number) => void;
};

const STORAGE_KEY = 'gen-grid-zoom';

export const useLayoutStore = create<LayoutState>()((set) => ({
  zoom: (() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const n = raw ? parseInt(raw, 10) : 2;
      return isNaN(n) ? 2 : Math.max(0, Math.min(4, n));
    } catch {
      return 2;
    }
  })(),
  setZoom: (z) => {
    const clamped = Math.max(0, Math.min(4, Math.round(z)));
    try { localStorage.setItem(STORAGE_KEY, String(clamped)); } catch {}
    set({ zoom: clamped });
  },
}));

// Legacy: target tile width (px) per zoom level (kept for back-compat).
export const ZOOM_TILE_WIDTHS: number[] = [160, 200, 260, 340, 460];

// Target ROW HEIGHT (px) per zoom level for justified row layout.
// Smaller zoom = shorter rows = more images per row.
export const ZOOM_ROW_HEIGHTS: number[] = [140, 190, 250, 320, 420];
