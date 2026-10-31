"use client";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { callApi, useI18n } from "./client";

// ---------- Placement ----------
type Opt = [string, string, string];
const STEPS: { key: string; ar: string; en: string; opts: Opt[] }[] = [
  { key: "age", ar: "الفئة العمرية", en: "Age group", opts: [["child", "طفل", "Child"], ["teen", "فتى أو فتاة", "Teen"], ["adult", "بالغ", "Adult"]] },
  { key: "reading", ar: "قراءتك الحالية للقرآن", en: "Your current Quran reading", opts: [["none", "لا أقرأ بعد", "I cannot read yet"], ["letters", "أعرف الحروف", "I know the letters"], ["slow", "أقرأ ببطء", "I read slowly"], ["fluent", "أقرأ بطلاقة", "I read fluently"]] },
  { key: "memorized", ar: "مقدار ما تحفظه", en: "How much you have memorized", opts: [["none", "لا شيء بعد", "Nothing yet"], ["little", "بعض السور القصيرة", "Some short surahs"], ["juz", "جزء أو أكثر", "A juz or more"], ["many", "أجزاء كثيرة", "Many juz"]] },
  { key: "tajweed", ar: "معرفتك بالتجويد", en: "Your tajweed experience", opts: [["none", "لم أدرسه", "None"], ["basic", "أساسيات", "Basics"], ["good", "جيدة", "Good"]] },
  { key: "schedule", ar: "الوقت المناسب لك", en: "Time you can give", opts: [["light", "وقت قليل يومياً", "A little daily"], ["regular", "وقت منتظم", "Regular"], ["intensive", "برنامج مكثف", "Intensive"]] },
];

export function PlacementQuiz({ programs }: { programs: { slug: string; titleAr: string; titleEn: string; summaryAr: string; summaryEn: string }[] }) {
  const { t, locale, lp } = useI18n();
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ slugs: string[]; dailyMinutes: number; newAyahs: number } | null>(null);
  const [err, setErr] = useState(false);
  const step = STEPS[i];
  const choose = async (v: string) => {
    const next = { ...answers, [step.key]: v };
    setAnswers(next);
    if (i + 1 < STEPS.length) { setI(i + 1); return; }
    try { setResult(await callApi("/placement", "POST", next)); } catch { setErr(true); }
  };
  if (result) {
    const list = result.slugs.map((s) => programs.find((p) => p.slug === s)).filter(Boolean) as typeof programs;
    return (
      <div aria-live="polite">
        <h3 className="text-2xl text-brand">{t("توصية مبدئية لك", "Your preliminary recommendation")}</h3>
        <p className="mt-1 text-sm text-ink-2">{t("هذه توصية من إجاباتك فقط ولا تحفظ. يؤكد المعلم مستوى القراءة فعلياً بعد التسجيل.", "This comes from your answers only and is not stored. A teacher confirms your actual reading level after you register.")}</p>
        <p className="mt-2">{t(`نقطة بداية مقترحة: ${result.dailyMinutes} دقيقة يومياً${result.newAyahs ? ` و${result.newAyahs} آيات جديدة` : ""}.`, `Suggested start: ${result.dailyMinutes} minutes daily, ${result.newAyahs} new ayahs.`)}</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">{list.map((p) => <li key={p.slug}><Link href={lp(`/programs/${p.slug}`)} className="card block h-full no-underline hover:border-gold"><strong>{locale === "ar" ? p.titleAr : p.titleEn}</strong><span className="mt-1 block text-sm text-ink-2">{locale === "ar" ? p.summaryAr : p.summaryEn}</span></Link></li>)}</ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link className="btn btn-primary" href={lp("/register")}>{t("سجل وابدأ", "Register and begin")}</Link>
          <button type="button" className="btn btn-ghost" onClick={() => { setResult(null); setI(0); setAnswers({}); }}>{t("إعادة الاختبار", "Start again")}</button>
        </div>
      </div>
    );
  }
  return (
    <fieldset>
      <legend className="text-xl font-semibold text-brand">{locale === "ar" ? step.ar : step.en}</legend>
      <div className="my-3 h-1.5 rounded-full bg-surface-2" role="progressbar" aria-label={t("تقدم الأسئلة", "Question progress")} aria-valuenow={i + 1} aria-valuemin={1} aria-valuemax={STEPS.length}><div className="h-1.5 rounded-full bg-gold-soft transition-all" style={{ width: `${((i + 1) / STEPS.length) * 100}%` }} /></div>
      <div className="grid gap-2 sm:grid-cols-2">
        {step.opts.map(([v, ar, en]) => <button key={v} type="button" className="btn btn-ghost justify-start text-start" onClick={() => choose(v)}>{locale === "ar" ? ar : en}</button>)}
      </div>
      {i > 0 && <button type="button" className="mt-3 text-sm underline" onClick={() => setI(i - 1)}>{t("السؤال السابق", "Previous question")}</button>}
      {err && <p role="alert" className="mt-2 text-sm text-danger">{t("تعذر عرض التوصية، حاول مرة أخرى.", "Could not show the recommendation, please retry.")}</p>}
    </fieldset>
  );
}

