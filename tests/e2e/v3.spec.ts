import { expect, test } from "@playwright/test";
import { expectAccessible, expectNoHorizontalScroll, login, sql } from "./helpers";

test("public adhkar show their source, and the counter works without an account", async ({ page }) => {
  await page.goto("/adhkar");
  await expect(page.locator("article").first()).toContainText("حصن المسلم");
  const counter = page.getByRole("button", { name: "زيادة العداد" }).first();
  const before = await counter.textContent();
  await counter.click();
  await expect(counter).not.toHaveText(before!);
  await expectNoHorizontalScroll(page);
  await expectAccessible(page);
});

test("the hadith page shows stored text and admits missing documentation", async ({ page }) => {
  const [h] = await sql<{ text: string }>(`SELECT text FROM hadith_entries WHERE number = 1`);
  await page.goto("/hadith/nawawi-40/1");
  await expect(page.locator("main")).toContainText(h.text.slice(0, 40));
  await expect(page.getByText("لم يوثق بعد من مرجع معتمد")).toBeVisible();
  await page.getByRole("tab", { name: "إخفاء تدريجي" }).click();
  await expect(page.locator(".word-hidden").first()).toBeVisible();
  await page.getByRole("tab", { name: "كتابة" }).click();
  await page.getByLabel("اكتب ما حفظته").fill(h.text);
  await page.getByRole("button", { name: "تحقق" }).click();
  await expect(page.getByText("100%")).toBeVisible();
  await expect(page.getByText("لا يثبت الحفظ إلا بالتسميع")).toBeVisible();
  await expectAccessible(page);
});

for (const path of ["/hadith", "/hadith/nawawi-40", "/competitions", "/competitions/demo-tajweed", "/tafsir/surah/112", "/mushaf/hizb/60", "/tajweed/qalqalah"]) {
  test(`renders and passes axe: ${path}`, async ({ page }) => {
    expect((await page.goto(path))?.status()).toBe(200);
    await expectNoHorizontalScroll(page);
    await expectAccessible(page);
  });
}

test("the service worker is served at the root", async ({ request }) => {
  const r = await request.get("/sw.js");
  expect(r.status()).toBe(200);
  expect(r.headers()["content-type"]).toContain("javascript");
});

test("student pages for the unified system render and pass axe", async ({ page }) => {
  await login(page, "student@demo.test");
  for (const p of ["/student", "/student/map", "/student/map?surah=114", "/student/placement", "/hadith/my", "/reports/me", "/reports/me?period=day", "/adhkar/settings"]) {
    expect((await page.goto(p))?.status(), p).toBe(200);
    await expectAccessible(page);
  }
});

test("staff pages render and pass axe", async ({ page }) => {
  await login(page, "teacher@demo.test");
  for (const p of ["/teacher/hadith", "/teacher/placement"]) { expect((await page.goto(p))?.status(), p).toBe(200); await expectAccessible(page); }
  await login(page, "admin@demo.test");
  for (const p of ["/admin/adhkar", "/admin/hadith", "/admin/competitions", "/admin/scholarly", "/admin/questions"]) { expect((await page.goto(p))?.status(), p).toBe(200); await expectAccessible(page); }
});

test("students cannot open staff modules", async ({ page }) => {
  await login(page, "student@demo.test");
  for (const p of ["/admin/adhkar", "/admin/hadith", "/admin/competitions", "/teacher/hadith", "/teacher/placement"]) expect((await page.goto(p))?.status(), p).toBe(404);
});

test("a guardian cannot read another child's report", async ({ page }) => {
  const [other] = await sql<{ id: string }>(`SELECT s.id FROM students s JOIN users u ON u.id = s."userId" WHERE u.email = 'student@demo.test'`);
  const [own] = await sql<{ id: string }>(`SELECT s.id FROM students s JOIN users u ON u.id = s."userId" WHERE u.email = 'student3@demo.test'`);
  await login(page, "guardian@demo.test");
  expect((await page.goto(`/reports/${other.id}`))?.status()).toBe(404);
  expect((await page.goto(`/reports/${own.id}`))?.status()).toBe(200);
});

test("placement wizard saves the profile and resumes at the next stage", async ({ page }) => {
  await sql(`DELETE FROM placement_assessments WHERE "studentId" = (SELECT s.id FROM students s JOIN users u ON u.id = s."userId" WHERE u.email = 'student2@demo.test')`);
  // The reminder card is dismissible and may sit over the form on a short page.
  await sql(`DELETE FROM notifications WHERE type = 'adhkar.reminder'`);
  await login(page, "student2@demo.test");
  await page.goto("/student/placement");
  await page.getByLabel("عدد الأجزاء المحفوظة تقريباً").fill("2");
  await page.getByRole("button", { name: "حفظ ومتابعة" }).click();
  await expect(page.getByText("اقرأ هذه الآيات بصوتك")).toBeVisible();
  await page.reload();
  await expect(page.getByText("اقرأ هذه الآيات بصوتك")).toBeVisible();
});

test("exam runner autosaves, survives a reload and finishes", async ({ page, baseURL }) => {
  await sql(`DELETE FROM assessment_attempts WHERE "studentId" = (SELECT s.id FROM students s JOIN users u ON u.id = s."userId" WHERE u.email = 'student@demo.test') AND "assessmentId" = (SELECT "assessmentId" FROM competitions WHERE slug = 'demo-tajweed')`);
  await login(page, "student@demo.test");
  await page.goto("/competitions/demo-tajweed");
  if (await page.getByRole("button", { name: "تسجيل", exact: true }).count()) {
    await page.getByRole("button", { name: "تسجيل", exact: true }).click();
    await expect(page.getByText("أنت مسجل.")).toBeVisible();
  }
  await page.getByRole("button", { name: "بدء الاختبار أو استئنافه" }).click();
  await page.waitForURL(/\/exams\//);
  await expect(page.getByText("الوقت المتبقي")).toBeVisible();
  const radio = page.getByRole("radio", { name: "صح", exact: true });
  await radio.check();
  await expect(page.getByText("حفظ تلقائياً")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("radio", { name: "صح", exact: true })).toBeChecked();
  await expectAccessible(page);
  await page.getByRole("button", { name: "تسليم نهائي" }).click();
  await page.waitForURL(/\/result/);
  await expect(page.getByRole("heading", { name: "نتيجة الاختبار" })).toBeVisible();
  void baseURL;
});

test("saving reminder settings keeps them after reload", async ({ page }) => {
  await login(page, "student@demo.test");
  await page.goto("/adhkar/settings");
  await page.getByLabel("تفعيل تذكيرات الأذكار").check();
  await page.getByLabel("وقت النوم").fill("22:30");
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(page.getByText("حفظت الإعدادات.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("تفعيل تذكيرات الأذكار")).toBeChecked();
  await expect(page.getByLabel("وقت النوم")).toHaveValue("22:30");
});
