import { notFound } from "next/navigation";
import { ActionForm } from "@/components/client";
import { AudioLink } from "@/components/v3";
import { Empty, PageHeader, Section } from "@/components/ui";
import { withActor } from "@/lib/db";
import { guard, pageCtx, type PageParams } from "@/lib/page";
import { SKILL_LABELS, TRACK_LABELS } from "@/modules/unified/labels";
import { SKILLS, TRACKS } from "@/modules/unified/service";

export const metadata = { title: "تقييم المستوى | Placement reviews", robots: { index: false } };

export default async function Reviews({ params }: PageParams) {
  const { locale, t } = await pageCtx(params);
  const actor = await guard(locale, "reviews.write");
  if (!actor.teacherId && !actor.perms.has("students.view_all")) notFound();
  const list = await withActor(actor, (tx) => tx.placementAssessment.findMany({ where: { status: "SUBMITTED" }, orderBy: { updatedAt: "asc" }, take: 30, include: { student: { include: { user: { select: { name: true } } } } } }));
  const i = locale === "ar" ? 0 : 1;
  const levels = ["1", "2", "3", "4", "5"].map((v) => ({ value: v, label: v }));
  return (
    <>
      <PageHeader title={t("تقييم المستوى", "Placement reviews")} subtitle={t("يظهر طلب الطالب لمعلمه وللمشرفين. قرارك يحدد المهارات والمسار.", "A request appears for the student's teacher and supervisors. Your decision sets the skills and track.")} />
      {list.length === 0 && <Empty title={t("لا توجد طلبات.", "No requests.")} />}
      {list.map((p) => {
        const intake = p.intake as Record<string, string | number>;
        return (
          <Section key={p.id} title={p.student.user.name}>
            <dl className="mb-3 grid gap-2 text-sm sm:grid-cols-3">
              <div><dt className="text-ink-2">{t("الأجزاء المذكورة", "Juz claimed")}</dt><dd>{intake.memorizedJuz ?? "—"}</dd></div>
              <div><dt className="text-ink-2">{t("مؤشر أسئلة التجويد", "Tajweed questions indicator")}</dt><dd>{p.tajweedPercent ?? "—"}{p.tajweedPercent != null && "%"}</dd></div>
              <div><dt className="text-ink-2">{t("مؤشر تحقق الحفظ", "Memorization check indicator")}</dt><dd>{p.memorizationPercent ?? "—"}{p.memorizationPercent != null && "%"}</dd></div>
            </dl>
            <div className="mb-3 flex flex-wrap gap-4 text-sm">
              <span>{t("القراءة", "Reading")}: {p.readingFileId ? <AudioLink path={`/placement/${p.id}/audio/reading`} /> : "—"}</span>
              <span>{t("الحفظ", "Memorization")}: {p.memorizationFileId ? <AudioLink path={`/placement/${p.id}/audio/memorization`} /> : "—"}</span>
            </div>
            <ActionForm path={`/placement/${p.id}/review`} submit={t("اعتماد المستوى والمسار", "Confirm level and track")} transform="placementReview" fields={[
              ...SKILLS.map((s) => ({ name: s, label: SKILL_LABELS[s][i], type: "select" as const, required: true, defaultValue: "3", options: levels })),
              { name: "track", label: t("المسار", "Track"), type: "select", required: true, defaultValue: p.recommendedTrack ?? undefined, hint: t("القيمة الحالية توصية يمكنك تغييرها.", "The current value is a recommendation you can change."), options: TRACKS.map((v) => ({ value: v, label: TRACK_LABELS[v][i] })) },
              { name: "note", label: t("ملاحظات", "Notes"), type: "textarea" },
            ]} />
          </Section>
        );
      })}
    </>
  );
}
