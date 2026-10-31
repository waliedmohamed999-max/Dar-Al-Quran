// The browser's speech service cannot run in automation, so a stand-in delivers transcripts through the real
// page code. This proves the interface and matching, not real recognition of a human voice.
import { expect, test } from "@playwright/test";
import { expectAccessible, login, sql } from "./helpers";

const FAKE = () => {
  class Fake {
    lang = ""; continuous = false; interimResults = false; onresult: unknown = null; onerror: unknown = null; onend: unknown = null;
    start() { (window as never as { __rec: unknown }).__rec = this; }
    stop() { (this.onend as (() => void) | null)?.(); }
    abort() { /* nothing is running */ }
  }
  (window as never as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = Fake;
  (window as never as { __say: unknown }).__say = (text: string, isFinal: boolean) => {
    const r = Object.assign([{ transcript: text }], { isFinal });
    ((window as never as { __rec: { onresult: (e: unknown) => void } }).__rec.onresult)({ resultIndex: 0, results: [r] });
  };
};
const say = (page: import("@playwright/test").Page, text: string, final = true) => page.evaluate(([t, f]) => (window as never as { __say: (a: string, b: boolean) => void }).__say(t as string, f as boolean), [text, final]);

test("reciting reveals stored words only when correct, and never claims mastery", async ({ page }) => {
  await page.addInitScript(FAKE);
  await login(page, "student@demo.test");
  await page.goto("/mushaf/surah/1");
  await page.getByRole("button", { name: "تسميع", exact: true }).click();
  const box = page.getByTestId("recite-text");
  await expect(box.locator(".recite-ok")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "ابدأ التسميع" })).toBeDisabled();
  await page.getByLabel(/أوافق على إرسال صوتي/).check();
  await expectAccessible(page);
  const stored = await sql<{ text: string }>(`SELECT text FROM quran_ayahs WHERE "surahId" = 1 AND "ayahNumber" = 1`);
  await page.getByLabel("إلى الآية").selectOption({ label: "1:2" });
  await page.getByLabel(/أوافق على إرسال صوتي/).check({ force: true }).catch(() => undefined);
  await page.getByRole("button", { name: "ابدأ التسميع" }).click();
  await say(page, "بسم الله الرحمن", false);
  await expect(box.locator(".recite-ok")).toHaveCount(3);
  await expect(box.locator(".recite-ok").first()).toHaveText(stored[0].text.split(" ")[0]);
  await say(page, "كلام غير صحيح");
  await expect(box.locator(".recite-ok")).toHaveCount(0);
  await say(page, "بسم الله الرحمن الرحيم الحمد لله رب العالمين");
  await expect(page.getByText("قرأت كلمات المقطع كلها بالترتيب.")).toBeVisible();
  await expect(page.getByText("الإتقان يعتمده معلمك")).toBeVisible();
});

test("the voice practice writes nothing to the student's record", async ({ page }) => {
  await page.addInitScript(FAKE);
  await login(page, "student@demo.test");
  await page.goto("/mushaf/surah/112");
  const count = async () => (await sql<{ n: number }>(`SELECT count(*)::int AS n FROM ayah_progress WHERE status = 'MASTERED'`))[0].n;
  const before = await count();
  const posts: string[] = [];
  await page.getByRole("button", { name: "تسميع", exact: true }).click();
  page.on("request", (r) => { if (r.method() !== "GET" && r.url().includes("/api/v1/")) posts.push(r.url()); });
  await page.getByLabel(/أوافق على إرسال صوتي/).check();
  await page.getByRole("button", { name: "ابدأ التسميع" }).click();
  await say(page, "قل هو الله احد");
  await expect(page.getByTestId("recite-text").locator(".recite-ok")).toHaveCount(4);
  expect(posts).toEqual([]);
  expect(await count()).toBe(before);
});

test("browsers without speech recognition get a clear alternative, and minors need consent", async ({ page }) => {
  await page.addInitScript(() => { delete (window as never as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition; delete (window as never as { SpeechRecognition?: unknown }).SpeechRecognition; });
  await login(page, "student@demo.test");
  await page.goto("/mushaf/surah/112");
  await page.getByRole("button", { name: "تسميع", exact: true }).click();
  await expect(page.getByText("هذا المتصفح لا يدعم التعرف على الصوت.")).toBeVisible();
  await sql(`UPDATE students SET "recordingConsentAt" = NULL WHERE "userId" = (SELECT id FROM users WHERE email = 'student3@demo.test')`);
  await login(page, "student3@demo.test");
  await page.goto("/mushaf/surah/112");
  await page.getByRole("button", { name: "تسميع", exact: true }).click();
  await expect(page.getByText("يلزم أن يوافق ولي أمرك")).toBeVisible();
});

test("visitors are asked to sign in", async ({ page }) => {
  await page.goto("/mushaf/surah/112");
  await page.getByRole("button", { name: "تسميع", exact: true }).click();
  await expect(page.getByText("التسميع الصوتي للمسجلين.")).toBeVisible();
});
