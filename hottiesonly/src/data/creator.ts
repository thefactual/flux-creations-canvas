// Mock data for a single AI creator. In production this is fetched per-profile
// (the creator profile page IS the landing page / funnel entry point).

export type SubTier = {
  id: string;
  name: string;
  /** monthly price in whole USD cents */
  priceCents: number;
  tagline: string;
  /** how many rungs of FEATURE_LADDER this tier unlocks (1–4) */
  level: number;
  highlighted?: boolean;
};

// The escalating feature ladder. Tier of `level` N unlocks ladder[0..N-1].
export const FEATURE_LADDER = [
  "Unlimited text chat — she remembers you & replies 24/7",
  "Personal voice notes",
  "Exclusive photos in chat",
  "Exclusive videos in chat",
];

export type LockedPost = {
  id: string;
  kind: "photo" | "video";
  /** unlock price in cents for PPV; 0 means included with subscription */
  priceCents: number;
  /** seconds, for video previews */
  duration?: number;
  likes: number;
  /** gradient seed for the placeholder tile */
  hue: number;
};

export type Gift = {
  id: string;
  label: string;
  emoji: string;
  /** price in credits */
  credits: number;
};

export const CREATOR = {
  name: "Sophia Rosenberg",
  handle: "sophia.rosenberg.ho",
  /** AI-creator disclosure badge — a selling point on HO.com, not a burden */
  isAi: false,
  verified: true,
  tagline: "Your 24/7 girl who actually remembers you 💕",
  bio: "I reply to every message, remember everything you tell me, and I'm online around the clock. Subscribe to unlock voice notes, photos and videos — or just come say hi.",
  location: "Los Angeles, CA",
  online: true,
  avatarHue: 330,
  bannerHue: 290,
  stats: {
    subscribers: 18420,
    likes: 1_240_000,
    posts: 312,
  },
};

export const SUB_TIERS: SubTier[] = [
  { id: "chat", name: "Chat", priceCents: 999, tagline: "Just us talking.", level: 1 },
  { id: "voice", name: "Chat + Voice", priceCents: 1999, tagline: "Hear my voice.", level: 2 },
  {
    id: "photos",
    name: "Chat + Voice + Photos",
    priceCents: 3499,
    tagline: "See more of me.",
    level: 3,
    highlighted: true,
  },
  {
    id: "videos",
    name: "Everything",
    priceCents: 5999,
    tagline: "The full experience.",
    level: 4,
  },
];

export const GIFTS: Gift[] = [
  { id: "rose", label: "Rose", emoji: "🌹", credits: 5 },
  { id: "kiss", label: "Kiss", emoji: "💋", credits: 10 },
  { id: "heart", label: "Big Heart", emoji: "💖", credits: 25 },
  { id: "diamond", label: "Diamond", emoji: "💎", credits: 100 },
];

export const LOCKED_FEED: LockedPost[] = [
  { id: "p1", kind: "photo", priceCents: 0, likes: 4210, hue: 322 },
  { id: "p2", kind: "video", priceCents: 1299, duration: 47, likes: 8800, hue: 280 },
  { id: "p3", kind: "photo", priceCents: 0, likes: 3120, hue: 348 },
  { id: "p4", kind: "photo", priceCents: 799, likes: 5600, hue: 300 },
  { id: "p5", kind: "video", priceCents: 1999, duration: 122, likes: 12400, hue: 265 },
  { id: "p6", kind: "photo", priceCents: 0, likes: 2890, hue: 335 },
];
