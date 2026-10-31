// Suggests a day's tasks from a plan, the student's records and available time. Pure: the service
// supplies the data and persists the result, and teachers can edit anything it produces.
import type { TaskType } from "@/generated/prisma/enums";

export type SurahInfo = { id: number; ayahCount: number };
export type DueRevision = { id: string; surahId: number; fromAyah: number; toAyah: number; nextReviewAt: Date };
export type PlanInput = {
  dailyMinutes: number;
  newAyahsPerDay: number;
  cursorSurah: number;
  cursorAyah: number;
  direction: "REVERSE" | "FORWARD";
};
export type SuggestedTask = {
  type: TaskType;
  surahId?: number;
  fromAyah?: number;
  toAyah?: number;
  ruleSlug?: string;
  suggestedMinutes: number;
  sortOrder: number;
  revisionOfId?: string;
};

/** Takes `count` new ayahs from the cursor without crossing a surah. Null once all are done. */
export function nextSegment(plan: PlanInput, surahs: SurahInfo[], count: number) {
  const surah = surahs.find((s) => s.id === plan.cursorSurah);
  if (!surah || plan.cursorAyah > surah.ayahCount) return null;
  const toAyah = Math.min(surah.ayahCount, plan.cursorAyah + Math.max(1, count) - 1);
  return { surahId: surah.id, fromAyah: plan.cursorAyah, toAyah };
}

/** Where the cursor goes after a segment. Reverse order runs from An-Nas to Al-Baqarah. */
export function advanceCursor(plan: PlanInput, surahs: SurahInfo[], toAyah: number) {
  const surah = surahs.find((s) => s.id === plan.cursorSurah)!;
  if (toAyah < surah.ayahCount) return { cursorSurah: surah.id, cursorAyah: toAyah + 1 };
  const next = plan.direction === "REVERSE" ? surah.id - 1 : surah.id + 1;
  if (next < 1 || next > 114) return { cursorSurah: surah.id, cursorAyah: surah.ayahCount + 1 };
  return { cursorSurah: next, cursorAyah: 1 };
}

/**
 * Time budget: revision first, since retention protects what is already memorized, then new
 * memorization, then study tasks. Near = last studied segments, far = older material.
 */
export function suggestDay(opts: {
  plan: PlanInput;
  surahs: SurahInfo[];
  due: DueRevision[];
  recentIds: Set<string>;
  tajweedSlug?: string;
}): SuggestedTask[] {
  const { plan, surahs, due, recentIds, tajweedSlug } = opts;
  const tasks: SuggestedTask[] = [];
  let remaining = plan.dailyMinutes;
  let order = 0;
  const push = (t: Omit<SuggestedTask, "sortOrder">) => {
    tasks.push({ ...t, sortOrder: order++ });
    remaining -= t.suggestedMinutes;
  };

  const segment = nextSegment(plan, surahs, plan.newAyahsPerDay);
  const newCost = segment ? Math.max(5, (segment.toAyah - segment.fromAyah + 1) * 2) : 0;
  const listenCost = segment ? 5 : 0;
  const reciteCost = segment ? 5 : 0;
  const reserve = newCost + listenCost + reciteCost;

  const ordered = [...due].sort((a, b) => a.nextReviewAt.getTime() - b.nextReviewAt.getTime());
  for (const r of ordered) {
    const cost = Math.max(3, Math.ceil((r.toAyah - r.fromAyah + 1) * 0.75));
    if (remaining - cost < reserve && tasks.length > 0) break;
    push({
      type: recentIds.has(r.id) ? "NEAR_REVISION" : "FAR_REVISION",
      surahId: r.surahId,
      fromAyah: r.fromAyah,
      toAyah: r.toAyah,
      suggestedMinutes: cost,
      revisionOfId: r.id,
    });
  }

  if (segment && remaining >= 5) {
    push({ type: "LISTENING", ...segment, suggestedMinutes: listenCost });
    push({ type: "NEW_MEMORIZATION", ...segment, suggestedMinutes: Math.min(newCost, Math.max(5, remaining - reciteCost)) });
    push({ type: "RECITATION", ...segment, suggestedMinutes: reciteCost });
  }
  if (tajweedSlug && remaining >= 5) push({ type: "TAJWEED", ruleSlug: tajweedSlug, suggestedMinutes: 5 });
  if (segment && remaining >= 5) push({ type: "TAFSIR", surahId: segment.surahId, fromAyah: segment.fromAyah, toAyah: segment.fromAyah, suggestedMinutes: 5 });
  return tasks;
}

/** Share of accountable tasks completed. Carried-over tasks count once, on their final day. */
export function completionPercent(tasks: { status: string }[]): number {
  const counted = tasks.filter((t) => t.status !== "CARRIED_OVER");
  if (counted.length === 0) return 0;
  return Math.round((counted.filter((t) => t.status === "DONE").length / counted.length) * 100);
}
