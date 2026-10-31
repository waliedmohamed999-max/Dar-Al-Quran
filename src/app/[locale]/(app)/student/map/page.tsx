import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/client";
import { Empty, PageHeader, Section, Stat } from "@/components/ui";
import { systemDb } from "@/lib/db";
import { guard, pageCtx, type PageParams, type SearchProps } from "@/lib/page";
import { AYAH_STATUS } from "@/modules/unified/labels";
import { surahMap } from "@/modules/unified/service";

export const metadata = { title: "خريطة الحفظ | Memorization map", robots: { index: false } };

export default async function MapPage({ params, searchParams }: PageParams & SearchProps) {
  const { locale, t, lp } = await pageCtx(params);
  const actor = await guard(locale);
  if (!actor.studentId) notFound();
  const surahId = Number((await searchParams).surah) || null;
  const [map, surahs] = await Promise.all([surahMap(actor, actor.studentId), systemDb().quranSurah.findMany({ orderBy: { id: "asc" } })]);
  const i = locale === "ar" ? 0 : 1;
  const current = surahs.find((s) => s.id === surahId);
  const total = surahs.reduce((n, s) => n + s.ayahCount, 0);
  const count = (k: string) => map.rows.filter((r) => r.status === k).length;
  const ayahJuz = await systemDb().quranAyah.findMany({ select: { surahId: true, ayahNumber: true, juz: true } });
  const mastered = new Set(map.rows.filter((r) => r.status === "MASTERED").map((r) => `${r.surahId}:${r.ayah}`));
  const juz = Array.from({ length: 30 }, (_, k) => { const all = ayahJuz.filter((a) => a.juz === k + 1); return { n: k + 1, pct: Math.round((all.filter((a) => mastered.has(`${a.surahId}:${a.ayahNumber}`)).length / all.length) * 100) }; });
  const statusOf = new Map(map.rows.filter((r) => r.surahId === surahId).map((r) => [r.ayah, r.status]));
  return (
    <>
      <PageHeader title={t("خريطة الحفظ", "Memorization map")} subtitle={t("تعكس قرارات معلمك وتدريبك. عدد مرات الاستماع لا يغير الحالة.", "Reflects your teacher's decisions and your practice. Listening counts do not change a status.")} />
      <ul className="mb-5 flex flex-wrap gap-2 text-xs" aria-label={t("دليل الحالات", "Status key")}>{Object.entries(AYAH_STATUS).map(([k, v]) => <li key={k} className={`st-${k} rounded-full px-2.5 py-1`}>{v[i]}</li>)}</ul>
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label={t("آيات متقنة باعتماد المعلم", "Ayahs mastered, teacher-approved")} value={`${count("MASTERED")} / ${total}`} />
        <Stat label={t("تحتاج مراجعة", "Need review")} value={count("NEEDS_REVIEW")} />
        <Stat label={t("قيد التدريب أو جاهزة", "Practising or ready")} value={count("PRACTICING") + count("READY")} />
      </div>
      <Section title={t("الأجزاء", "Juz")}>
        <ul className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">{juz.map((j) => <li key={j.n} className="rounded-md border border-line p-1 text-center text-xs" title={`${j.pct}%`}><span className="block font-semibold">{j.n}</span><span className="text-ink-2">{j.pct}%</span><span className="mt-1 block h-1 rounded-full bg-surface-2"><span className="block h-1 rounded-full bg-brand" style={{ width: `${j.pct}%` }} /></span></li>)}</ul>
      </Section>
      {current && (
        <Section title={locale === "ar" ? current.nameArabic : current.nameEnglish} actions={<Link className="btn btn-ghost btn-sm" href={lp(`/mushaf/surah/${current.id}`)}>{t("فتح في المصحف", "Open in mushaf")}</Link>}>
          <ul className="flex flex-wrap gap-1.5">{Array.from({ length: current.ayahCount }, (_, k) => k + 1).map((a) => { const st = statusOf.get(a) ?? "NOT_STARTED"; return <li key={a}><Link title={AYAH_STATUS[st][i]} aria-label={`${a}: ${AYAH_STATUS[st][i]}`} className={`st-${st} inline-flex size-9 items-center justify-center rounded-md text-sm no-underline`} href={lp(`/mushaf/surah/${current.id}?ayah=${a}`)}>{a}</Link></li>; })}</ul>
          <div className="mt-3 flex flex-wrap gap-2"><ActionButton path="/me/ayah-status" method="PUT" body={{ surahId: current.id, fromAyah: 1, toAyah: current.ayahCount, status: "PRACTICING" }} label={t("تحديد السورة قيد التدريب", "Mark surah as practising")} success={t("تم", "Done")} /></div>
        </Section>
      )}
      <Section title={t("السور", "Surahs")}>
        {surahs.length === 0 ? <Empty title="—" /> : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{surahs.map((s) => { const m = map.summary[s.id] ?? {}; const mastered = m.MASTERED ?? 0; const review = m.NEEDS_REVIEW ?? 0; const started = Object.values(m).reduce((a, b) => a + b, 0); return <li key={s.id}><Link href={lp(`/student/map?surah=${s.id}`)} className="block rounded-lg border border-line p-2 no-underline hover:border-gold"><span className="block font-semibold">{s.id}. {locale === "ar" ? s.nameArabic : s.nameEnglish}</span><span className="text-xs text-ink-2">{t(`متقنة ${mastered} · مراجعة ${review} · من ${s.ayahCount}`, `Mastered ${mastered} · review ${review} · of ${s.ayahCount}`)}</span><span className="mt-1 block h-1.5 rounded-full bg-surface-2"><span className="block h-1.5 rounded-full bg-brand" style={{ width: `${Math.round((mastered / s.ayahCount) * 100)}%` }} /></span>{started === 0 && <span className="sr-only">{t("لم تبدأ", "Not started")}</span>}</Link></li>; })}</ul>
        )}
      </Section>
    </>
  );
}
