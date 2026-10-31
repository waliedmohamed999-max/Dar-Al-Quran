import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MushafView } from "@/components/mushaf-view";
import { PageHeader } from "@/components/ui";
import { systemDb } from "@/lib/db";
import { pageCtx, type PageParams, type SearchProps } from "@/lib/page";

type P = PageParams<{ id: string }>;

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { id, locale } = await params;
  const s = Number.isInteger(Number(id)) ? await systemDb().quranSurah.findUnique({ where: { id: Number(id) } }) : null;
  if (!s) return {};
  return { title: locale === "ar" ? `سورة ${s.nameArabic}` : `Surah ${s.nameEnglish}`, description: locale === "ar" ? `سورة ${s.nameArabic} بالرسم العثماني مع التلاوة والتفسير.` : `Surah ${s.nameEnglish} in Uthmani script with recitation and tafsir.` };
}

export default async function SurahPage({ params, searchParams }: P & SearchProps) {
  const { t, lp, locale } = await pageCtx(params);
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1 || id > 114) notFound();
  const s = await systemDb().quranSurah.findUniqueOrThrow({ where: { id } });
  const ayahParam = Number((await searchParams).ayah);
  const initial = ayahParam ? await systemDb().quranAyah.findFirst({ where: { surahId: id, ayahNumber: ayahParam }, select: { id: true } }) : null;
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <PageHeader
        title={locale === "ar" ? `سورة ${s.nameArabic}` : `Surah ${s.nameEnglish}`}
        subtitle={`${s.revelationPlace === "MAKKAH" ? t("مكية", "Makkan") : t("مدنية", "Madinan")} · ${s.ayahCount} ${t("آية", "ayahs")}`}
        actions={
          <nav aria-label={t("التنقل بين السور", "Surah navigation")} className="flex gap-2">
            {id > 1 && <Link className="btn btn-ghost btn-sm" href={lp(`/mushaf/surah/${id - 1}`)}>{t("السورة السابقة", "Previous")}</Link>}
            {id < 114 && <Link className="btn btn-ghost btn-sm" href={lp(`/mushaf/surah/${id + 1}`)}>{t("السورة التالية", "Next")}</Link>}
          </nav>
        }
      />
      <MushafView where={{ surahId: id }} initialAyahId={initial?.id} />
    </div>
  );
}
