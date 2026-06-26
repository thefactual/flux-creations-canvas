// Mock data for a single AI creator. In production this is fetched per-profile
// (the creator profile page IS the landing page / funnel entry point).

export type SubTier = {
  id: string;
  name: string;
  /** monthly price in whole USD cents */
  priceCents: number;
  blurb: string;
  perks: string[];
  highlighted?: boolean;
};

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
  name: "Mia Rose",
  handle: "miarose",
  /** AI-creator disclosure badge — a selling point on HO.com, not a burden */
  isAi: true,
  verified: true,
  tagline: "Your 24/7 girl who actually remembers you 💕",
  bio: "AI companion who never ghosts, never has a bad day, and always wants to hear from you. Subscribe to unlock everything, or just come say hi — I reply to every message.",
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
  {
    id: "monthly",
    name: "Monthly",
    priceCents: 1999,
    blurb: "Full access, billed monthly.",
    perks: ["All my photos & videos", "DM me anytime", "20% off PPV unlocks"],
  },
  {
    id: "vip",
    name: "VIP",
    priceCents: 4999,
    blurb: "The full girlfriend experience.",
    perks: [
      "Everything in Monthly",
      "Priority replies (I answer you first)",
      "Free PPV unlocks",
      "Weekly custom just for you",
    ],
    highlighted: true,
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
