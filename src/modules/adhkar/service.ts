import webpush from "web-push";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { systemDb, withActor } from "@/lib/db";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import type { Actor } from "@/lib/session";
import { CALC_METHODS, dueSlots, isValidTimezone } from "./engine";
import { approved } from "@/lib/scholarly";

export const CATEGORIES: [string, string, string][] = [
  ["MORNING_EVENING", "أذكار الصباح والمساء", "Morning and evening"], ["SLEEP", "أذكار النوم", "Sleep"], ["WAKING", "أذكار الاستيقاظ", "Waking"],
  ["AFTER_PRAYER", "أذكار بعد الصلاة", "After prayer"], ["FOOD", "أذكار الطعام والشراب", "Food and drink"], ["ENTRY_EXIT", "الدخول والخروج", "Entering and leaving"],
  ["TRAVEL", "أذكار السفر", "Travel"], ["GENERAL", "أذكار عامة", "General"],
];

export const approvedAdhkar = (category?: string) =>
  systemDb().dhikr.findMany({ where: { ...approved(), ...(category ? { category: category as never } : {}) }, orderBy: [{ category: "asc" }, { sortOrder: "asc" }] });

const minute = z.coerce.number().int().min(0).max(1439).nullable().optional();
export const prefsSchema = z.object({
  enabled: z.boolean(),
  timezone: z.string().refine(isValidTimezone, "invalid time zone"),
  categories: z.array(z.enum(["MORNING_EVENING", "SLEEP", "WAKING", "AFTER_PRAYER"])).default([]),
  morningMin: minute, eveningMin: minute, sleepMin: minute, wakeMin: minute, dndStartMin: minute, dndEndMin: minute,
  days: z.array(z.coerce.number().int().min(0).max(6)).min(1).default([0, 1, 2, 3, 4, 5, 6]),
  minIntervalMin: z.coerce.number().int().min(15).max(1440).default(60),
  pushEnabled: z.boolean().default(false),
  usePrayerTimes: z.boolean().default(false),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  calcMethod: z.string().refine((m) => CALC_METHODS.includes(m)).default("UmmAlQura"),
});

/** Coordinates are stored rounded: enough for prayer times, without pinpointing a home. */
export async function savePreferences(actor: Actor, input: z.infer<typeof prefsSchema>) {
  if (input.usePrayerTimes && (input.latitude == null || input.longitude == null)) throw badRequest("location_required");
  const round = (v?: number | null) => (v == null ? null : Math.round(v * 100) / 100);
  const data = { ...input, latitude: round(input.latitude), longitude: round(input.longitude) };
  return withActor(actor, (tx) => tx.adhkarPreference.upsert({ where: { userId: actor.id }, update: data, create: { ...data, userId: actor.id } }));
}

export const toggleFavorite = (actor: Actor, dhikrId: string) =>
  withActor(actor, async (tx) => {
    if (!(await systemDb().dhikr.count({ where: { id: dhikrId, ...approved() } }))) throw notFound();
    const key = { userId_dhikrId: { userId: actor.id, dhikrId } };
    if (await tx.dhikrFavorite.findUnique({ where: key })) {
      await tx.dhikrFavorite.delete({ where: key });
      return { active: false };
    }
    await tx.dhikrFavorite.create({ data: { userId: actor.id, dhikrId } });
    return { active: true };
  });

export const subscribeSchema = z.object({ endpoint: z.url({ protocol: /^https$/ }), keys: z.object({ p256dh: z.string().min(1).max(300), auth: z.string().min(1).max(100) }) });

export const savePushSubscription = (actor: Actor, s: z.infer<typeof subscribeSchema>) =>
  systemDb().pushSubscription.upsert({ where: { endpoint: s.endpoint }, update: { userId: actor.id, p256dh: s.keys.p256dh, auth: s.keys.auth }, create: { userId: actor.id, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth } });

/** Forgets one browser, or every browser when none is named, and stops push for the account. */
export async function removePushSubscription(actor: Actor, endpoint?: string) {
  const db = systemDb();
  await db.pushSubscription.deleteMany({ where: { userId: actor.id, ...(endpoint ? { endpoint } : {}) } });
  if (!(await db.pushSubscription.count({ where: { userId: actor.id } }))) await db.adhkarPreference.updateMany({ where: { userId: actor.id }, data: { pushEnabled: false } });
  await audit(actor.id, "push.unsubscribe", "PushSubscription", null);
}

export const pushConfigured = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);

type PushSender = (sub: { endpoint: string; p256dh: string; auth: string }, payload: string) => Promise<void>;
let sender: PushSender | null = null;
/** Tests inject a sender. Production uses web-push with the configured VAPID keys. */
export const setPushSender = (s: PushSender | null) => { sender = s; };
const send: PushSender = async (sub, payload) => {
  if (sender) return sender(sub, payload);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
};

const TITLES: Record<string, [string, string]> = {
  MORNING_EVENING: ["وقت الأذكار", "Adhkar time"], SLEEP: ["أذكار النوم", "Sleep adhkar"], WAKING: ["أذكار الاستيقاظ", "Waking adhkar"], AFTER_PRAYER: ["أذكار بعد الصلاة", "After-prayer adhkar"],
};

