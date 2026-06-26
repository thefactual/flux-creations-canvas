import { create } from "zustand";
import { LOCKED_FEED } from "@/data/creator";

// The creator's content feed: seeded placeholder posts plus anything uploaded.
// Likes are interactive. Persisted to localStorage.

const STORAGE_KEY = "ho-content-v1";

export type Post = {
  id: string;
  kind: "photo" | "video";
  /** unlock price in cents; 0 = included with subscription */
  priceCents: number;
  likes: number;
  liked: boolean;
  duration?: number;
  /** gradient hue for placeholder tiles */
  hue: number;
  /** uploaded image as a data URL; absent = gradient placeholder */
  imageDataUrl?: string;
};

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function seed(): Post[] {
  return LOCKED_FEED.map((p) => ({ ...p, liked: false }));
}

function load(): Post[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : seed();
  } catch {
    return seed();
  }
}

function save(posts: Post[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
  } catch {
    /* storage full (large images) — keep in-memory */
  }
}

type NewPost = {
  kind: "photo" | "video";
  priceCents: number;
  imageDataUrl?: string;
  hue?: number;
};

type State = {
  posts: Post[];
  toggleLike: (id: string) => void;
  addPost: (post: NewPost) => void;
  removePost: (id: string) => void;
  reset: () => void;
};

export const useContent = create<State>((set, get) => ({
  posts: load(),

  toggleLike: (id) => {
    const posts = get().posts.map((p) =>
      p.id === id ? { ...p, liked: !p.liked, likes: p.likes + (p.liked ? -1 : 1) } : p,
    );
    set({ posts });
    save(posts);
  },

  addPost: (post) => {
    const newPost: Post = {
      id: uid(),
      kind: post.kind,
      priceCents: post.priceCents,
      likes: 0,
      liked: false,
      hue: post.hue ?? 320,
      imageDataUrl: post.imageDataUrl,
    };
    // Newest first.
    const posts = [newPost, ...get().posts];
    set({ posts });
    save(posts);
  },

  removePost: (id) => {
    const posts = get().posts.filter((p) => p.id !== id);
    set({ posts });
    save(posts);
  },

  reset: () => {
    const posts = seed();
    set({ posts });
    save(posts);
  },
}));

/** Total likes across the feed — used as the profile's live like count. */
export function totalLikes(posts: Post[]) {
  return posts.reduce((sum, p) => sum + p.likes, 0);
}
