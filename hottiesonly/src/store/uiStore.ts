import { create } from "zustand";

// Tiny UI store for the shared Buy-credits modal (used from the chat).
// Subscriptions live inline on the landing page (the Plans section), so there's
// no subscribe modal.

type State = {
  buyCreditsOpen: boolean;
  openBuyCredits: () => void;
  closeAll: () => void;
};

export const useUI = create<State>((set) => ({
  buyCreditsOpen: false,
  openBuyCredits: () => set({ buyCreditsOpen: true }),
  closeAll: () => set({ buyCreditsOpen: false }),
}));
