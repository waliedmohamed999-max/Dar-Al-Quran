import Link from "next/link";
import { notFound } from "next/navigation";
import { MushafView } from "@/components/mushaf-view";
import { PageHeader } from "@/components/ui";
import { pageCtx, type PageParams } from "@/lib/page";

export const metadata = { title: "أحزاب المصحف | Hizb" };

export default async function HizbPage({ params }: PageParams<{ n: string }>) {
  const { t, lp } = await pageCtx(params);
  const n = Number((await params).n);
  if (!Number.isInteger(n) || n < 1 || n > 60) notFound();
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <PageHeader title={t(`الحزب ${n}`, `Hizb ${n}`)} actions={<nav aria-label={t("التنقل بين الأحزاب", "Hizb navigation")} className="flex gap-2">{n > 1 && <Link className="btn btn-ghost btn-sm" href={lp(`/mushaf/hizb/${n - 1}`)}>{t("السابق", "Previous")}</Link>}{n < 60 && <Link className="btn btn-ghost btn-sm" href={lp(`/mushaf/hizb/${n + 1}`)}>{t("التالي", "Next")}</Link>}</nav>} />
      <MushafView where={{ hizb: n }} />
    </div>
  );
}
