"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";
import { callApi, useI18n } from "./client";

export const authClient = createAuthClient({ plugins: [twoFactorClient()] });

const Input = ({ id, label, ...rest }: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
  <div><label htmlFor={id} className="label">{label}</label><input id={id} name={id} className="input" required {...rest} /></div>
);

export function LoginForm() {
  const { t, lp } = useI18n();
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [needCode, setNeedCode] = useState(false);
  const verifyCode = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const code = String(f.get("code")).trim();
    setBusy(true); setErr(null);
    // Six digits come from the app. Anything longer is a one-time backup code.
    const { error } = /^\d{6}$/.test(code) ? await authClient.twoFactor.verifyTotp({ code }) : await authClient.twoFactor.verifyBackupCode({ code });
    setBusy(false);
    if (error) { setErr(t("الرمز غير صحيح.", "The code is incorrect.")); return; }
    window.location.assign(lp("/dashboard"));
  };
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setErr(null);
    const { data, error } = await authClient.signIn.email({ email: String(f.get("email")), password: String(f.get("password")) });
    setBusy(false);
    if (error) {
      setErr(error.status === 403 ? t("يرجى تأكيد بريدك الإلكتروني أولاً. أرسلنا إليك رابط التأكيد.", "Please confirm your email first. We sent you a link.") : error.status === 429 ? t("محاولات كثيرة، يرجى الانتظار قليلاً.", "Too many attempts, please wait.") : t("البريد أو كلمة المرور غير صحيحة.", "Incorrect email or password."));
      return;
    }
    if ((data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) { setNeedCode(true); return; }
    // A full load: a client refresh racing this navigation could leave the user stuck on the redirect route.
    window.location.assign(lp("/dashboard"));
  };
  if (needCode) {
    return (
      <form onSubmit={verifyCode} className="space-y-4">
        <Input id="code" autoComplete="one-time-code" dir="ltr" label={t("رمز المصادقة أو رمز الاسترداد", "Authentication or backup code")} />
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>{t("تأكيد", "Confirm")}</button>
      </form>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <Input id="email" type="email" autoComplete="email" label={t("البريد الإلكتروني", "Email")} />
      <Input id="password" type="password" autoComplete="current-password" label={t("كلمة المرور", "Password")} />
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      <button className="btn btn-primary w-full" disabled={busy}>{busy ? t("جارٍ الدخول…", "Signing in…") : t("تسجيل الدخول", "Sign in")}</button>
      <div className="flex justify-between text-sm">
        <Link className="underline" href={lp("/forgot-password")}>{t("نسيت كلمة المرور؟", "Forgot password?")}</Link>
        <Link className="underline" href={lp("/register")}>{t("حساب جديد", "Create account")}</Link>
      </div>
    </form>
  );
}

