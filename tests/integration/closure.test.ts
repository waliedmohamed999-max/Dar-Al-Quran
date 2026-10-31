// Release gates: approval, access control, judging, final exam and retention, on the real database.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { withActor } from "@/lib/db";
import * as adhkar from "@/modules/adhkar/service";
import { gradeAttempt, decideCertificate } from "@/modules/assessments/service";
import { scholarlyDecision } from "@/modules/cms/service";
import * as finalExam from "@/modules/hadith/final-exam";
import * as judging from "@/modules/judging/service";
import { purgeExpiredRecordings } from "@/modules/learning/retention";
import * as learning from "@/modules/learning/service";
import { ayahsWhere, approvedTafsirSources, rulesForAyah } from "@/modules/quran/service";
import * as study from "@/modules/quran/study";
import { publicSearch } from "@/modules/site/service";
import * as u from "@/modules/unified/service";
import { db, demo, demoHalaqa, makeStudent } from "./helpers";

vi.mock("@/lib/storage", async (orig) => ({ ...(await orig<object>()), putObject: vi.fn(async () => undefined), deleteObject: vi.fn(async () => undefined), signedGetUrl: vi.fn(async () => "https://storage.test/signed") }));

let d: Awaited<ReturnType<typeof demo>>;
beforeAll(async () => { d = await demo(); });
afterEach(() => { process.env.APP_ENV = "test"; delete process.env.TAJWEED_COLOURS_APPROVED; adhkar.setPushSender(null); });

const audio = () => new File([Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(64)])], "a.webm");
const member = async () => makeStudent((await demoHalaqa()).id);

describe("approval gate in production", () => {
  it("treats demo approvals as unapproved on every read path", async () => {
    process.env.APP_ENV = "production";
    expect(await adhkar.approvedAdhkar()).toEqual([]);
    expect(await approvedTafsirSources()).toEqual([]);
    expect(await u.publicCompetitions().then((l) => l.filter((c) => c.isDemo))).toEqual([]);
    expect(await u.placementQuestions().then((q) => q.length)).toBe(0);
    expect((await publicSearch("الإدغام", "ar")).rules).toEqual([]);
    expect(await rulesForAyah(1)).toEqual([]);
    expect(await u.lessonQuestions("qalqalah")).toEqual([]);
    expect(await db().hadithEntry.count({ where: (await import("@/lib/scholarly")).approved() })).toBe(0);
  });
  it("hides machine colours until the supervisor decides, and never touches the text", async () => {
    process.env.APP_ENV = "production";
    const [hidden] = await ayahsWhere({ surahId: 112 });
    expect(hidden.spans).toBeNull();
    process.env.TAJWEED_COLOURS_APPROVED = "true";
    const [shown] = await ayahsWhere({ surahId: 112 });
    expect(shown.text).toBe(hidden.text);
    expect(shown.spans).not.toBeNull();
  });
  it("a real reviewer's approval does count in production", async () => {
    const x = await db().dhikr.create({ data: { category: "GENERAL", titleAr: "اختبار", text: "نص", sourceName: "مصدر", licenseNote: "اختبار", takhrij: "تخريج اختبار" } });
    await scholarlyDecision(d.superAdmin, "dhikr", x.id, true);
    process.env.APP_ENV = "production";
    expect((await adhkar.approvedAdhkar("GENERAL")).map((a) => a.id)).toEqual([x.id]);
    process.env.APP_ENV = "test";
    await db().dhikr.delete({ where: { id: x.id } });
  });
  it("refuses a favourite on an unapproved dhikr", async () => {
    const x = await db().dhikr.create({ data: { category: "GENERAL", titleAr: "اختبار", text: "نص", sourceName: "مصدر", licenseNote: "اختبار" } });
    await expect(adhkar.toggleFavorite(d.student, x.id)).rejects.toThrow();
    await db().dhikr.delete({ where: { id: x.id } });
  });
  it("requires documentation before approval", async () => {
    const dh = await db().dhikr.create({ data: { category: "GENERAL", titleAr: "اختبار", text: "نص", sourceName: "مصدر", licenseNote: "اختبار" } });
    await expect(scholarlyDecision(d.superAdmin, "dhikr", dh.id, true)).rejects.toThrow("dhikr_takhrij_required");
    await expect(scholarlyDecision(d.superAdmin, "dhikr", dh.id, false)).rejects.toThrow("rejection_reason_required");
    await scholarlyDecision(d.superAdmin, "dhikr", dh.id, false, "لم يثبت التخريج");
    const hist = await db().contentReview.findFirstOrThrow({ where: { targetId: dh.id } });
    expect(hist.reason).toBe("لم يثبت التخريج");
    expect(hist.contentSha).toHaveLength(64);
    expect(hist.reviewerId).toBe(d.superAdmin.id);
    await db().dhikr.delete({ where: { id: dh.id } });
    const h = await db().hadithEntry.findFirstOrThrow({ where: { grade: null } });
    await expect(scholarlyDecision(d.superAdmin, "hadith", h.id, true)).rejects.toThrow("hadith_grade_required");
  });
  it("cannot publish a track containing an unreviewed hadith", async () => {
    const col = await db().hadithCollection.findFirstOrThrow({ where: { slug: "nawawi-40" }, include: { entries: { take: 1 } } });
    const e = col.entries[0];
    await db().hadithEntry.update({ where: { id: e.id }, data: { reviewStatus: "PENDING" } });
    await expect(u.publishCollection(d.superAdmin, col.id, true)).rejects.toThrow("collection_not_fully_reviewed");
    await db().hadithEntry.update({ where: { id: e.id }, data: { reviewStatus: "APPROVED" } });
  });
  it("study resources stay hidden until approved, and need a source", async () => {
    const input = { kind: "TOPIC" as const, surahId: 112, fromAyah: 1, toAyah: 4, body: "نص من مرجع اختبار", sourceName: "مرجع", sourceRef: "ص 1", licenseNote: "اختبار" };
    expect(study.studyResourceSchema.safeParse({ ...input, sourceName: "" }).success).toBe(false);
    expect(study.studyResourceSchema.safeParse({ ...input, kind: "VOCABULARY" }).success).toBe(false);
    await expect(study.saveStudyResource(d.student, null, input)).rejects.toThrow();
    const r = await study.saveStudyResource(d.superAdmin, null, input);
    expect(await study.approvedStudyResources(112)).toEqual([]);
    await scholarlyDecision(d.superAdmin, "study_resource", r.id, true);
    expect((await study.approvedStudyResources(112)).map((x) => x.id)).toEqual([r.id]);
    await study.saveStudyResource(d.superAdmin, r.id, { ...input, body: "نص معدل من المرجع" });
    expect(await study.approvedStudyResources(112)).toEqual([]);
    await db().studyResource.delete({ where: { id: r.id } });
  });
});

