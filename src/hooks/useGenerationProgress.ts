import { useEffect, useState } from 'react';

/**
 * Realistic generation-progress hook.
 *
 * Returns a percentage (0–100) and the elapsed seconds for a generation.
 * The percentage uses an asymptotic curve toward 99%:
 *   pct = 99 * (1 - exp(-elapsed / tau))
 * where `tau` is tuned per model so a "typical" job hits ~63% at the
 * expected midpoint and ~95% at ~3× the expected duration.
 *
 * When `isComplete` flips true (i.e. Realtime delivered the final URL),
 * we snap to 100% immediately. When `isFailed` flips true, the bar stops.
 *
 * The hook only ticks (1 Hz) while the job is active — no wasted renders
 * once the generation finishes.
 */

// Median expected wall-clock duration (seconds) per surface/model.
// Tuned from observed real-world latency. Adjust freely as data accrues.
const IMAGE_EXPECTED_S: Record<string, number> = {
  'nano-banana-pro': 22,
  'nano-banana-2': 14,
  'seedream-4': 18,
  'seedream-5-lite': 12,
  'grok-imagine': 28,
  'kling': 25,
  'flux': 30,
  'wan': 32,
};
const IMAGE_DEFAULT_S = 25;

const VIDEO_EXPECTED_S: Record<string, number> = {
  'kling-v3-pro': 180,
  'kling-v2.5-turbo-pro': 110,
  'kling-v2.6-pro': 160,
  'kling-o3-pro': 170,
  'kling-omni-edit': 150,
  'kling-o1-edit-pro': 150,
  'kling-v3-motion': 150,
  'ev-kling-v3-motion': 110,
  'kling-v2.6-motion-pro': 140,
  'kling-v2.6-motion-std': 120,
  'veo-3.1': 220,
  'veo-3.1-fast': 130,
  'veo-3.1-lite': 110,
  'minimax-video': 140,
  'pixverse-v6': 140,
  'ltx-2-19b': 110,
  'rw-seedance-1.5-pro': 150,
  'rw-runway-gen4.5': 200,
  'rw-sora-2': 220,
  'rw-kling-2.5': 130,
  'rw-veo-3.1': 220,
  'rw-veo-3.1-fast': 130,
  'grok-imagine': 180,
  'grok-imagine-edit': 180,
};
const VIDEO_DEFAULT_S = 160;

// Marketing-studio jobs go through script → keyframe → video, so they're slower.
const MARKETING_EXPECTED_S: Record<string, number> = {
  scripting: 200,
  keyframing: 160,
  keyframe_ready: 140,
  videoing: 130,
  default: 220,
};

export type ProgressKind = 'image' | 'video' | 'marketing';

export type UseGenerationProgressArgs = {
  kind: ProgressKind;
  startedAt: number;
  isComplete: boolean;
  isFailed: boolean;
  /** Image: model id. Video: model id. Marketing: stage label. */
  hint?: string;
  /** Marketing duration ('8s' etc.) bumps tau upward for longer outputs. */
  durationSeconds?: number;
};

function expectedTau({ kind, hint, durationSeconds }: UseGenerationProgressArgs): number {
  if (kind === 'image') {
    return IMAGE_EXPECTED_S[hint || ''] ?? IMAGE_DEFAULT_S;
  }
  if (kind === 'video') {
    const base = VIDEO_EXPECTED_S[hint || ''] ?? VIDEO_DEFAULT_S;
    // Longer clips take proportionally longer.
    if (durationSeconds && durationSeconds > 6) {
      return base * (1 + (durationSeconds - 6) / 12); // +~8% per extra second
    }
    return base;
  }
  // marketing
  const base = MARKETING_EXPECTED_S[hint || 'default'] ?? MARKETING_EXPECTED_S.default;
  if (durationSeconds && durationSeconds > 6) {
    return base * (1 + (durationSeconds - 6) / 14);
  }
  return base;
}

export function useGenerationProgress(args: UseGenerationProgressArgs): { pct: number; elapsed: number } {
  const { startedAt, isComplete, isFailed } = args;
  const [, tick] = useState(0);

  useEffect(() => {
    if (isComplete || isFailed) return;
    const t = setInterval(() => tick((n) => (n + 1) % 1_000_000), 1000);
    return () => clearInterval(t);
  }, [isComplete, isFailed]);

  if (isComplete) return { pct: 100, elapsed: Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) };

  const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const tau = expectedTau(args);
  // Asymptotic curve toward 99%. Reaches ~63% at tau and ~95% at 3× tau.
  const raw = 99 * (1 - Math.exp(-elapsed / tau));
  const pct = isFailed ? Math.min(99, raw) : Math.min(99, Math.max(1, raw));
  return { pct, elapsed };
}
