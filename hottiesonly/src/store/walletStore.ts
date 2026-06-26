import { create } from "zustand";

// The wallet holds the user's credit balance and subscription state.
// Credits power chat messages, PPV unlocks, tips, and gifts.

const STORAGE_KEY = "ho-wallet-v1";

// New visitors get a few free credits so they can say hi before paying —
// the "come chat, I reply to everyone" hook from the funnel.
const STARTING_CREDITS = 3;

export type Persisted = {
  credits: number;
  subscribedTierId: string | null;
  unlockedPostIds: string[];
};

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { credits: STARTING_CREDITS, subscribedTierId: null, unlockedPostIds: [] };
    const p = JSON.parse(raw) as Partial<Persisted>;
    return {
      credits: typeof p.credits === "number" ? p.credits : STARTING_CREDITS,
      subscribedTierId: p.subscribedTierId ?? null,
      unlockedPostIds: Array.isArray(p.unlockedPostIds) ? p.unlockedPostIds : [],
    };
  } catch {
    return { credits: STARTING_CREDITS, subscribedTierId: null, unlockedPostIds: [] };
  }
}

function save(p: Persisted) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

/** Pure helper so spend gating is unit-testable without a store. */
export function canSpend(credits: number, cost: number) {
  return cost >= 0 && credits >= cost;
}

type State = Persisted & {
  isSubscribed: boolean;
  addCredits: (amount: number) => void;
  /** Spend credits; returns false (no-op) if balance is insufficient. */
  spend: (amount: number) => boolean;
  subscribe: (tierId: string) => void;
  unsubscribe: () => void;
  unlockPost: (postId: string, cost: number) => boolean;
  isUnlocked: (postId: string) => boolean;
  reset: () => void;
};

export const useWallet = create<State>((set, get) => {
  const initial = load();
  const persistNow = () =>
    save({
      credits: get().credits,
      subscribedTierId: get().subscribedTierId,
      unlockedPostIds: get().unlockedPostIds,
    });

  return {
    ...initial,
    isSubscribed: initial.subscribedTierId !== null,

    addCredits: (amount) => {
      set({ credits: get().credits + amount });
      persistNow();
    },

    spend: (amount) => {
      if (!canSpend(get().credits, amount)) return false;
      set({ credits: get().credits - amount });
      persistNow();
      return true;
    },

    subscribe: (tierId) => {
      set({ subscribedTierId: tierId, isSubscribed: true });
      persistNow();
    },

    unsubscribe: () => {
      set({ subscribedTierId: null, isSubscribed: false });
      persistNow();
    },

    unlockPost: (postId, cost) => {
      if (get().unlockedPostIds.includes(postId)) return true;
      if (!canSpend(get().credits, cost)) return false;
      set({
        credits: get().credits - cost,
        unlockedPostIds: [...get().unlockedPostIds, postId],
      });
      persistNow();
      return true;
    },

    isUnlocked: (postId) => get().unlockedPostIds.includes(postId),

    reset: () => {
      set({ credits: 0, subscribedTierId: null, isSubscribed: false, unlockedPostIds: [] });
      persistNow();
    },
  };
});
