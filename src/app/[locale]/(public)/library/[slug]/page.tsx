import { notFound } from "next/navigation";
import { ActionButton } from "@/components/client";
import { PageHeader } from "@/components/ui";
import { pageCtx, type PageParams } from "@/lib/page";
import { sanitizeBody } from "@/lib/sanitize";
import { getActor } from "@/lib/session";
import { publicPage } from "@/modules/cms/service";

export default async function LibraryItem({ params }: PageParams<{ slug: string }>) {
  const { locale, t } = await pageCtx(params);
  const x = await publicPage("LIBRARY", (await params).slug, locale);
  if (!x) notFound();
  const actor = await getActor();
  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <PageHeader title={x.title} actions={actor ? <ActionButton path={`/library/${x.id}/favorite`} label={t("مفضلة", "Favourite")} success={t("تم", "Done")} /> : undefined} />
      <div className="prose-body" dangerouslySetInnerHTML={{ __html: sanitizeBody(x.body) }} />
      {x.mediaUrl && <p className="mt-4"><a className="btn btn-ghost" href={x.mediaUrl} target="_blank" rel="noopener noreferrer">{t("فتح المادة", "Open the resource")}</a></p>}
    </article>
  );
}
