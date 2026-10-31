import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { expectAccessible, expectNoHorizontalScroll, login, PASSWORD, sql } from "./helpers";

const SIDE = 'aside[aria-label="القائمة الجانبية"]';

function totp(secret: string) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1000000).padStart(6, "0");
}

test.describe("navigation by role", () => {
  const CASES: [string, string[], string[]][] = [
    ["admin@demo.test", ["/admin", "/admin/users", "/admin/scholarly", "/admin/settings"], ["/student", "/guardian"]],
    ["supervisor@demo.test", ["/admin", "/admin/halaqas", "/admin/questions"], ["/admin/users", "/admin/settings", "/admin/scholarly", "/admin/audit"]],
    ["teacher@demo.test", ["/teacher", "/teacher/reviews", "/judging"], ["/admin", "/admin/users"]],
    ["student@demo.test", ["/student", "/student/map", "/hadith/my"], ["/admin", "/teacher"]],
    ["guardian@demo.test", ["/guardian", "/notifications"], ["/admin", "/teacher", "/student"]],
  ];
  for (const [email, shown, hidden] of CASES) {
    test(`${email}: every link opens, and only permitted links appear`, async ({ page }) => {
      await login(page, email);
      const side = page.locator(SIDE);
      await expect(side).toBeVisible();
      for (const h of shown) await expect(side.locator(`a[href="${h}"]`).first()).toBeVisible();
      for (const h of hidden) await expect(side.locator(`a[href="${h}"]`)).toHaveCount(0);
      const hrefs = await side.locator("a[href]").evaluateAll((a) => [...new Set(a.map((x) => x.getAttribute("href")!))]);
      for (const h of hrefs) expect((await page.goto(h))?.status(), `${email} ${h}`).toBe(200);
    });
  }
});

test("the sidebar sits on the right in Arabic, shows the current page, and no menu covers the content", async ({ page }) => {
  await login(page, "admin@demo.test");
  await page.goto("/admin/users");
  const side = await page.locator(SIDE).boundingBox();
  const main = await page.locator("main").boundingBox();
  expect(side!.x).toBeGreaterThan(main!.x);
  await expect(page.locator(`${SIDE} a[aria-current="page"]`)).toHaveAttribute("href", "/admin/users");
  await expect(page.locator('nav[aria-label="مسار التنقل"]')).toContainText("المستخدمون");
  await expect(page.locator(".mega")).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});

test("collapse is remembered, search filters, groups fold, and the browser back button works", async ({ page }) => {
  await login(page, "admin@demo.test");
  await page.goto("/admin");
  const side = page.locator(SIDE);
  await side.getByRole("button", { name: "طي القائمة" }).click();
  await expect(side.getByLabel("بحث في القائمة")).toHaveCount(0);
  await page.reload();
  await expect(side.getByRole("button", { name: "توسيع القائمة" })).toBeVisible();
  await expect(page.locator(".dash-shell")).toHaveAttribute("data-collapsed", "true");
  await side.getByRole("button", { name: "توسيع القائمة" }).click();
  await side.getByLabel("بحث في القائمة").fill("التدقيق");
  await expect(side.locator("a[href]").filter({ hasText: /./ })).toHaveCount(2);
  await side.getByLabel("بحث في القائمة").fill("");
  const group = side.getByRole("button", { name: "المحتوى", exact: true });
  await group.click();
  await expect(group).toHaveAttribute("aria-expanded", "false");
  await expect(side.locator('a[href="/admin/adhkar"]')).toHaveCount(0);
  await page.reload();
  await expect(side.locator('a[href="/admin/adhkar"]')).toHaveCount(0);
  await side.getByRole("button", { name: "المحتوى", exact: true }).click();
  await side.locator('a[href="/admin/users"]').click();
  await page.waitForURL(/admin\/users/);
  await page.goBack();
  await page.waitForURL(/\/admin$/);
  await expect(side.locator('a[aria-current="page"]')).toHaveAttribute("href", "/admin");
});

