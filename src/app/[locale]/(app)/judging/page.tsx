import Link from "next/link";
import { Empty, PageHeader, Section, StatusBadge } from "@/components/ui";
import { systemDb } from "@/lib/db";
import { fmtDateTime } from "@/lib/i18n";
import { guard, pageCtx, type PageParams } from "@/lib/page";

export const metadata = { title: "جلسات التحكيم | Judging", robots: { index: false } };

export default async function MyJudging({ params }: PageParams) {
  const { locale, t, lp } = await pageCtx(params);
  const actor = await guard(locale, "reviews.write");
  const list = await systemDb().judgingSession.findMany({ where: { judges: { some: { userId: actor.id } } }, orderBy: { scheduledAt: "desc" } });
  return (
    <>
      <PageHeader title={t("جلسات التحكيم", "Judging sessions")} />
      <Section title={t("الجلسات المسندة إلي", "Sessions assigned to me")}>
        {list.length === 0 ? <Empty title={t("لا توجد جلسات مسندة إليك.", "No sessions are assigned to you.")} /> : <ul className="space-y-2">{list.map((s) => <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3"><Link className="underline" href={lp(`/judging/${s.id}`)}>{s.title}</Link><span className="flex items-center gap-2 text-xs">{fmtDateTime(locale, s.scheduledAt)}<StatusBadge locale={locale} status={s.status} /></span></li>)}</ul>}
      </Section>
    </>
  );
}
