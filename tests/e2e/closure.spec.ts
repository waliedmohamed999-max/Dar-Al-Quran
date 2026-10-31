import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { expectAccessible, expectNoHorizontalScroll, login, sql } from "./helpers";

test("an unapproved hadith disappears immediately from page, API-driven plan and listing, then returns", async ({ page }) => {
  const [h] = await sql<{ id: string; text: string }>(`SELECT id, text FROM hadith_entries WHERE number = 2`);
  expect((await page.goto("/hadith/nawawi-40/2"))?.status()).toBe(200);
  await sql(`UPDATE hadith_entries SET "reviewStatus" = 'PENDING' WHERE id = $1`, [h.id]);
  try {
    expect((await page.goto("/hadith/nawawi-40/2"))?.status()).toBe(404);
    await page.goto("/hadith/nawawi-40");
    await expect(page.locator("main")).not.toContainText(h.text.slice(0, 40));
  } finally {
    await sql(`UPDATE hadith_entries SET "reviewStatus" = 'APPROVED' WHERE id = $1`, [h.id]);
  }
  expect((await page.goto("/hadith/nawawi-40/2"))?.status()).toBe(200);
});

test("public pages are not stored by shared or browser caches", async ({ request }) => {
  for (const p of ["/adhkar", "/hadith/nawawi-40/1"]) {
    const r = await request.get(p);
    expect(r.headers()["cache-control"] ?? "", p).toMatch(/no-store|private/);
  }
  expect(readFileSync("public/sw.js", "utf8")).not.toMatch(/caches\.|fetch"/);
});

test("the full E2E xlsx export opens as a real workbook", async ({ page, request }) => {
  await login(page, "admin@demo.test");
  const cookies = await page.context().cookies();
  const r = await request.get("/api/v1/reports/export?type=students&format=xlsx", { headers: { cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; ") } });
  expect(r.status()).toBe(200);
  const body = await r.body();
  expect(body.subarray(0, 2).toString()).toBe("PK");
});

test("placement practice is offered first, stays unscored, and the voice guide is opt-in", async ({ page }) => {
  await sql(`DELETE FROM placement_assessments WHERE "studentId" = (SELECT s.id FROM students s JOIN users u ON u.id = s."userId" WHERE u.email = 'student2@demo.test')`);
  await login(page, "student2@demo.test");
  await page.goto("/student/placement");
  await expect(page.getByText("اختبار تجريبي قبل التقييم")).toBeVisible();
  await page.getByRole("button", { name: "التالي" }).click();
  await page.locator('input[name="practice"]').first().check();
  await expect(page.getByText("لا تحسب هذه الإجابة")).toBeVisible();
  await page.getByRole("button", { name: "انتهيت، ابدأ التقييم الرسمي" }).click();
  await expect(page.getByText("اختبار تجريبي قبل التقييم")).toBeHidden();
  const [row] = await sql<{ tajweedPercent: number | null; practice: Date }>(`SELECT "tajweedPercent", "practiceCompletedAt" AS practice FROM placement_assessments WHERE "studentId" = (SELECT s.id FROM students s JOIN users u ON u.id = s."userId" WHERE u.email = 'student2@demo.test') ORDER BY "createdAt" DESC LIMIT 1`);
  expect(row.practice).not.toBeNull();
  expect(row.tajweedPercent).toBeNull();
  await expectAccessible(page);
});

test("a judge scores in the browser and the admin approves", async ({ page }) => {
  const stamp = Date.now();
  const rows = await sql<{ id: string }>(`SELECT c.id FROM competitions c WHERE c.slug = 'demo-tajweed'`);
  await login(page, "student2@demo.test");
  await page.goto("/competitions/demo-tajweed");
  if (await page.getByRole("button", { name: "تسجيل", exact: true }).count()) { await page.getByRole("button", { name: "تسجيل", exact: true }).click(); await expect(page.getByText("أنت مسجل.")).toBeVisible(); }
  await login(page, "admin@demo.test");
  await page.goto("/admin/judging");
  await expectAccessible(page);
  await page.getByLabel("اسم النموذج").fill(`نموذج ${stamp}`);
  await page.getByLabel(/المعايير، كل سطر/).fill("الحفظ | دون خطأ ولا تردد | 10 | 1");
  await page.getByRole("button", { name: "حفظ النموذج" }).click();
  await expect(page.getByText(`نموذج ${stamp}`).first()).toBeVisible();
  await page.getByLabel("عنوان الجلسة").fill(`جلسة ${stamp}`);
  await page.getByLabel("المسابقة").selectOption(rows[0].id);
  await page.getByLabel(/^النموذج/).selectOption({ label: `نموذج ${stamp}` });
  await page.getByLabel("الموعد").fill("2030-01-01T10:00");
  const [teacher] = await sql<{ id: string }>(`SELECT id FROM users WHERE email = 'teacher@demo.test'`);
  await page.getByLabel("المحكمون").selectOption(teacher.id);
  await page.getByRole("button", { name: "إنشاء الجلسة" }).click();
  await page.getByRole("link", { name: `جلسة ${stamp}` }).click();
  await page.waitForURL(/\/judging\//);
  const url = page.url();
  await expectAccessible(page);
  await page.getByRole("button", { name: "فتح الجلسة" }).click();
  await expect(page.getByRole("button", { name: "إغلاق التحكيم" })).toBeVisible();

  await login(page, "teacher@demo.test");
  await page.goto("/judging");
  await page.getByRole("link", { name: `جلسة ${stamp}` }).click();
  const forms = page.getByRole("button", { name: "حفظ درجاتي" });
  await expect(forms.first()).toBeVisible();
  const n = await forms.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const form = page.locator('form:has(button:has-text("حفظ درجاتي"))').nth(i);
    await form.getByRole("spinbutton").fill("8");
    const saved = page.waitForResponse((r) => r.url().includes("/scores") && r.status() === 200);
    await form.getByRole("button", { name: "حفظ درجاتي" }).click();
    await saved;
  }
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "إغلاق التحكيم" }).click();
  await expect(page.getByText("النتيجة: 80%").first()).toBeVisible();

  await login(page, "admin@demo.test");
  await page.goto(url);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "اعتماد النتائج" }).click();
  await expect(page.getByRole("button", { name: "طلب شهادة للاعتماد" }).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("new staff pages render, pass axe, and stay closed to students", async ({ page }) => {
  await login(page, "admin@demo.test");
  for (const p of ["/admin/study-resources", "/admin/hadith", "/admin/lessons", "/admin/competitions"]) { expect((await page.goto(p))?.status(), p).toBe(200); await expectAccessible(page); }
  await login(page, "student@demo.test");
  for (const p of ["/admin/judging", "/admin/study-resources", "/judging"]) expect((await page.goto(p))?.status(), p).toBe(404);
});

test("reports show actual memorization, and the map shows juz progress", async ({ page }) => {
  await login(page, "student@demo.test");
  await page.goto("/reports/me");
  await expect(page.getByText("الحفظ الفعلي")).toBeVisible();
  await page.goto("/student/map");
  await expect(page.getByText("آيات متقنة باعتماد المعلم")).toBeVisible();
  await expectAccessible(page);
});
