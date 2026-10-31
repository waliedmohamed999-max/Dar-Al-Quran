// Dashboard figures. Everything is counted from records, and student data is read through RLS,
// so a supervisor's or teacher's dashboard contains only what they may see.
import { systemDb, withActor } from "@/lib/db";
import { forbidden } from "@/lib/errors";
import type { Actor } from "@/lib/session";

export type Period = { from: Date; to: Date; key: "week" | "month" | "custom" };

/** Unknown or reversed dates fall back to the last 30 days. Custom ranges are capped at a year. */
export function parsePeriod(q: { period?: string; from?: string; to?: string }, now = new Date()): Period {
  const end = new Date(now);
  const back = (d: number) => new Date(now.getTime() - d * 86400000);
  if (q.period === "week") return { from: back(6), to: end, key: "week" };
  if (q.period === "custom" && q.from && q.to) {
    const from = new Date(q.from), to = new Date(`${q.to}T23:59:59`);
    if (!Number.isNaN(+from) && !Number.isNaN(+to) && from <= to) return { from: to.getTime() - from.getTime() > 366 * 86400000 ? new Date(to.getTime() - 366 * 86400000) : from, to, key: "custom" };
  }
  return { from: back(29), to: end, key: "month" };
}

/** Daily up to five weeks, weekly beyond. Empty buckets stay empty rather than zero. */
export function buckets(p: Period) {
  const day = 86400000;
  const start = Date.UTC(p.from.getUTCFullYear(), p.from.getUTCMonth(), p.from.getUTCDate());
  const span = Math.max(1, Math.ceil((p.to.getTime() - start) / day));
  const size = span > 35 ? 7 : 1;
  const out: { start: number; end: number; label: string }[] = [];
  for (let t = start; t <= p.to.getTime(); t += size * day) {
    const d = new Date(t);
    out.push({ start: t, end: t + size * day, label: `${d.getUTCDate()}/${d.getUTCMonth() + 1}` });
  }
  return out;
}

const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : null);

export async function adminOverview(actor: Actor, p: Period) {
  if (!actor.perms.has("reports.view")) throw forbidden();
  const range = { gte: p.from, lte: p.to };
  const bk = buckets(p);
  const at = <T,>(rows: T[], when: (r: T) => Date) => bk.map((b) => rows.filter((r) => { const v = when(r).getTime(); return v >= b.start && v < b.end; }));
  const data = await withActor(actor, async (tx) => {
    const [students, teachers, halaqas, attendance, tasks, pendingRecitations, pendingEnroll, certs, reviews, revisions, sessions, tracks, pendingCerts, pendingPlacement, ungraded, halaqaRows] = await Promise.all([
      tx.student.count(),
      tx.teacher.count({ where: { user: { status: "ACTIVE" } } }),
      tx.halaqa.count({ where: { active: true } }),
      tx.attendance.findMany({ where: { session: { startsAt: range } }, select: { status: true, session: { select: { startsAt: true } } } }),
      tx.dailyTask.findMany({ where: { date: range, status: { not: "CARRIED_OVER" } }, select: { status: true, date: true } }),
      tx.recitationSubmission.count({ where: { status: "SUBMITTED" } }),
      tx.enrollment.count({ where: { status: "PENDING" } }),
      tx.certificate.count({ where: { status: "ISSUED" } }),
      tx.teacherReview.findMany({ where: { createdAt: range, decision: "APPROVED" }, select: { createdAt: true } }),
      tx.revisionRecord.findMany({ where: { createdAt: range }, select: { createdAt: true } }),
      tx.halaqaSession.findMany({ where: { startsAt: range, status: { not: "CANCELLED" } }, select: { startsAt: true, status: true } }),
      tx.student.groupBy({ by: ["track"], _count: true }),
      tx.certificate.count({ where: { status: "PENDING_APPROVAL" } }),
      tx.placementAssessment.count({ where: { status: "SUBMITTED" } }),
      tx.assessmentAttempt.count({ where: { status: "SUBMITTED" } }),
      tx.halaqa.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, active: true, capacity: true, teacher: { select: { user: { select: { name: true } } } }, enrollments: { where: { status: "ACTIVE" }, select: { studentId: true } } } }),
    ]);
    const perHalaqa = [];
    if (halaqaRows.length) {
      const [att, tk] = await Promise.all([
        tx.attendance.findMany({ where: { session: { startsAt: range } }, select: { status: true, session: { select: { halaqaId: true } } } }),
        tx.dailyTask.findMany({ where: { date: range, status: { not: "CARRIED_OVER" }, studentId: { in: halaqaRows.flatMap((h) => h.enrollments.map((e) => e.studentId)) } }, select: { status: true, studentId: true } }),
      ]);
      for (const h of halaqaRows) {
        const members = new Set(h.enrollments.map((e) => e.studentId));
        const a = att.filter((x) => x.session.halaqaId === h.id && x.status !== "EXCUSED");
        const t = tk.filter((x) => members.has(x.studentId));
        perHalaqa.push({ id: h.id, name: h.name, active: h.active, teacher: h.teacher?.user.name ?? null, members: members.size, capacity: h.capacity, attendance: percent(a.filter((x) => x.status === "PRESENT" || x.status === "LATE").length, a.length), tasks: percent(t.filter((x) => x.status === "DONE").length, t.length) });
      }
    }
    return { students, teachers, halaqas, attendance, tasks, pendingRecitations, pendingEnroll, certs, reviews, revisions, sessions, tracks, pendingCerts, pendingPlacement, ungraded, perHalaqa };
  });
  const attended = (r: { status: string }) => r.status === "PRESENT" || r.status === "LATE";
  const counted = data.attendance.filter((a) => a.status !== "EXCUSED");
  const trend = at(counted, (a) => a.session.startsAt).map((rows, i) => ({ label: bk[i].label, value: percent(rows.filter(attended).length, rows.length) }));
  const taskTrend = at(data.tasks, (t) => t.date).map((rows, i) => ({ label: bk[i].label, value: percent(rows.filter((r) => r.status === "DONE").length, rows.length) }));
  const memo = at(data.reviews, (r) => r.createdAt).map((rows, i) => ({ label: bk[i].label, value: rows.length }));
  const rev = at(data.revisions, (r) => r.createdAt).map((rows, i) => ({ label: bk[i].label, value: rows.length }));
  const activity = at(data.sessions, (s) => s.startsAt).map((rows, i) => ({ label: bk[i].label, value: rows.length }));
  return {
    students: data.students, teachers: data.teachers, halaqas: data.halaqas, certs: data.certs,
    attendancePercent: percent(counted.filter(attended).length, counted.length),
    tasksPercent: percent(data.tasks.filter((t) => t.status === "DONE").length, data.tasks.length),
    pendingRecitations: data.pendingRecitations, pendingEnroll: data.pendingEnroll, pendingCerts: data.pendingCerts, pendingPlacement: data.pendingPlacement, ungraded: data.ungraded,
    trend, taskTrend, memo, rev, activity, tracks: data.tracks.map((t) => ({ track: t.track, count: t._count })).sort((a, b) => b.count - a.count), halaqas_: data.perHalaqa,
  };
}

