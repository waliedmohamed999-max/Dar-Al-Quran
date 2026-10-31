import { systemDb } from "@/lib/db";
import { sendMail } from "@/lib/mail";
import { integrations } from "@/lib/env";

export const render = (tpl: string, vars: Record<string, string | number>) =>
  tpl.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Creates in-app notifications and queues email, honouring each user's preferences. */
export async function notify(userIds: string[], templateKey: string, vars: Record<string, string | number>, href?: string) {
  const db = systemDb();
  const tpl = await db.notificationTemplate.findUnique({ where: { key: templateKey } });
  if (!tpl) throw new Error(`missing notification template ${templateKey}`);
  const users = await db.user.findMany({
    where: { id: { in: [...new Set(userIds)] }, status: "ACTIVE" },
    select: { id: true, locale: true, email: true, preferences: true },
  });
  for (const u of users) {
    if (u.preferences?.mutedTypes.includes(templateKey)) continue;
    const en = u.locale === "en";
    const title = render(en ? tpl.titleEn : tpl.titleAr, vars);
    const body = render(en ? tpl.bodyEn : tpl.bodyAr, vars);
    await db.notification.create({ data: { userId: u.id, type: templateKey, title, body, href } });
    if (u.preferences?.emailEnabled !== false && integrations.email) {
      await db.job.create({ data: { type: "email.notification", payload: { userId: u.id, to: u.email, subject: title, body, dir: en ? "ltr" : "rtl" } } });
    }
  }
}

/** Worker handler. Enforces the per-user daily cap at send time. */
export async function deliverEmailNotification(p: { userId: string; to: string; subject: string; body: string; dir: string }) {
  const db = systemDb();
  const prefs = await db.notificationPreference.findUnique({ where: { userId: p.userId } });
  const cap = prefs?.maxEmailsPerDay ?? 5;
  const key = `email:${p.userId}:${new Date().toISOString().slice(0, 10)}`;
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO rate_limits (key, count, "expiresAt") VALUES (${key}, 1, now() + interval '2 days')
    ON CONFLICT (key) DO UPDATE SET count = rate_limits.count + 1 RETURNING count`;
  if (rows[0].count > cap) return "capped";
  await sendMail(p.to, p.subject, `<div dir="${p.dir}" style="font-family:sans-serif"><h3>${esc(p.subject)}</h3><p>${esc(p.body)}</p></div>`);
  return "sent";
}

/** Staff and approved guardians who should hear about a student's progress. */
export async function studentAudience(studentId: string) {
  const s = await systemDb().student.findUnique({
    where: { id: studentId },
    select: { userId: true, guardians: { where: { status: "APPROVED" }, select: { guardian: { select: { userId: true } } } } },
  });
  if (!s) return { student: [] as string[], guardians: [] as string[] };
  return { student: [s.userId], guardians: s.guardians.map((g) => g.guardian.userId) };
}