describe("no user reads another student's record", () => {
  it("covers every student read path for an unrelated student, teacher and guardian", async () => {
    const victim = await member();
    const sid = victim.studentId!;
    const reads: [string, (a: typeof d.student) => Promise<unknown>][] = [
      ["progress", (a) => learning.studentProgress(a, sid).then((p) => { if (p.tasksDonePercent === null) throw new Error("empty"); return p; })],
      ["map", (a) => u.surahMap(a, sid).then((m) => { if (!m.rows.length) throw new Error("empty"); return m; })],
      ["queue", (a) => u.revisionQueue(a, sid).then((q) => { if (!q.length) throw new Error("empty"); return q; })],
      ["skills", (a) => u.currentSkills(a, sid).then((q) => { if (!q.length) throw new Error("empty"); return q; })],
      ["report", (a) => u.learningReport(a, sid, "month").then((r) => { if (r.tasksTotal === 0 && !r.recitations.length) throw new Error("empty"); return r; })],
    ];
    const rec = await learning.submitRecitation(victim, { surahId: 112, fromAyah: 1, toAyah: 4, consent: true, file: audio() });
    await db().memorizationRecord.create({ data: { studentId: sid, surahId: 112, fromAyah: 1, toAyah: 4, status: "APPROVED", nextReviewAt: new Date() } });
    await db().studentSkill.create({ data: { studentId: sid, skill: "memorization", level: 3, source: "t" } });
    await db().dailyTask.create({ data: { studentId: sid, date: new Date(), type: "NEW_MEMORIZATION", surahId: 112, fromAyah: 1, toAyah: 4 } });
    const outsider = await makeStudent();
    const blockedTeacher = d.teacher2;
    for (const [name, read] of reads) {
      await expect(read(outsider), `student: ${name}`).rejects.toThrow();
      await expect(read(d.guardian), `guardian: ${name}`).rejects.toThrow();
      await expect(read(blockedTeacher), `teacher: ${name}`).rejects.toThrow();
      await expect(read(victim), `self: ${name}`).resolves.toBeTruthy();
      await expect(read(d.teacher), `own teacher: ${name}`).resolves.toBeTruthy();
    }
    for (const a of [outsider, d.guardian, blockedTeacher]) await expect(learning.recitationAudioUrl(a, rec.id)).rejects.toThrow();
    await expect(learning.recitationAudioUrl(d.teacher, rec.id)).resolves.toHaveProperty("url");
  });
  it("a guardian reaches only a linked child, and loses access when the link is revoked", async () => {
    const child = d.minor.studentId!;
    await expect(u.learningReport(d.guardian, child, "week")).resolves.toBeTruthy();
    const link = await db().guardianStudentLink.findFirstOrThrow({ where: { studentId: child, guardianId: d.guardian.guardianId! } });
    const res = await withActor(d.guardian, (tx) => tx.student.count({ where: { id: child } }));
    expect(res).toBe(1);
    await db().guardianStudentLink.update({ where: { id: link.id }, data: { status: "REVOKED" } });
    expect(await withActor(d.guardian, (tx) => tx.student.count({ where: { id: child } }))).toBe(0);
    await db().guardianStudentLink.update({ where: { id: link.id }, data: { status: "APPROVED" } });
  });
  it("hadith, placement and exam recordings are closed to outsiders", async () => {
    const victim = await member();
    const h = await db().hadithEntry.findFirstOrThrow({ where: { reviewStatus: "APPROVED" } });
    const sub = await u.submitHadith(victim, h.id, true, audio());
    await u.savePlacementAudio(victim, "reading", true, audio());
    const p = await u.getPlacement(victim);
    const outsider = await makeStudent();
    for (const a of [outsider, d.guardian, d.teacher2]) {
      await expect(u.hadithAudio(a, sub.id)).rejects.toThrow();
      await expect(u.placementAudio(a, p.id, "reading")).rejects.toThrow();
    }
    await expect(u.hadithAudio(d.teacher, sub.id)).resolves.toHaveProperty("url");
  });
  it("the application role has no direct access to judging and study tables", async () => {
    for (const t of ["judging_scores", "judging_entries", "judging_sessions", "rubrics", "study_resources"]) {
      await expect(withActor(d.superAdmin, (tx) => tx.$queryRawUnsafe(`SELECT 1 FROM ${t} LIMIT 1`)), t).rejects.toThrow();
    }
  });
});

