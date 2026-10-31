import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { pageCtx, type PageParams } from "@/lib/page";
import { publicPage } from "@/modules/cms/service";

export const metadata = { title: "الخصوصية | Privacy" };

export default async function Privacy({ params }: PageParams) {
  const { locale } = await pageCtx(params);
  const p = await publicPage("PAGE", "privacy", locale);
  if (!p) notFound();
  return <div className="mx-auto max-w-3xl px-4 py-10"><PageHeader title={p.title} /><div className="prose-body" dangerouslySetInnerHTML={{ __html: p.body }} /></div>;
}
