import Link from "next/link";
import { notFound } from "next/navigation";
import { Empty, PageHeader, Section, StatusBadge } from "@/components/ui";
import { withActor } from "@/lib/db";
import { guard, pageCtx, type PageParams } from "@/lib/page";

export const metadata = { title: "الاختبارات | Assessments", robots: { index: false } };

export default async function Assessments({ params }: PageParams) {
  const { locale, t, lp } = await pageCtx(params);
  const actor = await guard(locale);
  const studentId = actor.studentId;
  if (!studentId) notFound();
  const { list, certs } = await withActor(actor, async (tx) => ({
    list: await tx.assessment.findMany({
      where: { published: true, OR: [{ halaqaId: null }, { halaqa: { enrollments: { some: { studentId, status: "ACTIVE" } } } }] },
      orderBy: { createdAt: "desc" },
      include: { attempts: { where: { studentId } } },
    }),
    certs: await tx.certificate.findMany({ where: { studentId, status: "ISSUED" } }),
  }));
  return (
    <>
      <PageHeader title={t("الاختبارات والشهادات", "Assessments and certificates")} />
      <Section title={t("الاختبارات", "Assessments")}>
        {list.length === 0 ? <Empty title={t("لا توجد اختبارات متاحة.", "No assessments available.")} /> : (
          <ul className="space-y-2">
            {list.map((a) => {
              const att = a.attempts[0];
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3">
                  <span><strong>{a.title}</strong>{att?.scorePercent != null && <span className="ms-2 text-sm">{att.scorePercent}%</span>}</span>
                  {att && att.status !== "IN_PROGRESS" ? <StatusBadge locale={locale} status={att.status} /> : <Link className="btn btn-primary btn-sm" href={lp(`/student/assessments/${a.id}`)}>{t("ابدأ", "Start")}</Link>}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
      <Section title={t("شهاداتي", "My certificates")}>
        {certs.length === 0 ? <Empty title={t("لا توجد شهادات بعد.", "No certificates yet.")} hint={t("تصدر الشهادات بعد اعتماد بشري مخول من الدار.", "Certificates are issued after authorized human approval.")} /> : (
          <ul className="space-y-1">{certs.map((c) => <li key={c.id}><Link className="underline" href={lp(`/certificate/${c.id}`)}>{c.title}</Link></li>)}</ul>
        )}
      </Section>
    </>
  );
}
