import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { Empty, PageHeader, Section, Table } from "@/components/ui";
import { fmtDate } from "@/lib/i18n";
import { guard, pageCtx, type PageParams } from "@/lib/page";
import { withActor } from "@/lib/db";
import { SKILL_ADVICE, SKILL_LABELS, TRACK_LABELS } from "@/modules/unified/labels";
import { getPlacement } from "@/modules/unified/service";
import { Notice } from "@/components/ui";
import { currentSkills } from "@/modules/unified/service";

export const metadata = { title: "ملف المستوى | Level profile", robots: { index: false } };

export default async function Report({ params }: PageParams) {
  const { locale, t } = await pageCtx(params);
  const actor = await guard(locale);
  if (!actor.studentId) notFound();
  const sid = actor.studentId;
  const [skills, st] = await Promise.all([currentSkills(actor, sid), withActor(actor, (tx) => tx.student.findUniqueOrThrow({ where: { id: sid } }))]);
  const i = locale === "ar" ? 0 : 1;
  const placement = await getPlacement(actor);
  const weakest = [...skills].sort((a, b) => a.level - b.level).filter((s) => s.level <= 3).slice(0, 3);
  return (
    <>
      <div className="no-print mb-3"><PrintButton label={t("طباعة", "Print")} /></div>
      <PageHeader title={t("ملف المهارات القرآنية", "Quranic skills profile")} subtitle={st.track ? TRACK_LABELS[st.track]?.[i] : undefined} />
      {placement.status === "APPROVED" && (
        <Section title={t("قرار المعلم", "Teacher's decision")}>
          {placement.approvedTrack && <p className="font-semibold">{t("المسار المعتمد", "Approved track")}: {TRACK_LABELS[placement.approvedTrack]?.[i]}</p>}
          {placement.recommendedTrack && placement.recommendedTrack !== placement.approvedTrack && <p className="text-sm text-ink-2">{t("الاقتراح الآلي كان", "The automatic suggestion was")}: {TRACK_LABELS[placement.recommendedTrack]?.[i]}. {t("القرار للمعلم.", "The decision is the teacher's.")}</p>}
          {placement.teacherNote && <p className="mt-2">{placement.teacherNote}</p>}
          {(placement.tajweedPercent !== null || placement.memorizationPercent !== null) && <p className="mt-2 text-xs text-ink-2">{t("مؤشرات آلية لا تحدد المستوى", "Automatic indicators, which do not set the level")}: {placement.tajweedPercent !== null && `${t("التجويد النظري", "Tajweed theory")} ${placement.tajweedPercent}% `}{placement.memorizationPercent !== null && `${t("تحقق الحفظ", "Memorization check")} ${placement.memorizationPercent}%`}</p>}
        </Section>
      )}
      <Section title={t("المهارات", "Skills")}>
        <p className="mb-3 text-sm text-ink-2">{t("لكل مهارة تقييم مستقل من 1 إلى 5 بقرار المعلم. لا توجد درجة إجمالية.", "Each skill has its own 1 to 5 rating decided by the teacher. There is no overall score.")}</p>
        {skills.length === 0 ? <Empty title={t("لا توجد تقييمات بعد.", "No ratings yet.")} /> : (
          <Table caption={t("المهارات", "Skills")} columns={[t("المهارة", "Skill"), t("التقييم", "Rating"), t("مصدر التقييم", "Source"), t("التاريخ", "Date")]}>
            {skills.map((s) => <tr key={s.id}><td>{SKILL_LABELS[s.skill]?.[i] ?? s.skill}</td><td>{s.level} / 5</td><td>{t("تقييم المعلم", "Teacher assessment")}</td><td>{fmtDate(locale, s.createdAt)}</td></tr>)}
          </Table>
        )}
      </Section>
      <Section title={t("ماذا بعد؟", "What next?")}>
        {weakest.length === 0 ? <Notice>{t("لا توجد مهارة تحتاج أولوية خاصة الآن. تابع خطة معلمك.", "No skill needs special priority now. Continue your teacher's plan.")}</Notice> : <ul className="list-disc space-y-1 ps-5">{weakest.map((s) => <li key={s.id}><strong>{SKILL_LABELS[s.skill]?.[i]}: </strong>{SKILL_ADVICE[s.skill]?.[i]}</li>)}</ul>}
      </Section>
    </>
  );
}
