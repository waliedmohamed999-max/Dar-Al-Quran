import Link from "next/link";
import { ActionForm } from "@/components/client";
import { Empty, Notice, PageHeader, Section, StatusBadge } from "@/components/ui";
import { withActor } from "@/lib/db";
import { fmtDateTime } from "@/lib/i18n";
import { guard, pageCtx, type PageParams } from "@/lib/page";
import { liveDomain } from "@/modules/halaqat/live";

export const metadata = { title: "الفصول المباشرة | Live classes", robots: { index: false } };

export default async function LiveList({ params }: PageParams) {
  const { locale, t, lp } = await pageCtx(params);
  const actor = await guard(locale);
  const canCreate = actor.perms.has("halaqas.manage") || Boolean(actor.teacherId);
  const sid = actor.studentId;
  const { sessions, halaqas } = await withActor(actor, async (tx) => ({
    sessions: await tx.halaqaSession.findMany({
      where: { isOnline: true, startsAt: { gte: new Date(Date.now() - 86400000) }, ...(sid && !canCreate ? { halaqa: { enrollments: { some: { studentId: sid, status: "ACTIVE" } } } } : actor.teacherId && !actor.perms.has("halaqas.manage") ? { OR: [{ halaqa: { teacherId: actor.teacherId } }, { substituteTeacherId: actor.teacherId }] } : {}) },
      orderBy: { startsAt: "asc" }, take: 30, include: { halaqa: { select: { name: true } } },
    }),
    halaqas: canCreate ? await tx.halaqa.findMany({ where: actor.perms.has("halaqas.manage") ? { active: true } : { active: true, teacherId: actor.teacherId }, select: { id: true, name: true } }) : [],
  }));
  return (
    <>
      <PageHeader title={t("الفصول المباشرة", "Live classes")} subtitle={t("الدخول لأعضاء الحلقة ومعلمها فقط، ولا تسجل الحصص.", "Only the halaqa's members and teacher can join. Sessions are not recorded.")} />
      {!liveDomain() && canCreate && <Notice tone="warn">{t("لم يهيأ مزود الفيديو (LIVE_JITSI_DOMAIN)، فسيستخدم رابط الاجتماع المحفوظ للحلقة إن وجد.", "No video provider is configured (LIVE_JITSI_DOMAIN), so the halaqa's saved meeting link is used if present.")}</Notice>}
      {canCreate && (
        <Section title={t("جدولة حصة مباشرة", "Schedule a live session")}>
          {halaqas.length === 0 ? <Empty title={t("لا توجد حلقات.", "No halaqas.")} /> : (
            <ActionForm path="/live" submit={t("جدولة وإشعار الأعضاء", "Schedule and notify members")} fields={[
              { name: "halaqaId", label: t("الحلقة", "Halaqa"), type: "select", required: true, options: halaqas.map((h) => ({ value: h.id, label: h.name })) },
              { name: "startsAt", label: t("الموعد", "Start"), type: "datetime-local", required: true },
              { name: "minutes", label: t("المدة بالدقائق", "Minutes"), type: "number", min: 10, max: 300, defaultValue: 60, required: true },
              { name: "topic", label: t("الموضوع", "Topic") },
            ]} />
          )}
        </Section>
      )}
      <Section title={t("الحصص", "Sessions")}>
        {sessions.length === 0 ? <Empty title={t("لا توجد حصص مباشرة قادمة.", "No upcoming live sessions.")} /> : (
          <ul className="space-y-2">{sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3">
              <span><strong>{s.halaqa.name}</strong>{s.topic && ` — ${s.topic}`}<br /><span className="text-sm text-ink-2">{fmtDateTime(locale, s.startsAt)}</span></span>
              <span className="flex items-center gap-2"><StatusBadge locale={locale} status={s.status} /><Link className="btn btn-primary btn-sm" href={lp(`/live/${s.id}`)}>{t("فتح الفصل", "Open class")}</Link></span>
            </li>
          ))}</ul>
        )}
      </Section>
    </>
  );
}
