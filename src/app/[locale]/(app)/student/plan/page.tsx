import { notFound } from "next/navigation";
import { Empty, PageHeader, Section, StatusBadge } from "@/components/ui";
import { systemDb, withActor } from "@/lib/db";
import { fmtDate, TASK_TYPES, WEEKDAYS } from "@/lib/i18n";
import { guard, pageCtx, type PageParams } from "@/lib/page";
import { addDays, dayOnly } from "@/modules/learning/srs";

export const metadata = { title: "الخطة | Plan", robots: { index: false } };

export default async function PlanPage({ params }: PageParams) {
  const { locale, t } = await pageCtx(params);
  const actor = await guard(locale);
  const studentId = actor.studentId;
  if (!studentId) notFound();
  const today = dayOnly(new Date());
  const { plan, tasks, sessions, due } = await withActor(actor, async (tx) => ({
    plan: await tx.learningPlan.findFirst({ where: { studentId, status: "ACTIVE" }, include: { curriculum: true } }),
    tasks: await tx.dailyTask.findMany({ where: { studentId, date: { gte: addDays(today, -7), lte: addDays(today, 30) } }, orderBy: [{ date: "asc" }, { sortOrder: "asc" }] }),
    sessions: await tx.halaqaSession.findMany({ where: { startsAt: { gte: addDays(today, -7), lte: addDays(today, 30) }, halaqa: { enrollments: { some: { studentId, status: "ACTIVE" } } } }, orderBy: { startsAt: "asc" }, include: { halaqa: { select: { name: true } } } }),
    due: await tx.memorizationRecord.findMany({ where: { studentId, status: "APPROVED" }, orderBy: { nextReviewAt: "asc" }, take: 20 }),
  }));
  const surahs = await systemDb().quranSurah.findMany({ select: { id: true, nameArabic: true, nameEnglish: true, ayahCount: true } });
  const nm = (id: number | null) => { const s = surahs.find((x) => x.id === id); return s ? (locale === "ar" ? s.nameArabic : s.nameEnglish) : ""; };

  // A weekly and monthly projection from the real plan settings, shown as an estimate.
  const weekly = plan ? plan.newAyahsPerDay * plan.studyDays.length : 0;
  const days = [...new Set([...tasks.map((x) => x.date.toISOString().slice(0, 10)), ...sessions.map((s) => s.startsAt.toISOString().slice(0, 10))])].sort();

  return (
    <>
      <PageHeader title={t("الخطة والتقويم التعليمي", "Plan and calendar")} />
      <Section title={t("خطتي", "My plan")}>
        {!plan ? <Empty title={t("لا توجد خطة فعالة بعد.", "No active plan yet.")} hint={t("يضعها معلمك حسب مستواك ووقتك المتاح.", "Your teacher sets it according to your level and time.")} /> : (
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-sm text-ink-2">{t("الهدف", "Goal")}</dt><dd className="font-semibold">{plan.goal ?? "—"}</dd></div>
            <div><dt className="text-sm text-ink-2">{t("الوقت اليومي", "Daily time")}</dt><dd className="font-semibold">{t(`${plan.dailyMinutes} دقيقة`, `${plan.dailyMinutes} min`)}</dd></div>
            <div><dt className="text-sm text-ink-2">{t("الهدف الأسبوعي والشهري (تقديري)", "Weekly and monthly target (estimate)")}</dt><dd className="font-semibold">{t(`${weekly} آية أسبوعياً، نحو ${weekly * 4} شهرياً`, `${weekly} ayahs weekly, about ${weekly * 4} monthly`)}</dd></div>
            <div><dt className="text-sm text-ink-2">{t("أيام الدراسة", "Study days")}</dt><dd className="font-semibold">{plan.studyDays.map((d) => WEEKDAYS[locale][d]).join("، ")}</dd></div>
            <div><dt className="text-sm text-ink-2">{t("الموضع الحالي", "Current position")}</dt><dd className="font-semibold">{nm(plan.cursorSurah)} : {plan.cursorAyah}</dd></div>
          </dl>
        )}
      </Section>
      <Section title={t("مواعيد المراجعة المتباعدة", "Spaced revision schedule")}>
        {due.length === 0 ? <Empty title={t("تظهر هنا بعد اعتماد معلمك لمقاطع الحفظ.", "Appears after your teacher approves memorized segments.")} /> : (
          <ul className="grid gap-1 text-sm sm:grid-cols-2">{due.map((m) => <li key={m.id}>{nm(m.surahId)} ({m.fromAyah}–{m.toAyah}): {m.nextReviewAt ? fmtDate(locale, m.nextReviewAt) : "—"}</li>)}</ul>
        )}
      </Section>
      <Section title={t("التقويم", "Calendar")}>
        {days.length === 0 ? <Empty title={t("لا توجد أحداث في هذه الفترة.", "No events in this period.")} /> : (
          <ol className="space-y-3">
            {days.map((d) => (
              <li key={d} className="rounded-xl border border-line p-3">
                <h3 className="font-semibold">{fmtDate(locale, d, { dateStyle: "full", timeZone: "UTC" })}</h3>
                <ul className="mt-1 space-y-1 text-sm">
                  {sessions.filter((s) => s.startsAt.toISOString().startsWith(d)).map((s) => <li key={s.id}>{t("حصة", "Session")}: {s.halaqa.name} <StatusBadge locale={locale} status={s.status} /></li>)}
                  {tasks.filter((x) => x.date.toISOString().startsWith(d)).map((x) => <li key={x.id} className="flex flex-wrap items-center gap-2">{TASK_TYPES[x.type][locale]} {x.surahId ? `— ${nm(x.surahId)} (${x.fromAyah}–${x.toAyah})` : ""} <StatusBadge locale={locale} status={x.status} /></li>)}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </>
  );
}
