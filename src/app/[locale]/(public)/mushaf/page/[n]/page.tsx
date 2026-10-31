import Link from "next/link";
import { notFound } from "next/navigation";
import { MushafView } from "@/components/mushaf-view";
import { Notice, PageHeader } from "@/components/ui";
import { pageCtx, type PageParams } from "@/lib/page";

export const metadata = { title: "صفحات المصحف | Mushaf pages" };

export default async function MushafPage({ params }: PageParams<{ n: string }>) {
  const { t, lp } = await pageCtx(params);
  const n = Number((await params).n);
  if (!Number.isInteger(n) || n < 1 || n > 604) notFound();
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <PageHeader
        title={t(`الصفحة ${n}`, `Page ${n}`)}
        actions={
          <nav aria-label={t("التنقل بين الصفحات", "Page navigation")} className="flex flex-wrap items-center gap-2">
            {n > 1 && <Link className="btn btn-ghost btn-sm" href={lp(`/mushaf/page/${n - 1}`)}>{t("السابقة", "Previous")}</Link>}
            {n < 604 && <Link className="btn btn-ghost btn-sm" href={lp(`/mushaf/page/${n + 1}`)}>{t("التالية", "Next")}</Link>}
          </nav>
        }
      />
      <Notice>{t("تتبع الآيات ترقيم صفحات مصحف المدينة وتحفظ حدود الآيات، لكن توزيع الأسطر هنا مرن وليس مطابقاً لتوزيع الأسطر المطبوع.", "Ayahs follow Madinah mushaf page numbering and keep ayah boundaries, but line breaks here are fluid and do not match the printed lines.")}</Notice>
      <MushafView where={{ page: n }} pageMode />
    </div>
  );
}