export function RegisterForm() {
  const { t, lp, locale } = useI18n();
  const [state, setState] = useState<{ busy?: boolean; done?: boolean; err?: string }>({});
  const [type, setType] = useState("student");
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get("password") !== f.get("confirm")) { setState({ err: t("كلمتا المرور غير متطابقتين.", "Passwords do not match.") }); return; }
    setState({ busy: true });
    try {
      await callApi("/register", "POST", { name: f.get("name"), email: f.get("email"), password: f.get("password"), accountType: type, isMinor: f.get("isMinor") === "on", acceptTerms: f.get("acceptTerms") === "on", locale });
      setState({ done: true });
    } catch (err) {
      const c = (err as { code?: string }).code;
      setState({ err: c === "validation" ? t("تحقق من البيانات. كلمة المرور 10 أحرف على الأقل.", "Check the details. Passwords need at least 10 characters.") : c === "rate_limited" ? t("محاولات كثيرة، حاول لاحقاً.", "Too many attempts, try later.") : t("تعذر إنشاء الحساب.", "Could not create the account.") });
    }
  };
  if (state.done) return <p role="status" className="rounded-lg bg-surface-2 p-4">{t("إذا كان البريد صالحاً فستصلك رسالة لتأكيده. أكد بريدك ثم سجل الدخول.", "If the email is valid, you will receive a confirmation link. Confirm it, then sign in.")}</p>;
  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset>
        <legend className="label">{t("نوع الحساب", "Account type")}</legend>
        <div className="grid grid-cols-2 gap-2">
          {[["student", "طالب", "Student"], ["guardian", "ولي أمر", "Guardian"]].map(([v, ar, en]) => (
            <label key={v} className={`btn ${type === v ? "btn-primary" : "btn-ghost"}`}><input type="radio" name="accountType" value={v} className="sr-only" checked={type === v} onChange={() => setType(v)} />{t(ar, en)}</label>
          ))}
        </div>
      </fieldset>
      <Input id="name" autoComplete="name" label={t("الاسم", "Name")} maxLength={120} />
      <Input id="email" type="email" autoComplete="email" label={t("البريد الإلكتروني", "Email")} />
      <Input id="password" type="password" autoComplete="new-password" minLength={10} label={t("كلمة المرور (10 أحرف على الأقل)", "Password (at least 10 characters)")} />
      <Input id="confirm" type="password" autoComplete="new-password" minLength={10} label={t("تأكيد كلمة المرور", "Confirm password")} />
      {type === "student" && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="isMinor" className="mt-1 size-5" />
          <span>{t("عمر الطالب أقل من 18 سنة (يلزم حينها ربط ولي الأمر وموافقته لإرسال التسجيلات).", "The student is under 18 (a linked guardian must then consent before recordings can be sent).")}</span>
        </label>
      )}
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="acceptTerms" required className="mt-1 size-5" />
        <span>{t("أوافق على", "I accept the")} <Link href={lp("/terms")} className="underline">{t("الشروط", "terms")}</Link> {t("و", "and")} <Link href={lp("/privacy")} className="underline">{t("سياسة الخصوصية", "privacy policy")}</Link></span>
      </label>
      {state.err && <p role="alert" className="text-sm text-danger">{state.err}</p>}
      <button className="btn btn-primary w-full" disabled={state.busy}>{state.busy ? t("جارٍ الإنشاء…", "Creating…") : t("إنشاء الحساب", "Create account")}</button>
      <p className="text-center text-sm"><Link className="underline" href={lp("/login")}>{t("لدي حساب بالفعل", "I already have an account")}</Link></p>
    </form>
  );
}

export function ForgotForm() {
  const { t, lp } = useI18n();
  const [done, setDone] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email"));
    await authClient.requestPasswordReset({ email, redirectTo: lp("/reset-password") });
    setDone(true);
  };
  if (done) return <p role="status" className="rounded-lg bg-surface-2 p-4">{t("إذا كان البريد مسجلاً فستصلك رسالة بها رابط الاستعادة.", "If the email is registered, a reset link is on its way.")}</p>;
  return (
    <form onSubmit={submit} className="space-y-4">
      <Input id="email" type="email" autoComplete="email" label={t("البريد الإلكتروني", "Email")} />
      <button className="btn btn-primary w-full">{t("إرسال رابط الاستعادة", "Send reset link")}</button>
    </form>
  );
}

export function ResetForm() {
  const { t, lp } = useI18n();
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [err, setErr] = useState<string | null>(null);
  if (!token) return <p role="alert" className="text-danger">{t("الرابط غير صالح أو منتهي.", "This link is invalid or has expired.")}</p>;
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get("password") !== f.get("confirm")) { setErr(t("كلمتا المرور غير متطابقتين.", "Passwords do not match.")); return; }
    const { error } = await authClient.resetPassword({ newPassword: String(f.get("password")), token });
    if (error) { setErr(t("تعذرت إعادة التعيين. قد يكون الرابط منتهياً.", "Could not reset. The link may have expired.")); return; }
    router.push(lp("/login"));
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <Input id="password" type="password" autoComplete="new-password" minLength={10} label={t("كلمة المرور الجديدة", "New password")} />
      <Input id="confirm" type="password" autoComplete="new-password" minLength={10} label={t("تأكيدها", "Confirm")} />
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      <button className="btn btn-primary w-full">{t("حفظ", "Save")}</button>
    </form>
  );
}

export function SignOutButton() {
  const { t, lp } = useI18n();
  const router = useRouter();
  return <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { await authClient.signOut(); router.push(lp("/")); router.refresh(); }}>{t("خروج", "Sign out")}</button>;
}
