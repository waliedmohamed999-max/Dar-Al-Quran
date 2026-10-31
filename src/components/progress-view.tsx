import { Empty, Progress, Section, Stat } from "./ui";
import { translator, type Locale } from "@/lib/i18n";
import type { summarizeProgress } from "@/modules/learning/service";

const WEAK: Record<string, [string, string]> = {
  memorization: ["تثبيت الحفظ", "Memorization"], tajweed: ["التجويد", "Tajweed"], fluency: ["الطلاقة", "Fluency"], makharij: ["مخارج الحروف", "Articulation"], waqf: ["الوقف والابتداء", "Stopping and starting"],
};

export function ProgressView({ p, locale }: { p: ReturnType<typeof summarizeProgress>; locale: Locale }) {
  const t = translator(locale);
  const shown = (v: number | null) => (v === null ? "—" : `${v} / 5`);
  return (
    <>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t("الآيات المعتمدة", "Approved ayahs")} value={p.ayahsApproved} hint={t(`من ${p.ayahsTotal} آية`, `of ${p.ayahsTotal} ayahs`)} />
        <Stat label={t("إتقان المراجعة", "Revision mastery")} value={shown(p.revisionMastery)} hint={t("متوسط درجات المعلم", "Teacher grades average")} />
        <Stat label={t("الحضور", "Attendance")} value={p.attendancePercent === null ? "—" : `${p.attendancePercent}%`} hint={t(`من ${p.sessionsCounted} حصة`, `of ${p.sessionsCounted} sessions`)} />
        <Stat label={t("المهام المكتملة", "Tasks completed")} value={p.tasksDonePercent === null ? "—" : `${p.tasksDonePercent}%`} hint={t(`من ${p.tasksCounted} مهمة`, `of ${p.tasksCounted} tasks`)} />
      </div>
      <Section title={t("تقدم الحفظ", "Memorization progress")}>
        <Progress label={t("نسبة المعتمد من القرآن", "Share of the Quran approved")} value={Math.round((p.ayahsApproved / p.ayahsTotal) * 1000) / 10} />
      </Section>
      <Section title={t("تقييم المعلم", "Teacher rubric")}>
        <dl className="grid gap-3 sm:grid-cols-4">
          {([[t("الحفظ", "Memorization"), p.rubric.memorization], [t("التجويد", "Tajweed"), p.rubric.tajweed], [t("الطلاقة", "Fluency"), p.rubric.fluency], [t("المراجعة", "Revision"), p.rubric.revision]] as const).map(([k, v]) => (
            <div key={k}><dt className="text-sm text-ink-2">{k}</dt><dd className="text-xl font-bold text-brand">{shown(v)}</dd></div>
          ))}
        </dl>
      </Section>
      <Section title={t("مواضع تحتاج إلى عناية", "Areas to focus on")}>
        {p.weakAreas.length === 0 ? <Empty title={t("لا توجد ملاحظات مسجلة بعد.", "No notes recorded yet.")} /> : (
          <ul className="flex flex-wrap gap-2">{p.weakAreas.map((w) => <li key={w.category} className="rounded-full border border-line px-3 py-1 text-sm">{WEAK[w.category]?.[locale === "ar" ? 0 : 1] ?? w.category} ({w.count})</li>)}</ul>
        )}
      </Section>
      <Section title={t("آيات تحتاج إلى مراجعة", "Ayahs to review")}>
        {p.ayahsToReview.length === 0 ? <Empty title={t("لم يحدد المعلم آيات بعد.", "Your teacher has not noted any ayahs yet.")} /> : <ul className="flex flex-wrap gap-2">{p.ayahsToReview.map((a) => <li key={a.key} dir="ltr" className="rounded-full border border-line px-3 py-1 text-sm">{a.key}</li>)}</ul>}
      </Section>
      <Section title={t("تطور المستوى شهرياً", "Monthly development")}>
        {p.trend.length === 0 ? <Empty title={t("لا توجد تقييمات كافية بعد.", "Not enough assessments yet.")} /> : <ul className="space-y-2">{p.trend.map((m) => <li key={m.month}><Progress label={m.month} value={Math.round((m.average / 5) * 100)} /></li>)}</ul>}
      </Section>
      <Section title={t("الشارات", "Badges")}>
        {p.badges.length === 0 ? <Empty title={t("لم تصدر شارات بعد.", "No badges yet.")} /> : <ul className="flex flex-wrap gap-2">{p.badges.map((b) => <li key={b.key} className="rounded-full border border-gold px-3 py-1 text-sm">{locale === "ar" ? b.nameAr : b.nameEn}</li>)}</ul>}
      </Section>
    </>
  );
}
