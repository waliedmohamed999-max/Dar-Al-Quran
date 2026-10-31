// Background worker: `npm run worker`. Claims jobs with SKIP LOCKED, so several workers can run.
// Status and failures are visible in the jobs table and on the admin dashboard.
import "dotenv/config";
import { systemDb } from "@/lib/db";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/mail";
import { purgeExpiredRecordings } from "@/modules/learning/retention";
import { dayOnly, addDays } from "@/modules/learning/srs";
import { dispatchAdhkar } from "@/modules/adhkar/service";
import { deliverEmailNotification, notify, studentAudience } from "@/modules/notifications/service";

const db = systemDb();
const MAX_ATTEMPTS = 5;

type Handler = (payload: Record<string, unknown>) => Promise<unknown>;

const handlers: Record<string, Handler> = {
  "email.raw": async (p) => sendMail(p.to as string, p.subject as string, p.html as string),
  "email.notification": async (p) => deliverEmailNotification(p as never),
  "adhkar.dispatch": async () => dispatchAdhkar(),

  /** Keeps unfinished tasks visible: the old row stays as history and a linked copy moves to today. */
  "tasks.carry_over": async () => {
    const today = dayOnly(new Date());
    const open = await db.dailyTask.findMany({ where: { date: { lt: today }, status: { in: ["PENDING", "IN_PROGRESS"] } }, take: 5000 });
    for (const t of open) {
      await db.$transaction([
        db.dailyTask.update({ where: { id: t.id }, data: { status: "CARRIED_OVER" } }),
        db.dailyTask.create({
          data: {
            studentId: t.studentId, planId: t.planId, date: today, type: t.type, surahId: t.surahId, fromAyah: t.fromAyah, toAyah: t.toAyah,
            ruleSlug: t.ruleSlug, suggestedMinutes: t.suggestedMinutes, sortOrder: t.sortOrder, teacherNote: t.teacherNote,
            revisionOfId: t.revisionOfId, createdById: t.createdById, carriedFromId: t.id,
          },
        }),
      ]);
    }
    return { carried: open.length };
  },

  "reminders.daily": async () => {
    const today = dayOnly(new Date());
    const students = await db.dailyTask.findMany({ where: { date: today, status: "PENDING" }, distinct: ["studentId"], select: { student: { select: { userId: true } } } });
    if (students.length) await notify(students.map((s) => s.student.userId), "task.reminder", {}, "/student");
    const soon = await db.halaqaSession.findMany({
      where: { startsAt: { gte: new Date(), lte: addDays(new Date(), 1) }, status: "SCHEDULED" },
      select: { startsAt: true, halaqa: { select: { name: true, enrollments: { where: { status: "ACTIVE" }, select: { student: { select: { userId: true } } } } } } },
    });
    for (const s of soon) {
      await notify(s.halaqa.enrollments.map((e) => e.student.userId), "session.reminder", { halaqa: s.halaqa.name, time: s.startsAt.toISOString().slice(11, 16) });
    }
  },

  /** Weekly guardian summary, computed from records. */
  "reports.guardian_weekly": async () => {
    const links = await db.guardianStudentLink.findMany({ where: { status: "APPROVED" }, select: { studentId: true } });
    const since = addDays(new Date(), -7);
    for (const studentId of new Set(links.map((l) => l.studentId))) {
      const [done, absent] = await Promise.all([
        db.dailyTask.count({ where: { studentId, status: "DONE", completedAt: { gte: since } } }),
        db.attendance.count({ where: { studentId, status: "ABSENT", recordedAt: { gte: since } } }),
      ]);
      const aud = await studentAudience(studentId);
      await notify(aud.guardians, "report.weekly", { done, absent }, "/guardian");
    }
  },

  /** Retention: recordings past their date, expired provider cache and old audit rows. */
  "retention.purge": async () => {
    const now = new Date();
    const purged = await purgeExpiredRecordings(now);
    await db.tafsirEntry.deleteMany({ where: { expiresAt: { lt: now } } });
    await db.audioTiming.deleteMany({ where: { expiresAt: { lt: now } } });
    await db.rateLimit.deleteMany({ where: { expiresAt: { lt: now } } });
    await db.auditLog.deleteMany({ where: { createdAt: { lt: addDays(now, -env.auditRetentionDays) } } });
    await db.job.deleteMany({ where: { status: "DONE", updatedAt: { lt: addDays(now, -30) } } });
    return { recordings: purged.removed };
  },
};

/** Each schedule uses a period dedupeKey, so multiple workers enqueue it only once. */
async function enqueueSchedules() {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const daily = ["tasks.carry_over", "reminders.daily", "retention.purge"];
  const jobs = daily.map((type) => ({ type, payload: {}, dedupeKey: `${type}:${day}` }));
  jobs.push({ type: "adhkar.dispatch", payload: {}, dedupeKey: `adhkar.dispatch:${now.toISOString().slice(0, 16)}` });
  if (now.getUTCDay() === 5) jobs.push({ type: "reports.guardian_weekly", payload: {}, dedupeKey: `reports.guardian_weekly:${day}` });
  await db.job.createMany({ data: jobs, skipDuplicates: true });
}

async function claim() {
  const rows = await db.$queryRaw<{ id: string; type: string; payload: Record<string, unknown>; attempts: number }[]>`
    UPDATE jobs SET status = 'RUNNING', attempts = attempts + 1, "updatedAt" = now()
    WHERE id = (
      SELECT id FROM jobs WHERE status = 'PENDING' AND "runAt" <= now()
      ORDER BY "runAt" FOR UPDATE SKIP LOCKED LIMIT 1
    ) RETURNING id, type, payload, attempts`;
  return rows[0];
}

export async function runOne(): Promise<boolean> {
  const job = await claim();
  if (!job) return false;
  try {
    const handler = handlers[job.type];
    if (!handler) throw new Error(`no handler for ${job.type}`);
    await handler(job.payload);
    await db.job.update({ where: { id: job.id }, data: { status: "DONE", lastError: null } });
    console.log(JSON.stringify({ job: job.type, id: job.id, status: "done" }));
  } catch (e) {
    const failed = job.attempts >= MAX_ATTEMPTS;
    const message = (e as Error).message.slice(0, 500);
    await db.job.update({
      where: { id: job.id },
      data: { status: failed ? "FAILED" : "PENDING", lastError: message, runAt: new Date(Date.now() + 2 ** job.attempts * 30000) },
    });
    console.error(JSON.stringify({ job: job.type, id: job.id, status: failed ? "failed" : "retry", error: message }));
  }
  return true;
}

async function main() {
  console.log("worker started");
  let stop = false;
  process.on("SIGTERM", () => (stop = true));
  process.on("SIGINT", () => (stop = true));
  let last = 0;
  while (!stop) {
    if (Date.now() - last > 60000) {
      await enqueueSchedules();
      await db.job.updateMany({ where: { status: "RUNNING", updatedAt: { lt: new Date(Date.now() - 600000) } }, data: { status: "PENDING" } });
      last = Date.now();
    }
    if (!(await runOne())) await new Promise((r) => setTimeout(r, 3000));
  }
  await db.$disconnect();
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("worker/index.ts")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
