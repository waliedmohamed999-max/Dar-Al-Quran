import { AdhkarSettings } from "@/components/v3";
import { Empty, PageHeader, Section } from "@/components/ui";
import { withActor } from "@/lib/db";
import { fmtDateTime, WEEKDAYS } from "@/lib/i18n";
import { guard, pageCtx, type PageParams } from "@/lib/page";
import { CALC_METHODS } from "@/modules/adhkar/engine";

export const metadata = { title: "تذكيرات الأذكار | Adhkar reminders", robots: { index: false } };

export default async function Settings({ params }: PageParams) {
  const { locale, t } = await pageCtx(params);
  const actor = await guard(locale);
  const { pref, logs } = await withActor(actor, async (tx) => ({
    pref: await tx.adhkarPreference.findUnique({ where: { userId: actor.id } }),
    logs: await tx.adhkarNotificationLog.findMany({ where: { userId: actor.id }, orderBy: { createdAt: "desc" }, take: 20 }),
  }));
  return (
    <>
      <PageHeader title={t("تذكيرات الأذكار", "Adhkar reminders")} subtitle={t("معطلة حتى تفعلها. لا صوت تلقائي، ولا يقاس التزامك.", "Off until you enable them. No automatic sound, and your practice is never measured.")} />
      <Section title={t("الإعدادات", "Settings")}><AdhkarSettings pref={pref} vapid={process.env.VAPID_PUBLIC_KEY || null} methods={CALC_METHODS} days={WEEKDAYS[locale]} /></Section>
      <Section title={t("سجل التذكيرات", "Reminder log")}>
        {logs.length === 0 ? <Empty title={t("لم يرسل أي تذكير بعد.", "No reminders sent yet.")} /> : <ul className="space-y-1 text-sm">{logs.map((l) => <li key={l.id} className="flex justify-between border-b border-line pb-1"><span dir="ltr">{l.slot}</span><span>{l.channel}</span><span>{fmtDateTime(locale, l.createdAt)}</span></li>)}</ul>}
      </Section>
    </>
  );
}