// ---------- Tabs ----------
export function Tabs({ label, items }: { label: string; items: { key: string; title: string; content: React.ReactNode }[] }) {
  const [active, setActive] = useState(items[0]?.key);
  return (
    <div>
      <div role="tablist" aria-label={label} className="mb-4 flex flex-wrap gap-2">
        {items.map((x) => <button key={x.key} id={`tab-${x.key}`} role="tab" type="button" aria-selected={active === x.key} aria-controls={`panel-${x.key}`} className={`btn btn-sm ${active === x.key ? "btn-primary" : "btn-ghost"}`} onClick={() => setActive(x.key)}>{x.title}</button>)}
      </div>
      {items.map((x) => <div key={x.key} id={`panel-${x.key}`} role="tabpanel" aria-labelledby={`tab-${x.key}`} hidden={active !== x.key}>{x.content}</div>)}
    </div>
  );
}

// ---------- FAQ ----------
export function FaqSearch({ items }: { items: { id: string; title: string; body: string }[] }) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const shown = useMemo(() => items.filter((x) => (x.title + x.body).includes(q.trim())), [q, items]);
  return (
    <div>
      <label htmlFor="faq-q" className="sr-only">{t("ابحث في الأسئلة", "Search questions")}</label>
      <input id="faq-q" className="input mb-3" placeholder={t("ابحث في الأسئلة الشائعة", "Search frequently asked questions")} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="space-y-2" aria-live="polite">
        {shown.length === 0 && <p className="text-sm text-ink-2">{t("لا يوجد سؤال مطابق.", "No matching question.")}</p>}
        {shown.map((x) => <details key={x.id} className="card"><summary className="cursor-pointer font-semibold">{x.title}</summary><div className="prose-body mt-2 text-sm text-ink-2" dangerouslySetInnerHTML={{ __html: x.body }} /></details>)}
      </div>
    </div>
  );
}

// ---------- Live classroom ----------
type Join = { provider: "jitsi"; domain: string; room: string; displayName: string; canLead: boolean } | { provider: "link"; url: string; canLead: boolean } | { provider: "none"; canLead: boolean };
type State = { surah: number | null; ayah: number | null; ayahs: { id: number; ayahNumber: number; text: string }[] };

export function LiveRoom({ sessionId, surahs, attendanceHref }: { sessionId: string; surahs: { id: number; name: string }[]; attendanceHref: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [join, setJoin] = useState<Join | null>(null);
  const [state, setState] = useState<State>({ surah: null, ayah: null, ayahs: [] });
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const poll = () => callApi(`/live/${sessionId}/state`, "GET").then((s) => live && setState(s)).catch(() => undefined);
    poll();
    const id = setInterval(poll, 5000);
    return () => { live = false; clearInterval(id); };
  }, [sessionId]);

  const enter = async () => {
    setErr(null);
    try { setJoin(await callApi(`/live/${sessionId}/join`, "POST")); router.refresh(); } catch { setErr(t("تعذر الدخول. تأكد من عضويتك في الحلقة.", "Could not join. Check your halaqa membership.")); }
  };
  const share = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await callApi(`/live/${sessionId}/share`, "PUT", { surah: f.get("surah"), ayah: f.get("ayah") });
      setState(await callApi(`/live/${sessionId}/state`, "GET"));
      setMsg(t("تمت مشاركة الموضع.", "Position shared."));
    } catch { setMsg(t("الآية غير موجودة في هذه السورة.", "That ayah is not in this surah.")); }
  };
  const fromJoins = async () => {
    await callApi(`/live/${sessionId}/attendance`, "POST");
    setMsg(t("سجل الحضور من الدخول. يمكنك مراجعته.", "Attendance filled from joins. You can review it."));
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="card">
        {!join && <div className="py-10 text-center"><p className="mb-3 text-ink-2">{t("لا تسجل الحصة، ويتطلب أي تسجيل مستقبلي موافقة مسبقة.", "This session is not recorded. Any future recording needs prior consent.")}</p><button type="button" className="btn btn-primary" onClick={enter}>{t("دخول الحصة", "Join the session")}</button>{err && <p role="alert" className="mt-2 text-sm text-danger">{err}</p>}</div>}
        {join?.provider === "jitsi" && (
          <iframe
            title={t("الفصل المباشر", "Live classroom")}
            className="aspect-video w-full rounded-lg border-0"
            allow="camera; microphone; display-capture; autoplay"
            src={`https://${join.domain}/${join.room}#userInfo.displayName=${encodeURIComponent(`"${join.displayName}"`)}&config.prejoinPageEnabled=true&config.fileRecordingsEnabled=false&config.liveStreamingEnabled=false`}
          />
        )}
        {join?.provider === "link" && <p className="py-10 text-center"><a className="btn btn-primary" href={join.url} target="_blank" rel="noopener noreferrer">{t("فتح رابط الاجتماع", "Open the meeting link")}</a></p>}
        {join?.provider === "none" && <p role="status" className="py-10 text-center text-ink-2">{t("لم يهيأ مزود الاجتماعات أو رابط الحلقة بعد. سجل دخولك، وتواصل الإدارة لإعداده.", "No meeting provider or halaqa link is configured yet. Your join was logged; the administration needs to set one up.")}</p>}
        {join?.canLead && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <button type="button" className="btn btn-ghost btn-sm" onClick={fromJoins}>{t("تعبئة الحضور من الدخول", "Fill attendance from joins")}</button>
            <Link className="btn btn-ghost btn-sm" href={attendanceHref}>{t("مراجعة الحضور", "Review attendance")}</Link>
            <span aria-live="polite" className="text-sm text-ok">{msg}</span>
          </div>
        )}
      </div>
      <aside className="card" aria-label={t("المصحف المشترك", "Shared mushaf")}>
        <h2 className="text-lg text-brand">{t("المصحف المشترك", "Shared mushaf")}</h2>
        {join?.canLead && (
          <form onSubmit={share} className="my-2 grid grid-cols-[1fr_5rem_auto] items-end gap-2">
            <div><label htmlFor="ss" className="label">{t("السورة", "Surah")}</label><select id="ss" name="surah" className="input">{surahs.map((s) => <option key={s.id} value={s.id}>{s.id}. {s.name}</option>)}</select></div>
            <div><label htmlFor="sa" className="label">{t("الآية", "Ayah")}</label><input id="sa" name="ayah" type="number" min={1} defaultValue={1} className="input" /></div>
            <button className="btn btn-primary btn-sm">{t("مشاركة", "Share")}</button>
          </form>
        )}
        {state.ayahs.length === 0 ? <p className="text-sm text-ink-2">{t("لم يشارك المعلم موضعاً بعد.", "The teacher has not shared a position yet.")}</p> : (
          <div className="quran mt-2" lang="ar" dir="rtl" style={{ "--quran-size": "1.4rem" } as React.CSSProperties}>
            {state.ayahs.map((a) => <span key={a.id}>{a.text}<span className="ayah-end" aria-hidden="true">{a.ayahNumber}</span> </span>)}
          </div>
        )}
      </aside>
    </div>
  );
}

