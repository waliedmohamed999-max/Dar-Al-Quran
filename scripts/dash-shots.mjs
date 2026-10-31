// Captures dashboards for visual review: node scripts/dash-shots.mjs <baseUrl> <outDir> [--dark]
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";
import { config } from "dotenv";
import pg from "pg";

config({ quiet: true });
const [base, out] = process.argv.slice(2);
const swap = (u = "") => u.replace(/\/dar_quran(\?|$)/, "/dar_quran_test$1");
const password = process.env.DEMO_PASSWORD || "integration-test-password";
mkdirSync(out, { recursive: true });

const ROLES = [
  ["admin", "admin@demo.test", ["/admin", "/admin/users", "/admin/halaqas", "/admin/scholarly", "/admin/competitions", "/admin/reports"]],
  ["supervisor", "supervisor@demo.test", ["/admin"]],
  ["teacher", "teacher@demo.test", ["/teacher", "/teacher/reviews"]],
  ["student", "student@demo.test", ["/student", "/student/map"]],
  ["guardian", "guardian@demo.test", ["/guardian"]],
];
const SIZES = [["desktop", { width: 1440, height: 900 }], ["tablet", { width: 820, height: 1100 }], ["mobile", { width: 390, height: 844 }]];

const c = new pg.Client({ connectionString: swap(process.env.DATABASE_URL) });
await c.connect();
const b = await chromium.launch();
for (const [role, email, paths] of ROLES) {
  await c.query("DELETE FROM rate_limits WHERE key LIKE 'auth:%'");
  const ctx = await b.newContext({ locale: "ar", viewport: SIZES[0][1], colorScheme: process.argv.includes("--dark") ? "dark" : "light" });
  const p = await ctx.newPage();
  await p.goto(`${base}/login`);
  await p.locator("main").getByLabel("البريد الإلكتروني").fill(email);
  await p.getByLabel("كلمة المرور").fill(password);
  await p.getByRole("button", { name: "تسجيل الدخول" }).click();
  await p.waitForURL((u) => !u.pathname.includes("/login"));
  for (const path of paths) {
    const name = `${role}${path.replaceAll("/", "-")}`;
    for (const [size, viewport] of SIZES) {
      if (size !== "desktop" && path !== paths[0]) continue;
      await p.setViewportSize(viewport);
      await p.goto(base + path, { waitUntil: "networkidle" });
      await p.screenshot({ path: `${out}/${name}-${size}.png`, fullPage: size === "desktop" });
    }
  }
  await ctx.close();
}
await b.close();
await c.end();