/** Counts that need a person, including work outside student data, each behind its own permission. */
export async function adminQueues(actor: Actor) {
  const db = systemDb();
  const scholarly = actor.perms.has("scholarly.review")
    ? (await Promise.all([db.dhikr.count({ where: { reviewStatus: "PENDING" } }), db.hadithEntry.count({ where: { reviewStatus: "PENDING" } }), db.tajweedRule.count({ where: { reviewStatus: "PENDING" } }), db.tajweedExample.count({ where: { reviewStatus: "PENDING" } }), db.tafsirSource.count({ where: { status: "PENDING" } }), db.studyResource.count({ where: { reviewStatus: "PENDING" } })])).reduce((a, b) => a + b, 0)
    : null;
  const failedJobs = actor.perms.has("settings.manage") ? await db.job.count({ where: { status: "FAILED" } }) : null;
  const appeals = actor.perms.has("assessments.manage") ? await db.examAppeal.count({ where: { status: "PENDING" } }) : null;
  const judging = actor.perms.has("assessments.manage") ? await db.judgingSession.count({ where: { status: "CLOSED" } }) : null;
  return { scholarly, failedJobs, appeals, judging };
}

/** A guardian's summary per approved child. RLS returns nothing for any other student. */
export const childSummaries = (actor: Actor, ids: string[]) =>
  withActor(actor, async (tx) => {
    const since = new Date(Date.now() - 30 * 86400000);
    const out = [];
    for (const id of ids) {
      const [mastered, due, att, note, tasks] = await Promise.all([
        tx.ayahProgress.count({ where: { studentId: id, status: "MASTERED" } }),
        tx.memorizationRecord.count({ where: { studentId: id, status: "APPROVED", nextReviewAt: { lte: new Date() } } }),
        tx.attendance.findMany({ where: { studentId: id, recordedAt: { gte: since } }, select: { status: true } }),
        tx.teacherReview.findFirst({ where: { studentId: id, note: { not: null } }, orderBy: { createdAt: "desc" }, select: { note: true, createdAt: true } }),
        tx.dailyTask.count({ where: { studentId: id, status: { in: ["PENDING", "IN_PROGRESS"] }, date: { gte: new Date(Date.now() - 86400000) } } }),
      ]);
      const counted = att.filter((a) => a.status !== "EXCUSED");
      out.push({ id, mastered, due, absent: att.filter((a) => a.status === "ABSENT").length, attendance: percent(counted.filter((a) => a.status === "PRESENT" || a.status === "LATE").length, counted.length), note: note?.note ?? null, noteAt: note?.createdAt ?? null, tasks });
    }
    return out;
  });
