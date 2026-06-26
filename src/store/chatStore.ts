import { create } from 'zustand';

export type ChatRole = 'user' | 'persona';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  createdAt: number;
};

export type CreditPack = {
  id: string;
  credits: number;
  /** price in whole USD cents */
  priceCents: number;
  /** optional marketing badge e.g. "Best value" */
  badge?: string;
};

/** Credits charged per message sent to the persona. */
export const COST_PER_MESSAGE = 1;

export const CREDIT_PACKS: CreditPack[] = [
  { id: 'starter', credits: 20, priceCents: 499 },
  { id: 'plus', credits: 60, priceCents: 1199, badge: 'Popular' },
  { id: 'pro', credits: 150, priceCents: 2499, badge: 'Best value' },
];

const STORAGE_KEY = 'paytochat-state-v1';

type Persisted = {
  credits: number;
  messages: ChatMessage[];
};

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function loadPersisted(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { credits: 5, messages: [] };
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      credits: typeof parsed.credits === 'number' ? parsed.credits : 5,
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
    };
  } catch {
    return { credits: 5, messages: [] };
  }
}

function persist(state: Persisted) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota / unavailable storage */
  }
}

/**
 * Pure helper: can the user afford to send a message?
 * Exported so the gating logic is unit-testable without a store instance.
 */
export function canAfford(credits: number, cost = COST_PER_MESSAGE) {
  return credits >= cost;
}

/** Format whole cents as a $X.XX string. */
export function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

const REPLY_TEMPLATES = [
  "Mmm, I love that you reached out 💜 tell me more about what's on your mind?",
  'You always know what to say. What are you up to right now?',
  "That's so interesting — keep going, I'm all yours for this chat 😘",
  'I was just thinking about you. What would you like to talk about next?',
  "You're sweet. Want me to send you something special later? 💋",
];

/** Pure helper: deterministic-ish mock reply so the UI feels alive without a backend. */
export function mockReply(userText: string, seed = 0): string {
  const idx = (userText.length + seed) % REPLY_TEMPLATES.length;
  return REPLY_TEMPLATES[idx];
}

type State = {
  credits: number;
  messages: ChatMessage[];
  isTyping: boolean;
  /** Sends a user message, deducts a credit, and queues a mock persona reply.
   *  Returns false (and does nothing) when the user can't afford it. */
  send: (text: string) => boolean;
  addCredits: (amount: number) => void;
  reset: () => void;
};

export const useChatStore = create<State>((set, get) => {
  const initial = loadPersisted();
  return {
    credits: initial.credits,
    messages: initial.messages,
    isTyping: false,

    send: (text) => {
      const trimmed = text.trim();
      if (!trimmed) return false;
      const { credits, messages } = get();
      if (!canAfford(credits)) return false;

      const userMsg: ChatMessage = {
        id: uid(),
        role: 'user',
        text: trimmed,
        createdAt: Date.now(),
      };
      const nextCredits = credits - COST_PER_MESSAGE;
      const nextMessages = [...messages, userMsg];
      set({ credits: nextCredits, messages: nextMessages, isTyping: true });
      persist({ credits: nextCredits, messages: nextMessages });

      // Simulate the persona "typing" then replying.
      window.setTimeout(() => {
        const replyMsg: ChatMessage = {
          id: uid(),
          role: 'persona',
          text: mockReply(trimmed, nextMessages.length),
          createdAt: Date.now(),
        };
        const withReply = [...get().messages, replyMsg];
        set({ messages: withReply, isTyping: false });
        persist({ credits: get().credits, messages: withReply });
      }, 900);

      return true;
    },

    addCredits: (amount) => {
      const credits = get().credits + amount;
      set({ credits });
      persist({ credits, messages: get().messages });
    },

    reset: () => {
      set({ credits: 5, messages: [], isTyping: false });
      persist({ credits: 5, messages: [] });
    },
  };
});