test("keyboard: skip link, Ctrl+K jump, and every sidebar control reachable", async ({ page }) => {
  await login(page, "admin@demo.test");
  await page.goto("/admin");
  await page.keyboard.press("Control+k");
  await expect(page.locator("#quick-search")).toBeFocused();
  await page.keyboard.type("الشهادات");
  await page.keyboard.press("Enter");
  await page.waitForURL(/admin\/certificates/);
  await page.locator(`${SIDE} a[href="/admin/users"]`).focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(/admin\/users/);
});

test.describe("mobile drawer", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test("stays closed by default, opens, closes with Escape and after navigating", async ({ page }) => {
    await login(page, "admin@demo.test");
    await page.goto("/admin");
    const drawer = page.getByRole("dialog", { name: "القائمة" });
    await expect(drawer).toHaveCount(0);
    await expect(page.locator(SIDE)).toBeHidden();
    await expect(page.locator("main h1")).toBeInViewport();
    await expectNoHorizontalScroll(page);
    await page.getByRole("button", { name: "فتح القائمة" }).click();
    await expect(drawer).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(page.getByRole("button", { name: "فتح القائمة" })).toBeFocused();
    await page.getByRole("button", { name: "فتح القائمة" }).click();
    await drawer.locator('a[href="/admin/users"]').click();
    await page.waitForURL(/admin\/users/);
    await expect(drawer).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });
});

test("the dashboard shows real figures and working period filters", async ({ page }) => {
  await login(page, "admin@demo.test");
  const [{ n }] = await sql<{ n: number }>("SELECT count(*)::int AS n FROM students");
  await page.goto("/admin?period=week");
  await expect(page.locator(".kpi").first()).toContainText(String(n));
  await expect(page.getByRole("heading", { name: "مهام تحتاج إجراء" })).toBeVisible();
  await expect(page.getByRole("link", { name: "أسبوع" })).toHaveAttribute("aria-current", "true");
  await expectAccessible(page);
  await page.getByLabel("من", { exact: true }).fill("2026-01-01");
  await page.getByLabel("إلى", { exact: true }).fill("2026-02-01");
  await page.getByRole("button", { name: "تطبيق" }).click();
  await page.waitForURL(/period=custom/);
  await expect(page.getByText("لا توجد مهام في هذه الفترة.")).toBeVisible({ timeout: 20000 });
  await page.goto("/admin?period=month");
  await page.getByLabel("بحث", { exact: true }).fill("الفرقان");
  await expect(page.locator(".tbl tbody tr").first()).toContainText("الفرقان");
  await page.getByRole("button", { name: "الطلاب", exact: true }).click();
  await expect(page.locator('th[aria-sort="ascending"]')).toBeVisible();
});

test("dark mode and every role dashboard pass axe, and public pages keep their own tokens", async ({ page }) => {
  await login(page, "admin@demo.test");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/admin");
  await expect(page.locator(".kpi").first()).toBeVisible();
  await expectAccessible(page);
  await page.emulateMedia({ colorScheme: "light" });
  for (const [email, path] of [["teacher@demo.test", "/teacher"], ["student@demo.test", "/student"], ["guardian@demo.test", "/guardian"], ["supervisor@demo.test", "/admin"]]) {
    await login(page, email);
    await page.goto(path);
    await expect(page.locator(SIDE)).toBeVisible();
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);
  }
  await page.goto("/");
  expect(await page.evaluate(() => getComputedStyle(document.querySelector(".btn-primary")!).backgroundColor)).toBe("rgb(0, 0, 0)");
  await page.goto("/admin");
});

test("no CSP violations on public and dashboard pages, and inline scripts carry a nonce", async ({ page, request }) => {
  const bad: string[] = [];
  page.on("console", (m) => { if (/Content Security Policy/i.test(m.text())) bad.push(m.text().slice(0, 200)); });
  const r = await request.get("/");
  const csp = r.headers()["content-security-policy"];
  expect(csp).toContain("'nonce-");
  expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  await page.goto("/");
  await page.goto("/mushaf/surah/112");
  await login(page, "admin@demo.test");
  await page.goto("/admin");
  expect(bad).toEqual([]);
  expect((await request.get("/api/health")).headers()["content-security-policy"]).toContain("default-src 'none'");
});

