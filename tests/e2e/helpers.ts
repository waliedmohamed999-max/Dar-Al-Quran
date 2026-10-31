import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Client } from "pg";

export const PASSWORD = process.env.DEMO_PASSWORD || "integration-test-password";

/** Waits and retries if the sign-in limiter (3 attempts per 10 seconds per IP) responds. */
export async function submitLogin(page: Page, email: string, password = PASSWORD) {
  for (let i = 0; i < 4; i++) {
    // The durable limiter allows 20 attempts per 5 minutes per IP; a test run legitimately exceeds it.
    await sql("DELETE FROM rate_limits WHERE key LIKE 'auth:%'");
    await page.goto("/login");
    await page.locator("main").getByLabel("البريد الإلكتروني").fill(email);
    await page.getByLabel("كلمة المرور").fill(password);
    await page.getByRole("button", { name: "تسجيل الدخول" }).click();
    // Scoped to the form: Next adds its own role=alert route announcer to the page.
    const alert = page.locator("form [role=alert]");
    await Promise.race([page.waitForURL((u) => !u.pathname.includes("/login")), alert.waitFor()]);
    if (!page.url().includes("/login")) return;
    if (!(await alert.textContent())?.includes("محاولات كثيرة")) return;
    await page.waitForTimeout(11000);
  }
}

export async function login(page: Page, email: string) {
  await page.context().clearCookies();
  await submitLogin(page, email);
  await page.waitForURL((u) => !u.pathname.includes("/login"));
}

export async function sql<T = Record<string, unknown>>(text: string, values: unknown[] = []) {
  const c = new Client({ connectionString: process.env.E2E_DATABASE_URL });
  await c.connect();
  const r = await c.query(text, values as never[]);
  await c.end();
  return r.rows as T[];
}

/** Fails on serious and critical WCAG 2 A/AA violations. */
export async function expectAccessible(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const bad = r.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""));
  expect(bad.map((v) => `${v.id}: ${v.nodes[0]?.target} (${v.nodes.length})`)).toEqual([]);
}

export async function expectNoHorizontalScroll(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(1);
}
