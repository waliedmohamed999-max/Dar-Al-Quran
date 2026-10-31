import { expect, test } from "@playwright/test";
import { expectAccessible, expectNoHorizontalScroll, sql } from "./helpers";

test("displays ayah text byte-for-byte from the imported source", async ({ page }) => {
  const rows = await sql<{ id: number; text: string }>(`SELECT id, text FROM quran_ayahs WHERE "surahId" = 112 ORDER BY id`);
  await page.goto("/mushaf/surah/112");
  expect(rows).toHaveLength(4);
  for (const r of rows) expect(await page.locator(`#a-${r.id}`).textContent()).toBe(r.text);
  await expectNoHorizontalScroll(page);
});

test("tajweed colouring does not alter a single character", async ({ page }) => {
  const rows = await sql<{ id: number; text: string }>(`SELECT a.id, a.text FROM quran_ayahs a JOIN tajweed_annotations t ON t."ayahId" = a.id WHERE a."surahId" = 1 ORDER BY a.id`);
  await page.goto("/mushaf/surah/1");
  await page.getByRole("button", { name: "تجويد", exact: true }).click();
  await expect(page.locator(".quran [class^=tj-]").first()).toBeVisible();
  for (const r of rows) expect(await page.locator(`#a-${r.id}`).textContent()).toBe(r.text);
  await expect(page.getByText("لم يكتمل تدقيقه")).toBeVisible();
});

test("shows the Bismillah as a heading, not in At-Tawbah, and not inside the ayah", async ({ page }) => {
  const [first] = await sql<{ text: string }>(`SELECT text FROM quran_ayahs WHERE id = 1`);
  await page.goto("/mushaf/surah/114");
  await expect(page.locator(".basmala")).toHaveText(first.text);
  const [ayah] = await sql<{ id: number }>(`SELECT id FROM quran_ayahs WHERE "surahId" = 114 AND "ayahNumber" = 1`);
  await expect(page.locator(`#a-${ayah.id}`)).not.toContainText(first.text);
  await page.goto("/mushaf/surah/9");
  await expect(page.locator(".basmala")).toHaveCount(0);
});

test("page view uses mushaf page numbers", async ({ page }) => {
  const [c] = await sql<{ n: number }>(`SELECT count(*)::int AS n FROM quran_ayahs WHERE page = 604`);
  await page.goto("/mushaf/page/604");
  await expect(page.locator(".ayah")).toHaveCount(c.n);
  await expect(page.getByText("ليس مطابقاً لتوزيع الأسطر المطبوع")).toBeVisible();
});

test("search matches without diacritics", async ({ page }) => {
  await page.goto("/mushaf/search?q=" + encodeURIComponent("الرحمن"));
  await expect(page.getByRole("status")).toContainText("عدد الآيات");
});

test("repeats an ayah the chosen number of times, then advances", async ({ page }) => {
  await page.route("**/everyayah.com/**", (r) => r.abort());
  await page.goto("/mushaf/surah/112");
  await page.getByRole("button", { name: "استماع", exact: true }).click();
  await page.locator("#repeat").selectOption("3");
  await page.getByRole("button", { name: "تشغيل", exact: true }).click();
  // WebKit does not route media requests through page.route, so this reads the element itself.
  await expect.poll(() => page.locator("audio").evaluate((el: HTMLAudioElement) => el.src)).toContain("/data/Alafasy_128kbps/112001.mp3");
  // Audio cannot play in CI, so the element's `ended` event drives the same code path.
  await page.locator("audio").evaluate((el: HTMLAudioElement) => {
    el.play = () => Promise.resolve();
    el.dispatchEvent(new Event("ended"));
    el.dispatchEvent(new Event("ended"));
  });
  await expect.poll(async () => page.locator("audio").getAttribute("src").catch(() => null)).toContain("112001");
  await page.locator("audio").evaluate((el: HTMLAudioElement) => el.dispatchEvent(new Event("ended")));
  await expect.poll(() => page.locator("audio").evaluate((el: HTMLAudioElement) => el.src)).toContain("112002");
  await expect(page.getByText("الآية الجارية")).toContainText("112:2");
});

test("offers repeat values from 1 to 10 plus unlimited, and speeds", async ({ page }) => {
  await page.goto("/mushaf/surah/112");
  await page.getByRole("button", { name: "استماع", exact: true }).click();
  await expect(page.locator("#repeat option")).toHaveCount(11);
  await expect(page.locator("#rr option")).toHaveCount(11);
  await expect(page.locator("#speed option")).toHaveCount(5);
});

test("memorize mode hides words gradually without changing the text", async ({ page }) => {
  const rows = await sql<{ id: number; text: string }>(`SELECT id, text FROM quran_ayahs WHERE "surahId" = 112 ORDER BY id`);
  await page.goto("/mushaf/surah/112");
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  const hidden = page.locator(".word-hidden");
  const before = await hidden.count();
  expect(before).toBeGreaterThan(0);
  await hidden.first().click();
  await expect(hidden).toHaveCount(before - 1);
  for (const r of rows) expect(await page.locator(`#a-${r.id}`).textContent()).toBe(r.text);
});

test("tapping a word in tajweed mode shows its approved rule and lesson link", async ({ page }) => {
  const [a] = await sql<{ id: number }>(`SELECT id FROM quran_ayahs WHERE "surahId" = 1 AND "ayahNumber" = 2`);
  await page.goto("/mushaf/surah/1");
  await page.getByRole("button", { name: "تجويد", exact: true }).click();
  await page.locator(`#a-${a.id} .word`).last().click();
  await expect(page.getByRole("heading", { name: "أحكام الكلمة" })).toBeVisible();
  await expect(page.getByRole("complementary").getByRole("link").first()).toHaveAttribute("href", /\/tajweed\//);
});

test("switching modes keeps the selected ayah", async ({ page }) => {
  await page.goto("/mushaf/surah/112");
  await page.locator(".ayah").nth(1).click();
  for (const m of ["تفسير", "دراسة", "قراءة"]) {
    await page.getByRole("button", { name: m, exact: true }).click();
    await expect(page.locator(".ayah").nth(1)).toHaveAttribute("data-selected", "true");
  }
});

test("every reader mode is accessible", async ({ page }) => {
  await page.goto("/mushaf/surah/112");
  for (const m of ["قراءة", "استماع", "حفظ", "تجويد", "تفسير", "دراسة"]) {
    await page.getByRole("button", { name: m, exact: true }).click();
    await expectAccessible(page);
  }
});