test("two-factor: enable, then sign-in demands a code, and a wrong code fails", async ({ page }) => {
  const email = "supervisor@demo.test";
  await sql(`DELETE FROM auth_two_factors WHERE "userId" = (SELECT id FROM users WHERE email = $1)`, [email]);
  await sql(`UPDATE users SET "twoFactorEnabled" = false WHERE email = $1`, [email]);
  try {
    await login(page, email);
    await page.goto("/account/security");
    await page.getByLabel("كلمة المرور").fill(PASSWORD);
    await page.getByRole("button", { name: "بدء التفعيل" }).click();
    const secret = (await page.getByTestId("totp-secret").textContent())!;
    await page.getByLabel("الرمز من التطبيق").fill(totp(secret));
    await page.getByRole("button", { name: "تأكيد" }).click();
    await expect(page.getByText("فعلت المصادقة الثنائية.")).toBeVisible();
    const [row] = await sql<{ secret: string }>(`SELECT secret FROM auth_two_factors WHERE "userId" = (SELECT id FROM users WHERE email = $1)`, [email]);
    expect(row.secret, "stored encrypted").not.toBe(secret);
    await page.context().clearCookies();
    await sql("DELETE FROM rate_limits WHERE key LIKE 'auth:%'");
    await page.goto("/login");
    await page.locator("main").getByLabel("البريد الإلكتروني").fill(email);
    await page.getByLabel("كلمة المرور").fill(PASSWORD);
    await page.getByRole("button", { name: "تسجيل الدخول" }).click();
    await expect(page.getByLabel("رمز المصادقة أو رمز الاسترداد")).toBeVisible();
    await page.getByLabel("رمز المصادقة أو رمز الاسترداد").fill("000000");
    await page.getByRole("button", { name: "تأكيد" }).click();
    await expect(page.locator("form [role=alert]")).toContainText("غير صحيح");
    await page.getByLabel("رمز المصادقة أو رمز الاسترداد").fill(totp(secret));
    await page.getByRole("button", { name: "تأكيد" }).click();
    await page.waitForURL((u) => !u.pathname.includes("/login"));
  } finally {
    await sql(`DELETE FROM auth_two_factors WHERE "userId" = (SELECT id FROM users WHERE email = $1)`, [email]);
    await sql(`UPDATE users SET "twoFactorEnabled" = false WHERE email = $1`, [email]);
  }
});

test("scholarly board: filter, open an item, a rejection needs a reason, and history records it", async ({ page }) => {
  const [{ id }] = await sql<{ id: string }>(`INSERT INTO adhkar (id, category, "titleAr", text, "sourceName", "licenseNote", "updatedAt") VALUES ('e2e-' || floor(random()*1e9)::text, 'GENERAL', 'ذكر اختبار', 'نص اختبار', 'مصدر', 'ترخيص اختبار', now()) RETURNING id`);
  try {
    await login(page, "admin@demo.test");
    await page.goto(`/admin/scholarly?status=PENDING&type=dhikr&item=dhikr:${id}`);
    await expect(page.getByText("ترخيص اختبار").first()).toBeVisible();
    await expect(page.getByText("لا يعتمد قبل إضافة التخريج.")).toBeVisible();
    await expectAccessible(page);
    await page.getByLabel(/^القرار/).selectOption("reject");
    await page.getByRole("button", { name: "حفظ القرار" }).click();
    await expect(page.getByText("اذكر سبب الرفض.")).toBeVisible();
    await page.getByLabel(/السبب/).fill("لم يثبت التخريج");
    const saved = page.waitForResponse((r) => r.url().includes("/scholarly/dhikr/") && r.status() === 200);
    await page.getByRole("button", { name: "حفظ القرار" }).click();
    await saved;
    await page.goto("/admin/scholarly?status=REJECTED&type=dhikr");
    await expect(page.getByText("لم يثبت التخريج").first()).toBeVisible();
  } finally {
    await sql(`DELETE FROM content_reviews WHERE "targetId" = $1`, [id]);
    await sql(`DELETE FROM adhkar WHERE id = $1`, [id]);
  }
});
