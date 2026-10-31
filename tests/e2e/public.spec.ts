import { expect, test } from "@playwright/test";
import { expectAccessible, expectNoHorizontalScroll, sql } from "./helpers";

const PAGES = ["/", "/about", "/programs", "/programs/memorization", "/academy", "/library", "/news", "/search", "/verify", "/mushaf", "/tajweed", "/tafsir", "/teachers", "/articles", "/contact", "/privacy", "/terms", "/login", "/register", "/forgot-password"];

test("Arabic is the default and right-to-left", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("رحلتك مع القرآن");
});

test("English is available and left-to-right", async ({ page }) => {
  await page.goto("/en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Your journey");
});

test("/ar redirects to the canonical unprefixed URL", async ({ page }) => {
  await page.goto("/ar/about");
  await expect(page).toHaveURL(/\/about$/);
});

for (const path of PAGES) {
  test(`renders, fits the screen and passes axe: ${path}`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expectNoHorizontalScroll(page);
    await expectAccessible(page);
  });
}

test("dark mode toggles and passes contrast checks", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await page.getByRole("button", { name: "تبديل الوضع الليلي" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expectAccessible(page);
});

test("does not show fabricated statistics or testimonials", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "آراء موثقة" })).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText(/\+\s?\d{2,}|طالب مسجل|معتمد(ة)? من/);
});

test("placement gives a recommendation and leads to registration", async ({ page }) => {
  await page.goto("/");
  for (const a of ["بالغ", "أقرأ ببطء", "بعض السور القصيرة", "أساسيات", "وقت منتظم"]) await page.locator("#placement").getByRole("button", { name: a, exact: true }).click();
  await expect(page.getByText("توصية مبدئية لك")).toBeVisible();
  await expect(page.getByText("يؤكد المعلم مستوى القراءة")).toBeVisible();
  await expect(page.locator("#placement").getByRole("link", { name: "سجل وابدأ" })).toHaveAttribute("href", "/register");
});

test("previews of private dashboards are labelled as illustrative", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("معاينة ببيانات توضيحية").first()).toBeVisible();
});

test("AI section tells the truth while the assistant is disabled", async ({ page }) => {
  // Integration tests leave the assistant enabled in the shared test database, so this sets its own state.
  await sql(`UPDATE settings SET value = '{"enabled": false}' WHERE key = 'ai'`);
  await page.goto("/");
  await expect(page.getByText("معاينة، لم يفعل بعد")).toBeVisible();
  await expect(page.getByRole("link", { name: "اسأل المساعد" })).toHaveCount(0);
});

test("every header and footer link resolves", async ({ page, request }) => {
  await page.goto("/");
  const hrefs = await page.locator("header a, footer a").evaluateAll((a) => [...new Set(a.map((x) => x.getAttribute("href")!).filter((h) => h.startsWith("/")))]);
  expect(hrefs.length).toBeGreaterThan(10);
  for (const h of hrefs) expect((await request.get(h)).status(), h).toBe(200);
});

test("no branch management remains", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).not.toContainText("الفروع");
});

test("sends security headers", async ({ request }) => {
  const h = (await request.get("/")).headers();
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["strict-transport-security"]).toBeTruthy();
  expect(h["x-powered-by"]).toBeUndefined();
});

test("provides SEO metadata and sitemap", async ({ page, request }) => {
  await page.goto("/mushaf/surah/2");
  await expect(page).toHaveTitle(/البقرة/);
  await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
  const xml = await (await request.get("/sitemap.xml")).text();
  expect(xml).toContain("/mushaf/surah/114");
  expect(xml).not.toContain("/admin");
  expect((await request.get("/robots.txt")).status()).toBe(200);
});

test("shows a friendly 404", async ({ page }) => {
  const res = await page.goto("/mushaf/surah/115");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("غير موجودة");
});
