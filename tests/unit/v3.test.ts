import { describe, expect, it } from "vitest";
import { dueSlots, inDnd, isValidTimezone, localParts, prayerMinutes, type Prefs } from "@/modules/adhkar/engine";
import { gradeObjective } from "@/modules/assessments/service";
import { hiddenWordIndexes, segments, writtenRecallPercent } from "@/modules/hadith/exercises";
import { recommendTrack, revisionPriority } from "@/modules/unified/service";

const base: Prefs = { enabled: true, timezone: "Asia/Riyadh", categories: ["MORNING_EVENING", "SLEEP", "WAKING", "AFTER_PRAYER"], morningMin: 420, eveningMin: 1020, sleepMin: null, wakeMin: null, days: [0, 1, 2, 3, 4, 5, 6], dndStartMin: null, dndEndMin: null, minIntervalMin: 60, usePrayerTimes: false, latitude: null, longitude: null, calcMethod: "UmmAlQura", lastSentAt: null };

describe("adhkar scheduling", () => {
  it("fires at the user's local time, not server time", () => {
    expect(dueSlots(base, new Date("2026-03-01T04:02:00Z"))[0].slot).toBe("morning");
    expect(dueSlots(base, new Date("2026-03-01T07:02:00Z"))).toEqual([]);
  });
  it("keeps the same wall-clock time across daylight saving changes", () => {
    const ny = { ...base, timezone: "America/New_York" };
    // 07:00 New York is 12:00 UTC in winter and 11:00 UTC in summer.
    expect(dueSlots(ny, new Date("2026-03-07T12:03:00Z"))[0]?.slot).toBe("morning");
    expect(dueSlots(ny, new Date("2026-03-07T11:03:00Z"))).toEqual([]);
    expect(dueSlots(ny, new Date("2026-03-09T11:03:00Z"))[0]?.slot).toBe("morning");
    expect(dueSlots(ny, new Date("2026-03-09T12:03:00Z"))).toEqual([]);
    expect(localParts(new Date("2026-03-08T07:30:00Z"), "America/New_York").minutes).toBe(3 * 60 + 30);
  });
  it("uses the local date across midnight", () => {
    expect(localParts(new Date("2026-03-01T22:00:00Z"), "Asia/Riyadh").date).toBe("2026-03-02");
  });
  it("respects disabled state, days and categories", () => {
    const at = new Date("2026-03-01T04:02:00Z");
    expect(dueSlots({ ...base, enabled: false }, at)).toEqual([]);
    expect(dueSlots({ ...base, days: [1] }, at)).toEqual([]);
    expect(dueSlots({ ...base, categories: ["SLEEP"] }, at)).toEqual([]);
  });
  it("handles do-not-disturb windows that cross midnight", () => {
    expect(inDnd(23 * 60, 22 * 60, 6 * 60)).toBe(true);
    expect(inDnd(5 * 60, 22 * 60, 6 * 60)).toBe(true);
    expect(inDnd(12 * 60, 22 * 60, 6 * 60)).toBe(false);
    expect(dueSlots({ ...base, dndStartMin: 400, dndEndMin: 500 }, new Date("2026-03-01T04:02:00Z"))).toEqual([]);
  });
  it("enforces the minimum interval and sends one slot at a time", () => {
    const at = new Date("2026-03-01T04:02:00Z");
    expect(dueSlots({ ...base, lastSentAt: new Date(at.getTime() - 10 * 60000) }, at)).toEqual([]);
    expect(dueSlots({ ...base, sleepMin: 420 }, at)).toHaveLength(1);
  });
  it("computes plausible prayer times in order", () => {
    const p = prayerMinutes({ latitude: 24.71, longitude: 46.68, calcMethod: "UmmAlQura", timezone: "Asia/Riyadh" }, { year: 2026, month: 3, day: 1 })!;
    expect(p.fajr).toBeGreaterThan(4 * 60);
    expect(p.fajr).toBeLessThan(p.sunrise);
    expect(p.sunrise).toBeLessThan(p.dhuhr);
    expect(p.dhuhr).toBeLessThan(p.asr);
    expect(p.asr).toBeLessThan(p.maghrib);
    expect(p.maghrib).toBeLessThan(p.isha);
  });
  it("needs a location for prayer times, and rejects bad zones", () => {
    expect(prayerMinutes({ latitude: null, longitude: null, calcMethod: "UmmAlQura", timezone: "UTC" }, { year: 2026, month: 1, day: 1 })).toBeNull();
    expect(isValidTimezone("Mars/Base")).toBe(false);
    expect(isValidTimezone("Africa/Cairo")).toBe(true);
  });
});

