import { ActionForm } from "@/components/client";
import { RecitationPlayer } from "@/components/recorder";
import { Empty, PageHeader, Section } from "@/components/ui";
import { systemDb, withActor } from "@/lib/db";
import { fmtDate } from "@/lib/i18n";
import { guard, pageCtx, type PageParams } from "@/lib/page";

export const metadata = { title: "تقييم التسميع | Reviews", robots: { index: false } };

export default async function Reviews({ params }: PageParams) {
  const { locale, t } = await pageCtx(params);
  const actor = await guard(locale, "reviews.write");
  const subs = await withActor(actor, (tx) => tx.recitationSubmission.findMany({
    where: { status: { in: ["SUBMITTED", "IN_REVIEW"] } },
    orderBy: { createdAt: "asc" },
    take: 30,
    include: { student: { include: { user: { select: { name: true } } } } },
  }));
  const surahs = await systemDb().quranSurah.findMany({ select: { id: true, nameArabic: true, nameEnglish: true } });
  const nm = (id: number) => { const s = surahs.find((x) => x.id === id)!; return locale === "ar" ? s.nameArabic : s.nameEnglish; };
  const rubric = ["1", "2", "3", "4", "5"].map((v) => ({ value: v, label: v }));
  return (
    <>
      <PageHeader title={t("تقييم التسميع", "Review recitations")} subtitle={t("استمع إلى التلاوة ثم قيمها. اختر عبارات تعين الطالب على التحسن.", "Listen, then assess. Choose words that help the student improve.")} />
      {subs.length === 0 && <Empty title={t("لا يوجد تسميع بانتظار التقييم.", "No recitations awaiting review.")} />}
      {subs.map((s) => (
        <Section key={s.id} title={`${s.student.user.name} — ${nm(s.surahId)} (${s.fromAyah}–${s.toAyah})`} actions={<span className="text-xs text-ink-2">{fmtDate(locale, s.createdAt)}</span>}>
          <div className="mb-3"><RecitationPlayer id={s.id} /></div>
          {s.note && <p className="mb-3 rounded bg-surface-2 p-2 text-sm">{t("ملاحظة الطالب", "Student's note")}: {s.note}</p>}
          <ActionForm
            path={`/recitations/${s.id}/review`}
            submit={t("حفظ التقييم", "Save assessment")}
            transform="review"
            fields={[
              { name: "memorizationScore", label: t("الحفظ (1-5)", "Memorization (1-5)"), type: "select", required: true, defaultValue: "4", options: rubric },
              { name: "tajweedScore", label: t("التجويد (1-5)", "Tajweed (1-5)"), type: "select", required: true, defaultValue: "4", options: rubric },
              { name: "fluencyScore", label: t("الطلاقة (1-5)", "Fluency (1-5)"), type: "select", required: true, defaultValue: "4", options: rubric },
              { name: "revisionScore", label: t("المراجعة (1-5)", "Revision (1-5)"), type: "select", required: true, defaultValue: "4", options: rubric },
              { name: "mistakeCategory", label: t("موضع يحتاج إلى عناية", "Area to focus on"), type: "select", required: true, defaultValue: "tajweed", options: [["memorization", "تثبيت الحفظ", "Memorization"], ["tajweed", "التجويد", "Tajweed"], ["fluency", "الطلاقة", "Fluency"], ["makharij", "مخارج الحروف", "Articulation"], ["waqf", "الوقف والابتداء", "Stopping"]].map(([value, ar, en]) => ({ value, label: t(ar, en) })) },
              { name: "mistakeAyah", label: t("رقم الآية (اختياري)", "Ayah number (optional)"), type: "number", min: 1 },
              { name: "mistakeNote", label: t("توجيه للتحسين (اختياري)", "Guidance (optional)"), full: true },
              { name: "note", label: t("كلمة للطالب", "Note for the student"), type: "textarea" },
              { name: "decision", label: t("القرار", "Decision"), type: "select", required: true, defaultValue: "APPROVED", options: [{ value: "APPROVED", label: t("اعتماد الإنجاز", "Approve") }, { value: "RESUBMIT", label: t("طلب إعادة التسميع", "Ask to recite again") }] },
            ]}
          />
        </Section>
      ))}
    </>
  );
}