// ---------- AI assistant ----------
type Source = { id: string; kind: string; title: string; text?: string; href: string };
type Reply = { status: string; answer: string | null; sources: Source[] };

export function AskAssistant({ question: initial }: { question?: string }) {
  const { t, lp } = useI18n();
  const [reply, setReply] = useState<Reply | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true); setErr(null); setReply(null);
    try { setReply(await callApi("/ai/ask", "POST", { question: new FormData(e.currentTarget).get("q") })); }
    catch (x) {
      const c = (x as { code?: string }).code;
      setErr(c === "guardian_consent_required" ? t("يلزم موافقة ولي الأمر لاستخدام المساعد.", "Guardian consent is needed to use the assistant.") : c === "rate_limited" ? t("بلغت حد الأسئلة لهذه الساعة.", "You reached this hour's question limit.") : t("تعذر الإرسال، حاول لاحقاً.", "Could not send, please try later."));
    } finally { setBusy(false); }
  };
  return (
    <div>
      <form onSubmit={submit}>
        <label htmlFor="q" className="label">{t("سؤالك عن الدرس", "Your question about the lesson")}</label>
        <textarea id="q" name="q" className="input" rows={3} required minLength={3} maxLength={1000} defaultValue={initial} />
        <button className="btn btn-primary mt-2" disabled={busy}>{busy ? t("جارٍ البحث في المصادر…", "Searching sources…") : t("اسأل", "Ask")}</button>
      </form>
      <div aria-live="polite" className="mt-4">
        {err && <p role="alert" className="text-danger">{err}</p>}
        {reply?.status === "REFERRED" && <p className="rounded-lg bg-surface-2 p-3">{t("هذا السؤال يحتاج إلى معلمك، فلم نجب عنه آلياً وأحلناه إليه.", "This question needs your teacher, so it was not answered automatically and has been referred.")}</p>}
        {reply?.status === "SOURCES_ONLY" && <p className="mb-2 rounded-lg bg-surface-2 p-3">{t("هذه مقاطع من مصادر مراجعة تطابق سؤالك، دون إجابة مولدة.", "These are reviewed sources matching your question, without a generated answer.")}</p>}
        {reply?.answer && <div className="card whitespace-pre-wrap">{reply.answer}</div>}
        {reply && reply.sources.length > 0 && (
          <div className="mt-3">
            <h3 className="font-semibold">{t("المراجع", "References")}</h3>
            <ul className="mt-1 space-y-1 text-sm">{reply.sources.map((s) => <li key={s.id}><Link className="underline" href={lp(s.href)}>{s.title}</Link></li>)}</ul>
          </div>
        )}
      </div>
    </div>
  );
}
