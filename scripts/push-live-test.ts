// Real Web Push: throwaway VAPID keys made for this run, the browser vendor's real push service, and a real
// service worker. Needs a production build and the test database. Prints PASS, FAIL or BLOCKED with the reason.
// Usage: npx tsx scripts/push-live-test.ts [chrome|firefox]
import "dotenv/config";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, firefox } from "@playwright/test";
import webpush from "web-push";

const swap = (u = "") => u.replace(/\/dar_quran(\?|$)/, "/dar_quran_test$1");
const PORT = 3102;
const BASE = `http://localhost:${PORT}`;
const which = process.argv[2] ?? "chrome";

async function main() {
  const keys = webpush.generateVAPIDKeys();
  const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
    shell: true, stdio: "ignore",
    env: { ...process.env, DATABASE_URL: swap(process.env.DATABASE_URL), APP_DATABASE_URL: swap(process.env.APP_DATABASE_URL), APP_ENV: "test", APP_URL: BASE, VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey, VAPID_SUBJECT: "mailto:push-test@example.invalid" },
  });
  const stop = () => { if (server.pid) spawnSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], { stdio: "ignore" }); };
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 1000)); }
    // Chrome refuses push in incognito-like contexts, so this uses a real throwaway profile.
    const profile = mkdtempSync(join(tmpdir(), "dar-push-"));
    const opts = { locale: "ar" };
    const ctx = which === "firefox"
      ? await firefox.launchPersistentContext(profile, { ...opts, firefoxUserPrefs: { "dom.push.enabled": true, "permissions.default.desktop-notification": 1 } })
      : await chromium.launchPersistentContext(profile, { ...opts, channel: "chrome", headless: false, permissions: ["notifications"], args: ["--window-position=-2000,-2000"] });
    const browser = ctx;
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`);
    await page.locator("main").getByLabel("البريد الإلكتروني").fill("student2@demo.test");
    await page.getByLabel("كلمة المرور").fill(process.env.DEMO_PASSWORD || "integration-test-password");
    await page.getByRole("button", { name: "تسجيل الدخول" }).click();
    await page.waitForURL((u) => !u.pathname.includes("/login"));
    await page.goto(`${BASE}/adhkar/settings`);
    console.log("permission:", await page.evaluate(() => Promise.race([Notification.requestPermission(), new Promise((r) => setTimeout(() => r("requestPermission hung"), 8000))])), await page.evaluate(() => Notification.permission));
    page.on("console", (m) => { if (m.type() === "error") console.log("console:", m.text().slice(0, 200)); });
    page.on("response", (r) => { if (r.url().includes("/api/v1/me/")) console.log(r.request().method(), new URL(r.url()).pathname, r.status()); });
    // The grant above is real. Automation can leave the prompt call unresolved, so an existing grant is returned directly.
    await page.evaluate(() => { if (Notification.permission === "granted") Notification.requestPermission = async () => "granted"; });
    await page.getByLabel("تفعيل تذكيرات الأذكار").check();
    await page.locator('input[name="pushEnabled"]').check();
    await page.getByRole("button", { name: "حفظ", exact: true }).click();
    // First registration with the vendor can take a while.
    const shownUi = await Promise.race([
      page.getByText("حفظت الإعدادات.").waitFor({ timeout: 90000 }).then(() => "saved"),
      page.locator("form .text-danger").filter({ hasText: /./ }).first().waitFor({ timeout: 90000 }).then(() => page.locator("form .text-danger").filter({ hasText: /./ }).first().textContent()),
    ]).catch(() => "no response in 90 seconds");
    console.log("settings form:", shownUi);
    const sub = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration("/sw.js"); const s = await r?.pushManager.getSubscription(); return s?.endpoint ?? null; });
    const shown = shownUi;
    if (!sub) console.log("direct subscribe:", await page.evaluate(async (k) => { try { const r = await navigator.serviceWorker.register("/sw.js"); await navigator.serviceWorker.ready; const s = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: k }); return s.endpoint; } catch (e) { return `${(e as Error).name}: ${(e as Error).message}`; } }, keys.publicKey));
    if (!sub) { console.log(`BLOCKED ${which}: the browser created no push subscription. UI said: ${shown}`); await browser.close(); return 2; }
    console.log(`subscribed through ${new URL(sub).host}`);
    await page.reload();
    await page.getByRole("button", { name: "إرسال إشعار تجريبي" }).click();
    await page.getByText("أرسل إشعار تجريبي.").waitFor({ timeout: 30000 });
    console.log("the vendor's push service accepted the message");
    const got = await page.evaluate(async () => {
      const r = await navigator.serviceWorker.ready;
      for (let i = 0; i < 150; i++) { const n = await r.getNotifications(); if (n.length) return { title: n[0].title, body: n[0].body, silent: n[0].silent, dir: n[0].dir }; await new Promise((x) => setTimeout(x, 1000)); }
      return null;
    });
    if (!got) { console.log(`FAIL ${which}: accepted but the service worker showed no notification within 150 seconds`); await browser.close(); return 1; }
    console.log("service worker showed:", JSON.stringify(got));
    await page.locator('input[name="pushEnabled"]').uncheck();
    await page.getByRole("button", { name: "حفظ", exact: true }).click();
    await page.getByText("حفظت الإعدادات.").waitFor();
    const after = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration("/sw.js"); return Boolean(await r?.pushManager.getSubscription()); });
    console.log(after ? `FAIL ${which}: still subscribed after unticking` : `PASS ${which}: delivered, shown silently, and unsubscribed`);
    await browser.close();
    return after ? 1 : 0;
  } finally { stop(); }
}
main().then((c) => process.exit(c)).catch((e) => { console.error("ERROR", (e as Error).message.slice(0, 500)); process.exit(1); });
