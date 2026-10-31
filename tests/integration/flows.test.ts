import { beforeAll, describe, expect, it, vi } from "vitest";
import { withActor } from "@/lib/db";
import * as assess from "@/modules/assessments/service";
import * as halaqat from "@/modules/halaqat/service";
import * as learning from "@/modules/learning/service";
import { addDays, dayOnly } from "@/modules/learning/srs";
import * as people from "@/modules/people/service";
import { buildReport, exportReport, toPdf } from "@/modules/reports/service";
import { tafsirFor } from "@/modules/quran/service";
import * as cms from "@/modules/cms/service";
import { db, demo, demoHalaqa, makeStudent } from "./helpers";

let d: Awaited<ReturnType<typeof demo>>;
beforeAll(async () => { d = await demo(); });

async function submission(teacherHalaqaId: string, surahId = 112) {
  const s = await makeStudent(teacherHalaqaId);
  const sub = await db().recitationSubmission.create({
    data: { studentId: s.studentId!, surahId, fromAyah: 1, toAyah: 4, consentGivenBy: s.id, deleteAfter: addDays(new Date(), 30) },
  });
  return { s, sub };
}

describe("halaqa enrollment", () => {
  it("fills capacity, waitlists, and promotes on withdrawal", async () => {
    const h = await halaqat.createHalaqa(d.admin, { name: `اختبار ${Date.now()}`, level: 1, gender: "ANY", capacity: 1, mode: "IN_PERSON", schedule: [] });
    const [a, b] = [await makeStudent(), await makeStudent()];
    const ea = await halaqat.requestEnrollment(a, h.id, a.studentId!);
    const eb = await halaqat.requestEnrollment(b, h.id, b.studentId!);
    expect(ea.status).toBe("PENDING");
    expect((await halaqat.decideEnrollment(d.admin, ea.id, true)).status).toBe("ACTIVE");
    expect((await halaqat.decideEnrollment(d.admin, eb.id, true)).status).toBe("WAITLISTED");
    await halaqat.withdrawEnrollment(a, ea.id);
    expect((await db().enrollment.findUniqueOrThrow({ where: { id: eb.id } })).status).toBe("ACTIVE");
  });
  it("cannot exceed capacity under concurrent approvals", async () => {
    const h = await halaqat.createHalaqa(d.admin, { name: `تزامن ${Date.now()}`, level: 1, gender: "ANY", capacity: 2, mode: "IN_PERSON", schedule: [] });
    const students = await Promise.all([1, 2, 3, 4].map(() => makeStudent()));
    const es = await Promise.all(students.map((s) => halaqat.requestEnrollment(s, h.id, s.studentId!)));
    await Promise.all(es.map((e) => halaqat.decideEnrollment(d.admin, e.id, true)));
    expect(await db().enrollment.count({ where: { halaqaId: h.id, status: "ACTIVE" } })).toBe(2);
  });
  it("a student cannot enroll someone else", async () => {
    const h = await demoHalaqa();
    await expect(halaqat.requestEnrollment(d.student2, h.id, d.student.studentId!)).rejects.toThrow();
  });
  it("encrypts meeting links and shows them only to members", async () => {
    const h = await halaqat.createHalaqa(d.admin, { name: `رابط ${Date.now()}`, level: 1, gender: "ANY", capacity: 5, mode: "REMOTE", meetingUrl: "https://meet.example/abc", schedule: [] });
    expect((await db().halaqa.findUniqueOrThrow({ where: { id: h.id } })).meetingUrlEnc).not.toContain("meet.example");
    await expect(halaqat.meetingLinkFor(d.student2, h.id)).rejects.toThrow();
    const member = await makeStudent(h.id);
    expect(await halaqat.meetingLinkFor(member, h.id)).toBe("https://meet.example/abc");
  });
  it("records attendance only for members and notifies guardians about absence", async () => {
    const h = await demoHalaqa();
    const session = await db().halaqaSession.create({ data: { halaqaId: h.id, startsAt: new Date(Date.now() + Math.random() * 1e10), endsAt: new Date(Date.now() + 2e10) } });
    await expect(halaqat.recordAttendance(d.teacher, session.id, { records: [{ studentId: d.student2.studentId!, status: "PRESENT" }] })).rejects.toThrow();
    const before = await db().notification.count({ where: { userId: d.guardian.id, type: "attendance.absent" } });
    await halaqat.recordAttendance(d.teacher, session.id, { records: [{ studentId: d.minor.studentId!, status: "ABSENT" }] });
    expect(await db().notification.count({ where: { userId: d.guardian.id, type: "attendance.absent" } })).toBe(before + 1);
  });
  it("gives a substitute teacher temporary access to the students", async () => {
    const h = await demoHalaqa();
    const s = await makeStudent(h.id);
    const see = () => withActor(d.teacher2, (tx) => tx.student.count({ where: { id: s.studentId! } }));
    expect(await see()).toBe(0);
    const session = await db().halaqaSession.create({ data: { halaqaId: h.id, startsAt: new Date(Date.now() + 86400000 + Math.random() * 1e8), endsAt: new Date(Date.now() + 90000000) } });
    await halaqat.setSubstitute(d.admin, session.id, d.teacher2.teacherId!);
    expect(await see()).toBe(1);
    await db().halaqaSession.delete({ where: { id: session.id } });
  });
});

