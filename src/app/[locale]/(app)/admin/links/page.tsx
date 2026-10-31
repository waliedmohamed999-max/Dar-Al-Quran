import { ActionButton, ActionForm } from "@/components/client";
import { Empty, PageHeader, Section, StatusBadge } from "@/components/ui";
import { withActor } from "@/lib/db";
import { guard, pageCtx, type PageParams } from "@/lib/page";

export const metadata = { title: "ربط أولياء الأمور | Guardian links", robots: { index: false } };

export default async function Links({ params }: PageParams) {
  const { locale, t } = await pageCtx(params);
  const actor = await guard(locale, "guardians.link");
  const links = await withActor(actor, (tx) => tx.guardianStudentLink.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 100,
    include: { guardian: { include: { user: { select: { name: true, email: true } } } }, student: { include: { user: { select: { name: true } } } } },
  }));
  return (
    <>
      <PageHeader title={t("ربط أولياء الأمور", "Guardian links")} subtitle={t("تحقق من صلة ولي الأمر بالوثائق المعتمدة لدى الدار قبل الاعتماد.", "Verify the guardian's relationship through the school's approved documents before approving.")} />
      <Section title={t("الطلبات", "Requests")}>
        {links.length === 0 ? <Empty title={t("لا توجد طلبات.", "No requests.")} /> : (
          <ul className="space-y-3">
            {links.map((l) => (
              <li key={l.id} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><strong>{l.guardian.user.name}</strong> ({l.relation}) ← {l.student.user.name}</span>
                  <StatusBadge locale={locale} status={l.status} />
                </div>
                {l.status === "PENDING" && (
                  <div className="mt-2 space-y-2">
                    <ActionForm path={`/guardian/links/${l.id}/decide`} submit={t("اعتماد الربط", "Approve link")} transform="approveLink" fields={[{ name: "verified", label: t("تحققت رسمياً من صلة ولي الأمر بالطالب", "I officially verified this relationship"), type: "checkbox", required: true }]} />
                    <ActionButton path={`/guardian/links/${l.id}/decide`} body={{ approve: false }} label={t("رفض", "Reject")} />
                  </div>
                )}
                {l.status === "APPROVED" && <div className="mt-2"><ActionButton path={`/guardian/links/${l.id}/revoke`} label={t("إلغاء الربط", "Revoke link")} variant="danger" confirm={t("سيفقد ولي الأمر الوصول فوراً. متابعة؟", "The guardian loses access immediately. Continue?")} /></div>}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