describe("hadith exercises", () => {
  const text = "إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ، وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى";
  it("recall ignores diacritics and reflects missing words", () => {
    expect(writtenRecallPercent(text, "إنما الأعمال بالنيات وإنما لكل امرئ ما نوى")).toBe(100);
    expect(writtenRecallPercent(text, "إنما الأعمال")).toBe(25);
    expect(writtenRecallPercent(text, "")).toBe(0);
  });
  it("segments rebuild the original text", () => {
    expect(segments(text).join(" ")).toBe(text);
    expect(segments(text).length).toBeGreaterThanOrEqual(2);
  });
  it("hides a stable share of words", () => {
    expect(hiddenWordIndexes(20, 50, 3).size).toBe(10);
    expect([...hiddenWordIndexes(20, 50, 3)]).toEqual([...hiddenWordIndexes(20, 50, 3)]);
    expect(hiddenWordIndexes(20, 0).size).toBe(0);
    expect(hiddenWordIndexes(5, 100).size).toBe(5);
  });
});

describe("exam grading", () => {
  it("grades objective types", () => {
    expect(gradeObjective({ type: "TRUE_FALSE", correctKey: "t" }, { selectedKey: "t" })).toBe(1);
    expect(gradeObjective({ type: "COMPLETE_TEXT", correctKey: "قطب جد" }, { textAnswer: "قُطْبُ جَدٍّ" })).toBe(1);
    expect(gradeObjective({ type: "ORDER", correctKey: "a,b,c" }, { textAnswer: "b,a,c" })).toBe(0);
  });
  it("leaves recitation and oral answers to a person", () => {
    for (const type of ["RECITATION", "ORAL", "PRACTICAL"]) expect(gradeObjective({ type, correctKey: null }, { textAnswer: "x" })).toBeNull();
  });
});

describe("recommendations", () => {
  it("maps profiles to tracks", () => {
    expect(recommendTrack({ experience: "none", goal: "memorize", memorizedJuz: 0 })).toBe("foundation");
    expect(recommendTrack({ experience: "some", goal: "read" })).toBe("recitation_correction");
    expect(recommendTrack({ experience: "some", goal: "memorize", memorizedJuz: 0 })).toBe("memorization_beginner");
    expect(recommendTrack({ experience: "regular", goal: "memorize", memorizedJuz: 20, memorizationPercent: 100 })).toBe("advanced_exam_prep");
    expect(recommendTrack({ experience: "regular", goal: "memorize", memorizedJuz: 5, memorizationPercent: 0 })).toBe("consolidation");
  });
  it("prioritizes overdue and weak segments", () => {
    const now = new Date("2026-03-10");
    const fresh = { nextReviewAt: new Date("2026-03-10"), ease: 2.5, repetitions: 5, ayahCount: 5, lastQuality: 5 };
    expect(revisionPriority({ ...fresh, nextReviewAt: new Date("2026-03-01") }, now)).toBeGreaterThan(revisionPriority(fresh, now));
    expect(revisionPriority({ ...fresh, lastQuality: 1 }, now)).toBeGreaterThan(revisionPriority(fresh, now));
    expect(revisionPriority({ ...fresh, ease: 1.5 }, now)).toBeGreaterThan(revisionPriority(fresh, now));
  });
});
