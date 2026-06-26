import { create } from "zustand";

// Tiny UI store so any component (header, paywall banner, composer) can open
// the shared Buy-credits and Subscribe modals without prop drilling.

type State = {
  buyCreditsOpen: boolean;
  subscribeOpen: boolean;
  openBuyCredits: () => void;
  openSubscribe: () => void;
  closeAll: () => void;
};

export const useUI = create<State>((set) => ({
  buyCreditsOpen: false,
  subscribeOpen: false,
  openBuyCredits: () => set({ buyCreditsOpen: true, subscribeOpen: false }),
  openSubscribe: () => set({ subscribeOpen: true, buyCreditsOpen: false }),
  closeAll: () => set({ buyCreditsOpen: false, subscribeOpen: false }),
}));
