import Link from "next/link";
import { ActionButton } from "@/components/client";
import { Empty, PageHeader, Section, StatusBadge, Table } from "@/components/ui";
import { withActor } from "@/lib/db";
import { fmtDate } from "@/lib/i18n";
import { guard, pageCtx, type PageParams } from "@/lib/page";

export const metadata = { title: "الشهادات | Certificates", robots: { index: false } };

export default async function Certificates({ params }: PageParams) {
  const { locale, t, lp } = await pageCtx(params);
  const actor = await guard(locale, "certificates.request");
  const canApprove = actor.perms.has("certificates.approve");
  const list = await withActor(actor, (tx) => tx.certificate.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { student: { include: { user: { select: { name: true } } } } } }));
  return (
    <>
      <PageHeader title={t("الشهادات", "Certificates")} subtitle={t("لا تصدر شهادة إلا باعتماد شخص مخول غير مقدم الطلب.", "A certificate needs approval from an authorized person other than the requester.")} />
      <Section title={t("السجل", "Register")}>
        {list.length === 0 ? <Empty title={t("لا توجد شهادات.", "No certificates.")} /> : (
          <Table caption={t("الشهادات", "Certificates")} columns={[t("الطالب", "Student"), t("العنوان", "Title"), t("الحالة", "Status"), t("الإصدار", "Issued"), t("إجراءات", "Actions")]}>
            {list.map((c) => (
              <tr key={c.id}>
                <td>{c.student.user.name}</td><td>{c.title}{c.scope && <div className="text-xs text-ink-2">{c.scope}</div>}</td>
                <td><StatusBadge locale={locale} status={c.status} /></td>
                <td>{c.issuedAt ? fmtDate(locale, c.issuedAt) : "—"}</td>
                <td className="flex flex-wrap gap-2">
                  {canApprove && c.status === "PENDING_APPROVAL" && (
                    <>
                      <ActionButton path={`/certificates/${c.id}/decide`} body={{ approve: true }} label={t("اعتماد وإصدار", "Approve and issue")} variant="primary" confirm={t("هل راجعت استحقاق الطالب لهذه الشهادة؟", "Have you reviewed the student's eligibility?")} />
                      <ActionButton path={`/certificates/${c.id}/decide`} body={{ approve: false }} label={t("رفض", "Reject")} />
                    </>
                  )}
                  {c.status === "ISSUED" && (
                    <>
                      <Link className="btn btn-ghost btn-sm" href={lp(`/certificate/${c.id}`)}>{t("عرض", "View")}</Link>
                      {canApprove && <ActionButton path={`/certificates/${c.id}/revoke`} label={t("إلغاء", "Revoke")} variant="danger" confirm={t("إلغاء هذه الشهادة؟", "Revoke this certificate?")} />}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </>
  );
}
