import { create } from "zustand";
import { CREATOR } from "@/data/creator";

// Editable creator profile, persisted to localStorage so edits survive reloads.
// Seeded from the static CREATOR defaults on first run.

const STORAGE_KEY = "ho-profile-v1";

export type Profile = {
  name: string;
  handle: string;
  tagline: string;
  bio: string;
  location: string;
  /** uploaded avatar as a data URL; null = use the gradient fallback */
  avatarDataUrl: string | null;
  bannerDataUrl: string | null;
  avatarHue: number;
  bannerHue: number;
  /** base subscriber/like seed; live counts are derived on top of these */
  baseSubscribers: number;
  baseLikes: number;
};

const DEFAULT_PROFILE: Profile = {
  name: CREATOR.name,
  handle: CREATOR.handle,
  tagline: CREATOR.tagline,
  bio: CREATOR.bio,
  location: CREATOR.location,
  avatarDataUrl: null,
  bannerDataUrl: null,
  avatarHue: CREATOR.avatarHue,
  bannerHue: CREATOR.bannerHue,
  baseSubscribers: CREATOR.stats.subscribers,
  baseLikes: CREATOR.stats.likes,
};

function load(): Profile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROFILE;
    return { ...DEFAULT_PROFILE, ...(JSON.parse(raw) as Partial<Profile>) };
  } catch {
    return DEFAULT_PROFILE;
  }
}

function save(p: Profile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* storage full / unavailable — keep going with in-memory state */
  }
}

type State = {
  profile: Profile;
  update: (patch: Partial<Profile>) => void;
  reset: () => void;
};

export const useProfile = create<State>((set, get) => ({
  profile: load(),
  update: (patch) => {
    const next = { ...get().profile, ...patch };
    set({ profile: next });
    save(next);
  },
  reset: () => {
    set({ profile: DEFAULT_PROFILE });
    save(DEFAULT_PROFILE);
  },
}));

/** Non-React accessor (used by the chat store for the creator's display name). */
export const getProfile = () => useProfile.getState().profile;
