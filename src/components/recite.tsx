"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, Eye, Mic, RotateCcw, Square } from "lucide-react";
import { useI18n } from "./client";
import { alignRecitation } from "@/modules/quran/recite-match";

type Ayah = { id: number; surahId: number; ayahNumber: number; text: string };
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void; abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null;
};
const recognizerClass = () => {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export function ReciteMode({ ayahs, startId, signedIn, allowed }: { ayahs: Ayah[]; startId?: number; signedIn: boolean; allowed: boolean }) {
  const { t, lp } = useI18n();
  const first = Math.max(0, ayahs.findIndex((a) => a.id === startId));
  const [from, setFrom] = useState(first);
  const [to, setTo] = useState(Math.min(ayahs.length - 1, first + 4));
  const [agreed, setAgreed] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [problem, setProblem] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const rec = useRef<Recognition | null>(null);
  const wanted = useRef(false);
  const done = useRef("");
  useEffect(() => setSupported(Boolean(recognizerClass())), []);
  useEffect(() => () => { wanted.current = false; rec.current?.abort(); }, []);

  const range = useMemo(() => ayahs.slice(from, to + 1), [ayahs, from, to]);
  // Words split exactly as stored, so what appears is always the source text.
  const words = useMemo(() => range.flatMap((a) => a.text.trim().split(/\s+/).map((text, i) => ({ text, ayah: a, first: i === 0 }))), [range]);
  const result = useMemo(() => alignRecitation(words.map((w) => w.text), transcript), [words, transcript]);
  const finished = words.length > 0 && result.cursor >= words.length;

  const reset = () => { done.current = ""; setTranscript(""); setRevealed(new Set()); setProblem(null); };
  const stop = () => { wanted.current = false; rec.current?.stop(); setListening(false); };
  useEffect(() => { if (finished && listening) stop(); }, [finished, listening]);
  useEffect(() => { stop(); reset(); /* a new range starts clean */ }, [from, to]);

  const start = () => {
    const R = recognizerClass();
    if (!R) { setSupported(false); return; }
    setProblem(null);
    const r = new R();
    r.lang = "ar-SA";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const piece = e.results[i][0].transcript;
        if (e.results[i].isFinal) done.current += ` ${piece}`; else live += ` ${piece}`;
      }
      setTranscript(`${done.current} ${live}`);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") { wanted.current = false; setListening(false); setProblem(t("لم يمنح إذن الميكروفون. اسمح به من إعدادات المتصفح.", "Microphone permission was not given. Allow it in browser settings.")); }
      else if (e.error === "network") { wanted.current = false; setListening(false); setProblem(t("انقطع الاتصال بخدمة التعرف على الصوت. تحقق من الإنترنت ثم أعد المحاولة.", "The speech service connection was lost. Check your internet, then try again.")); }
    };
    // Browsers end recognition after silence, so it resumes until the student stops.
    r.onend = () => { if (wanted.current) { try { r.start(); } catch { setListening(false); } } else setListening(false); };
    rec.current = r;
    wanted.current = true;
    try { r.start(); setListening(true); } catch { setListening(false); }
  };

  const next = words[result.cursor];
  const percent = words.length ? Math.round((result.correct / words.length) * 100) : 0;
  const show = (w: number) => setRevealed((s) => new Set(s).add(w));

  if (!signedIn) return <div className="card text-center"><p className="mb-3">{t("التسميع الصوتي للمسجلين.", "Voice recitation is for signed-in users.")}</p><Link className="btn btn-primary" href={lp("/login")}>{t("تسجيل الدخول", "Sign in")}</Link></div>;
  if (!allowed) return <div className="card"><p role="note">{t("لحماية خصوصيتك، يلزم أن يوافق ولي أمرك المرتبط بحسابك قبل استخدام التسميع الصوتي.", "To protect your privacy, your linked guardian must agree before you use voice recitation.")}</p></div>;

  return (
    <div className="card space-y-4" data-testid="recite-mode">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="rc-from">{t("من الآية", "From ayah")}</label><select id="rc-from" className="input" value={from} onChange={(e) => { const v = Number(e.target.value); setFrom(v); setTo(Math.max(to, v)); }}>{ayahs.map((a, i) => <option key={a.id} value={i}>{a.surahId}:{a.ayahNumber}</option>)}</select></div>
        <div><label className="label" htmlFor="rc-to">{t("إلى الآية", "To ayah")}</label><select id="rc-to" className="input" value={to} onChange={(e) => setTo(Number(e.target.value))}>{ayahs.map((a, i) => (i >= from ? <option key={a.id} value={i}>{a.surahId}:{a.ayahNumber}</option> : null))}</select></div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!listening
          ? <button type="button" className="btn btn-primary" disabled={!supported || !agreed || finished} onClick={start}><Mic className="size-4" aria-hidden="true" />{transcript ? t("متابعة التسميع", "Continue reciting") : t("ابدأ التسميع", "Start reciting")}</button>
          : <button type="button" className="btn btn-danger" onClick={stop}><Square className="size-4" aria-hidden="true" />{t("إيقاف", "Stop")}</button>}
        <button type="button" className="btn btn-ghost" onClick={() => { stop(); reset(); }}><RotateCcw className="size-4" aria-hidden="true" />{t("من جديد", "Start over")}</button>
        {next && <button type="button" className="btn btn-ghost" onClick={() => show(result.cursor)}><Eye className="size-4" aria-hidden="true" />{t("أظهر الكلمة التالية", "Show the next word")}</button>}
        {listening && <span className="flex items-center gap-2 text-sm text-ok" role="status"><span className="recite-dot" aria-hidden="true" />{t("أستمع إليك الآن…", "Listening…")}</span>}
      </div>

      {!supported && <p role="alert" className="text-sm text-warn">{t("هذا المتصفح لا يدعم التعرف على الصوت. استخدم Chrome أو Edge أو Safari، أو سجل تلاوتك لمعلمك.", "This browser has no speech recognition. Use Chrome, Edge or Safari, or record your recitation for your teacher.")}</p>}
      {supported && !listening && !transcript && (
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 size-5" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} /><span>{t("أوافق على إرسال صوتي أثناء التسميع إلى خدمة التعرف الصوتي في متصفحي (مثل Google أو Apple). لا تحفظ المنصة الصوت ولا النص.", "I agree that my voice is sent to my browser's speech service (such as Google or Apple) while reciting. The platform stores neither the voice nor the text.")}</span></label>
      )}
      {problem && <p role="alert" className="text-sm text-danger">{problem}</p>}

      <div>
        <div className="mb-1 flex justify-between text-sm"><span>{t(`${result.correct} من ${words.length} كلمة`, `${result.correct} of ${words.length} words`)}</span>{result.missed > 0 && <span className="text-danger">{t(`تجاوزت ${result.missed}`, `Skipped ${result.missed}`)}</span>}</div>
        <div className="h-2 rounded-full bg-surface-2" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={t("تقدم التسميع", "Recitation progress")}><div className="h-2 rounded-full bg-ok transition-all" style={{ width: `${percent}%` }} /></div>
      </div>

      <div className="recite-text font-quran" lang="ar" dir="rtl" aria-live="polite" data-testid="recite-text">
        {words.map((w, i) => {
          const state = result.states[i];
          const open = state !== "hidden" || revealed.has(i);
          const endsAyah = words[i + 1]?.ayah.id !== w.ayah.id;
          return (
            <span key={i}>
              {open
                ? <span className={state === "correct" ? "recite-ok" : state === "missed" ? "recite-missed" : "recite-hint"}>{w.text}</span>
                : <span className={`recite-blank ${i === result.cursor ? "recite-current" : ""}`} style={{ width: `${Math.min(6, Math.max(1.4, w.text.length * 0.42))}em` }} aria-label={t("كلمة مخفية", "Hidden word")} />}
              {" "}
              {endsAyah && <span className="ayah-end" aria-hidden="true">{w.ayah.ayahNumber}</span>}{" "}
            </span>
          );
        })}
      </div>

      {finished && (
        <div className="rounded-lg bg-surface-2 p-3" role="status">
          <p className="flex items-center gap-2 font-semibold"><Check className="size-5 text-ok" aria-hidden="true" />{result.missed ? t(`وصلت إلى نهاية المقطع، وتجاوزت ${result.missed} كلمة بالأحمر.`, `You reached the end, skipping ${result.missed} words shown in red.`) : t("قرأت كلمات المقطع كلها بالترتيب.", "You read every word of the passage in order.")}</p>
          <p className="mt-1 text-sm text-ink-2">{t("هذا تدريب: لا يقيس التشكيل ولا التجويد، وقد يخطئ التعرف الصوتي. الإتقان يعتمده معلمك.", "This is practice. It does not assess vowels or tajweed, and recognition can err. Your teacher confirms mastery.")}</p>
          <Link className="btn btn-primary btn-sm mt-2" href={lp(`/student/recitations?surah=${range[0].surahId}&from=${range[0].ayahNumber}&to=${range[range.length - 1].ayahNumber}`)}>{t("سجل تلاوتك لمعلمك", "Record for your teacher")}</Link>
        </div>
      )}
      {!finished && <p className="text-xs text-ink-2">{t("تظهر الكلمات من نص المصحف المعتمد. لا يحفظ هذا التدريب في سجلك، ولا يقيس التشكيل والتجويد.", "Words appear from the approved mushaf text. This practice is not saved to your record and does not assess vowels or tajweed.")}</p>}
    </div>
  );
}
