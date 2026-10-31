import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { systemDb } from "@/lib/db";
import { fmtDate } from "@/lib/i18n";
import { pageCtx, type PageParams, type SearchProps } from "@/lib/page";

export const metadata = { title: "أخبار الدار | News", description: "أخبار وإعلانات وفعاليات ومقالات دار القرآن الكريم." };

export default async function News({ params, searchParams }: PageParams & SearchProps) {
  const { locale, t, lp } = await pageCtx(params);
  const type = (await searchParams).type;
  const tabs: [string, string, string][] = [["", "الكل", "All"], ["NEWS", "الأخبار والإعلانات", "News"], ["EVENT", "الفعاليات", "Events"], ["ARTICLE", "المقالات", "Articles"]];
  const types = ["NEWS", "EVENT", "ARTICLE"].includes(type ?? "") ? [type as "NEWS"] : (["NEWS", "EVENT", "ARTICLE"] as const);
  const items = await systemDb().contentPage.findMany({ where: { status: "PUBLISHED", locale, type: { in: [...types] } }, orderBy: [{ featured: "desc" }, { publishedAt: "desc" }], take: 40 });
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageHeader title={t("أخبار الدار والمركز الإعلامي", "News and media centre")} />
      <nav aria-label={t("تصفية", "Filter")} className="mb-5 flex flex-wrap gap-2">{tabs.map(([v, ar, en]) => <Link key={v} aria-current={(type ?? "") === v ? "page" : undefined} className={`btn btn-sm ${(type ?? "") === v ? "btn-primary" : "btn-ghost"}`} href={lp(v ? `/news?type=${v}` : "/news")}>{locale === "ar" ? ar : en}</Link>)}</nav>
      {items.length === 0 ? <Empty title={t("لا توجد منشورات بعد.", "Nothing published yet.")} /> : (
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{items.map((x) => (
          <li key={x.id}><Link href={lp(`/articles/${x.slug}`)} className="card lift block h-full overflow-hidden no-underline">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {x.imageUrl && <img src={x.imageUrl} alt="" loading="lazy" className="mb-3 aspect-video w-full rounded-lg object-cover" />}
            {x.publishedAt && <span className="text-xs text-ink-2">{fmtDate(locale, x.publishedAt)}</span>}
            <h2 className="text-lg text-brand">{x.title}</h2>{x.excerpt && <p className="mt-1 text-sm text-ink-2">{x.excerpt}</p>}
          </Link></li>
        ))}</ul>
      )}
    </div>
  );
}
