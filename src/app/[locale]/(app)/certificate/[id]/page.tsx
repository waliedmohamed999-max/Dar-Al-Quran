import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { PrintButton } from "@/components/print-button";
import { withActor } from "@/lib/db";
import { env } from "@/lib/env";
import { fmtDate } from "@/lib/i18n";
import { guard, pageCtx, type PageParams } from "@/lib/page";
import { getSetting } from "@/modules/cms/service";

export const metadata = { title: "شهادة | Certificate", robots: { index: false } };

export default async function CertificatePage({ params }: PageParams<{ id: string }>) {
  const { locale, t } = await pageCtx(params);
  const actor = await guard(locale);
  const id = (await params).id;
  const c = await withActor(actor, (tx) => tx.certificate.findFirst({ where: { id, status: "ISSUED" }, include: { student: { include: { user: { select: { name: true } } } } } }));
  if (!c) notFound();
  const brand = await getSetting<{ nameAr: string; nameEn: string }>("brand", { nameAr: "دار القرآن الكريم", nameEn: "Dar Al-Quran" });
  const url = `${env.appUrl}/verify/${c.code}`;
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 180, color: { dark: "#0b4a3a", light: "#ffffff" } });
  return (
    <div>
      <div className="no-print mb-4"><PrintButton label={t("طباعة أو حفظ PDF", "Print or save as PDF")} /></div>
      <article className="mx-auto max-w-3xl border-4 border-double border-[#8c6d2b] bg-white p-10 text-center text-[#16251f]">
        <h1 className="text-4xl text-[#0b4a3a]">{brand.nameAr}</h1>
        <p className="mt-6 text-lg">{t("تشهد الدار بأن", "This certifies that")}</p>
        <p className="mt-2 font-display text-3xl font-bold">{c.student.user.name}</p>
        <p className="mt-6 text-2xl text-[#0b4a3a]">{c.title}</p>
        {c.scope && <p className="mt-2">{c.scope}</p>}
        {c.issuedAt && <p className="mt-6 text-sm">{t("تاريخ الإصدار", "Issued on")}: {fmtDate(locale, c.issuedAt)}</p>}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt={t("رمز التحقق من الشهادة", "Certificate verification code")} className="mx-auto mt-6 size-32" />
        <p className="mt-2 break-all text-xs" dir="ltr">{c.code}</p>
        <p className="mt-4 text-xs text-[#4d5d55]">{t("شهادة داخلية صادرة عن الدار بعد اعتماد بشري مخول، ولا تعني اعتماداً حكومياً أو رسمياً خارجياً.", "An internal certificate issued after authorized human approval. It does not imply government or external accreditation.")}</p>
      </article>
    </div>
  );
}
