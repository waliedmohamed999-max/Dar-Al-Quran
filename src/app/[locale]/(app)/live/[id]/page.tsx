import { notFound } from "next/navigation";
import { LiveRoom } from "@/components/academy";
import { ActionForm } from "@/components/client";
import { PageHeader, Section } from "@/components/ui";
import { systemDb, withActor } from "@/lib/db";
import { fmtDateTime } from "@/lib/i18n";
import { guard, pageCtx, type PageParams } from "@/lib/page";

export const metadata = { title: "الفصل المباشر | Live class", robots: { index: false } };

export default async function LivePage({ params }: PageParams<{ id: string }>) {
  const { locale, t, lp } = await pageCtx(params);
  const actor = await guard(locale);
  const id = (await params).id;
  const s = await withActor(actor, (tx) => tx.halaqaSession.findFirst({ where: { id, isOnline: true }, include: { halaqa: { select: { name: true } } } }));
  if (!s) notFound();
  const surahs = await systemDb().quranSurah.findMany({ orderBy: { id: "asc" }, select: { id: true, nameArabic: true, nameEnglish: true } });
  const options = surahs.map((x) => ({ id: x.id, name: locale === "ar" ? x.nameArabic : x.nameEnglish }));
  return (
    <>
      <PageHeader title={s.halaqa.name} subtitle={`${fmtDateTime(locale, s.startsAt)}${s.topic ? ` · ${s.topic}` : ""}`} />
      <LiveRoom sessionId={s.id} surahs={options} attendanceHref={lp(`/teacher/sessions/${s.id}`)} />
      {actor.perms.has("tasks.assign") && (
        <div className="mt-6"><Section title={t("واجب ما بعد الحصة لجميع الأعضاء", "Follow-up work for all members")}>
          <ActionForm path={`/live/${s.id}/homework`} submit={t("إرسال الواجب", "Send")} success={t("أرسل الواجب.", "Sent.")} fields={[
            { name: "date", label: t("التاريخ", "Date"), type: "date", required: true },
            { name: "type", label: t("النوع", "Type"), type: "select", required: true, options: [["NEAR_REVISION", "مراجعة", "Revision"], ["NEW_MEMORIZATION", "حفظ", "Memorization"], ["LISTENING", "استماع", "Listening"], ["RECITATION", "تسميع", "Recitation"]].map(([value, ar, en]) => ({ value, label: t(ar, en) })) },
            { name: "surahId", label: t("السورة", "Surah"), type: "select", options: options.map((x) => ({ value: String(x.id), label: `${x.id}. ${x.name}` })) },
            { name: "fromAyah", label: t("من الآية", "From ayah"), type: "number", min: 1 },
            { name: "toAyah", label: t("إلى الآية", "To ayah"), type: "number", min: 1 },
            { name: "teacherNote", label: t("ملاحظة", "Note"), type: "textarea" },
          ]} />
        </Section></div>
      )}
    </>
  );
}
