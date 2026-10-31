// Interface previews on the public site. All values are illustrative constants and visibly labelled;
// nothing here reads student data.
import { Progress } from "./ui";
import { translator, type Locale } from "@/lib/i18n";

export const DEMO_LABEL = (l: Locale) => translator(l)("معاينة ببيانات توضيحية", "Preview with illustrative data");

const Frame = ({ locale, children }: { locale: Locale; children: React.ReactNode }) => (
  <figure className="device-light">
    <figcaption className="mb-3 inline-block rounded-full border border-gold px-3 py-0.5 text-xs font-semibold text-gold">{DEMO_LABEL(locale)}</figcaption>
    {children}
  </figure>
);

export function StudentPreview({ locale }: { locale: Locale }) {
  const t = translator(locale);
  const tasks = [[t("حفظ جديد", "New memorization"), true], [t("استماع", "Listening"), true], [t("تسميع", "Recitation"), false], [t("مراجعة قريبة", "Recent revision"), false]] as const;
  return (
    <Frame locale={locale}>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="card md:col-span-2">
          <h3 className="mb-2 font-bold text-brand">{t("ورد اليوم", "Today's program")}</h3>
          <Progress label={t("إنجاز اليوم", "Today's completion")} value={50} />
          <ul className="mt-3 space-y-1.5 text-sm">{tasks.map(([a, d]) => <li key={a} className="flex justify-between border-b border-line pb-1"><span>{a}</span><span className={d ? "text-ok" : "text-ink-2"}>{d ? t("مكتملة", "Done") : t("لم تبدأ", "Not started")}</span></li>)}</ul>
        </div>
        <div className="space-y-4">
          <div className="card text-sm"><h3 className="font-bold text-brand">{t("الدرس القادم", "Next lesson")}</h3><p className="mt-1 text-ink-2">{t("الأحد، حلقة توضيحية", "Sunday, sample halaqa")}</p></div>
          <div className="card text-sm"><h3 className="font-bold text-brand">{t("المراجعة القادمة", "Next revision")}</h3><p className="mt-1 text-ink-2">{t("بعد 3 أيام حسب تقييمك", "In 3 days, based on your grade")}</p></div>
          <div className="card text-sm"><h3 className="font-bold text-brand">{t("إنجاز", "Achievement")}</h3><p className="mt-1 text-ink-2">{t("أول مقطع معتمد", "First approved segment")}</p></div>
        </div>
      </div>
    </Frame>
  );
}

export function TeacherFeedbackPreview({ locale }: { locale: Locale }) {
  const t = translator(locale);
  return (
    <Frame locale={locale}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card text-sm"><h3 className="font-bold text-brand">{t("توجيه المعلم", "Teacher feedback")}</h3><p className="mt-1 text-ink-2">{t("أحسنت. انتبه للغنة في الموضع المحدد وأعد التسميع متى كنت مستعداً.", "Well done. Mind the ghunnah where marked, and recite again when ready.")}</p></div>
        <div className="card space-y-2"><Progress label={t("الحفظ", "Memorization")} value={80} /><Progress label={t("التجويد", "Tajweed")} value={60} /><Progress label={t("الطلاقة", "Fluency")} value={70} /></div>
      </div>
    </Frame>
  );
}

export function GuardianPreview({ locale }: { locale: Locale }) {
  const t = translator(locale);
  return (
    <Frame locale={locale}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-2"><Progress label={t("الحضور", "Attendance")} value={90} /><Progress label={t("إنجاز الواجبات", "Tasks completed")} value={75} /></div>
        <div className="card text-sm"><h3 className="font-bold text-brand">{t("إشعار", "Notification")}</h3><p className="mt-1 text-ink-2">{t("التقرير الأسبوعي: مهام مكتملة وحصة قادمة.", "Weekly report: completed tasks and the next session.")}</p></div>
      </div>
    </Frame>
  );
}