describe("retention covers every recording", () => {
  it("deletes hadith, placement and exam audio past the limit, and refuses to serve it", async () => {
    const s = await member();
    const h = await db().hadithEntry.findFirstOrThrow({ where: { reviewStatus: "APPROVED" } });
    const sub = await u.submitHadith(s, h.id, true, audio());
    await u.savePlacementAudio(s, "reading", true, audio());
    const p = await u.getPlacement(s);
    const old = new Date(Date.now() - 400 * 86400000);
    await db().hadithSubmission.update({ where: { id: sub.id }, data: { deleteAfter: old } });
    await db().file.updateMany({ where: { ownerId: s.id }, data: { createdAt: old } });
    const r = await purgeExpiredRecordings();
    expect(r.removed).toBeGreaterThanOrEqual(2);
    expect(await db().file.count({ where: { ownerId: s.id, deletedAt: null } })).toBe(0);
    await expect(u.hadithAudio(s, sub.id)).rejects.toThrow();
    await expect(u.placementAudio(s, p.id, "reading")).rejects.toThrow();
  });
});

describe("push subscriptions", () => {
  it("sends a test to the caller's own browsers and honours unsubscribe", async () => {
    const s = await makeStudent();
    const end = `https://push.test/${s.id}`;
    await adhkar.savePushSubscription(s, { endpoint: end, keys: { p256dh: "k", auth: "a" } });
    await db().adhkarPreference.create({ data: { userId: s.id, timezone: "Asia/Riyadh", enabled: true, pushEnabled: true } });
    const sent: string[] = [];
    adhkar.setPushSender(async (sub) => { sent.push(sub.endpoint); });
    expect(await adhkar.sendTestPush(s)).toEqual({ delivered: 1, total: 1 });
    expect(sent).toEqual([end]);
    await adhkar.removePushSubscription(s, end);
    expect(await db().pushSubscription.count({ where: { userId: s.id } })).toBe(0);
    expect((await db().adhkarPreference.findUniqueOrThrow({ where: { userId: s.id } })).pushEnabled).toBe(false);
    await expect(adhkar.sendTestPush(s)).rejects.toThrow("no_subscription");
  });
});

