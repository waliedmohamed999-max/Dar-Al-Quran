import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { systemDb } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { fmtDate, localePath } from "@/lib/i18n";
import { pageCtx, type PageParams } from "@/lib/page";
import { sanitizeBody } from "@/lib/sanitize";
import { publicPage } from "@/modules/cms/service";

type P = PageParams<{ slug: string }>;
const load = async (slug: string, locale: string) => (await publicPage("ARTICLE", slug, locale)) ?? (await publicPage("NEWS", slug, locale)) ?? publicPage("EVENT", slug, locale);

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { slug, locale } = await params;
  const a = await load(slug, locale);
  return a ? { title: a.seoTitle ?? a.title, description: a.seoDescription ?? a.excerpt ?? undefined, openGraph: { title: a.seoTitle ?? a.title, description: a.seoDescription ?? a.excerpt ?? undefined, type: "article", images: a.imageUrl ? [a.imageUrl] : undefined } } : {};
}

export default async function Article({ params }: P) {
  const { locale } = await pageCtx(params);
  const a = await load((await params).slug, locale);
  if (!a) notFound();
  const related = a.category ? await systemDb().contentPage.findMany({ where: { status: "PUBLISHED", locale, category: a.category, id: { not: a.id }, type: { in: ["ARTICLE", "NEWS", "EVENT"] } }, take: 3, select: { id: true, slug: true, title: true } }) : [];
  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <PageHeader title={a.title} subtitle={a.publishedAt ? fmtDate(locale, a.publishedAt) : undefined} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {a.imageUrl && <img src={a.imageUrl} alt="" className="mb-5 w-full rounded-xl" />}
      <div className="prose-body" dangerouslySetInnerHTML={{ __html: sanitizeBody(a.body) }} />
      {a.mediaUrl && <p className="mt-4"><a className="btn btn-ghost" href={a.mediaUrl} target="_blank" rel="noopener noreferrer">{locale === "ar" ? "مشاهدة المادة" : "View the media"}</a></p>}
      {related.length > 0 && (
        <aside className="mt-10 border-t border-line pt-5">
          <h2 className="mb-2 text-xl text-brand">{locale === "ar" ? "ذو صلة" : "Related"}</h2>
          <ul className="space-y-1">{related.map((r) => <li key={r.id}><Link className="underline" href={localePath(locale, `/articles/${r.slug}`)}>{r.title}</Link></li>)}</ul>
        </aside>
      )}
    </article>
  );
}
