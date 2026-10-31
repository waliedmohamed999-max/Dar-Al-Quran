export type Locale = "ar" | "en";

export const isLocale = (v: string): v is Locale => v === "ar" || v === "en";

/** Text lives next to its markup: t("عربي", "English"). No key can go missing in one language. */
export const translator = (l: Locale) => (ar: string, en: string) => (l === "ar" ? ar : en);

/** Arabic has no prefix; English lives under /en. */
export const localePath = (l: Locale, p: string) => (l === "ar" ? p : `/en${p === "/" ? "" : p}`);

export const fmtDate = (l: Locale, d: Date | string, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeZone: "UTC" }) =>
  new Intl.DateTimeFormat(l === "ar" ? "ar-EG-u-nu-latn" : "en-GB", opts).format(new Date(d));

export const fmtDateTime = (l: Locale, d: Date | string) =>
  new Intl.DateTimeFormat(l === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: process.env.APP_TZ ?? "Asia/Riyadh" }).format(new Date(d));

export const WEEKDAYS = {
  ar: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};

export const TASK_TYPES: Record<string, { ar: string; en: string }> = {
  NEW_MEMORIZATION: { ar: "حفظ جديد", en: "New memorization" },
  NEAR_REVISION: { ar: "مراجعة قريبة", en: "Recent revision" },
  FAR_REVISION: { ar: "مراجعة القديم", en: "Older revision" },
  LISTENING: { ar: "استماع", en: "Listening" },
  RECITATION: { ar: "تسميع", en: "Recitation" },
  TAJWEED: { ar: "تجويد", en: "Tajweed" },
  TAFSIR: { ar: "تأمل وتفسير", en: "Tafsir" },
};

export const STATUS_LABELS: Record<string, { ar: string; en: string }> = {
  PENDING: { ar: "لم تبدأ", en: "Not started" },
  IN_PROGRESS: { ar: "جارية", en: "In progress" },
  DONE: { ar: "مكتملة", en: "Done" },
  SKIPPED: { ar: "متجاوزة", en: "Skipped" },
  CARRIED_OVER: { ar: "مرحلة", en: "Carried over" },
  ACTIVE: { ar: "فعال", en: "Active" },
  WAITLISTED: { ar: "قائمة انتظار", en: "Waiting list" },
  REJECTED: { ar: "مرفوض", en: "Rejected" },
  WITHDRAWN: { ar: "منسحب", en: "Withdrawn" },
  SUBMITTED: { ar: "بانتظار المراجعة", en: "Awaiting review" },
  IN_REVIEW: { ar: "قيد المراجعة", en: "In review" },
  APPROVED: { ar: "معتمد", en: "Approved" },
  INACTIVE: { ar: "غير نشطة", en: "Inactive" },
  RESUBMIT: { ar: "إعادة تسميع", en: "Recite again" },
  NEEDS_RETRY: { ar: "إعادة", en: "Retry" },
  DELETED: { ar: "محذوف", en: "Deleted" },
  PRESENT: { ar: "حاضر", en: "Present" },
  LATE: { ar: "متأخر", en: "Late" },
  ABSENT: { ar: "غائب", en: "Absent" },
  EXCUSED: { ar: "إجازة", en: "Excused" },
  SCHEDULED: { ar: "مجدولة", en: "Scheduled" },
  HELD: { ar: "انعقدت", en: "Held" },
  CANCELLED: { ar: "ملغاة", en: "Cancelled" },
  DRAFT: { ar: "مسودة", en: "Draft" },
  PUBLISHED: { ar: "منشور", en: "Published" },
  ARCHIVED: { ar: "مؤرشف", en: "Archived" },
  PENDING_APPROVAL: { ar: "بانتظار الاعتماد", en: "Pending approval" },
  ISSUED: { ar: "صادرة", en: "Issued" },
  REVOKED: { ar: "ملغاة", en: "Revoked" },
  GRADED: { ar: "مصحح", en: "Graded" },
  SUSPENDED: { ar: "موقوف", en: "Suspended" },
  DEACTIVATED: { ar: "معطل", en: "Deactivated" },
  IN_PERSON: { ar: "حضوري", en: "In person" },
  REMOTE: { ar: "عن بعد", en: "Remote" },
  HYBRID: { ar: "مدمج", en: "Hybrid" },
};
export const label = (l: Locale, key: string) => STATUS_LABELS[key]?.[l] ?? key;