describe("daily program", () => {
  it("generates a day once, and moves the cursor once", async () => {
    const h = await demoHalaqa();
    const s = await makeStudent(h.id);
    await learning.createPlan(d.teacher, { studentId: s.studentId!, dailyMinutes: 45, newAyahsPerDay: 3, studyDays: [0, 1, 2, 3, 4, 5, 6], direction: "REVERSE", cursorAyah: 1 });
    const date = new Date();
    const first = await learning.generateDay(s, s.studentId!, date);
    const again = await learning.generateDay(s, s.studentId!, date);
    expect(first.length).toBeGreaterThan(0);
    expect(again.map((t) => t.id).sort()).toEqual(first.map((t) => t.id).sort());
    const plan = await db().learningPlan.findFirstOrThrow({ where: { studentId: s.studentId! } });
    expect(plan.cursorAyah).toBe(4);
    const task = first.find((t) => t.type === "NEW_MEMORIZATION")!;
    expect([task.surahId, task.fromAyah, task.toAyah]).toEqual([114, 1, 3]);
  });
  it("only the student or their teacher can generate a day, and concurrency stays safe", async () => {
    const s = await makeStudent((await demoHalaqa()).id);
    await learning.createPlan(d.teacher, { studentId: s.studentId!, dailyMinutes: 45, newAyahsPerDay: 3, studyDays: [0, 1, 2, 3, 4, 5, 6], direction: "REVERSE", cursorAyah: 1 });
    await expect(learning.generateDay(d.student2, s.studentId!, new Date())).rejects.toThrow();
    await expect(learning.generateDay(d.teacher2, s.studentId!, new Date())).rejects.toThrow();
    await expect(learning.generateDay(d.guardian, s.studentId!, new Date())).rejects.toThrow();
    const runs = await Promise.all([1, 2, 3].map(() => learning.generateDay(s, s.studentId!, new Date())));
    expect(new Set(runs.flat().map((t) => t.id)).size).toBe(runs[0].length);
  });
  it("completing new memorization records progress without approving it", async () => {
    const s = await makeStudent((await demoHalaqa()).id);
    const t = await db().dailyTask.create({ data: { studentId: s.studentId!, date: new Date(), type: "NEW_MEMORIZATION", surahId: 112, fromAyah: 1, toAyah: 4 } });
    await learning.updateTask(s, t.id, { status: "DONE" });
    expect((await db().memorizationRecord.findFirstOrThrow({ where: { studentId: s.studentId! } })).status).toBe("IN_PROGRESS");
  });
  it("skips non-study days", async () => {
    const s = await makeStudent((await demoHalaqa()).id);
    const date = new Date();
    const other = (date.getUTCDay() + 1) % 7;
    await learning.createPlan(d.teacher, { studentId: s.studentId!, dailyMinutes: 30, newAyahsPerDay: 2, studyDays: [other], direction: "REVERSE", cursorAyah: 1 });
    expect(await learning.generateDay(d.teacher, s.studentId!, date)).toEqual([]);
  });
  it("carrying over keeps the original and links the new task", async () => {
    const s = await makeStudent((await demoHalaqa()).id);
    const t = await db().dailyTask.create({ data: { studentId: s.studentId!, date: dayOnly(new Date()), type: "LISTENING", surahId: 112, fromAyah: 1, toAyah: 4 } });
    const moved = await learning.rescheduleTask(s, t.id, addDays(new Date(), 1));
    expect(moved.carriedFromId).toBe(t.id);
    expect((await db().dailyTask.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("CARRIED_OVER");
    await expect(learning.rescheduleTask(s, t.id, addDays(new Date(), 2))).rejects.toThrow();
    await expect(learning.updateTask(s, t.id, { status: "DONE" })).rejects.toThrow();
  });
  it("assigns to a group but rejects a student outside the teacher's scope", async () => {
    const h = await demoHalaqa();
    const [a, b] = [await makeStudent(h.id), await makeStudent(h.id)];
    const base = { date: new Date(), type: "LISTENING" as const, surahId: 112, fromAyah: 1, toAyah: 4, suggestedMinutes: 5 };
    expect(await learning.assignTasks(d.teacher, { ...base, studentIds: [a.studentId!, b.studentId!] })).toHaveLength(2);
    await expect(learning.assignTasks(d.teacher, { ...base, studentIds: [d.student2.studentId!] })).rejects.toThrow();
    await expect(learning.assignTasks(d.teacher, { ...base, toAyah: 99, studentIds: [a.studentId!] })).rejects.toThrow(/ayah_out_of_range/);
  });
  it("a student cannot add a teacher's note", async () => {
    const s = await makeStudent();
    const t = await db().dailyTask.create({ data: { studentId: s.studentId!, date: new Date(), type: "LISTENING" } });
    await expect(learning.updateTask(s, t.id, { teacherNote: "x" })).rejects.toThrow();
  });
});

describe("teacher review", () => {
  const rubric = { memorizationScore: 4, tajweedScore: 4, fluencyScore: 3, revisionScore: 4, mistakes: [] };
  it("approval records memorization, schedules revision and awards a badge", async () => {
    const { s, sub } = await submission((await demoHalaqa()).id);
    await learning.reviewSubmission(d.teacher, sub.id, { ...rubric, decision: "APPROVED" });
    const m = await db().memorizationRecord.findFirstOrThrow({ where: { studentId: s.studentId! } });
    expect(m.status).toBe("APPROVED");
    expect(m.approvedById).toBe(d.teacher.id);
    expect(m.nextReviewAt).not.toBeNull();
    expect(await db().studentBadge.count({ where: { studentId: s.studentId! } })).toBe(1);
  });
  it("asking to recite again does not approve anything", async () => {
    const { s, sub } = await submission((await demoHalaqa()).id);
    await learning.reviewSubmission(d.teacher, sub.id, { ...rubric, decision: "RESUBMIT" });
    expect((await db().memorizationRecord.findFirstOrThrow({ where: { studentId: s.studentId! } })).status).toBe("NEEDS_RETRY");
    expect((await learning.studentProgress(s, s.studentId!)).ayahsApproved).toBe(0);
  });
  it("another teacher cannot review or see the submission", async () => {
    const { sub } = await submission((await demoHalaqa()).id);
    await expect(learning.reviewSubmission(d.teacher2, sub.id, { ...rubric, decision: "APPROVED" })).rejects.toThrow();
  });
  it("graded revision moves the next date by quality, and overrides are recorded", async () => {
    const { s, sub } = await submission((await demoHalaqa()).id);
    await learning.reviewSubmission(d.teacher, sub.id, { ...rubric, decision: "APPROVED" });
    const m = await db().memorizationRecord.findFirstOrThrow({ where: { studentId: s.studentId! } });
    const weak = await learning.gradeRevision(d.teacher, m.id, { quality: 1 });
    expect(weak.intervalAfter).toBe(1);
    const manual = await learning.gradeRevision(d.teacher, m.id, { quality: 5, overrideDays: 30 });
    expect(manual).toMatchObject({ intervalAfter: 30, overridden: true });
  });
  it("blocks a minor's upload until a guardian consents", async () => {
    const file = new File([Buffer.alloc(32)], "a.webm");
    await expect(learning.submitRecitation(d.minor, { surahId: 112, fromAyah: 1, toAyah: 4, consent: true, file })).rejects.toThrow(/guardian_consent_required/);
    await people.setRecordingConsent(d.guardian, d.minor.studentId!, true);
    await expect(learning.submitRecitation(d.minor, { surahId: 112, fromAyah: 1, toAyah: 4, consent: true, file })).rejects.toThrow(/unsupported_audio_type/);
    await people.setRecordingConsent(d.guardian, d.minor.studentId!, false);
  });
  it("refuses consent from an unlinked guardian", async () => {
    await expect(people.setRecordingConsent(d.guardian, d.student.studentId!, true)).rejects.toThrow();
  });
  it("rejects a recording without the student's consent", async () => {
    await expect(learning.submitRecitation(d.student, { surahId: 112, fromAyah: 1, toAyah: 4, consent: false, file: new File(["x"], "a") })).rejects.toThrow(/consent_required/);
  });
});

describe("assessments and certificates", () => {
  it("grades choice answers on the server and holds practical ones for the teacher", async () => {
    const h = await demoHalaqa();
    const s = await makeStudent(h.id);
    const a = await db().assessment.findFirstOrThrow({ where: { title: "[تجريبي] اختبار تجويد قصير" }, include: { items: { include: { question: true } } } });
    const view = await assess.assessmentForStudent(s, a.id);
    expect(JSON.stringify(view)).not.toContain("correctKey");
    const answers = a.items.map((i) => i.question.type === "MULTIPLE_CHOICE" ? { questionId: i.questionId, selectedKey: i.question.correctKey! } : { questionId: i.questionId, textAnswer: "مثال" });
    const att = await assess.submitAttempt(s, a.id, { answers });
    expect(att.status).toBe("SUBMITTED");
    await expect(assess.submitAttempt(s, a.id, { answers })).rejects.toThrow(/already_submitted/);
    const practical = a.items.find((i) => i.question.type === "PRACTICAL")!;
    const graded = await assess.gradeAttempt(d.teacher, att.id, { grades: [{ questionId: practical.questionId, ratio: 1 }] });
    expect(graded).toMatchObject({ status: "GRADED", scorePercent: 100 });
  });
  it("needs approval from someone other than the requester, then verifies publicly", async () => {
    const s = await makeStudent((await demoHalaqa()).id);
    const c = await assess.requestCertificate(d.teacher, { studentId: s.studentId!, title: "شهادة اختبار" });
    expect(c.status).toBe("PENDING_APPROVAL");
    expect(await assess.verifyCertificate(c.code)).toBeNull();
    const own = await assess.requestCertificate(d.admin, { studentId: s.studentId!, title: "طلب المدير" });
    await expect(assess.decideCertificate(d.admin, own.id, true)).rejects.toThrow(/requester_cannot_approve/);
    await assess.decideCertificate(d.admin, c.id, true);
    const v = await assess.verifyCertificate(c.code);
    expect(v?.status).toBe("ISSUED");
    expect(JSON.stringify(v)).not.toMatch(/@|userId|studentId/);
    await assess.revokeCertificate(d.admin, c.id);
    expect((await assess.verifyCertificate(c.code))?.status).toBe("REVOKED");
  });
});

describe("guardian reports", () => {
  it("shows a linked child's progress and refuses anyone else's", async () => {
    const p = await learning.studentProgress(d.guardian, d.minor.studentId!);
    expect(p.attendancePercent).not.toBeNull();
    const other = await learning.studentProgress(d.guardian, d.student.studentId!);
    expect(other.tasksCounted).toBe(0);
    expect(other.ayahsApproved).toBe(0);
  });
  it("a link request reveals nothing about whether the student exists", async () => {
    expect(await people.requestGuardianLink(d.guardian, { studentEmail: "nobody@test.invalid", relation: "ولي" })).toEqual({ ok: true });
  });
  it("needs official verification to approve", async () => {
    const s = await makeStudent();
    const l = await db().guardianStudentLink.create({ data: { guardianId: d.guardian.guardianId!, studentId: s.studentId!, relation: "ولي" } });
    await expect(people.decideGuardianLink(d.admin, l.id, true, false)).rejects.toThrow(/verification_required/);
    expect((await people.decideGuardianLink(d.admin, l.id, true, true)).status).toBe("APPROVED");
  });
  it("messages only pass between a guardian and the child's teacher", async () => {
    await expect(people.sendMessage(d.guardian, { studentId: d.student.studentId!, recipientId: d.teacher.id, body: "x" })).rejects.toThrow();
    await expect(people.sendMessage(d.guardian, { studentId: d.minor.studentId!, recipientId: d.teacher2.id, body: "x" })).rejects.toThrow();
    expect(await people.sendMessage(d.guardian, { studentId: d.minor.studentId!, recipientId: d.teacher.id, body: "السلام عليكم" })).toBeTruthy();
  });
});

describe("reports and permissions", () => {
  it("scopes a teacher's report to their own students", async () => {
    const r = await buildReport(d.teacher, { type: "students" });
    const names = r.rows.map((x) => x[0]);
    expect(names).toContain("[تجريبي] طالب أول");
    expect(names).not.toContain("[تجريبي] طالب ثان");
  });
  it("refuses exports to a student", async () => {
    await expect(exportReport(d.student, { type: "students" }, "csv")).rejects.toThrow();
  });
  it("writes an audit row for each export", async () => {
    const before = await db().auditLog.count({ where: { action: "report.export" } });
    const res = await exportReport(d.admin, { type: "attendance" }, "xlsx");
    expect(res.headers.get("Content-Type")).toContain("spreadsheet");
    expect(await db().auditLog.count({ where: { action: "report.export" } })).toBe(before + 1);
  });
  it("produces a valid PDF with Arabic", async () => {
    const pdf = await toPdf({ title: "Report", columns: ["الطالب"], rows: [["طالب تجريبي"]] });
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });
  it("cannot self-assign or change one's own status", async () => {
    await expect(people.setRole(d.student, d.student.id, "admin", true)).rejects.toThrow();
    await expect(people.setUserStatus(d.admin, d.admin.id, "SUSPENDED")).rejects.toThrow();
  });
  it("an admin cannot create another admin; only a super admin can", async () => {
    await expect(people.createUserByStaff(d.admin, { name: "x y", email: `a${Date.now()}@test.invalid`, role: "admin" })).rejects.toThrow();
  });
});

describe("tafsir caching", () => {
  it("hides unapproved sources", async () => {
    await db().tafsirSource.update({ where: { slug: "baghawi" }, data: { status: "PENDING" } });
    await expect(tafsirFor(1, "baghawi")).rejects.toThrow();
    await db().tafsirSource.update({ where: { slug: "baghawi" }, data: { status: "APPROVED" } });
  });
  it("stores a provider response with an expiry and serves it from cache", async () => {
    await db().tafsirEntry.deleteMany({ where: { ayahId: 2 } });
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ tafsir: { text: '<span class="x">نص</span> من المصدر' } })));
    const a = await tafsirFor(2, "muyassar");
    expect(a.text).toBe("نص من المصدر");
    const row = await db().tafsirEntry.findFirstOrThrow({ where: { ayahId: 2 } });
    expect(row.expiresAt!.getTime()).toBeGreaterThan(Date.now());
    expect(row.expiresAt!.getTime()).toBeLessThanOrEqual(Date.now() + 7.1 * 86400000);
    await tafsirFor(2, "muyassar");
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
  it("reports unavailable instead of inventing text when the provider fails", async () => {
    await db().tafsirEntry.deleteMany({ where: { ayahId: 3 } });
    const spy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("down"));
    expect((await tafsirFor(3, "muyassar")).text).toBeNull();
    spy.mockRestore();
  });
});

