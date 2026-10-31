"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Volume2 } from "lucide-react";
import { callApi, useI18n } from "./client";

/**
 * Reads the instructions aloud with the browser's own voice, only when asked. Used for instructions and
 * never for Quran: synthetic speech must not recite. Hidden where the browser has no Arabic voice.
 */
export function VoiceGuide({ text }: { text: string }) {
  const { t, locale } = useI18n();
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null | undefined>(undefined);
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    if (!("speechSynthesis" in window)) { setVoice(null); return; }
    const pick = () => setVoice(speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(locale)) ?? null);
    pick();
    speechSynthesis.addEventListener("voiceschanged", pick);
    return () => { speechSynthesis.removeEventListener("voiceschanged", pick); speechSynthesis.cancel(); };
  }, [locale]);
  if (voice === undefined) return null;
  if (voice === null) return <p className="mb-2 text-xs text-ink-2">{t("لا يتوفر صوت عربي في هذا المتصفح، فالتعليمات مكتوبة فقط.", "This browser has no voice for this language, so instructions are written only.")}</p>;
  const toggle = () => {
    if (speaking) { speechSynthesis.cancel(); setSpeaking(false); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    speechSynthesis.speak(u);
    setSpeaking(true);
  };
  return <button type="button" className="btn btn-ghost btn-sm mb-2" aria-pressed={speaking} onClick={toggle}><Volume2 className="size-4" aria-hidden="true" />{speaking ? t("إيقاف القراءة", "Stop reading") : t("استمع إلى التعليمات", "Listen to the instructions")}</button>;
}

/** Unscored rehearsal. The test recording stays in the browser and the answers are never sent. */
export function PracticeRun({ ayahs }: { ayahs: { id: number; ayahNumber: number; text: string }[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [state, setState] = useState<"idle" | "recording" | "denied" | "unsupported">("idle");
  const [url, setUrl] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const record = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setState("unsupported"); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => chunks.push(e.data);
      r.onstop = () => { stream.getTracks().forEach((x) => x.stop()); setUrl(URL.createObjectURL(new Blob(chunks, { type: r.mimeType }))); setState("idle"); };
      r.start();
      rec.current = r;
      setState("recording");
    } catch { setState("denied"); }
  };
  const finish = async () => { await callApi("/placement/practice", "POST"); router.refresh(); };
  const prompt = ayahs[0];
  const options = ayahs.slice(1, 4);
  const instructions = t("هذا اختبار تجريبي لا يحسب ولا يحفظ. جرب الميكروفون، ثم أجب عن سؤال مثال، ثم ابدأ التقييم الرسمي.", "This practice run is not scored or saved. Try the microphone, answer a sample question, then begin the real assessment.");
  return (
    <section className="card mb-5 space-y-3" aria-labelledby="practice-h">
      <h2 id="practice-h" className="text-lg font-semibold text-brand">{t("اختبار تجريبي قبل التقييم", "Practice before the assessment")}</h2>
      <p className="text-sm text-ink-2">{instructions}</p>
      <VoiceGuide text={instructions} />
      {step === 1 && (
        <div className="space-y-2">
          <p className="font-semibold">{t("1. جرب الميكروفون", "1. Try the microphone")}</p>
          {state !== "recording" ? <button type="button" className="btn btn-ghost" onClick={record}>{t("ابدأ تسجيلاً تجريبياً", "Start a test recording")}</button> : <button type="button" className="btn btn-primary" onClick={() => rec.current?.stop()}>{t("إيقاف", "Stop")}</button>}
          {state === "denied" && <p role="alert" className="text-sm text-danger">{t("لم يمنح الإذن. يمكنك السماح من إعدادات المتصفح، أو رفع ملف صوتي في التقييم.", "Permission was not granted. Allow it in browser settings, or upload a file during the assessment.")}</p>}
          {state === "unsupported" && <p role="alert" className="text-sm text-warn">{t("هذا المتصفح لا يدعم التسجيل، ويمكنك رفع ملف صوتي في التقييم.", "This browser cannot record. You can upload a file during the assessment.")}</p>}
          {url && <audio controls src={url} className="w-full" data-testid="practice-audio" />}
          <button type="button" className="btn btn-primary" onClick={() => setStep(2)}>{t("التالي", "Next")}</button>
        </div>
      )}
      {step === 2 && prompt && (
        <fieldset className="space-y-1">
          <legend className="font-semibold">{t("2. سؤال مثال: ما الآية التالية؟", "2. Sample: what is the next ayah?")}</legend>
          <p className="font-quran text-xl" lang="ar" dir="rtl">{prompt.text}</p>
          {options.map((o) => <label key={o.id} className="flex min-h-11 items-center gap-2"><input type="radio" name="practice" className="size-5" checked={picked === o.id} onChange={() => setPicked(o.id)} /><span className="font-quran text-lg" lang="ar" dir="rtl">{o.text}</span></label>)}
          {picked !== null && <p aria-live="polite" className={`text-sm ${picked === options[0]?.id ? "text-ok" : "text-warn"}`}>{picked === options[0]?.id ? t("إجابة صحيحة. لا تحسب هذه الإجابة.", "Correct. This answer does not count.") : t("الصحيح هو الخيار الأول. لا تحسب هذه الإجابة.", "The first option is correct. This answer does not count.")}</p>}
          <button type="button" className="btn btn-primary" onClick={finish}>{t("انتهيت، ابدأ التقييم الرسمي", "Done, begin the real assessment")}</button>
        </fieldset>
      )}
      <button type="button" className="text-sm underline" onClick={finish}>{t("تخطي الاختبار التجريبي", "Skip the practice")}</button>
    </section>
  );
}