/** Worker job. Inserting the log row first makes each slot deliver at most once, even with several workers. */
export async function dispatchAdhkar(now = new Date()) {
  const db = systemDb();
  const prefs = await db.adhkarPreference.findMany({ where: { enabled: true }, include: { user: { select: { locale: true, status: true, pushSubscriptions: true } } } });
  let sent = 0;
  for (const p of prefs) {
    if (p.user.status !== "ACTIVE") continue;
    for (const due of dueSlots(p, now)) {
      const inserted = await db.adhkarNotificationLog.createMany({ data: { userId: p.userId, slot: due.slot, localDate: due.localDate, channel: "IN_APP", status: "SENT" }, skipDuplicates: true });
      if (inserted.count === 0) continue;
      const title = TITLES[due.category]?.[p.user.locale === "en" ? 1 : 0] ?? TITLES.MORNING_EVENING[0];
      const body = p.user.locale === "en" ? "A gentle reminder. Open your adhkar when you are ready." : "تذكير لطيف. افتح أذكارك متى تيسر لك.";
      await db.notification.create({ data: { userId: p.userId, type: "adhkar.reminder", title, body, href: `/adhkar?category=${due.category}` } });
      await db.adhkarPreference.update({ where: { userId: p.userId }, data: { lastSentAt: now } });
      sent += 1;
      if (p.pushEnabled && (pushConfigured() || sender)) {
        for (const sub of p.user.pushSubscriptions) {
          try {
            await send(sub, JSON.stringify({ title, body, url: `/adhkar?category=${due.category}` }));
            await db.adhkarNotificationLog.update({ where: { userId_slot_localDate: { userId: p.userId, slot: due.slot, localDate: due.localDate } }, data: { channel: "PUSH" } });
          } catch (e) {
            // A gone subscription is removed. Other errors are noted without personal data.
            const code = (e as { statusCode?: number }).statusCode;
            if (code === 404 || code === 410) await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
            else console.error("[adhkar] push failed", code);
          }
        }
      }
    }
  }
  return { sent };
}

/** Sends a harmless test to the caller's own browsers, so a real delivery can be confirmed. */
export async function sendTestPush(actor: Actor) {
  if (!pushConfigured() && !sender) throw conflict("push_not_configured");
  const subs = await systemDb().pushSubscription.findMany({ where: { userId: actor.id } });
  if (!subs.length) throw conflict("no_subscription");
  let delivered = 0;
  for (const sub of subs) {
    try { await send(sub, JSON.stringify({ title: "دار القرآن الكريم", body: "إشعار تجريبي: التذكيرات تعمل.", url: "/adhkar/settings" })); delivered += 1; }
    catch (e) { const code = (e as { statusCode?: number }).statusCode; if (code === 404 || code === 410) await systemDb().pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined); }
  }
  return { delivered, total: subs.length };
}

/** Latest unread reminder for the gentle in-page card. */
export const pendingReminder = (actor: Actor) =>
  withActor(actor, (tx) => tx.notification.findFirst({ where: { userId: actor.id, type: "adhkar.reminder", readAt: null, createdAt: { gte: new Date(Date.now() - 2 * 3600000) } }, orderBy: { createdAt: "desc" } }));

export const dhikrSchema = z.object({
  category: z.enum(["MORNING_EVENING", "SLEEP", "WAKING", "AFTER_PRAYER", "FOOD", "ENTRY_EXIT", "TRAVEL", "GENERAL"]),
  titleAr: z.string().trim().min(2).max(160),
  text: z.string().trim().min(2).max(6000),
  repeat: z.coerce.number().int().min(1).max(1000).nullable().optional(),
  sourceName: z.string().trim().min(2).max(200),
  takhrij: z.string().trim().max(1000).nullable().optional(),
  explanation: z.string().trim().max(4000).nullable().optional(),
  explanationSource: z.string().trim().max(200).nullable().optional(),
  audioUrl: z.url({ protocol: /^https$/ }).nullable().optional(),
  audioSource: z.string().trim().max(200).nullable().optional(),
  audioLicense: z.string().trim().max(300).nullable().optional(),
  licenseNote: z.string().trim().min(2).max(300),
});

/** Every create or edit returns the dhikr to review. A cited explanation needs its source. */
export async function saveDhikr(actor: Actor, id: string | null, input: z.infer<typeof dhikrSchema>) {
  if (!actor.perms.has("content.manage")) throw forbidden();
  if (input.explanation && !input.explanationSource) throw badRequest("explanation_source_required");
  if (input.audioUrl && !(input.audioSource && input.audioLicense)) throw badRequest("audio_license_required");
  const db = systemDb();
  const reset = { reviewStatus: "PENDING" as const, reviewedBy: null, reviewedAt: null };
  if (id && !(await db.dhikr.findUnique({ where: { id } }))) throw notFound();
  const row = id ? await db.dhikr.update({ where: { id }, data: { ...input, ...reset } }) : await db.dhikr.create({ data: { ...input, ...reset } });
  await audit(actor.id, id ? "dhikr.update" : "dhikr.create", "Dhikr", row.id);
  return row;
}
