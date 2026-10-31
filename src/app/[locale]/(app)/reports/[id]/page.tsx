import Link from "next/link";
import { notFound } from "next/navigation";
import { Empty, PageHeader, Section, Stat, Table } from "@/components/ui";
import { systemDb, withActor } from "@/lib/db";
import { fmtDate } from "@/lib/i18n";
import { guard, pageCtx, type PageParams, type SearchProps } from "@/lib/page";
import { AYAH_STATUS } from "@/modules/unified/labels";
import { learningReport } from "@/modules/unified/service";

export const metadata = { title: "تقرير التقدم | Progress report", robots: { index: false } };

export default async function Report({ params, searchParams }: PageParams<{ id: string }> & SearchProps) {
  const { locale, t, lp } = await pageCtx(params);
  const actor = await guard(locale);
  const raw = (await params).id;
  const id = raw === "me" ? actor.studentId : raw;
  if (!id) notFound();
  const sp = await searchParams;
  const period = sp.period === "day" || sp.period === "month" ? sp.period : "week";
  // RLS returns nothing for a student the actor may not see.
  const student = await withActor(actor, (tx) => tx.student.findUnique({ where: { id }, select: { user: { select: { name: true } } } }));
  if (!student) notFound();
  const r = await learningReport(actor, id, period);
  const surahs = await systemDb().quranSurah.findMany({ select: { id: true, nameArabic: true, nameEnglish: true } });
  const nm = (x: number | null) => { const s = surahs.find((y) => y.id === x); return s ? (locale === "ar" ? s.nameArabic : s.nameEnglish) : "—"; };
  const i = locale === "ar" ? 0 : 1;
  const tabs: [string, string, string][] = [["day", "يومي", "Daily"], ["week", "أسبوعي", "Weekly"], ["month", "شهري", "Monthly"]];
  return (
    <>
      <PageHeader title={t("تقرير التقدم", "Progress report")} subtitle={student.user.name} />
      <nav aria-label={t("الفترة", "Period")} className="mb-5 flex gap-2">{tabs.map(([k, ar, en]) => <Link key={k} aria-current={period === k ? "page" : undefined} className={`btn btn-sm ${period === k ? "btn-primary" : "btn-ghost"}`} href={lp(`/reports/${raw}?period=${k}`)}>{t(ar, en)}</Link>)}</nav>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t("مهام مكتملة", "Tasks completed")} value={`${r.tasksDone} / ${r.tasksTotal}`} />
        <Stat label={t("مراجعات مقيمة", "Graded revisions")} value={r.revisionCount} hint={r.revisionAverage !== null ? t(`متوسط ${r.revisionAverage} من 5`, `Average ${r.revisionAverage} of 5`) : undefined} />
        <Stat label={t("حضور", "Present")} value={r.attendance.present} hint={t(`غياب ${r.attendance.absent}`, `Absent ${r.attendance.absent}`)} />
        <Stat label={t("تسميعات مقيمة", "Assessed recitations")} value={r.recitations.length} />
      </div>
      <Section title={t("الحفظ الفعلي", "Actual memorization")}>
        <p className="mb-2 text-xs text-ink-2">{t("يحسب ما اعتمده المعلم فقط.", "Counts only what a teacher approved.")}</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label={t("إجمالي الآيات المتقنة", "Total mastered ayahs")} value={r.actual.totalAyahs} hint={t(`في ${r.actual.pages} صفحة و${r.actual.juzTouched} جزء`, `On ${r.actual.pages} pages across ${r.actual.juzTouched} juz`)} />
          <Stat label={t("اعتمد في هذه الفترة", "Approved this period")} value={r.actual.inPeriod} />
          <Stat label={t("المخطط في هذه الفترة", "Planned this period")} value={r.actual.planned ?? "—"} hint={r.actual.planned === null ? t("لا توجد خطة نشطة", "No active plan") : undefined} />
          <Stat label={t("الفرق عن الخطة", "Against the plan")} value={r.actual.planned === null ? "—" : r.actual.inPeriod - r.actual.planned} />
        </div>
      </Section>
      <Section title={t("حسب مستوى الإتقان", "By mastery level")}>
        {Object.keys(r.mastery).length === 0 ? <Empty title={t("لا توجد بيانات بعد.", "No data yet.")} /> : <ul className="flex flex-wrap gap-2 text-sm">{Object.entries(r.mastery).map(([k, n]) => <li key={k} className={`st-${k} rounded-full px-3 py-1`}>{AYAH_STATUS[k]?.[i]}: {n}</li>)}</ul>}
      </Section>
      <Section title={t("حسب السورة", "By surah")}>
        {Object.keys(r.bySurah).length === 0 ? <Empty title={t("لا توجد بيانات بعد.", "No data yet.")} /> : (
          <Table caption={t("حسب السورة", "By surah")} columns={[t("السورة", "Surah"), t("متقنة", "Mastered"), t("تحتاج مراجعة", "Needs review"), t("أخرى", "Other")]}>
            {Object.entries(r.bySurah).map(([s, m]) => { const mastered = m.MASTERED ?? 0; const rev = m.NEEDS_REVIEW ?? 0; const all = Object.values(m).reduce((a, b) => a + b, 0); return <tr key={s}><td>{nm(Number(s))}</td><td>{mastered}</td><td>{rev}</td><td>{all - mastered - rev}</td></tr>; })}
          </Table>
        )}
      </Section>
      <Section title={t("سجل التسميع", "Recitation log")}>
        {r.recitations.length === 0 ? <Empty title={t("لا يوجد تسميع مقيم في هذه الفترة.", "No assessed recitations in this period.")} /> : (
          <Table caption={t("سجل التسميع", "Recitation log")} columns={[t("التاريخ", "Date"), t("السورة", "Surah"), t("النطاق", "Range"), t("الحفظ", "Memorization"), t("التجويد", "Tajweed"), t("القرار", "Decision"), t("الملاحظات", "Notes")]}>
            {r.recitations.map((x) => <tr key={x.id}><td>{fmtDate(locale, x.date)}</td><td>{nm(x.surahId)}</td><td>{x.fromAyah}–{x.toAyah}</td><td>{x.memorization}/5</td><td>{x.tajweed}/5</td><td>{x.decision === "APPROVED" ? t("اعتماد", "Approved") : t("إعادة", "Again")}</td><td>{x.note ?? "—"}</td></tr>)}
          </Table>
        )}
      </Section>
    </>
  );
}
