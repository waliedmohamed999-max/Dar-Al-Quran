import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { systemDb } from "@/lib/db";
import { pageCtx, type PageParams, type SearchProps } from "@/lib/page";

export const metadata = { title: "المكتبة القرآنية | Library", description: "مواد تعليمية مراجعة: تلاوات ودروس تجويد وموارد تفسير ومقالات." };

const LIBRARY_CATEGORIES: [string, string, string][] = [["tajweed", "دروس التجويد", "Tajweed lessons"], ["tafsir", "موارد التفسير", "Tafsir resources"], ["memorization", "شروح الحفظ", "Memorization guides"], ["lectures", "محاضرات تعليمية", "Lectures"], ["articles", "مقالات", "Articles"], ["downloads", "موارد للتنزيل", "Downloads"]];

export default async function Library({ params, searchParams }: PageParams & SearchProps) {
  const { locale, t, lp } = await pageCtx(params);
  const { q = "", category = "" } = await searchParams;
  const items = await systemDb().contentPage.findMany({
    where: { type: "LIBRARY", status: "PUBLISHED", locale, ...(category ? { category } : {}), ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { excerpt: { contains: q, mode: "insensitive" } }] } : {}) },
    orderBy: [{ featured: "desc" }, { publishedAt: "desc" }], take: 60,
  });
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageHeader title={t("المكتبة القرآنية", "Quran library")} subtitle={t("كل مادة تنشر بعد مراجعتها ومع مراعاة حقوق استخدامها.", "Each item is published after review, respecting its usage rights.")} />
      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <Link href={lp("/mushaf")} className="card lift no-underline"><strong className="text-brand">{t("التلاوات القرآنية", "Recitations")}</strong><span className="mt-1 block text-sm text-ink-2">{t("استمع لكل آية في المصحف المعلم.", "Listen to every ayah in the mushaf.")}</span></Link>
        <Link href={lp("/tajweed")} className="card lift no-underline"><strong className="text-brand">{t("دروس التجويد", "Tajweed lessons")}</strong><span className="mt-1 block text-sm text-ink-2">{t("دروس متدرجة بأمثلة من المصحف.", "Graded lessons with mushaf examples.")}</span></Link>
        <Link href={lp("/tafsir")} className="card lift no-underline"><strong className="text-brand">{t("التفسير", "Tafsir")}</strong><span className="mt-1 block text-sm text-ink-2">{t("قارن بين مصادر مذكورة بأسمائها.", "Compare named sources.")}</span></Link>
      </div>
      <form role="search" className="card mb-6 grid gap-3 sm:grid-cols-[1fr_14rem_auto] sm:items-end">
        <div><label htmlFor="q" className="label">{t("بحث", "Search")}</label><input id="q" name="q" defaultValue={q} className="input" /></div>
        <div><label htmlFor="category" className="label">{t("التصنيف", "Category")}</label><select id="category" name="category" defaultValue={category} className="input"><option value="">{t("الكل", "All")}</option>{LIBRARY_CATEGORIES.map(([v, ar, en]) => <option key={v} value={v}>{locale === "ar" ? ar : en}</option>)}</select></div>
        <button className="btn btn-primary">{t("عرض", "Show")}</button>
      </form>
      {items.length === 0 ? <Empty title={t("لا توجد مواد منشورة مطابقة بعد.", "No matching published items yet.")} hint={t("تضيف الإدارة المواد من إدارة المحتوى.", "The administration adds items from content management.")} /> : (
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{items.map((x) => <li key={x.id}><Link href={lp(`/library/${x.slug}`)} className="card lift block h-full no-underline"><h2 className="text-lg text-brand">{x.title}</h2>{x.excerpt && <p className="mt-1 text-sm text-ink-2">{x.excerpt}</p>}</Link></li>)}</ul>
      )}
    </div>
  );
}
