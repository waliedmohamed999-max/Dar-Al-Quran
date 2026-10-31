"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { authClient } from "../auth-forms";
import { useI18n } from "../client";

export function TwoFactorSetup({ enabled }: { enabled: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [setup, setSetup] = useState<{ uri: string; qr: string; secret: string; codes: string[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const start = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErr(null);
    const { data, error } = await authClient.twoFactor.enable({ password: String(new FormData(e.currentTarget).get("password")) });
    if (error || !data || data.method !== "totp") { setErr(t("كلمة المرور غير صحيحة.", "The password is incorrect.")); return; }
    setSetup({ uri: data.totpURI, qr: await QRCode.toDataURL(data.totpURI, { margin: 1, width: 200 }), secret: new URL(data.totpURI).searchParams.get("secret") ?? "", codes: data.backupCodes });
  };
  const verify = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErr(null);
    const { error } = await authClient.twoFactor.verifyTotp({ code: String(new FormData(e.currentTarget).get("code")) });
    if (error) { setErr(t("الرمز غير صحيح. تأكد من توقيت هاتفك.", "The code is incorrect. Check your phone's clock.")); return; }
    setDone(true);
    router.refresh();
  };
  const disable = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErr(null);
    const { error } = await authClient.twoFactor.disable({ password: String(new FormData(e.currentTarget).get("password")) });
    if (error) { setErr(t("كلمة المرور غير صحيحة.", "The password is incorrect.")); return; }
    router.refresh();
  };
  if (done) return <p role="status" className="text-sm text-ok">{t("فعلت المصادقة الثنائية.", "Two-factor authentication is on.")}</p>;
  if (enabled) {
    return (
      <form onSubmit={disable} className="max-w-sm space-y-3">
        <p className="text-sm text-ok">{t("المصادقة الثنائية مفعلة.", "Two-factor authentication is on.")}</p>
        <div><label className="label" htmlFor="tf-off">{t("كلمة المرور لإيقافها", "Password to turn it off")}</label><input id="tf-off" name="password" type="password" required autoComplete="current-password" className="input" /></div>
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        <button className="btn btn-ghost">{t("إيقاف المصادقة الثنائية", "Turn off")}</button>
      </form>
    );
  }
  if (!setup) {
    return (
      <form onSubmit={start} className="max-w-sm space-y-3">
        <div><label className="label" htmlFor="tf-pw">{t("كلمة المرور", "Password")}</label><input id="tf-pw" name="password" type="password" required autoComplete="current-password" className="input" /></div>
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        <button className="btn btn-primary">{t("بدء التفعيل", "Start setup")}</button>
      </form>
    );
  }
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div>
        <p className="mb-2 text-sm">{t("امسح الرمز بتطبيق مصادقة، أو أدخل المفتاح يدوياً.", "Scan with an authenticator app, or enter the key by hand.")}</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={setup.qr} alt={t("رمز إعداد تطبيق المصادقة", "Authenticator setup code")} width={200} height={200} className="rounded-lg bg-white p-1" />
        <p className="mt-2 break-all font-mono text-xs" dir="ltr" data-testid="totp-secret">{setup.secret}</p>
        <form onSubmit={verify} className="mt-3 flex flex-wrap items-end gap-2">
          <div><label className="label" htmlFor="tf-code">{t("الرمز من التطبيق", "Code from the app")}</label><input id="tf-code" name="code" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" dir="ltr" className="input" /></div>
          <button className="btn btn-primary">{t("تأكيد", "Confirm")}</button>
        </form>
        {err && <p role="alert" className="mt-2 text-sm text-danger">{err}</p>}
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">{t("رموز الاسترداد: احفظها الآن، فلن تظهر مرة أخرى.", "Backup codes: save them now. They will not appear again.")}</p>
        <ul className="grid grid-cols-2 gap-1 font-mono text-sm" dir="ltr">{setup.codes.map((c) => <li key={c}>{c}</li>)}</ul>
      </div>
    </div>
  );
}
