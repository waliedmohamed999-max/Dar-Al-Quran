import { ActionButton, ActionForm } from "@/components/client";
import { Empty, Notice, PageHeader, Section, StatusBadge } from "@/components/ui";
import { fmtDateTime } from "@/lib/i18n";
import { guard, pageCtx, type PageParams } from "@/lib/page";
import { sessionConsole } from "@/modules/judging/service";

export const metadata = { title: "جلسة تحكيم | Judging session", robots: { index: false } };

export default async function JudgingConsole({ params }: PageParams<{ id: string }>) {
  const { locale, t } = await pageCtx(params);
  const actor = await guard(locale);
  const s = await sessionConsole(actor, (await params).id);
  const manage = actor.perms.has("assessments.manage");
  const open = s.status === "OPEN";
  const final = s.status === "CLOSED" || s.status === "APPROVED";
  return (
    <>
      <PageHeader title={s.title} subtitle={`${s.competition.title} · ${fmtDateTime(locale, s.scheduledAt)}`} actions={<StatusBadge locale={locale} status={s.status} />} />
      <Notice>{t("يرى كل محكم درجاته فقط حتى إغلاق التحكيم. لا تظهر الأسماء علناً: تعرض النتائج العامة بالرمز.", "Each judge sees only their own marks until scoring closes. Names are not public: public results use codes.")}</Notice>
      <Section title={t("سير الجلسة", "Session controls")}>
        <div className="flex flex-wrap gap-2">
          {s.status === "SCHEDULED" && <ActionButton path={`/judging/${s.id}/open`} label={t("فتح الجلسة", "Open session")} variant="primary" />}
          {open && <ActionButton path={`/judging/${s.id}/close`} label={t("إغلاق التحكيم", "Close scoring")} confirm={t("لن تعدل الدرجات بعد الإغلاق. متابعة؟", "Scores cannot change after closing. Continue?")} />}
          {s.status === "CLOSED" && manage && <ActionButton path={`/judging/${s.id}/approve`} label={t("اعتماد النتائج", "Approve results")} variant="primary" confirm={t("هل راجعت الفروق بين المحكمين؟", "Have you reviewed differences between judges?")} />}
        </div>
      </Section>
      <Section title={t("نموذج التحكيم", "Rubric")}>
        <ul className="list-disc space-y-1 ps-5 text-sm">{s.criteria.map((c) => <li key={c.id}><strong>{c.labelAr}</strong> ({t(`من ${c.maxScore}، الوزن ${c.weight}`, `of ${c.maxScore}, weight ${c.weight}`)}): {c.guidanceAr}</li>)}</ul>
      </Section>
      <Section title={t("المشاركون", "Participants")}>
        {s.entries.length === 0 ? <Empty title={t("لا يوجد مشاركون.", "No participants.")} /> : (
          <ul className="space-y-4">
            {s.entries.map((e) => {
              const mine = new Map(e.mine.map((m) => [m.criterionId, m.score]));
              return (
                <li key={e.id} className={`rounded-xl border p-3 ${e.status === "ON_STAGE" ? "border-gold" : "border-line"}`} data-testid={`entry-${e.code}`}>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span><strong>{e.name}</strong> <span className="text-xs text-ink-2">{e.code}</span> <StatusBadge locale={locale} status={e.status} /></span>
                    <span className="flex flex-wrap gap-1.5">
                      {open && e.status !== "ON_STAGE" && <ActionButton path={`/judging/entries/${e.id}/status`} method="PUT" body={{ status: "ON_STAGE" }} label={t("استدعاء", "Call")} />}
                      {open && e.status !== "ABSENT" && <ActionButton path={`/judging/entries/${e.id}/status`} method="PUT" body={{ status: "ABSENT" }} label={t("غائب", "Absent")} />}
                    </span>
                  </div>
                  <p className="mb-2 text-xs text-ink-2">{t(`سجل الدرجات ${e.scoredBy} من ${s.judgeCount} محكمين`, `${e.scoredBy} of ${s.judgeCount} judges have scored`)}</p>
                  {open && s.isJudge && e.status !== "ABSENT" && (
                    <ActionForm path={`/judging/entries/${e.id}/scores`} method="PUT" transform="scores" resetOnSuccess={false} submit={t("حفظ درجاتي", "Save my scores")} fields={s.criteria.map((c) => ({ name: c.id, label: `${c.labelAr} (0–${c.maxScore})`, type: "number" as const, min: 0, max: c.maxScore, required: true, defaultValue: mine.get(c.id) }))} />
                  )}
                  {final && e.finalPercent !== null && <p className="font-semibold">{t("النتيجة", "Result")}: {e.finalPercent}%{e.spread !== null && e.spread >= 20 && <span className="ms-2 text-sm text-warn">{t(`فرق كبير بين المحكمين: ${e.spread}`, `Wide difference between judges: ${e.spread}`)}</span>}</p>}
                  {s.status === "APPROVED" && e.finalPercent !== null && e.finalPercent >= s.passPercent && actor.perms.has("certificates.request") && (
                    <ActionForm path="/certificates/from-result" submit={t("طلب شهادة للاعتماد", "Request a certificate for approval")} fields={[
                      { name: "evidenceType", type: "hidden", label: "", defaultValue: "judging" }, { name: "evidenceId", type: "hidden", label: "", defaultValue: e.id },
                      { name: "title", label: t("عنوان الشهادة", "Certificate title"), required: true, defaultValue: `${s.competition.title}` },
                    ]} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </>
  );
}
