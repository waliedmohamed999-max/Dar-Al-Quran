// Spaced repetition based on SM-2. Intervals respond to the teacher's graded quality rather than
// fixed days, and a teacher's decision always overrides the computed date. Pure, no I/O.

export type SrsState = { ease: number; intervalDays: number; repetitions: number };

export const MIN_EASE = 1.3;
export const MAX_INTERVAL = 120;

/** quality: 1 (needs much more work) .. 5 (excellent) */
export function nextReview(state: SrsState, quality: number, overrideDays?: number): SrsState {
  if (!Number.isInteger(quality) || quality < 1 || quality > 5) throw new RangeError("quality must be 1..5");
  // SM-2's 0..5 scale, shifted: 1 -> 1 ... 5 -> 5.
  const ease = Math.max(MIN_EASE, state.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  let repetitions: number;
  let intervalDays: number;
  if (quality < 3) {
    repetitions = 0;
    intervalDays = 1;
  } else {
    repetitions = state.repetitions + 1;
    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 3;
    else intervalDays = Math.round(state.intervalDays * ease);
  }
  intervalDays = Math.min(MAX_INTERVAL, Math.max(1, intervalDays));
  if (overrideDays !== undefined) intervalDays = overrideDays;
  return { ease: Number(ease.toFixed(3)), intervalDays, repetitions };
}

export const addDays = (d: Date, days: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days));
export const dayOnly = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
