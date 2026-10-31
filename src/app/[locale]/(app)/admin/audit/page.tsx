import { Empty, PageHeader, Section, Table } from "@/components/ui";
import { withActor } from "@/lib/db";
import { fmtDateTime } from "@/lib/i18n";
import { guard, pageCtx, type PageParams } from "@/lib/page";

export const metadata = { title: "سجل التدقيق | Audit log", robots: { index: false } };

export default async function Audit({ params }: PageParams) {
  const { locale, t } = await pageCtx(params);
  const actor = await guard(locale, "audit.view");
  const logs = await withActor(actor, (tx) => tx.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { actor: { select: { name: true } } } }));
  return (
    <>
      <PageHeader title={t("سجل التدقيق", "Audit log")} subtitle={t("سجل غير قابل للتعديل من التطبيق، ويحفظ المعرفات لا البيانات الشخصية.", "Cannot be edited by the application. It stores identifiers, not personal data.")} />
      <Section title={t("آخر العمليات", "Latest actions")}>
        {logs.length === 0 ? <Empty title={t("لا توجد سجلات.", "No records.")} /> : (
          <Table caption={t("سجل التدقيق", "Audit log")} columns={[t("الوقت", "Time"), t("المنفذ", "Actor"), t("العملية", "Action"), t("الكيان", "Entity"), t("تفاصيل", "Details")]}>
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap">{fmtDateTime(locale, l.createdAt)}</td>
                <td>{l.actor?.name ?? t("النظام", "System")}</td>
                <td dir="ltr" className="text-start font-mono text-xs">{l.action}</td>
                <td dir="ltr" className="text-start font-mono text-xs">{l.entity}</td>
                <td dir="ltr" className="text-start font-mono text-xs">{JSON.stringify(l.meta)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </>
  );
}