describe("oral judging", () => {
  const setup = async () => {
    const a = await member(), b = await member(), minor = await member();
    await db().student.update({ where: { id: minor.studentId! }, data: { isMinor: true } });
    const comp = await db().competition.findFirstOrThrow({ where: { isDemo: true } });
    const c = await db().competition.create({ data: { ...{ slug: `j-${Date.now()}`, title: "مسابقة تحكيم", description: "وصف", kind: "tajweed", level: "beginner", criteria: "معايير", resultsMethod: "طريقة", registrationOpensAt: new Date(0), registrationClosesAt: new Date(2e12), examStartsAt: new Date(0), examEndsAt: new Date(2e12), durationMin: 10, published: true, assessmentId: comp.assessmentId, createdById: d.admin.id } } });
    for (const [s, show] of [[a, true], [b, false], [minor, true]] as const) await u.registerCompetition(s, c.id, show);
    const rubric = await judging.createRubric(d.admin, { title: "نموذج", criteria: [{ labelAr: "الحفظ", guidanceAr: "دون خطأ", maxScore: 10, weight: 1 }, { labelAr: "التجويد", guidanceAr: "تطبيق الأحكام", maxScore: 20, weight: 1 }] });
    const crit = await db().rubricCriterion.findMany({ where: { rubricId: rubric.id }, orderBy: { sortOrder: "asc" } });
    const session = await judging.createSession(d.admin, { competitionId: c.id, rubricId: rubric.id, title: "جلسة", scheduledAt: new Date(), passPercent: 60, judgeIds: [d.teacher.id, d.teacher2.id] });
    const entries = await db().judgingEntry.findMany({ where: { sessionId: session.id } });
    const entryOf = (s: { studentId: string | null }) => entries.find((e) => e.studentId === s.studentId)!;
    return { a, b, minor, c, crit, session, entries, entryOf };
  };
  const full = (crit: { id: string }[], x: number, y: number) => ({ scores: [{ criterionId: crit[0].id, score: x }, { criterionId: crit[1].id, score: y }] });

  it("runs the whole session, keeps judges apart, and releases results only after approval", async () => {
    const s = await setup();
    await expect(judging.submitScores(d.teacher, s.entryOf(s.a).id, full(s.crit, 5, 5))).rejects.toThrow("session_not_open");
    await judging.openSession(d.teacher, s.session.id);
    await expect(judging.submitScores(d.supervisor, s.entryOf(s.a).id, full(s.crit, 5, 5))).rejects.toThrow();
    await expect(judging.submitScores(d.teacher, s.entryOf(s.a).id, full(s.crit, 11, 5))).rejects.toThrow("score_above_maximum");
    await judging.callEntry(d.teacher, s.entryOf(s.a).id, "ON_STAGE");
    await judging.callEntry(d.teacher, s.entryOf(s.b).id, "ON_STAGE");
    expect(await db().judgingEntry.count({ where: { sessionId: s.session.id, status: "ON_STAGE" } })).toBe(1);
    await judging.submitScores(d.teacher, s.entryOf(s.a).id, full(s.crit, 10, 20));
    const view = await judging.sessionConsole(d.teacher2, s.session.id);
    expect(view.entries.find((e) => e.id === s.entryOf(s.a).id)!.mine).toEqual([]);
    await expect(judging.closeSession(d.teacher, s.session.id)).rejects.toThrow("scores_incomplete");
    await judging.submitScores(d.teacher2, s.entryOf(s.a).id, full(s.crit, 8, 16));
    for (const [st, x, y] of [[s.b, 5, 10], [s.minor, 10, 20]] as const) for (const j of [d.teacher, d.teacher2]) await judging.submitScores(j, s.entryOf(st).id, full(s.crit, x, y));
    await judging.closeSession(d.teacher, s.session.id);
    await expect(judging.submitScores(d.teacher, s.entryOf(s.a).id, full(s.crit, 1, 1))).rejects.toThrow("session_not_open");
    expect(await judging.publicResults(s.c.id)).toEqual([]);
    expect(await judging.myJudging(s.a, s.c.id)).toEqual([]);
    await expect(judging.approveSession(d.teacher, s.session.id)).rejects.toThrow("judge_cannot_approve");
    await judging.approveSession(d.admin, s.session.id);
    await db().competition.update({ where: { id: s.c.id }, data: { resultsPublished: true } });

    const pub = await judging.publicResults(s.c.id);
    expect(pub.map((r) => r.percent)).toEqual([100, 90, 50]);
    expect(pub.find((r) => r.percent === 100)!.name).toBeNull();
    expect(pub.find((r) => r.percent === 90)!.name).toBe("طالب");
    expect(pub.find((r) => r.percent === 50)!.name).toBeNull();
    expect(JSON.stringify(pub)).not.toContain(s.minor.studentId!);
    const mine = await judging.myJudging(s.a, s.c.id);
    expect(mine[0].criteria[0].average).toBe(9);

    await expect(judging.fileJudgingAppeal(s.b, s.entryOf(s.a).id, "اعتراض على غيري")).rejects.toThrow();
    const ap = await judging.fileJudgingAppeal(s.b, s.entryOf(s.b).id, "راجعوا درجتي من فضلكم");
    await expect(judging.fileJudgingAppeal(s.b, s.entryOf(s.b).id, "اعتراض مكرر هنا")).rejects.toThrow("appeal_pending");
    await expect(judging.requestResultCertificate(d.admin, { evidenceType: "judging", evidenceId: s.entryOf(s.b).id, title: "شهادة" })).rejects.toThrow("appeal_pending");
    const done = await judging.decideAppeal(d.admin, ap.id, { approve: true, decision: "صححت", newScore: 65 });
    expect(done.previousScore).toBe(50);
    await expect(judging.decideAppeal(d.admin, ap.id, { approve: false, decision: "مرة أخرى" })).rejects.toThrow("already_decided");
    expect((await db().judgingEntry.findUniqueOrThrow({ where: { id: s.entryOf(s.b).id } })).finalPercent).toBe(65);

    const cert = await judging.requestResultCertificate(d.admin, { evidenceType: "judging", evidenceId: s.entryOf(s.b).id, title: "شهادة مسابقة" });
    expect(cert.status).toBe("PENDING_APPROVAL");
    expect(cert.issuedAt).toBeNull();
    await expect(judging.requestResultCertificate(d.admin, { evidenceType: "judging", evidenceId: s.entryOf(s.b).id, title: "مكررة" })).rejects.toThrow("certificate_exists");
    await expect(decideCertificate(d.admin, cert.id, true)).rejects.toThrow("requester_cannot_approve");
    expect((await decideCertificate(d.superAdmin, cert.id, true)).status).toBe("ISSUED");
  });
  it("panel members cannot approve their own session, and low results earn no certificate", async () => {
    const a = await member();
    const comp = await db().competition.findFirstOrThrow({ where: { isDemo: true } });
    await u.registerCompetition(a, comp.id, false);
    const rubric = await judging.createRubric(d.admin, { title: "نموذج واحد", criteria: [{ labelAr: "الحفظ", guidanceAr: "دون خطأ", maxScore: 10, weight: 1 }] });
    const crit = await db().rubricCriterion.findFirstOrThrow({ where: { rubricId: rubric.id } });
    const s = await judging.createSession(d.admin, { competitionId: comp.id, rubricId: rubric.id, title: "جلسة فردية", scheduledAt: new Date(), passPercent: 60, judgeIds: [d.admin.id] }).catch(async () => judging.createSession(d.admin, { competitionId: comp.id, rubricId: rubric.id, title: "جلسة فردية", scheduledAt: new Date(), passPercent: 60, judgeIds: [d.superAdmin.id] }));
    const judge = (await db().judgingJudge.findFirstOrThrow({ where: { sessionId: s.id } })).userId === d.admin.id ? d.admin : d.superAdmin;
    await judging.openSession(judge, s.id);
    for (const e of await db().judgingEntry.findMany({ where: { sessionId: s.id } })) await judging.submitScores(judge, e.id, { scores: [{ criterionId: crit.id, score: 2 }] });
    await judging.closeSession(judge, s.id);
    await expect(judging.approveSession(judge, s.id)).rejects.toThrow("judge_cannot_approve");
    await judging.approveSession(judge === d.admin ? d.superAdmin : d.admin, s.id);
    const e = await db().judgingEntry.findFirstOrThrow({ where: { sessionId: s.id, studentId: a.studentId! } });
    await expect(judging.requestResultCertificate(d.admin, { evidenceType: "judging", evidenceId: e.id, title: "شهادة" })).rejects.toThrow("result_below_pass");
  });
  it("students cannot manage sessions or see the console", async () => {
    await expect(judging.createRubric(d.student, { title: "نموذج", criteria: [{ labelAr: "الحفظ", guidanceAr: "دون خطأ", maxScore: 10, weight: 1 }] })).rejects.toThrow();
    const s = await db().judgingSession.findFirstOrThrow();
    await expect(judging.sessionConsole(d.student, s.id)).rejects.toThrow();
    await expect(judging.approveSession(d.student, s.id)).rejects.toThrow();
  });
});

