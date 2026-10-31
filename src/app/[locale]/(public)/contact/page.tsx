import { ActionForm } from "@/components/client";
import { PageHeader } from "@/components/ui";
import { pageCtx, type PageParams } from "@/lib/page";
import { getSetting } from "@/modules/cms/service";

export const metadata = { title: "تواصل معنا | Contact" };

export default async function Contact({ params }: PageParams) {
  const { t } = await pageCtx(params);
  const c = await getSetting<{ email?: string; phone?: string; address?: string }>("contact", {});
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <PageHeader title={t("تواصل معنا", "Contact us")} />
      {(c.email || c.phone || c.address) && (
        <div className="card mb-5 text-sm">
          {c.email && <p>{t("البريد", "Email")}: <a className="underline" href={`mailto:${c.email}`}>{c.email}</a></p>}
          {c.phone && <p dir="ltr" className="text-start">{c.phone}</p>}
          {c.address && <p>{c.address}</p>}
        </div>
      )}
      <div className="card">
        <ActionForm
          path="/contact"
          submit={t("إرسال", "Send")}
          success={t("وصلتنا رسالتك، شكراً لك.", "We received your message, thank you.")}
          fields={[
            { name: "name", label: t("الاسم", "Name"), required: true },
            { name: "email", label: t("البريد الإلكتروني", "Email"), type: "email", required: true },
            { name: "subject", label: t("الموضوع", "Subject"), required: true, full: true },
            { name: "body", label: t("الرسالة", "Message"), type: "textarea", required: true },
          ]}
        />
      </div>
    </div>
  );
}
