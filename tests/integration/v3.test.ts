// Unified learning system: real database, no mocks except the push transport.
import * as judging from "@/modules/judging/service";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { withActor } from "@/lib/db";
import * as adhkar from "@/modules/adhkar/service";
import { gradeAttempt } from "@/modules/assessments/service";
import * as learning from "@/modules/learning/service";
import * as u from "@/modules/unified/service";
import { db, demo, demoHalaqa, makeStudent } from "./helpers";

vi.mock("@/lib/storage", async (orig) => ({ ...(await orig<object>()), putObject: vi.fn(async () => undefined), signedGetUrl: vi.fn(async () => "https://storage.test/signed") }));

let d: Awaited<ReturnType<typeof demo>>;
beforeAll(async () => { d = await demo(); });
afterEach(() => adhkar.setPushSender(null));

const audio = () => new File([Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(64)])], "a.webm");
const member = async () => makeStudent((await demoHalaqa()).id);
const firstHadith = () => db().hadithEntry.findFirstOrThrow({ where: { reviewStatus: "APPROVED" }, orderBy: { number: "asc" } });

describe("content integrity and review gates", () => {
  it("imports all 42 hadiths with hashes, and invents no grades or explanations", async () => {
    const all = await db().hadithEntry.findMany();
    expect(all).toHaveLength(42);
    expect(all.every((h) => h.sha256.length === 64 && !h.explanation)).toBe(true);
    expect(all.filter((h) => h.grade && h.gradeSource !== "مرجع اختبار")).toHaveLength(0);
  });
  it("hides pending adhkar and hadith from the application role", async () => {
    const dh = await db().dhikr.create({ data: { category: "GENERAL", titleAr: "اختبار", text: "نص قيد المراجعة", sourceName: "اختبار", licenseNote: "اختبار" } });
    const h = await firstHadith();
    await db().hadithEntry.update({ where: { id: h.id }, data: { reviewStatus: "PENDING" } });
    expect(await withActor(d.student, (tx) => tx.dhikr.count({ where: { id: dh.id } }))).toBe(0);
    expect(await withActor(d.student, (tx) => tx.hadithEntry.count({ where: { id: h.id } }))).toBe(0);
    expect((await adhkar.approvedAdhkar("GENERAL")).some((x) => x.id === dh.id)).toBe(false);
    await expect(u.startHadith(d.student, h.id)).rejects.toThrow();
    await db().hadithEntry.update({ where: { id: h.id }, data: { reviewStatus: "APPROVED" } });
    await db().dhikr.delete({ where: { id: dh.id } });
  });
  it("editing a dhikr returns it to review, and an explanation needs a source", async () => {
    const x = await db().dhikr.findFirstOrThrow({ where: { reviewStatus: "APPROVED" } });
    const input = { category: x.category, titleAr: x.titleAr, text: x.text, sourceName: x.sourceName, licenseNote: x.licenseNote };
    await expect(adhkar.saveDhikr(d.teacher, x.id, input)).rejects.toThrow();
    await expect(adhkar.saveDhikr(d.admin, x.id, { ...input, explanation: "شرح" })).rejects.toThrow(/explanation_source_required/);
    expect((await adhkar.saveDhikr(d.admin, x.id, input)).reviewStatus).toBe("PENDING");
    await db().dhikr.update({ where: { id: x.id }, data: { reviewStatus: "APPROVED", reviewedBy: "demo-seed" } });
  });
});

