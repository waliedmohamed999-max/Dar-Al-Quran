import Link from "next/link";
import { Empty, Notice, PageHeader } from "@/components/ui";
import { systemDb } from "@/lib/db";
import { pageCtx, type PageParams } from "@/lib/page";
import { approved } from "@/lib/scholarly";

export const metadata = { title: "علم التجويد | Tajweed", description: "دروس متدرجة في أحكام التجويد برواية حفص عن عاصم." };

const CATEGORIES: Record<string, [string, string]> = {
  makharij: ["مخارج الحروف وصفاتها", "Articulation and characteristics"],
  "noon-tanween": ["النون الساكنة والتنوين", "Noon sakinah and tanween"],
  meem: ["الميم الساكنة", "Meem sakinah"],
  madd: ["المدود", "Prolongation"],
  qalqalah: ["القلقلة", "Qalqalah"],
  ghunnah: ["الغنة", "Ghunnah"],
  tafkheem: ["التفخيم والترقيق وأحكام الراء واللام", "Heavy and light letters, Raa and Laam"],
  waqf: ["الوقف والابتداء", "Stopping and starting"],
};

export default async function Tajweed({ params }: PageParams) {
  const { locale, t, lp } = await pageCtx(params);
  const rules = await systemDb().tajweedRule.findMany({ where: { ...approved(), riwaya: { key: "hafs-asim" } }, orderBy: { sortOrder: "asc" } });
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <PageHeader title={t("علم التجويد", "Tajweed")} subtitle={t("رواية حفص عن عاصم من طريق الشاطبية. المستوى موضح في كل درس.", "Hafs from Asim via Ash-Shatibiyyah. The level appears on each lesson.")} />
      {rules.some((r) => r.reviewedBy === "demo-seed") && <Notice tone="warn">{t("نسخة تجريبية: نصوص الدروس لم تراجع علمياً بعد، وظهورها هنا لأغراض العرض فقط.", "Demo: lesson texts have not had scholarly review and appear here for demonstration only.")}</Notice>}
      {rules.length === 0 && <Empty title={t("لا توجد دروس منشورة بعد.", "No lessons published yet.")} hint={t("تنشر الدروس بعد المراجعة العلمية.", "Lessons are published after scholarly review.")} />}
      <section className="mb-8" aria-label={t("المستويات", "Levels")}>
        <h2 className="mb-3 text-2xl text-brand">{t("مسار التعلم بالمستويات", "Learning path by level")}</h2>
        <ol className="grid gap-3 md:grid-cols-4">
          {[[1, "التأسيس والنطق", "Foundation and pronunciation"], [2, "الأحكام الأساسية", "Core rules"], [3, "التطبيق المتقدم", "Advanced application"], [4, "الإتقان العملي", "Practical mastery"]].map(([n, ar, en]) => {
            const count = rules.filter((r) => r.level === n).length;
            return <li key={n as number} className="card"><p className="text-xs font-bold text-gold">{t("المستوى", "Level")} {n}</p><p className="font-semibold text-brand">{t(ar as string, en as string)}</p><p className="text-sm text-ink-2">{n === 4 ? t("عرض عملي على المعلم", "Practical recitation to a teacher") : t(`${count} درساً`, `${count} lessons`)}</p></li>;
          })}
        </ol>
      </section>
      {Object.entries(CATEGORIES).map(([key, [ar, en]]) => {
        const items = rules.filter((r) => r.category === key);
        if (!items.length) return null;
        return (
          <section key={key} className="mb-8">
            <h2 className="mb-3 text-2xl text-brand">{locale === "ar" ? ar : en}</h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((r) => (
                <li key={r.slug}>
                  <Link href={lp(`/tajweed/${r.slug}`)} className="card block h-full no-underline hover:border-gold">
                    <span className="block font-semibold">{locale === "ar" ? r.titleAr : r.titleEn}</span>
                    <span className="text-xs text-ink-2">{t("المستوى", "Level")} {r.level}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