describe("hadith final exam", () => {
  const opens = { completionCount: 3, recitationCount: 1, passPercent: 50, durationMin: 30, opensAt: new Date(Date.now() - 3600000), closesAt: new Date(Date.now() + 86400000) };
  it("needs a fully reviewed track, asks stored text, and leads to a human-approved certificate", async () => {
    const col = await db().hadithCollection.findFirstOrThrow({ where: { slug: "nawawi-40" }, include: { entries: { take: 1 } } });
    await db().hadithCollection.update({ where: { id: col.id }, data: { finalCompetitionId: null } });
    await expect(finalExam.buildFinalExam(d.student, col.id, opens)).rejects.toThrow();
    const e = col.entries[0];
    await db().hadithEntry.update({ where: { id: e.id }, data: { reviewStatus: "PENDING" } });
    await expect(finalExam.buildFinalExam(d.admin, col.id, opens)).rejects.toThrow("collection_not_fully_reviewed");
    await db().hadithEntry.update({ where: { id: e.id }, data: { reviewStatus: "APPROVED" } });

    const c = await finalExam.buildFinalExam(d.admin, col.id, opens);
    expect(c.published).toBe(false);
    await expect(finalExam.buildFinalExam(d.admin, col.id, opens)).rejects.toThrow("final_exam_exists");
    await expect(finalExam.publishFinalExam(d.teacher, col.id)).rejects.toThrow();
    await finalExam.publishFinalExam(d.superAdmin, col.id);

    const qs = await db().question.findMany({ where: { items: { some: { assessmentId: c.assessmentId } } } });
    const texts = (await db().hadithEntry.findMany({ where: { collectionId: col.id } })).map((h) => h.text);
    for (const q of qs.filter((x) => x.type === "COMPLETE_TEXT")) expect(texts.some((t) => t.endsWith(q.correctKey!))).toBe(true);

    const s = await member();
    await u.registerCompetition(s, c.id, false);
    const a = await u.startExam(s, c.id);
    for (const q of qs) if (q.type === "COMPLETE_TEXT") await u.saveAnswer(s, a.id, { questionId: q.id, textAnswer: q.correctKey! });
    const done = await u.finishExam(s, a.id);
    expect(done.status).toBe("SUBMITTED");
    await expect(judging.requestResultCertificate(d.admin, { evidenceType: "attempt", evidenceId: a.id, title: "شهادة" })).rejects.toThrow("result_not_final");
    expect(await db().certificate.count({ where: { studentId: s.studentId! } })).toBe(0);
    const graded = await gradeAttempt(d.teacher, a.id, { grades: qs.filter((q) => q.type === "RECITATION").map((q) => ({ questionId: q.id, ratio: 1 })) });
    expect(graded.scorePercent).toBe(100);
    const cert = await judging.requestResultCertificate(d.admin, { evidenceType: "attempt", evidenceId: a.id, title: "إتمام الأربعين النووية" });
    expect(cert.status).toBe("PENDING_APPROVAL");
    await db().hadithCollection.update({ where: { id: col.id }, data: { finalCompetitionId: null } });
  });
});

describe("segment difficulty", () => {
  it("only the student's teacher sets it, and it changes the suggested order", async () => {
    const s = await member();
    const m = await db().memorizationRecord.create({ data: { studentId: s.studentId!, surahId: 112, fromAyah: 1, toAyah: 4, status: "APPROVED", nextReviewAt: new Date() } });
    await expect(u.setSegmentDifficulty(d.teacher2, m.id, { difficulty: 5 })).rejects.toThrow();
    await expect(u.setSegmentDifficulty(s, m.id, { difficulty: 1 })).rejects.toThrow();
    const before = (await u.revisionQueue(d.teacher, s.studentId!))[0].score;
    await u.setSegmentDifficulty(d.teacher, m.id, { difficulty: 5, note: "متشابهات" });
    const after = (await u.revisionQueue(d.teacher, s.studentId!))[0];
    expect(after.score).toBeGreaterThan(before);
    expect(after.reasons).toContain("teacher_difficulty");
    expect((await db().memorizationRecord.findUniqueOrThrow({ where: { id: m.id } })).ease).toBe(m.ease);
  });
});