describe("adhkar reminders", () => {
  const prefs = { enabled: true, timezone: "Asia/Riyadh", categories: ["MORNING_EVENING" as const], morningMin: 420, eveningMin: 1020, sleepMin: null, wakeMin: null, dndStartMin: null, dndEndMin: null, days: [0, 1, 2, 3, 4, 5, 6], minIntervalMin: 60, pushEnabled: true, usePrayerTimes: false, latitude: null, longitude: null, calcMethod: "UmmAlQura" };
  it("is off by default and is private to its user", async () => {
    const s = await makeStudent();
    expect(await db().adhkarPreference.count({ where: { userId: s.id } })).toBe(0);
    await adhkar.savePreferences(s, prefs);
    expect(await withActor(d.student2, (tx) => tx.adhkarPreference.count({ where: { userId: s.id } }))).toBe(0);
    await expect(withActor(d.student2, (tx) => tx.adhkarPreference.update({ where: { userId: s.id }, data: { enabled: false } }))).rejects.toThrow();
  });
  it("sends once per slot even when dispatched repeatedly, logs it and pushes silently", async () => {
    const s = await makeStudent();
    await adhkar.savePreferences(s, prefs);
    await adhkar.savePushSubscription(s, { endpoint: `https://push.test/${s.id}`, keys: { p256dh: "k", auth: "a" } });
    const sent: string[] = [];
    adhkar.setPushSender(async (sub) => { sent.push(sub.endpoint); });
    const at = new Date("2030-03-03T04:02:00Z");
    await adhkar.dispatchAdhkar(at);
    await adhkar.dispatchAdhkar(new Date(at.getTime() + 60000));
    expect(await db().notification.count({ where: { userId: s.id, type: "adhkar.reminder" } })).toBe(1);
    expect(sent.filter((e) => e.includes(s.id))).toHaveLength(1);
    expect(await db().adhkarNotificationLog.findFirst({ where: { userId: s.id } })).toMatchObject({ slot: "morning", channel: "PUSH" });
  });
  it("removes a subscription the browser reports as gone", async () => {
    const s = await makeStudent();
    await adhkar.savePreferences(s, prefs);
    await adhkar.savePushSubscription(s, { endpoint: `https://push.test/gone-${s.id}`, keys: { p256dh: "k", auth: "a" } });
    adhkar.setPushSender(async () => { throw Object.assign(new Error("gone"), { statusCode: 410 }); });
    await adhkar.dispatchAdhkar(new Date("2031-03-03T04:02:00Z"));
    expect(await db().pushSubscription.count({ where: { userId: s.id } })).toBe(0);
  });
  it("rounds stored coordinates and requires them for prayer times", async () => {
    const s = await makeStudent();
    await expect(adhkar.savePreferences(s, { ...prefs, usePrayerTimes: true })).rejects.toThrow(/location_required/);
    const row = await adhkar.savePreferences(s, { ...prefs, usePrayerTimes: true, latitude: 24.71357, longitude: 46.67529 });
    expect([row.latitude, row.longitude]).toEqual([24.71, 46.68]);
  });
  it("keeps no count of how much a person recites", async () => {
    const cols = await db().$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name LIKE 'adhkar%' AND column_name ILIKE '%count%'`;
    expect(cols[0].n).toBe(0);
  });
});

describe("hadith academy", () => {
  it("assignment, recitation and teacher mastery, with isolation", async () => {
    const s = await member();
    const h = await firstHadith();
    await expect(u.assignHadith(d.teacher2, { studentIds: [s.studentId!], hadithIds: [h.id] })).rejects.toThrow();
    await u.assignHadith(d.teacher, { studentIds: [s.studentId!], hadithIds: [h.id], reciteBy: new Date() });
    await expect(u.submitHadith(s, h.id, false, audio())).rejects.toThrow(/consent_required/);
    const sub = await u.submitHadith(s, h.id, true, audio());
    expect((await db().hadithMemorization.findFirstOrThrow({ where: { studentId: s.studentId! } })).status).toBe("SUBMITTED");
    await expect(u.hadithAudio(d.teacher2, sub.id)).rejects.toThrow();
    await expect(u.hadithAudio(d.student2, sub.id)).rejects.toThrow();
    expect((await u.hadithAudio(d.teacher, sub.id)).url).toContain("signed");
    const rev = { memorizationScore: 5, understandingScore: 4, decision: "APPROVED" as const };
    await expect(u.reviewHadith(d.teacher2, sub.id, rev)).rejects.toThrow();
    await u.reviewHadith(d.teacher, sub.id, rev);
    const m = await db().hadithMemorization.findFirstOrThrow({ where: { studentId: s.studentId! } });
    expect(m).toMatchObject({ status: "MASTERED", approvedById: d.teacher.id });
    expect(m.nextReviewAt).not.toBeNull();
  });
  it("a student cannot mark their own mastery through the application role", async () => {
    const s = await member();
    const h = await firstHadith();
    const m = await u.startHadith(s, h.id);
    expect(m.status).toBe("PRACTICING");
    await expect(withActor(s, (tx) => tx.hadithMemorization.update({ where: { id: m.id }, data: { status: "MASTERED" } }))).rejects.toThrow();
  });
  it("a minor needs guardian consent to submit", async () => {
    await expect(u.submitHadith(d.minor, (await firstHadith()).id, true, audio())).rejects.toThrow(/guardian_consent_required/);
  });
});

describe("hadith documentation management", () => {
  it("needs a named reference, returns to review, and only reviewers publish", async () => {
    const h = await db().hadithEntry.findFirstOrThrow({ where: { number: 2 } });
    expect(u.hadithEditSchema.safeParse({ text: h.text, grade: "صحيح" }).success).toBe(false);
    expect(u.hadithEditSchema.safeParse({ text: h.text, explanation: "شرح" }).success).toBe(false);
    await expect(u.editHadith(d.teacher, h.id, { text: h.text })).rejects.toThrow();
    const r = await u.editHadith(d.admin, h.id, { text: h.text, grade: "اختبار", gradeSource: "مرجع اختبار", vocabulary: [{ word: "كلمة", meaning: "معنى" }] });
    expect(r.reviewStatus).toBe("PENDING");
    await db().hadithEntry.update({ where: { id: h.id }, data: { reviewStatus: "APPROVED", reviewedBy: "demo-seed", grade: null, gradeSource: null, vocabulary: undefined } });
    await expect(u.publishCollection(d.teacher, h.collectionId, true)).rejects.toThrow();
    await u.publishCollection(d.admin, h.collectionId, true);
  });
});

describe("placement to plan: the unified flow", () => {
  const intake = { ageGroup: "adult" as const, experience: "regular" as const, goal: "memorize" as const, memorizedJuz: 1, format: "group" as const, days: [0, 2] };
  const skills = { reading_accuracy: 4, reading_fluency: 3, tajweed_knowledge: 3, tajweed_application: 2, memorization: 3, memorization_retention: 2, quran_understanding: 3 };
  it("new student to approved skills, plan, recitation, ayah mastery, revision and report", async () => {
    const s = await member();
    const sid = s.studentId!;
    await expect(u.submitPlacement(s)).rejects.toThrow(/intake_incomplete/);
    await u.saveIntake(s, intake);
    const qs = await u.placementQuestions();
    expect(JSON.stringify(qs)).not.toContain("correctKey");
    const correct = await db().question.findMany({ where: { id: { in: qs.map((q) => q.id) } } });
    const p1 = await u.savePlacementTajweed(s, Object.fromEntries(correct.map((q) => [q.id, q.correctKey!])));
    expect(p1.tajweedPercent).toBe(100);
    const check = await u.memorizationCheck(114);
    const ordered = [...check.order].sort((a, b) => a.id - b.id).map((a) => a.id);
    const p2 = await u.savePlacementMemorization(s, { surahId: 114, promptId: check.nextAyah!.promptId, chosenId: check.nextAyah!.promptId + 1, orderIds: ordered });
    expect(p2.memorizationPercent).toBe(100);
    await u.savePlacementAudio(s, "reading", true, audio());
    const sent = await u.submitPlacement(s);
    expect(sent.recommendedTrack).toBe("memorization_intermediate");
    await expect(u.saveIntake(s, intake)).rejects.toThrow(/placement_submitted/);

    // Nothing about the student's level is decided before a person reviews it.
    expect((await db().student.findUniqueOrThrow({ where: { id: sid } })).track).toBeNull();
    const review = { skills, track: "consolidation" as const, note: "يحتاج إلى تثبيت" };
    await expect(u.reviewPlacement(d.teacher2, sent.id, review)).rejects.toThrow();
    await expect(u.reviewPlacement(s, sent.id, review)).rejects.toThrow();
    await u.reviewPlacement(d.teacher, sent.id, review);
    expect((await db().student.findUniqueOrThrow({ where: { id: sid } })).track).toBe("consolidation");
    const profile = await u.currentSkills(s, sid);
    expect(profile).toHaveLength(7);
    expect(profile.every((x) => x.source === "teacher_placement" && x.assessedById === d.teacher.id)).toBe(true);

    // Plan and day.
    await learning.createPlan(d.teacher, { studentId: sid, dailyMinutes: 45, newAyahsPerDay: 3, studyDays: [0, 1, 2, 3, 4, 5, 6], direction: "REVERSE", cursorAyah: 1 });
    expect((await learning.generateDay(s, sid, new Date())).length).toBeGreaterThan(0);

    // Practice states never become mastery.
    await u.updateAyahRange(s, { surahId: 114, fromAyah: 1, toAyah: 6, status: "READY" });
    await expect(u.updateAyahRange(s, { surahId: 114, fromAyah: 1, toAyah: 6, status: "MASTERED" })).rejects.toThrow();

    // Recitation, then teacher review updates the map, schedule and report.
    const sub = await db().recitationSubmission.create({ data: { studentId: sid, surahId: 114, fromAyah: 1, toAyah: 6, consentGivenBy: s.id, deleteAfter: new Date(Date.now() + 1e9) } });
    await learning.reviewSubmission(d.teacher, sub.id, { memorizationScore: 4, tajweedScore: 4, fluencyScore: 4, revisionScore: 4, decision: "APPROVED", mistakes: [] });
    const map = await u.surahMap(s, sid);
    expect(map.summary[114].MASTERED).toBe(6);

    // A student update cannot overwrite the teacher's decision.
    await u.updateAyahRange(s, { surahId: 114, fromAyah: 1, toAyah: 6, status: "PRACTICING" });
    expect((await u.surahMap(s, sid)).summary[114].MASTERED).toBe(6);

    const queue = await u.revisionQueue(s, sid);
    expect(queue[0]).toMatchObject({ surahId: 114 });
    await learning.gradeRevision(d.teacher, queue[0].id, { quality: 1 });
    expect((await u.surahMap(s, sid)).summary[114].NEEDS_REVIEW).toBe(6);

    const report = await u.learningReport(d.teacher, sid, "week");
    expect(report.recitations).toHaveLength(1);
    expect(report.bySurah[114].NEEDS_REVIEW).toBe(6);
    expect(report.revisionCount).toBe(1);
    const outsider = await u.learningReport(d.student2, sid, "week");
    expect(outsider.recitations).toHaveLength(0);
    expect(outsider.tasksTotal).toBe(0);
  });
  it("memorization checks use stored ayahs, and reject wrong answers", async () => {
    const s = await makeStudent();
    const c = await u.memorizationCheck(114);
    const stored = await db().quranAyah.findMany({ where: { surahId: 114 } });
    for (const o of c.order) expect(stored.some((a) => a.id === o.id && a.text === o.text)).toBe(true);
    const wrong = await u.savePlacementMemorization(s, { surahId: 114, promptId: c.nextAyah!.promptId, chosenId: c.nextAyah!.promptId + 2, orderIds: [...c.order].sort((a, b) => b.id - a.id).map((a) => a.id) });
    expect(wrong.memorizationPercent).toBe(0);
  });
  it("placement recordings are refused to other teachers", async () => {
    const s = await member();
    await u.savePlacementAudio(s, "reading", true, audio());
    const p = await u.getPlacement(s);
    await expect(u.placementAudio(d.teacher2, p.id, "reading")).rejects.toThrow();
    expect((await u.placementAudio(d.teacher, p.id, "reading")).url).toContain("signed");
  });
});

describe("competitions", () => {
  const comp = () => db().competition.findFirstOrThrow({ where: { slug: "demo-tajweed" } });
  const answerAll = async (actor: typeof d.student, attemptId: string) => {
    const v = await u.examView(actor, attemptId);
    expect(JSON.stringify(v)).not.toContain("correctKey");
    const qs = await db().question.findMany({ where: { id: { in: v.questions.map((q) => q.id) } } });
    for (const q of qs) {
      if (q.type === "RECITATION") continue;
      await u.saveAnswer(actor, attemptId, q.type === "MULTIPLE_CHOICE" || q.type === "TRUE_FALSE" ? { questionId: q.id, selectedKey: q.correctKey! } : { questionId: q.id, textAnswer: q.correctKey! });
    }
    return qs;
  };
  it("registration, autosave, resume, human grading, results, leaderboard and appeal", async () => {
    const c = await comp();
    const s = await member();
    await expect(u.startExam(s, c.id)).rejects.toThrow();
    await u.registerCompetition(s, c.id, true);
    const a = await u.startExam(s, c.id);
    expect((await u.startExam(s, c.id)).id).toBe(a.id);
    const qs = await answerAll(s, a.id);
    await expect(u.saveAnswer(d.student2, a.id, { questionId: qs[0].id, selectedKey: "a" })).rejects.toThrow();
    await expect(u.saveAnswer(s, a.id, { questionId: "other", selectedKey: "a" })).rejects.toThrow(/unknown_question/);
    const rec = qs.find((q) => q.type === "RECITATION")!;
    await u.saveAudioAnswer(s, a.id, rec.id, true, audio());
    await expect(u.examAnswerAudio(d.teacher2, a.id, rec.id)).rejects.toThrow();
    expect((await u.examAnswerAudio(d.teacher, a.id, rec.id)).url).toContain("signed");
    const done = await u.finishExam(s, a.id);
    expect(done.status).toBe("SUBMITTED");
    await expect(u.finishExam(s, a.id)).rejects.toThrow(/already_submitted/);
    const graded = await gradeAttempt(d.teacher, a.id, { grades: [{ questionId: rec.id, ratio: 1 }] });
    expect(graded).toMatchObject({ status: "GRADED", scorePercent: 100 });
    expect(await u.leaderboard(c.id)).toEqual([]);
    await expect(u.publishResults(d.student, c.id)).rejects.toThrow();
    await u.publishResults(d.admin, c.id);
    expect((await u.leaderboard(c.id)).some((r) => r.score === 100)).toBe(true);
    await db().competition.update({ where: { id: c.id }, data: { resultsPublished: false } });
    await expect(u.fileAppeal(d.student2, a.id, "اعتراض على النتيجة")).rejects.toThrow();
    const ap = await u.fileAppeal(s, a.id, "اعتراض على النتيجة");
    await expect(judging.decideAppeal(d.student, ap.id, { approve: true, decision: "x" })).rejects.toThrow();
    expect((await judging.decideAppeal(d.admin, ap.id, { approve: false, decision: "روجعت" })).status).toBe("REJECTED");
    expect(await db().examEvent.count({ where: { attemptId: a.id } })).toBeGreaterThanOrEqual(3);
  });
  it("enforces windows, the server clock and attempt limits", async () => {
    const c = await comp();
    const s = await member();
    await expect(u.registerCompetition(s, c.id, false, new Date(c.registrationClosesAt.getTime() + 1000))).rejects.toThrow(/registration_closed/);
    await u.registerCompetition(s, c.id, false);
    await expect(u.startExam(s, c.id, new Date(c.examEndsAt.getTime() + 1000))).rejects.toThrow(/exam_not_open/);
    const a1 = await u.startExam(s, c.id);
    const q = ((a1.questionOrder as string[]))[0];
    await expect(u.saveAnswer(s, a1.id, { questionId: q, selectedKey: "a" }, new Date(a1.expiresAt!.getTime() + 1000))).rejects.toThrow(/time_expired/);
    await u.finishExam(s, a1.id);
    const a2 = await u.startExam(s, c.id);
    expect(a2.attemptNo).toBe(2);
    await u.finishExam(s, a2.id);
    await expect(u.startExam(s, c.id)).rejects.toThrow(/no_attempts_left/);
  });
  it("closes an expired attempt instead of resuming it", async () => {
    const c = await comp();
    const s = await member();
    await u.registerCompetition(s, c.id, false);
    const a = await u.startExam(s, c.id);
    const b = await u.startExam(s, c.id, new Date(a.expiresAt!.getTime() + 1000));
    expect(b.id).not.toBe(a.id);
    expect((await db().assessmentAttempt.findUniqueOrThrow({ where: { id: a.id } })).status).not.toBe("IN_PROGRESS");
  });
  it("never lists minors on a leaderboard, even with the box ticked", async () => {
    const c = await comp();
    const r = await u.registerCompetition(d.minor, c.id, true);
    expect(r.showOnLeaderboard).toBe(false);
  });
});

describe("study records", () => {
  it("scores lesson quizzes on the server", async () => {
    const s = await makeStudent();
    const qs = await u.lessonQuestions("qalqalah");
    expect(JSON.stringify(qs)).not.toContain("correctKey");
    const full = await db().question.findMany({ where: { id: { in: qs.map((q) => q.id) } } });
    expect((await u.submitLessonQuiz(s, "qalqalah", Object.fromEntries(full.map((q) => [q.id, q.correctKey!])))).scorePercent).toBe(100);
    expect((await db().lessonProgress.findFirstOrThrow({ where: { studentId: s.studentId! } })).completedAt).not.toBeNull();
    await expect(u.lessonNote(d.teacher2, s.studentId!, "qalqalah", "x")).rejects.toThrow();
  });
  it("ayah notes stay private to their author", async () => {
    await u.saveAyahNote(d.student, 1, "ملاحظتي");
    expect((await u.getAyahNote(d.student, 1))?.body).toBe("ملاحظتي");
    expect(await u.getAyahNote(d.teacher, 1)).toBeNull();
    await u.saveAyahNote(d.student, 1, "");
    expect(await u.getAyahNote(d.student, 1)).toBeNull();
  });
  it("word rules come only from approved rules overlapping that word", async () => {
    const a = await db().tajweedAnnotation.findUniqueOrThrow({ where: { ayahId: 2 } });
    const spans = JSON.parse(a.markup) as [number, number, string][];
    const withRule = spans.find((s) => ["n", "p", "q", "g", "f"].includes(s[2]))!;
    const rules = await u.wordRules(2, withRule[0], withRule[1]);
    expect(rules.length).toBeGreaterThan(0);
    expect(await u.wordRules(2, 9000, 9001)).toEqual([]);
  });
});
