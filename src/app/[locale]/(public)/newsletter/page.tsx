import { PageHeader } from "@/components/ui";
import { pageCtx, type PageParams, type SearchProps } from "@/lib/page";
import { confirmNewsletter, unsubscribe } from "@/modules/site/service";

export const metadata = { title: "النشرة | Newsletter", robots: { index: false } };

export default async function Newsletter({ params, searchParams }: PageParams & SearchProps) {
  const { t } = await pageCtx(params);
  const { confirm, unsub } = await searchParams;
  const ok = confirm ? await confirmNewsletter(confirm) : unsub ? await unsubscribe(unsub) : false;
  const msg = !ok ? t("الرابط غير صالح أو استخدم من قبل.", "This link is invalid or was already used.") : confirm ? t("تم تأكيد اشتراكك.", "Your subscription is confirmed.") : t("تم إلغاء اشتراكك.", "You have been unsubscribed.");
  return <div className="mx-auto max-w-xl px-4 py-14"><PageHeader title={t("النشرة البريدية", "Newsletter")} /><p role="status" className="card">{msg}</p></div>;
}
