// Runs against a server with APP_ENV=production on data whose only approvals come from the demo seed.
// Nothing religious may be served: this is the end-to-end proof of the approval gate.
import { expect, test } from "@playwright/test";
import { sql } from "./helpers";

test.use({ baseURL: "http://localhost:3101" });

test("listing pages show no unapproved adhkar or hadith", async ({ page }) => {
  const [d] = await sql<{ text: string }>(`SELECT text FROM adhkar ORDER BY "sortOrder" LIMIT 1`);
  await page.goto("/adhkar");
  await expect(page.locator("main")).not.toContainText(d.text.slice(0, 30));
  await page.goto("/hadith");
  await expect(page.locator("main")).not.toContainText("حديث رقم");
});

test("direct links to unapproved content return 404", async ({ page }) => {
  const [rule] = await sql<{ slug: string }>(`SELECT slug FROM tajweed_rules WHERE "reviewedBy" = 'demo-seed' LIMIT 1`);
  for (const p of ["/hadith/nawawi-40", "/hadith/nawawi-40/1", `/tajweed/${rule.slug}`, "/competitions/demo-tajweed"]) {
    expect((await page.goto(p))?.status(), p).toBe(404);
  }
});

test("the API, search and sitemap serve no unapproved content", async ({ request }) => {
  const [rule] = await sql<{ slug: string; titleAr: string }>(`SELECT slug, "titleAr" FROM tajweed_rules WHERE "reviewedBy" = 'demo-seed' LIMIT 1`);
  const search = await (await request.get(`/api/v1/search?q=${encodeURIComponent(rule.titleAr)}`)).text();
  expect(search).not.toContain(rule.slug);
  const rules = await (await request.get("/api/v1/quran/ayahs/1/tajweed-rules")).json();
  expect(rules.data ?? rules).toEqual([]);
  const tafsir = await (await request.get("/api/v1/quran/ayahs/1/tafsir")).json();
  expect(tafsir.data ?? tafsir).toEqual([]);
  const map = await (await request.get("/sitemap.xml")).text();
  expect(map).not.toContain(`/tajweed/${rule.slug}`);
  expect(map).not.toContain("/hadith/nawawi-40");
});

test("the mushaf still shows verbatim text, without unapproved colours", async ({ page, request }) => {
  const [a] = await sql<{ text: string }>(`SELECT text FROM quran_ayahs WHERE "surahId" = 112 AND "ayahNumber" = 2`);
  await page.goto("/mushaf/surah/112");
  await expect(page.locator(".quran")).toContainText(a.text);
  const r = await (await request.get("/api/v1/quran/surahs/112/ayahs")).json();
  expect((r.data ?? r).every((x: { spans: unknown }) => x.spans === null)).toBe(true);
});

test("administrators cannot open admin pages or APIs in production without a second factor", async ({ page, baseURL }) => {
  await sql("DELETE FROM rate_limits WHERE key LIKE 'auth:%'");
  await page.goto("/login");
  await page.locator("main").getByLabel("البريد الإلكتروني").fill("admin@demo.test");
  await page.getByLabel("كلمة المرور").fill(process.env.DEMO_PASSWORD || "integration-test-password");
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await page.waitForURL(/account\/security/);
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/account\/security/);
  const r = await page.evaluate(async () => (await fetch("/api/v1/content", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status);
  expect(r).toBe(403);
  void baseURL;
});
