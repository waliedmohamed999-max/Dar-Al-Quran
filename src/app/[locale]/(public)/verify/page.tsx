import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { pageCtx, type PageParams, type SearchProps } from "@/lib/page";

export const metadata = { title: "التحقق من شهادة | Verify certificate" };

export default async function VerifyForm({ params, searchParams }: PageParams & SearchProps) {
  const { t, lp } = await pageCtx(params);
  const code = (await searchParams).code?.trim();
  if (code) redirect(lp(`/verify/${encodeURIComponent(code)}`));
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <PageHeader title={t("التحقق من شهادة", "Verify a certificate")} subtitle={t("أدخل المعرف المطبوع على الشهادة.", "Enter the ID printed on the certificate.")} />
      <form className="card flex gap-2"><label htmlFor="code" className="sr-only">{t("معرف الشهادة", "Certificate ID")}</label><input id="code" name="code" dir="ltr" className="input" required /><button className="btn btn-primary">{t("تحقق", "Verify")}</button></form>
    </div>
  );
}
