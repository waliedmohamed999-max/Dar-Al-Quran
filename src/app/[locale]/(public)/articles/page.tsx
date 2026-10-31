import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { fmtDate } from "@/lib/i18n";
import { pageCtx, type PageParams } from "@/lib/page";
import { publicContent } from "@/modules/cms/service";

export const metadata = { title: "الأخبار والمقالات | News & articles" };

export default async function Articles({ params }: PageParams) {
  const { locale, t, lp } = await pageCtx(params);
  const [articles, news] = await Promise.all([publicContent("ARTICLE", locale), publicContent("NEWS", locale)]);
  const all = [...news, ...articles].sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <PageHeader title={t("الأخبار والمقالات", "News and articles")} />
      {all.length === 0 ? <Empty title={t("لا توجد منشورات بعد.", "Nothing published yet.")} /> : (
        <ul className="space-y-3">
          {all.map((a) => (
            <li key={a.id} className="card">
              <h2 className="text-xl"><Link className="text-brand hover:underline" href={lp(`/articles/${a.slug}`)}>{a.title}</Link></h2>
              {a.publishedAt && <p className="text-xs text-ink-2">{fmtDate(locale, a.publishedAt)}</p>}
              {a.excerpt && <p className="mt-1 text-sm text-ink-2">{a.excerpt}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
