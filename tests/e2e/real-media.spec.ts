// Real browser media paths, with no mocks of the app. Chromium's fake microphone is a real MediaRecorder capture
// of a synthetic signal, so this proves the code path, not a human voice or physical hardware.
import { expect, test } from "@playwright/test";
import { login, sql } from "./helpers";

test.use({ launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"] }, permissions: ["microphone"] });

const SPEECH = 15000;

test("recording from the microphone, uploading to storage, and listening through a signed URL", async ({ page, browserName, request }) => {
  test.skip(browserName !== "chromium", "fake capture devices are a Chromium feature");
  await login(page, "student@demo.test");
  await page.goto("/student/recitations");
  await page.getByRole("button", { name: "بدء التسجيل" }).click();
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: "إنهاء التسجيل" }).click();
  const before = (await sql<{ n: number }>(`SELECT count(*)::int AS n FROM recitation_submissions`))[0].n;
  await page.getByLabel(/أوافق على إرسال/).check();
  const [response] = await Promise.all([page.waitForResponse((r) => r.url().includes("/api/v1/recitations") && r.request().method() === "POST"), page.getByRole("button", { name: "إرسال إلى المعلم" }).click()]);
  expect(response.status(), await response.text()).toBeLessThan(300);
  await expect.poll(async () => (await sql<{ n: number }>(`SELECT count(*)::int AS n FROM recitation_submissions`))[0].n).toBeGreaterThan(before);
  const [row] = await sql<{ id: string; mime: string; size: number }>(`SELECT s.id, f.mime, f.size FROM recitation_submissions s JOIN files f ON f.id = s."fileId" ORDER BY s."createdAt" DESC LIMIT 1`);
  expect(row.size).toBeGreaterThan(1000);
  const signed = await page.evaluate(async (id) => (await fetch(`/api/v1/recitations/${id}/audio`)).json(), row.id);
  const url = signed.data?.url ?? signed.url;
  expect(url).toContain("X-Amz-Signature");
  // The browser plays it the way the app does, through a media element, so CSP and the signature both apply.
  const played = await page.evaluate((u) => new Promise<{ ok: boolean; seconds?: number }>((res) => {
    const a = new Audio(u);
    a.muted = true;
    a.onerror = () => res({ ok: false });
    a.onplaying = () => res({ ok: true, seconds: a.currentTime });
    a.play().catch(() => res({ ok: false }));
    setTimeout(() => res({ ok: false }), 15000);
  }), url);
  expect(played.ok).toBe(true);
  const bytes = await (await request.get(url)).body();
  expect(bytes.subarray(0, 4).toString("hex")).toBe("1a45dfa3");
  expect((await request.get(url.split("?")[0])).status(), "without a signature the object is closed").toBeGreaterThanOrEqual(400);
});

test("placement practice records locally and sends nothing to the server", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "fake capture devices are a Chromium feature");
  await sql(`DELETE FROM placement_assessments WHERE "studentId" = (SELECT s.id FROM students s JOIN users u ON u.id = s."userId" WHERE u.email = 'student2@demo.test')`);
  await login(page, "student2@demo.test");
  await page.goto("/student/placement");
  const uploads: string[] = [];
  page.on("request", (r) => { if (r.method() === "POST" && /audio|recitations/.test(r.url())) uploads.push(r.url()); });
  await page.getByRole("button", { name: "ابدأ تسجيلاً تجريبياً" }).click();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "إيقاف" }).click();
  const audio = page.getByTestId("practice-audio");
  await expect(audio).toBeVisible();
  await expect.poll(() => audio.evaluate((e: HTMLAudioElement) => e.src)).toMatch(/^blob:/);
  expect(await audio.evaluate((e: HTMLAudioElement) => new Promise<boolean>((res) => { e.onloadedmetadata = () => res(true); e.onerror = () => res(false); e.load(); }))).toBe(true);
  expect(uploads).toEqual([]);
});

test("real recitation audio plays, advances, repeats, and highlights words", async ({ page }) => {
  await page.goto("/mushaf/surah/112");
  await page.getByRole("button", { name: "استماع" }).click();
  await page.getByLabel("تكرار الآية").selectOption("2");
  await page.locator("#a-6222").click();
  const audio = page.locator("audio").first();
  await expect.poll(() => audio.evaluate((e: HTMLAudioElement) => e.src), { timeout: SPEECH }).toContain("everyayah.com");
  // A real network decode: time moves and the duration is known.
  await expect.poll(() => audio.evaluate((e: HTMLAudioElement) => e.currentTime), { timeout: SPEECH }).toBeGreaterThan(0.3);
  expect(await audio.evaluate((e: HTMLAudioElement) => e.error)).toBeNull();
  await expect(page.locator(".word-live").first()).toBeVisible({ timeout: SPEECH });
  await expect(page.locator(".quran")).toContainText((await sql<{ text: string }>(`SELECT text FROM quran_ayahs WHERE id = 6222`))[0].text);
  // The second play of ayah 1 returns near the start while still on the same ayah file.
  const src = await audio.evaluate((e: HTMLAudioElement) => e.src);
  await audio.evaluate((e: HTMLAudioElement) => { e.currentTime = Math.max(0, e.duration - 0.15); });
  await expect.poll(() => audio.evaluate((e: HTMLAudioElement) => e.currentTime < 1.5 && !e.paused), { timeout: SPEECH }).toBe(true);
  expect(await audio.evaluate((e: HTMLAudioElement) => e.src)).toBe(src);
  // After the repeats it moves to the next ayah.
  await audio.evaluate((e: HTMLAudioElement) => { e.currentTime = Math.max(0, e.duration - 0.15); });
  await expect.poll(() => audio.evaluate((e: HTMLAudioElement) => e.src), { timeout: SPEECH }).not.toBe(src);
});
