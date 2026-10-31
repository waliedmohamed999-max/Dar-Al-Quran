import Link from "next/link";
import { notFound } from "next/navigation";
import { MushafView } from "@/components/mushaf-view";
import { PageHeader } from "@/components/ui";
import { pageCtx, type PageParams } from "@/lib/page";

export const metadata = { title: "أجزاء المصحف | Juz" };

export default async function JuzPage({ params }: PageParams<{ n: string }>) {
  const { t, lp } = await pageCtx(params);
  const n = Number((await params).n);
  if (!Number.isInteger(n) || n < 1 || n > 30) notFound();
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <PageHeader
        title={t(`الجزء ${n}`, `Juz ${n}`)}
        actions={
          <nav aria-label={t("التنقل بين الأجزاء", "Juz navigation")} className="flex gap-2">
            {n > 1 && <Link className="btn btn-ghost btn-sm" href={lp(`/mushaf/juz/${n - 1}`)}>{t("السابق", "Previous")}</Link>}
            {n < 30 && <Link className="btn btn-ghost btn-sm" href={lp(`/mushaf/juz/${n + 1}`)}>{t("التالي", "Next")}</Link>}
          </nav>
        }
      />
      <MushafView where={{ juz: n }} />
    </div>
  );
}
