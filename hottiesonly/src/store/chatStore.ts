import { create } from "zustand";
import { useWallet } from "./walletStore";
import { CREATOR } from "@/data/creator";

// Chat with the creator (or her AI). 1 credit per message. The reply is a
// local mock so the experience is complete without a backend — swap mockReply
// for a fine-tuned LLM call with per-subscriber memory in production.

export const COST_PER_MESSAGE = 1;

const STORAGE_KEY = "ho-chat-v1";

export type ChatRole = "user" | "creator";
export type ChatKind = "text" | "tip" | "gift";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  kind: ChatKind;
  text: string;
  createdAt: number;
};

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function loadMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveMessages(messages: ChatMessage[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch {
    /* ignore */
  }
}

const REPLIES = [
  "mmm hi you 🥺 i was hoping you'd message me",
  "you always know exactly what to say 😘 tell me more",
  "i've been thinking about you all day, what are you up to?",
  "you're so sweet to me 💕 don't stop",
  "i remember you said that — i love that you came back to me",
  "keep talking to me like that and i'm all yours tonight 💋",
];

/** Deterministic mock reply so the same input is stable in tests. */
export function mockReply(userText: string, seed = 0): string {
  const idx = (userText.length + seed) % REPLIES.length;
  return REPLIES[idx];
}

type State = {
  messages: ChatMessage[];
  isTyping: boolean;
  /** Send a text message. Charges COST_PER_MESSAGE. Returns false if unaffordable. */
  sendText: (text: string) => boolean;
  /** Record a tip/gift in the thread (the credit spend happens at the call site). */
  pushEvent: (kind: "tip" | "gift", text: string) => void;
  reset: () => void;
};

export const useChat = create<State>((set, get) => ({
  messages: loadMessages(),
  isTyping: false,

  sendText: (text) => {
    const trimmed = text.trim();
    if (!trimmed) return false;
    // Charge a credit up front; bail if the user can't afford it.
    if (!useWallet.getState().spend(COST_PER_MESSAGE)) return false;

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      kind: "text",
      text: trimmed,
      createdAt: Date.now(),
    };
    const next = [...get().messages, userMsg];
    set({ messages: next, isTyping: true });
    saveMessages(next);

    window.setTimeout(() => {
      const reply: ChatMessage = {
        id: uid(),
        role: "creator",
        kind: "text",
        text: mockReply(trimmed, next.length),
        createdAt: Date.now(),
      };
      const withReply = [...get().messages, reply];
      set({ messages: withReply, isTyping: false });
      saveMessages(withReply);
    }, 900);

    return true;
  },

  pushEvent: (kind, text) => {
    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      kind,
      text,
      createdAt: Date.now(),
    };
    const next = [...get().messages, userMsg];
    set({ messages: next, isTyping: true });
    saveMessages(next);

    window.setTimeout(() => {
      const reply: ChatMessage = {
        id: uid(),
        role: "creator",
        kind: "text",
        text:
          kind === "gift"
            ? `omg you spoil me 🥹 thank you baby, ${CREATOR.name} loves you`
            : "you're too generous 😘 you just made my whole night",
        createdAt: Date.now(),
      };
      const withReply = [...get().messages, reply];
      set({ messages: withReply, isTyping: false });
      saveMessages(withReply);
    }, 800);
  },

  reset: () => {
    set({ messages: [], isTyping: false });
    saveMessages([]);
  },
}));
