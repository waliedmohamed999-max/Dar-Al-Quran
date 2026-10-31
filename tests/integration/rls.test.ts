// Authorization at the database layer: these use the restricted role directly, with no API checks.
import { beforeAll, describe, expect, it } from "vitest";
import { withActor } from "@/lib/db";
import type { Actor } from "@/lib/session";
import { db, demo, demoHalaqa, makeStudent } from "./helpers";

let d: Awaited<ReturnType<typeof demo>>;
beforeAll(async () => { d = await demo(); });

const visible = (a: Actor, studentId: string) => withActor(a, (tx) => tx.student.count({ where: { id: studentId } }));

describe("student visibility", () => {
  it("shows nothing when no user is set", async () => {
    expect(await withActor({ id: "" }, (tx) => tx.student.count())).toBe(0);
    expect(await withActor({ id: "" }, (tx) => tx.attendance.count())).toBe(0);
  });
  it("a student sees themselves but not another student (IDOR)", async () => {
    expect(await visible(d.student, d.student.studentId!)).toBe(1);
    expect(await visible(d.student, d.student2.studentId!)).toBe(0);
  });
  it("a teacher sees their own students only", async () => {
    expect(await visible(d.teacher, d.student.studentId!)).toBe(1);
    expect(await visible(d.teacher, d.student2.studentId!)).toBe(0);
  });
  it("a guardian sees only the linked child", async () => {
    expect(await visible(d.guardian, d.minor.studentId!)).toBe(1);
    expect(await visible(d.guardian, d.student.studentId!)).toBe(0);
  });
  it("supervisors and admins see every student of the school", async () => {
    expect(await visible(d.supervisor, d.student2.studentId!)).toBe(1);
    expect(await visible(d.admin, d.student2.studentId!)).toBe(1);
  });
  it("hides another student's account email", async () => {
    const other = await db().student.findUniqueOrThrow({ where: { id: d.student2.studentId! } });
    expect(await withActor(d.student, (tx) => tx.user.count({ where: { id: other.userId } }))).toBe(0);
  });
});

describe("guardian link lifecycle", () => {
  it("a revoked link removes access immediately", async () => {
    const s = await makeStudent();
    const link = await db().guardianStudentLink.create({ data: { guardianId: d.guardian.guardianId!, studentId: s.studentId!, relation: "ولي", status: "APPROVED" } });
    expect(await visible(d.guardian, s.studentId!)).toBe(1);
    await db().guardianStudentLink.update({ where: { id: link.id }, data: { status: "REVOKED" } });
    expect(await visible(d.guardian, s.studentId!)).toBe(0);
  });
  it("a pending link grants nothing", async () => {
    const s = await makeStudent();
    await db().guardianStudentLink.create({ data: { guardianId: d.guardian.guardianId!, studentId: s.studentId!, relation: "ولي", status: "PENDING" } });
    expect(await visible(d.guardian, s.studentId!)).toBe(0);
  });
  it("a guardian cannot approve their own link", async () => {
    const s = await makeStudent();
    await expect(withActor(d.guardian, (tx) => tx.guardianStudentLink.create({ data: { guardianId: d.guardian.guardianId!, studentId: s.studentId!, relation: "ولي", status: "APPROVED" } }))).rejects.toThrow();
  });
  it("guardians read but do not edit student records", async () => {
    const before = await db().dailyTask.create({ data: { studentId: d.minor.studentId!, date: new Date("2026-01-01"), type: "LISTENING" } });
    const r = await withActor(d.guardian, (tx) => tx.dailyTask.updateMany({ where: { id: before.id }, data: { status: "DONE" } }));
    expect(r.count).toBe(0);
  });
});

describe("write boundaries", () => {
  it("a student cannot approve their own memorization", async () => {
    await expect(withActor(d.student, (tx) => tx.memorizationRecord.create({ data: { studentId: d.student.studentId!, surahId: 110, fromAyah: 1, toAyah: 3, status: "APPROVED" } }))).rejects.toThrow();
  });
  it("a student cannot write a teacher review", async () => {
    await expect(withActor(d.student, (tx) => tx.teacherReview.create({
      data: { studentId: d.student.studentId!, teacherId: d.teacher.teacherId!, memorizationScore: 5, tajweedScore: 5, fluencyScore: 5, revisionScore: 5, decision: "APPROVED" },
    }))).rejects.toThrow();
  });
  it("a teacher cannot assign tasks outside their students", async () => {
    await expect(withActor(d.teacher, (tx) => tx.dailyTask.create({ data: { studentId: d.student2.studentId!, date: new Date(), type: "LISTENING" } }))).rejects.toThrow();
  });
  it("a student cannot change their own role", async () => {
    const role = await db().role.findUniqueOrThrow({ where: { key: "super_admin" } });
    await expect(withActor(d.student, (tx) => tx.userRole.create({ data: { userId: d.student.id, roleId: role.id } }))).rejects.toThrow();
  });
  it("Quran text cannot be changed by the application role", async () => {
    await expect(withActor(d.superAdmin, (tx) => tx.quranAyah.update({ where: { id: 1 }, data: { text: "x" } }))).rejects.toThrow();
  });
  it("audit rows cannot be edited or deleted by the application role", async () => {
    const row = await db().auditLog.create({ data: { action: "test", entity: "T" } });
    await expect(withActor(d.superAdmin, (tx) => tx.auditLog.update({ where: { id: row.id }, data: { action: "x" } }))).rejects.toThrow();
    await expect(withActor(d.superAdmin, (tx) => tx.auditLog.delete({ where: { id: row.id } }))).rejects.toThrow();
  });
  it("correct answers are unreadable to the application role", async () => {
    await expect(withActor(d.student, (tx) => tx.question.findFirst())).rejects.toThrow(/permission denied|denied/i);
    const ok = await withActor(d.student, (tx) => tx.question.findFirst({ select: { id: true, promptAr: true } }));
    expect(ok).not.toBeNull();
  });
  it("auth secrets are not reachable from the application role", async () => {
    await expect(withActor(d.superAdmin, (tx) => tx.authAccount.findFirst())).rejects.toThrow();
    await expect(withActor(d.superAdmin, (tx) => tx.authSession.findFirst())).rejects.toThrow();
  });
});

describe("certificates need an authorized human", () => {
  it("the database refuses issuing without the permission, even if a service was bypassed", async () => {
    const h = await demoHalaqa();
    const s = await makeStudent(h.id);
    await expect(withActor(d.teacher, (tx) => tx.certificate.create({
      data: { code: `C${Date.now()}`, studentId: s.studentId!, title: "x", requestedById: d.teacher.id, status: "ISSUED", approvedById: d.teacher.id },
    }))).rejects.toThrow(/authorized|denied|security/i);
  });
  it("the approver recorded must be the acting user", async () => {
    const s = await makeStudent();
    await expect(withActor(d.admin, (tx) => tx.certificate.create({
      data: { code: `D${Date.now()}`, studentId: s.studentId!, title: "x", requestedById: d.admin.id, status: "ISSUED", approvedById: d.teacher.id },
    }))).rejects.toThrow();
  });
});
