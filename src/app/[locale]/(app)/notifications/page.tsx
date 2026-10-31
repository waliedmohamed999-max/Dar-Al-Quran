import Link from "next/link";
import { ActionButton } from "@/components/client";
import { Empty, PageHeader } from "@/components/ui";
import { fmtDateTime } from "@/lib/i18n";
import { guard, pageCtx, type PageParams } from "@/lib/page";
import { myNotifications } from "@/modules/people/service";

export const metadata = { title: "الإشعارات | Notifications", robots: { index: false } };

export default async function Notifications({ params }: PageParams) {
  const { locale, t, lp } = await pageCtx(params);
  const actor = await guard(locale);
  const items = await myNotifications(actor);
  return (
    <>
      <PageHeader title={t("الإشعارات", "Notifications")} />
      {items.length === 0 ? <Empty title={t("لا توجد إشعارات.", "No notifications.")} /> : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li key={n.id} className={`card ${n.readAt ? "" : "border-gold"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>{n.href ? <Link className="underline" href={lp(n.href)}>{n.title}</Link> : n.title}</strong>
                <span className="text-xs text-ink-2">{fmtDateTime(locale, n.createdAt)}</span>
              </div>
              <p className="text-sm">{n.body}</p>
              {!n.readAt && <div className="mt-2"><ActionButton path={`/me/notifications/${n.id}/read`} label={t("تمت القراءة", "Mark as read")} /></div>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
