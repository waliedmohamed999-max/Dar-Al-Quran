import { notFound } from "next/navigation";
import { ActionButton } from "@/components/client";
import { RecitationPlayer, RecitationRecorder } from "@/components/recorder";
import { Empty, PageHeader, Section, StatusBadge } from "@/components/ui";
import { systemDb, withActor } from "@/lib/db";
import { fmtDate } from "@/lib/i18n";
import { guard, pageCtx, type PageParams, type SearchProps } from "@/lib/page";

export const metadata = { title: "التسميع | Recitations", robots: { index: false } };

export default async function Recitations({ params, searchParams }: PageParams & SearchProps) {
  const { locale, t } = await pageCtx(params);
  const actor = await guard(locale);
  const studentId = actor.studentId;
  if (!studentId) notFound();
  const sp = await searchParams;
  const { student, subs } = await withActor(actor, async (tx) => ({
    student: await tx.student.findUniqueOrThrow({ where: { id: studentId } }),
    subs: await tx.recitationSubmission.findMany({ where: { studentId, status: { not: "DELETED" } }, orderBy: { createdAt: "desc" }, include: { reviews: { orderBy: { createdAt: "desc" }, take: 1 } } }),
  }));
  const surahs = await systemDb().quranSurah.findMany({ orderBy: { id: "asc" }, select: { id: true, nameArabic: true, nameEnglish: true, ayahCount: true } });
  const nm = (id: number) => { const s = surahs.find((x) => x.id === id)!; return locale === "ar" ? s.nameArabic : s.nameEnglish; };
  return (
    <>
      <PageHeader title={t("التسميع", "Recitations")} subtitle={t("يستمع معلمك إلى تلاوتك ويقيمها بنفسه. لا يوجد تقييم آلي.", "Your teacher listens and assesses your recitation personally. There is no automated grading.")} />
      <Section title={t("تسميع جديد", "New recitation")}>
        <RecitationRecorder
          surahs={surahs}
          taskId={sp.task}
          defaults={{ surahId: Number(sp.surah) || undefined, fromAyah: Number(sp.from) || undefined, toAyah: Number(sp.to) || undefined }}
          needsGuardianConsent={student.isMinor && !student.recordingConsentAt}
        />
      </Section>
      <Section title={t("تسميعاتي", "My recitations")}>
        {subs.length === 0 ? <Empty title={t("لم ترسل تسميعاً بعد.", "No recitations sent yet.")} /> : (
          <ul className="space-y-3">
            {subs.map((s) => (
              <li key={s.id} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{nm(s.surahId)} ({s.fromAyah}–{s.toAyah})</strong>
                  <StatusBadge locale={locale} status={s.status} />
                </div>
                <p className="text-xs text-ink-2">{fmtDate(locale, s.createdAt)} · {t("يحذف تلقائياً بتاريخ", "Auto-deleted on")} {fmtDate(locale, s.deleteAfter)}</p>
                {s.reviews[0] && (
                  <div className="mt-2 rounded bg-surface-2 p-2 text-sm">
                    <p>{t("الحفظ", "Memorization")} {s.reviews[0].memorizationScore}/5 · {t("التجويد", "Tajweed")} {s.reviews[0].tajweedScore}/5 · {t("الطلاقة", "Fluency")} {s.reviews[0].fluencyScore}/5 · {t("المراجعة", "Revision")} {s.reviews[0].revisionScore}/5</p>
                    {s.reviews[0].note && <p className="mt-1">{s.reviews[0].note}</p>}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <RecitationPlayer id={s.id} />
                  <ActionButton path={`/recitations/${s.id}`} method="DELETE" label={t("حذف التسجيل", "Delete recording")} variant="danger" confirm={t("هل تريد حذف هذا التسجيل نهائياً؟", "Delete this recording permanently?")} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