describe("cms", () => {
  it("publishes only through review, and sanitizes the body", async () => {
    const c = await cms.upsertContent(d.admin, null, { type: "ARTICLE", slug: `t-${Date.now()}`, locale: "ar", title: "اختبار", body: "<p>نص</p><script>x</script>", sortOrder: 0, featured: false });
    expect(c.body).toBe("<p>نص</p>");
    expect(await cms.publicPage("ARTICLE", c.slug, "ar")).toBeNull();
    await expect(cms.transitionContent(d.admin, c.id, "PUBLISHED")).rejects.toThrow(/must_be_in_review/);
    await cms.transitionContent(d.admin, c.id, "IN_REVIEW");
    await cms.transitionContent(d.admin, c.id, "PUBLISHED");
    expect(await cms.publicPage("ARTICLE", c.slug, "ar")).not.toBeNull();
    await cms.upsertContent(d.admin, c.id, { type: "ARTICLE", slug: c.slug, locale: "ar", title: "معدل", body: "<p>جديد</p>", sortOrder: 0, featured: false });
    expect(await cms.publicPage("ARTICLE", c.slug, "ar")).toBeNull();
  });
  it("a teacher cannot edit content", async () => {
    await expect(cms.upsertContent(d.teacher, null, { type: "ARTICLE", slug: `x-${Date.now()}`, locale: "ar", title: "لا", body: "<p>x</p>", sortOrder: 0, featured: false })).rejects.toThrow();
  });
  it("a teacher cannot make a scholarly decision", async () => {
    await expect(cms.scholarlyDecision(d.teacher, "tafsir_source", "1", true)).rejects.toThrow();
  });
});
