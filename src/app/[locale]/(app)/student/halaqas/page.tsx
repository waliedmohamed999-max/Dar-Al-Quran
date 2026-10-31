import { ActionButton } from "@/components/client";
import { Empty, PageHeader, Section, StatusBadge } from "@/components/ui";
import { withActor } from "@/lib/db";
import { label, WEEKDAYS } from "@/lib/i18n";
import { guard, pageCtx, type PageParams } from "@/lib/page";

export const metadata = { title: "الحلقات | Halaqas", robots: { index: false } };

const time = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export default async function StudentHalaqas({ params }: PageParams) {
  const { locale, t } = await pageCtx(params);
  const actor = await guard(locale);
  const studentId = actor.studentId ?? "";
  const { halaqas, mine } = await withActor(actor, async (tx) => ({
    halaqas: await tx.halaqa.findMany({ where: { active: true }, include: { schedule: true }, orderBy: { name: "asc" } }),
    mine: await tx.enrollment.findMany({ where: { studentId } }),
  }));
  return (
    <>
      <PageHeader title={t("الحلقات", "Halaqas")} subtitle={t("تراجع الإدارة طلبات الانتساب، وتضاف الطلبات عند اكتمال العدد إلى قائمة الانتظار.", "The administration reviews requests. When a halaqa is full, requests join the waiting list.")} />
      <Section title={t("الحلقات المتاحة", "Available halaqas")}>
        {halaqas.length === 0 ? <Empty title={t("لا توجد حلقات متاحة حالياً.", "No halaqas available right now.")} /> : (
          <ul className="grid gap-3 md:grid-cols-2">
            {halaqas.map((h) => {
              const e = mine.find((x) => x.halaqaId === h.id);
              return (
                <li key={h.id} className="rounded-xl border border-line p-3">
                  <div className="flex items-center justify-between gap-2"><strong>{h.name}</strong>{e && <StatusBadge locale={locale} status={e.status} />}</div>
                  <p className="text-sm text-ink-2">{label(locale, h.mode)} · {t("المستوى", "Level")} {h.level}{h.ageGroup ? ` · ${h.ageGroup}` : ""}</p>
                  <ul className="mt-1 text-sm">{h.schedule.map((s) => <li key={s.id}>{WEEKDAYS[locale][s.weekday]} {time(s.startMin)}–{time(s.endMin)}</li>)}</ul>
                  <div className="mt-2">
                    {!e && <ActionButton path={`/halaqas/${h.id}/enroll`} body={{}} label={t("طلب الانتساب", "Request to join")} variant="primary" />}
                    {e && ["ACTIVE", "PENDING", "WAITLISTED"].includes(e.status) && <ActionButton path={`/enrollments/${e.id}/withdraw`} label={t("انسحاب", "Withdraw")} confirm={t("هل تريد الانسحاب من هذه الحلقة؟", "Withdraw from this halaqa?")} />}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </>
  );
}
