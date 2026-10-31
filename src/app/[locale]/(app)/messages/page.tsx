import { ActionForm } from "@/components/client";
import { Empty, PageHeader, Section } from "@/components/ui";
import { systemDb, withActor } from "@/lib/db";
import { fmtDateTime } from "@/lib/i18n";
import { guard, pageCtx, type PageParams } from "@/lib/page";

export const metadata = { title: "الرسائل | Messages", robots: { index: false } };

export default async function Messages({ params }: PageParams) {
  const { locale, t } = await pageCtx(params);
  const actor = await guard(locale);
  const messages = await withActor(actor, (tx) => tx.message.findMany({
    where: { OR: [{ senderId: actor.id }, { recipientId: actor.id }] },
    orderBy: { createdAt: "desc" },
    take: 50,
  }));
  // Names come from the system role because a recipient may not otherwise be able to see the sender.
  const db = systemDb();
  const senders = new Map((await db.user.findMany({ where: { id: { in: messages.map((m) => m.senderId) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const isAdmin = actor.roles.some((r) => r.key === "super_admin" || r.key === "admin");
  const recipients = isAdmin
    ? await db.user.findMany({ where: { status: "ACTIVE", OR: [{ teacher: { isNot: null } }, { guardian: { isNot: null } }] }, select: { id: true, name: true }, take: 500 })
    : actor.teacherId || actor.guardianId
      ? await db.user.findMany({ where: { status: "ACTIVE", roles: { some: { role: { key: { in: ["admin", "super_admin"] } } } } }, select: { id: true, name: true }, take: 50 })
      : [];
  return (
    <>
      <PageHeader title={t("الرسائل", "Messages")} subtitle={t("تواصل منظم بين ولي الأمر ومعلم الطالب بخصوص متابعته فقط.", "Structured communication between a guardian and the student's teacher, about their follow-up only.")} />
      {recipients.length > 0 && (
        <Section title={isAdmin ? t("رسالة جديدة", "New message") : t("مراسلة الإدارة", "Message the administration")}>
          <ActionForm path="/messages" submit={t("إرسال", "Send")} success={t("أرسلت الرسالة.", "Message sent.")} fields={[
            { name: "recipientId", label: t("المستلم", "Recipient"), type: "select", required: true, options: recipients.map((r) => ({ value: r.id, label: r.name })) },
            { name: "body", label: t("الرسالة", "Message"), type: "textarea", required: true },
          ]} />
        </Section>
      )}
      <Section title={t("المراسلات", "Conversations")}>
        {messages.length === 0 ? <Empty title={t("لا توجد رسائل.", "No messages.")} /> : (
          <ul className="space-y-3">
            {messages.map((m) => (
              <li key={m.id} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap justify-between gap-2 text-sm"><strong>{senders.get(m.senderId)}</strong><span className="text-xs text-ink-2">{fmtDateTime(locale, m.createdAt)}</span></div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{m.body}</p>
                {m.senderId !== actor.id && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm underline">{t("رد", "Reply")}</summary>
                    <div className="mt-2">
                      <ActionForm path="/messages" submit={t("إرسال", "Send")} success={t("أرسل.", "Sent.")} fields={[
                        { name: "studentId", label: "", type: "hidden", defaultValue: m.studentId ?? "" },
                        { name: "recipientId", label: "", type: "hidden", defaultValue: m.senderId },
                        { name: "body", label: t("الرسالة", "Message"), type: "textarea", required: true },
                      ]} />
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
