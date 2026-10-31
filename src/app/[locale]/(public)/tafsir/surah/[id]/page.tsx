import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/client";
import { Empty, Notice, PageHeader, Progress, Section } from "@/components/ui";
import { systemDb } from "@/lib/db";
import { pageCtx, type PageParams, type SearchProps } from "@/lib/page";
import { getActor } from "@/lib/session";
import { approvedTafsirSources, tafsirFor } from "@/modules/quran/service";
import { approvedStudyResources } from "@/modules/quran/study";

export const metadata = { title: "دراسة السورة | Surah study" };
const PAGE = 5;

export default async function SurahStudy({ params, searchParams }: PageParams<{ id: string }> & SearchProps) {
  const { locale, t, lp } = await pageCtx(params);
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1 || id > 114) notFound();
  const sp = await searchParams;
  const db = systemDb();
  const s = await db.quranSurah.findUniqueOrThrow({ where: { id } });
  const from = Math.max(1, Number(sp.from) || 1);
  const [ayahs, sources, actor] = await Promise.all([db.quranAyah.findMany({ where: { surahId: id, ayahNumber: { gte: from, lt: from + PAGE } }, orderBy: { id: "asc" } }), approvedTafsirSources(), getActor()]);
  const resources = await approvedStudyResources(id);
  const src = sources.find((x) => x.slug === sp.source) ?? sources[0];
  const entries = src ? await Promise.all(ayahs.map((a) => tafsirFor(a.id, src.slug))) : [];
  const last = ayahs[ayahs.length - 1]?.ayahNumber ?? from;
  const progress = actor?.studentId ? await db.tafsirProgress.findUnique({ where: { studentId_surahId: { studentId: actor.studentId, surahId: id } } }) : null;
  const q = (f: number) => `/tafsir/surah/${id}?from=${f}${src ? `&source=${src.slug}` : ""}`;
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <PageHeader title={locale === "ar" ? `تدبر سورة ${s.nameArabic}` : `Study Surah ${s.nameEnglish}`} subtitle={`${s.revelationPlace === "MAKKAH" ? t("مكية", "Makkan") : t("مدنية", "Madinan")} · ${s.ayahCount} ${t("آية", "ayahs")}`} actions={<Link className="btn btn-ghost" href={lp(`/mushaf/surah/${id}`)}>{t("فتح في المصحف", "Open in mushaf")}</Link>} />
      {resources.length === 0 ? <Notice>{t("لم تضف بعد موضوعات أو مفردات أو أسباب نزول موثقة لهذه السورة، ولا تولدها المنصة.", "No documented topics, word meanings or occasions of revelation have been added for this surah yet. The platform does not generate them.")}</Notice> : (
        <Section title={t("موارد موثقة", "Documented resources")}>
          <ul className="space-y-2 text-sm">{resources.map((r) => <li key={r.id} className="border-b border-line pb-2" lang="ar" dir="rtl"><strong>{r.kind === "VOCABULARY" ? `${r.term}: ` : r.kind === "ASBAB" ? t("سبب النزول", "Occasion") + ": " : t("الموضوع", "Topic") + ": "}</strong>{r.body} <span className="text-xs text-ink-2">({t("الآيات", "Ayahs")} {r.fromAyah}–{r.toAyah}. {r.sourceName}، {r.sourceRef})</span></li>)}</ul>
        </Section>
      )}
      {actor?.studentId && <div className="card mb-5"><Progress label={t("تقدمي في السورة", "My progress in this surah")} value={Math.round(((progress?.ayahUpTo ?? 0) / s.ayahCount) * 100)} /></div>}
      {sources.length > 1 && <nav aria-label={t("مصدر التفسير", "Tafsir source")} className="mb-4 flex flex-wrap gap-1.5">{sources.map((x) => <Link key={x.slug} aria-current={x.slug === src?.slug ? "true" : undefined} className={`btn btn-sm ${x.slug === src?.slug ? "btn-primary" : "btn-ghost"}`} href={lp(`/tafsir/surah/${id}?from=${from}&source=${x.slug}`)}>{locale === "ar" ? x.nameAr : x.nameEn}</Link>)}</nav>}
      {!src ? <Empty title={t("لم يعتمد أي مصدر تفسير بعد.", "No tafsir source is approved yet.")} /> : ayahs.map((a, i) => (
        <Section key={a.id} title={`${t("الآية", "Ayah")} ${a.ayahNumber}`}>
          <p className="quran" lang="ar" dir="rtl">{a.text}</p>
          <div className="mt-2 border-t border-line pt-2 text-sm leading-7" lang="ar" dir="rtl">{entries[i]?.text ?? <span className="text-ink-2">{t("غير متاح من المصدر حالياً.", "Not available from the source right now.")}</span>}</div>
          <p className="mt-1 text-xs text-ink-2">{src.nameAr} — {src.author}</p>
        </Section>
      ))}
      <nav aria-label={t("التنقل", "Navigation")} className="flex flex-wrap items-center justify-between gap-2">
        {from > 1 ? <Link className="btn btn-ghost btn-sm" href={lp(q(Math.max(1, from - PAGE)))}>{t("السابق", "Previous")}</Link> : <span />}
        {actor?.studentId && <ActionButton path="/tafsir-progress" method="PUT" body={{ surahId: id, ayahUpTo: last }} label={t(`درست حتى الآية ${last}`, `Studied up to ayah ${last}`)} success={t("حفظ", "Saved")} />}
        {last < s.ayahCount ? <Link className="btn btn-ghost btn-sm" href={lp(q(from + PAGE))}>{t("التالي", "Next")}</Link> : <span />}
      </nav>
      <p className="mt-6 text-sm text-ink-2">{t("لديك سؤال عن الشرح؟ ", "A question about the explanation? ")}<Link className="underline" href={lp("/ai")}>{t("اسأل المساعد من المصادر المراجعة", "Ask the assistant from reviewed sources")}</Link></p>
    </div>
  );
}
