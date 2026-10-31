// Reminder scheduling. Pure: everything derives from the user's IANA time zone, so daylight
// saving changes are handled by Intl rather than by stored offsets.
import { CalculationMethod, Coordinates, PrayerTimes } from "adhan";

export type Prefs = {
  enabled: boolean;
  timezone: string;
  categories: string[];
  morningMin: number | null;
  eveningMin: number | null;
  sleepMin: number | null;
  wakeMin: number | null;
  days: number[];
  dndStartMin: number | null;
  dndEndMin: number | null;
  minIntervalMin: number;
  usePrayerTimes: boolean;
  latitude: number | null;
  longitude: number | null;
  calcMethod: string;
  lastSentAt: Date | null;
};

export type DueSlot = { slot: string; category: string; localDate: string };

const WINDOW_MIN = 10;

export function isValidTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Wall-clock parts of an instant in a time zone. */
export function localParts(now: Date, timezone: string) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(now);
  const v = (t: string) => p.find((x) => x.type === t)!.value;
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(v("weekday"));
  return { date: `${v("year")}-${v("month")}-${v("day")}`, minutes: Number(v("hour")) * 60 + Number(v("minute")), weekday, year: Number(v("year")), month: Number(v("month")), day: Number(v("day")) };
}

/** Handles windows that cross midnight, such as 22:00 to 06:00. */
export function inDnd(minutes: number, start: number | null, end: number | null) {
  if (start === null || end === null || start === end) return false;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

const METHODS = ["UmmAlQura", "MuslimWorldLeague", "Egyptian", "Karachi", "Dubai", "Qatar", "Kuwait", "Singapore", "Turkey", "NorthAmerica"] as const;
export const CALC_METHODS: readonly string[] = METHODS;

/** Computed locally with the adhan library. Displayed as an estimate; local authorities are the reference. */
export function prayerMinutes(p: Pick<Prefs, "latitude" | "longitude" | "calcMethod" | "timezone">, parts: { year: number; month: number; day: number }) {
  if (p.latitude === null || p.longitude === null) return null;
  const method = (METHODS as readonly string[]).includes(p.calcMethod) ? (p.calcMethod as (typeof METHODS)[number]) : "UmmAlQura";
  const t = new PrayerTimes(new Coordinates(p.latitude, p.longitude), new Date(parts.year, parts.month - 1, parts.day), CalculationMethod[method]());
  const mins = (d: Date) => localParts(d, p.timezone).minutes;
  return { fajr: mins(t.fajr), sunrise: mins(t.sunrise), dhuhr: mins(t.dhuhr), asr: mins(t.asr), maghrib: mins(t.maghrib), isha: mins(t.isha) };
}

/** Slots whose time falls inside the current window. The notification log ensures one send per slot per day. */
export function dueSlots(p: Prefs, now: Date): DueSlot[] {
  if (!p.enabled) return [];
  const local = localParts(now, p.timezone);
  if (!p.days.includes(local.weekday)) return [];
  if (inDnd(local.minutes, p.dndStartMin, p.dndEndMin)) return [];
  if (p.lastSentAt && now.getTime() - p.lastSentAt.getTime() < p.minIntervalMin * 60000) return [];

  const candidates: { slot: string; category: string; at: number | null }[] = [
    { slot: "sleep", category: "SLEEP", at: p.sleepMin },
    { slot: "waking", category: "WAKING", at: p.wakeMin },
  ];
  const prayers = p.usePrayerTimes ? prayerMinutes(p, local) : null;
  if (prayers) {
    candidates.push({ slot: "morning", category: "MORNING_EVENING", at: prayers.fajr + 20 }, { slot: "evening", category: "MORNING_EVENING", at: prayers.asr + 30 });
    for (const k of ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const) candidates.push({ slot: `after_prayer:${k}`, category: "AFTER_PRAYER", at: prayers[k] + 25 });
  } else {
    candidates.push({ slot: "morning", category: "MORNING_EVENING", at: p.morningMin }, { slot: "evening", category: "MORNING_EVENING", at: p.eveningMin });
  }
  const due = candidates.filter((c) => c.at !== null && p.categories.includes(c.category) && local.minutes >= c.at && local.minutes < c.at + WINDOW_MIN);
  // At most one reminder per run, so overlapping slots never arrive as a burst.
  return due.slice(0, 1).map((c) => ({ slot: c.slot, category: c.category, localDate: local.date }));
}
