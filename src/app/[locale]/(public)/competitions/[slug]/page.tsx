import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/client";
import { Notice, PageHeader, Section, StatusBadge, Table } from "@/components/ui";
import { systemDb } from "@/lib/db";
import { fmtDateTime } from "@/lib/i18n";
import { pageCtx, type PageParams } from "@/lib/page";
import { getActor } from "@/lib/session";
import { leaderboard } from "@/modules/unified/service";
import { myJudging, publicResults } from "@/modules/judging/service";
import { StartExam } from "@/components/start-exam";
import { notDemoRow } from "@/lib/scholarly";

export default async function CompetitionPage({ params }: PageParams<{ slug: string }>) {
  const { locale, t, lp } = await pageCtx(params);
  const c = await systemDb().competition.findFirst({ where: { slug: (await params).slug, published: true, ...notDemoRow() }, include: { assessment: { select: { _count: { select: { items: true } } } } } });
  if (!c) notFound();
  const actor = await getActor();
  const sid = actor?.studentId;
  const db = systemDb();
  const reg = sid ? await db.competitionRegistration.findUnique({ where: { competitionId_studentId: { competitionId: c.id, studentId: sid } } }) : null;
  const attempts = sid ? await db.assessmentAttempt.findMany({ where: { assessmentId: c.assessmentId, studentId: sid }, orderBy: { attemptNo: "desc" } }) : [];
  const board = c.resultsPublished && c.leaderboardEnabled ? await leaderboard(c.id) : [];
  const [oral, mine] = await Promise.all([publicResults(c.id), actor ? myJudging(actor, c.id) : []]);
  const now = new Date();
  const regOpen = now >= c.registrationOpensAt && now <= c.registrationClosesAt;
  const examOpen = now >= c.examStartsAt && now <= c.examEndsAt;
  const facts: [string, string][] = [
    [t("المستوى", "Level"), c.level], [t("الفئة", "Audience"), c.ageGroup ?? t("الجميع", "Everyone")], [t("التسجيل", "Registration"), `${fmtDateTime(locale, c.registrationOpensAt)} — ${fmtDateTime(locale, c.registrationClosesAt)}`],
    [t("الاختبار", "Exam"), `${fmtDateTime(locale, c.examStartsAt)} — ${fmtDateTime(locale, c.examEndsAt)}`], [t("المدة", "Duration"), t(`${c.durationMin} دقيقة`, `${c.durationMin} minutes`)], [t("عدد الأسئلة", "Questions"), String(c.assessment._count.items)], [t("المحاولات", "Attempts"), String(c.maxAttempts)],
  ];
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <PageHeader title={c.title} subtitle={c.description} />
      {c.isDemo && <Notice tone="warn">{t("مسابقة تجريبية ببيانات توضيحية.", "A demo competition with illustrative data.")}</Notice>}
      <Section title={t("التفاصيل", "Details")}><dl className="grid gap-3 sm:grid-cols-2">{facts.map(([a, b]) => <div key={a}><dt className="text-sm text-ink-2">{a}</dt><dd className="font-semibold">{b}</dd></div>)}</dl></Section>
      <Section title={t("الشروط ومعايير التقييم", "Conditions and criteria")}>
        {c.conditions && <p className="mb-2">{c.conditions}</p>}
        <p><strong>{t("التقييم", "Assessment")}: </strong>{c.criteria}</p>
        <p className="mt-1"><strong>{t("إعلان النتائج", "Results")}: </strong>{c.resultsMethod}</p>
        {c.prizes && <p className="mt-1"><strong>{t("الجوائز", "Prizes")}: </strong>{c.prizes}</p>}
      </Section>
      <Section title={t("المشاركة", "Take part")}>
        {!actor ? <Link className="btn btn-primary" href={lp("/login")}>{t("سجل الدخول للمشاركة", "Sign in to take part")}</Link> : !sid ? <p className="text-sm text-ink-2">{t("المشاركة للطلاب.", "Participation is for students.")}</p> : (
          <div className="space-y-3">
            {!reg && regOpen && <ActionForm path={`/competitions/${c.id}/register`} submit={t("تسجيل", "Register")} fields={c.leaderboardEnabled ? [{ name: "showOnLeaderboard", label: t("أوافق على ظهور اسمي الأول في لوحة الترتيب (لا يظهر القاصرون)", "Show my first name on the leaderboard (minors never appear)"), type: "checkbox", full: true }] : []} />}
            {!reg && !regOpen && <p className="text-sm text-ink-2">{t("التسجيل مغلق حالياً.", "Registration is closed right now.")}</p>}
            {reg && <p className="text-sm text-ok">{t("أنت مسجل.", "You are registered.")}</p>}
            {reg && examOpen && <StartExam competitionId={c.id} hrefBase={lp("/exams")} />}
            {attempts.map((a) => <div key={a.id} className="flex flex-wrap items-center gap-2 text-sm"><span>{t("المحاولة", "Attempt")} {a.attemptNo}</span><StatusBadge locale={locale} status={a.status} />{a.status !== "IN_PROGRESS" && <Link className="underline" href={lp(`/exams/${a.id}/result`)}>{t("النتيجة والاعتراض", "Result and appeal")}</Link>}</div>)}
          </div>
        )}
      </Section>
      {mine.map((m) => (
        <Section key={m.id} title={`${t("نتيجتي الشفهية", "My oral result")}: ${m.title}`}>
          <p className="mb-2 font-semibold">{m.percent}% <span className="text-sm font-normal text-ink-2">{t(`النجاح من ${m.passPercent}%`, `Pass from ${m.passPercent}%`)}</span></p>
          <ul className="mb-3 list-disc ps-5 text-sm">{m.criteria.map((x) => <li key={x.label}>{locale === "en" && x.labelEn ? x.labelEn : x.label}: {x.average ?? "—"} / {x.max}</li>)}</ul>
          <ActionForm path={`/judging/entries/${m.id}/appeal`} submit={t("إرسال الاعتراض", "Send appeal")} fields={[{ name: "reason", label: t("سبب الاعتراض", "Reason for appeal"), type: "textarea", required: true, full: true }]} />
        </Section>
      ))}
      {oral.length > 0 && <Section title={t("نتائج التحكيم الشفهي", "Oral judging results")}><p className="mb-2 text-xs text-ink-2">{t("تعرض بالرمز. يظهر الاسم الأول لمن وافق من البالغين فقط، ولا يظهر اسم قاصر.", "Shown by code. A first name appears only for adults who agreed, never for a minor.")}</p><Table caption={t("نتائج التحكيم الشفهي", "Oral judging results")} columns={[t("الترتيب", "Rank"), t("الرمز", "Code"), t("الاسم", "Name"), t("النتيجة", "Score")]}>{oral.map((r) => <tr key={r.code}><td>{r.rank}</td><td>{r.code}</td><td>{r.name ?? "—"}</td><td>{r.percent}%</td></tr>)}</Table></Section>}
      {board.length > 0 && <Section title={t("لوحة الترتيب", "Leaderboard")}><Table caption={t("لوحة الترتيب", "Leaderboard")} columns={[t("الاسم الأول", "First name"), t("النتيجة", "Score")]}>{board.map((b, i) => <tr key={i}><td>{b.name}</td><td>{b.score}%</td></tr>)}</Table></Section>}
    </div>
  );
}
