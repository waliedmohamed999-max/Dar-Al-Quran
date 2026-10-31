import { Empty, Notice, PageHeader } from "@/components/ui";
import { fmtDate } from "@/lib/i18n";
import { pageCtx, type PageParams } from "@/lib/page";
import { verifyCertificate } from "@/modules/assessments/service";

export const metadata = { title: "التحقق من شهادة | Verify certificate", robots: { index: false } };

export default async function Verify({ params }: PageParams<{ code: string }>) {
  const { locale, t } = await pageCtx(params);
  const c = await verifyCertificate((await params).code);
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <PageHeader title={t("التحقق من الشهادة", "Certificate verification")} />
      {!c ? <Empty title={t("لم يعثر على شهادة بهذا المعرف.", "No certificate found with this ID.")} /> : (
        <div className="card space-y-1">
          {c.status === "REVOKED" ? <Notice tone="danger">{t("هذه الشهادة ملغاة.", "This certificate has been revoked.")}</Notice> : <Notice>{t("شهادة صحيحة صادرة عن دار القرآن الكريم بعد اعتماد بشري مخول.", "A valid certificate issued by Dar Al-Quran after authorized human approval.")}</Notice>}
          <p><strong>{c.title}</strong></p>
          {c.scope && <p>{c.scope}</p>}
          {c.studentFirstName && <p>{t("الاسم الأول", "First name")}: {c.studentFirstName}</p>}
          {c.issuedAt && <p>{t("تاريخ الإصدار", "Issued")}: {fmtDate(locale, c.issuedAt)}</p>}
          <p className="break-all text-xs text-ink-2" dir="ltr">{c.code}</p>
          <p className="text-xs text-ink-2">{t("شهادة داخلية من الدار، ولا تعني اعتماداً حكومياً أو رسمياً خارجياً.", "An internal certificate from the school; it does not imply government or external accreditation.")}</p>
        </div>
      )}
    </div>
  );
}
