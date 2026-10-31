import Link from "next/link";
import { notFound } from "next/navigation";
import { Empty, PageHeader, Section, StatusBadge } from "@/components/ui";
import { withActor } from "@/lib/db";
import { fmtDate } from "@/lib/i18n";
import { guard, pageCtx, type PageParams } from "@/lib/page";
import { approved } from "@/lib/scholarly";

export const metadata = { title: "حفظ الحديث | Hadith memorization", robots: { index: false } };

export default async function MyHadith({ params }: PageParams) {
  const { locale, t, lp } = await pageCtx(params);
  const actor = await guard(locale);
  const studentId = actor.studentId;
  if (!studentId) notFound();
  const list = await withActor(actor, (tx) => tx.hadithMemorization.findMany({ where: { studentId, hadith: approved() }, orderBy: { updatedAt: "desc" }, include: { hadith: { select: { number: true, text: true, collection: { select: { slug: true, titleAr: true } } } } } }));
  return (
    <>
      <PageHeader title={t("حفظ الحديث", "Hadith memorization")} subtitle={t("الإتقان يعتمده المعلم بعد التسميع، ولا يثبت بالتمارين وحدها.", "A teacher confirms mastery after recitation. Exercises alone do not establish it.")} actions={<Link className="btn btn-ghost" href={lp("/hadith")}>{t("تصفح المسارات", "Browse tracks")}</Link>} />
      <Section title={t("أحاديث خطتي", "Hadiths in my plan")}>
        {list.length === 0 ? <Empty title={t("لا توجد أحاديث في خطتك.", "No hadiths in your plan.")} /> : <ul className="space-y-2">{list.map((m) => <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3"><Link className="underline" href={lp(`/hadith/${m.hadith.collection.slug}/${m.hadith.number}`)}>{m.hadith.collection.titleAr}: {m.hadith.number}</Link><span className="flex items-center gap-2 text-xs">{m.reciteBy && <span>{t("التسميع", "Recite by")} {fmtDate(locale, m.reciteBy)}</span>}{m.nextReviewAt && <span>{t("المراجعة", "Review")} {fmtDate(locale, m.nextReviewAt)}</span>}<StatusBadge locale={locale} status={m.status} /></span></li>)}</ul>}
      </Section>
    </>
  );
}
