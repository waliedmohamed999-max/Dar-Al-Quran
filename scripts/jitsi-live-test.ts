// Loads the live room against a real Jitsi deployment in real Chrome with a fake camera and microphone.
// The app must be built with LIVE_JITSI_DOMAIN set, because it enters the CSP at build time.
// Usage: LIVE_JITSI_DOMAIN=meet.jit.si npx tsx scripts/jitsi-live-test.ts
import "dotenv/config";
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "@playwright/test";
import { Client } from "pg";

const swap = (u = "") => u.replace(/\/dar_quran(\?|$)/, "/dar_quran_test$1");
const PORT = 3104;
const BASE = `http://localhost:${PORT}`;
const domain = process.env.LIVE_JITSI_DOMAIN;

async function main() {
  if (!domain) { console.log("NOT RUN: LIVE_JITSI_DOMAIN is not set"); return 2; }
  const server = spawn("npx", ["next", "start", "-p", String(PORT)], { shell: true, stdio: "ignore", env: { ...process.env, DATABASE_URL: swap(process.env.DATABASE_URL), APP_DATABASE_URL: swap(process.env.APP_DATABASE_URL), APP_ENV: "test", APP_URL: BASE } });
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 1000)); }
    const c = new Client({ connectionString: swap(process.env.DATABASE_URL) });
    await c.connect();
    await c.query("DELETE FROM rate_limits WHERE key LIKE 'auth:%'");
    const { rows } = await c.query(`SELECT s.id FROM halaqa_sessions s JOIN halaqas h ON h.id = s."halaqaId" JOIN teachers t ON t.id = h."teacherId" JOIN users u ON u.id = t."userId" WHERE s."liveRoom" IS NOT NULL AND s.status <> 'CANCELLED' AND u.email = 'teacher@demo.test' ORDER BY s."startsAt" DESC LIMIT 1`);
    await c.end();
    if (!rows.length) { console.log("NOT RUN: no live session in the test database"); return 2; }
    const browser = await chromium.launch({ channel: "chrome", args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
    const ctx = await browser.newContext({ locale: "ar", permissions: ["camera", "microphone"] });
    const page = await ctx.newPage();
    const blocked: string[] = [];
    page.on("console", (m) => { if (/Content Security Policy|Refused to frame/.test(m.text())) blocked.push(m.text().slice(0, 200)); });
    await page.goto(`${BASE}/login`);
    await page.locator("main").getByLabel("البريد الإلكتروني").fill("teacher@demo.test");
    await page.getByLabel("كلمة المرور").fill(process.env.DEMO_PASSWORD || "integration-test-password");
    await page.getByRole("button", { name: "تسجيل الدخول" }).click();
    await page.waitForURL((u) => !u.pathname.includes("/login"));
    await page.goto(`${BASE}/live/${rows[0].id}`);
    const join = page.getByRole("button", { name: /انضم|دخول|الدخول|ادخل/ }).first();
    if (await join.count()) await join.click();
    const frame = page.locator(`iframe[src*="${domain}"]`);
    await frame.waitFor({ timeout: 30000 }).catch(() => undefined);
    const has = await frame.count();
    console.log("iframe from the Jitsi domain:", has > 0, "CSP blocks:", blocked.length ? blocked : "none");
    if (!has) { console.log(`FAIL: no Jitsi frame appeared. Page text: ${(await page.locator("main").innerText()).slice(0, 300)}`); await browser.close(); return 1; }
    const inner = page.frames().find((f) => f.url().includes(domain));
    await page.waitForTimeout(15000);
    const text = inner ? (await inner.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 300) : "";
    console.log("frame url host:", inner ? new URL(inner.url()).host : "none");
    console.log("frame text:", text);
    await page.screenshot({ path: process.argv[2] ?? "jitsi.png" });
    await browser.close();
    console.log("LOADED: the embed opened from the real service. Two-way audio and video between people was not exercised.");
    return 0;
  } finally { if (server.pid) spawnSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], { stdio: "ignore" }); }
}
main().then((c) => process.exit(c)).catch((e) => { console.error("ERROR", (e as Error).message.slice(0, 400)); process.exit(1); });
