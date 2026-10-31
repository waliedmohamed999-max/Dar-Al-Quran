import { describe, expect, it } from "vitest";
import { advanceCursor, completionPercent, nextSegment, suggestDay, type PlanInput } from "@/modules/learning/planner";
import { MAX_INTERVAL, MIN_EASE, nextReview } from "@/modules/learning/srs";
import { summarizeProgress } from "@/modules/learning/service";

const surahs = [{ id: 112, ayahCount: 4 }, { id: 113, ayahCount: 5 }, { id: 114, ayahCount: 6 }];
const plan: PlanInput = { dailyMinutes: 45, newAyahsPerDay: 3, cursorSurah: 114, cursorAyah: 1, direction: "REVERSE" };

describe("spaced repetition", () => {
  const s0 = { ease: 2.5, intervalDays: 1, repetitions: 0 };
  it("responds to quality rather than fixed days", () => {
    const good = nextReview({ ...s0, intervalDays: 10, repetitions: 3 }, 5);
    const ok = nextReview({ ...s0, intervalDays: 10, repetitions: 3 }, 3);
    expect(good.intervalDays).toBeGreaterThan(ok.intervalDays);
  });
  it("resets after a weak attempt", () => {
    const r = nextReview({ ease: 2.5, intervalDays: 30, repetitions: 5 }, 2);
    expect(r).toMatchObject({ intervalDays: 1, repetitions: 0 });
    expect(r.ease).toBeLessThan(2.5);
  });
  it("keeps ease and interval within limits", () => {
    let s = s0;
    for (let i = 0; i < 20; i++) s = nextReview(s, 1);
    expect(s.ease).toBe(MIN_EASE);
    expect(nextReview({ ease: 2.5, intervalDays: 100, repetitions: 9 }, 5).intervalDays).toBe(MAX_INTERVAL);
  });
  it("lets the teacher's decision override the calculation", () => {
    expect(nextReview(s0, 5, 14).intervalDays).toBe(14);
  });
  it("rejects invalid quality", () => {
    expect(() => nextReview(s0, 6)).toThrow(RangeError);
    expect(() => nextReview(s0, 0)).toThrow(RangeError);
  });
});

describe("planner", () => {
  it("does not cross a surah boundary", () => {
    expect(nextSegment({ ...plan, cursorAyah: 5 }, surahs, 3)).toEqual({ surahId: 114, fromAyah: 5, toAyah: 6 });
  });
  it("moves the cursor backward in reverse order", () => {
    expect(advanceCursor(plan, surahs, 6)).toEqual({ cursorSurah: 113, cursorAyah: 1 });
    expect(advanceCursor(plan, surahs, 3)).toEqual({ cursorSurah: 114, cursorAyah: 4 });
  });
  it("stops at the end instead of leaving the Quran's range", () => {
    expect(advanceCursor({ ...plan, cursorSurah: 1, direction: "REVERSE" }, [{ id: 1, ayahCount: 7 }], 7)).toEqual({ cursorSurah: 1, cursorAyah: 8 });
    expect(nextSegment({ ...plan, cursorSurah: 1, cursorAyah: 8 }, [{ id: 1, ayahCount: 7 }], 3)).toBeNull();
  });
  it("includes all learning activities for a normal day", () => {
    const types = suggestDay({ plan, surahs, due: [], recentIds: new Set(), tajweedSlug: "qalqalah" }).map((t) => t.type);
    expect(types).toEqual(expect.arrayContaining(["NEW_MEMORIZATION", "LISTENING", "RECITATION", "TAJWEED", "TAFSIR"]));
  });
  it("puts revision first and labels recent and older material", () => {
    const due = [
      { id: "old", surahId: 113, fromAyah: 1, toAyah: 5, nextReviewAt: new Date("2026-01-01") },
      { id: "new", surahId: 112, fromAyah: 1, toAyah: 4, nextReviewAt: new Date("2026-01-02") },
    ];
    const tasks = suggestDay({ plan, surahs, due, recentIds: new Set(["new"]) });
    expect(tasks[0]).toMatchObject({ type: "FAR_REVISION", revisionOfId: "old" });
    expect(tasks[1]).toMatchObject({ type: "NEAR_REVISION", revisionOfId: "new" });
  });
  it("respects a short time budget", () => {
    const tasks = suggestDay({ plan: { ...plan, dailyMinutes: 15 }, surahs, due: [], recentIds: new Set(), tajweedSlug: "x" });
    expect(tasks.reduce((n, t) => n + t.suggestedMinutes, 0)).toBeLessThanOrEqual(25);
  });
});

describe("completion figures", () => {
  it("does not count carried-over rows twice", () => {
    expect(completionPercent([{ status: "CARRIED_OVER" }, { status: "DONE" }, { status: "PENDING" }])).toBe(50);
  });
  it("is zero with nothing to measure", () => {
    expect(completionPercent([])).toBe(0);
  });
  it("summarizes only actual records and does not double count overlaps", () => {
    const p = summarizeProgress({
      mem: [
        { status: "APPROVED", surahId: 114, fromAyah: 1, toAyah: 3 },
        { status: "APPROVED", surahId: 114, fromAyah: 2, toAyah: 4 },
        { status: "IN_PROGRESS", surahId: 113, fromAyah: 1, toAyah: 5 },
      ],
      tasks: [{ status: "DONE" }, { status: "CARRIED_OVER" }, { status: "PENDING" }],
      attendance: [{ status: "PRESENT" }, { status: "ABSENT" }, { status: "EXCUSED" }],
      reviews: [{ memorizationScore: 4, tajweedScore: 3, fluencyScore: 5, revisionScore: 4, mistakes: [{ category: "tajweed" }, { category: "tajweed" }] }],
      revisions: [{ quality: 4 }, { quality: 5 }],
      badges: [],
    });
    expect(p.ayahsApproved).toBe(4);
    expect(p.tasksDonePercent).toBe(50);
    expect(p.attendancePercent).toBe(50);
    expect(p.revisionMastery).toBe(4.5);
    expect(p.weakAreas).toEqual([{ category: "tajweed", count: 2 }]);
  });
  it("shows no figure when there are no records, rather than zero", () => {
    const p = summarizeProgress({ mem: [], tasks: [], attendance: [], reviews: [], revisions: [], badges: [] });
    expect(p.attendancePercent).toBeNull();
    expect(p.tasksDonePercent).toBeNull();
    expect(p.revisionMastery).toBeNull();
  });
});
