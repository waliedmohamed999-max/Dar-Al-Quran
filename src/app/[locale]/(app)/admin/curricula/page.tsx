import { ActionForm } from "@/components/client";
import { Empty, PageHeader, Section, Table } from "@/components/ui";
import { withActor } from "@/lib/db";
import { guard, pageCtx, type PageParams } from "@/lib/page";

export const metadata = { title: "المناهج | Curricula", robots: { index: false } };

export default async function Curricula({ params }: PageParams) {
  const { locale, t } = await pageCtx(params);
  const actor = await guard(locale, "plans.manage");
  const list = await withActor(actor, (tx) => tx.curriculum.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { plans: true } } } }));
  return (
    <>
      <PageHeader title={t("المناهج", "Curricula")} />
      <Section title={t("منهج جديد", "New curriculum")}>
        <ActionForm path="/curricula" submit={t("إضافة", "Add")} fields={[
          { name: "name", label: t("الاسم", "Name"), required: true },
          { name: "level", label: t("المستوى", "Level"), type: "number", min: 1, max: 10, defaultValue: 1, required: true },
          { name: "direction", label: t("اتجاه الحفظ", "Direction"), type: "select", required: true, defaultValue: "REVERSE", options: [{ value: "REVERSE", label: t("من الناس إلى البقرة", "From An-Nas backward") }, { value: "FORWARD", label: t("من الفاتحة إلى الناس", "From Al-Fatiha forward") }] },
          { name: "description", label: t("الوصف", "Description"), type: "textarea" },
        ]} />
      </Section>
      <Section title={t("المناهج الحالية", "Existing curricula")}>
        {list.length === 0 ? <Empty title={t("لا توجد مناهج.", "No curricula.")} /> : (
          <Table caption={t("المناهج", "Curricula")} columns={[t("الاسم", "Name"), t("المستوى", "Level"), t("الخطط", "Plans")]}>
            {list.map((c) => <tr key={c.id}><td>{c.name}<div className="text-xs text-ink-2">{c.description}</div></td><td>{c.level}</td><td>{c._count.plans}</td></tr>)}
          </Table>
        )}
      </Section>
    </>
  );
}
