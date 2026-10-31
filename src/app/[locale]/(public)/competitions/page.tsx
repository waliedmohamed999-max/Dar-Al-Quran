import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { fmtDateTime } from "@/lib/i18n";
import { pageCtx, type PageParams } from "@/lib/page";
import { publicCompetitions } from "@/modules/unified/service";

export const metadata = { title: "المسابقات والاختبارات | Competitions", description: "مسابقات واختبارات في الحفظ والتجويد والتفسير والحديث بمعايير منشورة." };

export default async function Competitions({ params }: PageParams) {
  const { locale, t, lp } = await pageCtx(params);
  const list = await publicCompetitions();
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <PageHeader title={t("المسابقات والاختبارات", "Competitions and examinations")} subtitle={t("معايير منشورة، وتصحيح آلي للموضوعي، وبشري للتسميع، وحق الاعتراض.", "Published criteria, automatic grading for objective questions, human grading for recitation, and a right to appeal.")} />
      {list.length === 0 ? <Empty title={t("لا توجد مسابقات منشورة حالياً.", "No competitions are published right now.")} /> : (
        <ul className="grid gap-4 md:grid-cols-2">{list.map((c) => <li key={c.id}><Link href={lp(`/competitions/${c.slug}`)} className="card lift block h-full no-underline"><h2 className="text-xl text-brand">{c.title}</h2><p className="mt-1 text-sm text-ink-2">{c.description.slice(0, 120)}</p><p className="mt-2 text-xs text-gold">{t("الاختبار", "Exam")}: {fmtDateTime(locale, c.examStartsAt)}</p>{c.isDemo && <p className="mt-1 text-xs text-warn">{t("مسابقة تجريبية", "Demo competition")}</p>}</Link></li>)}</ul>
      )}
    </div>
  );
}
