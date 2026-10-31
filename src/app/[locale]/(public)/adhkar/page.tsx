import Link from "next/link";
import { DhikrCard } from "@/components/v3";
import { Empty, Notice, PageHeader } from "@/components/ui";
import { pageCtx, type PageParams, type SearchProps } from "@/lib/page";
import { getActor } from "@/lib/session";
import { approvedAdhkar, CATEGORIES } from "@/modules/adhkar/service";

export const metadata = { title: "أذكاري | Adhkar", description: "أذكار موثقة ببيان مصدرها، مع عداد اختياري وتذكيرات بإذن المستخدم." };

export default async function Adhkar({ params, searchParams }: PageParams & SearchProps) {
  const { locale, t, lp } = await pageCtx(params);
  const category = (await searchParams).category ?? "MORNING_EVENING";
  const valid = CATEGORIES.some(([k]) => k === category) ? category : "MORNING_EVENING";
  const [list, actor] = await Promise.all([approvedAdhkar(valid), getActor()]);
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <PageHeader title={t("أذكاري", "My adhkar")} subtitle={t("العداد لك وحدك ولا يحفظ. الذكر عبادة لا تقاس ولا تنافس فيها.", "The counter is yours alone and is not saved. Remembrance is worship, not a score or a competition.")} actions={actor ? <Link className="btn btn-ghost" href={lp("/adhkar/settings")}>{t("التذكيرات", "Reminders")}</Link> : undefined} />
      {list.some((d) => d.reviewedBy === "demo-seed") && <Notice tone="warn">{t("نسخة تجريبية: لم يراجع مختص هذه النصوص بعد، ولم يؤكد ترخيص مصدرها.", "Demo: a specialist has not reviewed these texts, and the source licence is unconfirmed.")}</Notice>}
      <nav aria-label={t("أنواع الأذكار", "Adhkar types")} className="mb-5 flex flex-wrap gap-1.5">{CATEGORIES.map(([k, ar, en]) => <Link key={k} aria-current={k === valid ? "page" : undefined} className={`btn btn-sm ${k === valid ? "btn-primary" : "btn-ghost"}`} href={lp(`/adhkar?category=${k}`)}>{locale === "ar" ? ar : en}</Link>)}</nav>
      {list.length === 0 ? <Empty title={t("لا توجد أذكار معتمدة في هذا القسم بعد.", "No approved adhkar in this section yet.")} hint={t("تنشر بعد المراجعة العلمية.", "They are published after scholarly review.")} /> : <ul className="space-y-4">{list.map((d) => <li key={d.id}><DhikrCard signedIn={Boolean(actor)} d={d} /></li>)}</ul>}
    </div>
  );
}
