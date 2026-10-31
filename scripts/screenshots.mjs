// Captures key pages for visual review: node scripts/screenshots.mjs <baseUrl> <outDir>
import { chromium } from "@playwright/test";
const [base, out] = process.argv.slice(2);
const b = await chromium.launch();
for (const [name, viewport, scheme] of [["desktop", { width: 1440, height: 900 }, "light"], ["mobile", { width: 390, height: 844 }, "light"], ["dark", { width: 1440, height: 900 }, "dark"]]) {
  const c = await b.newContext({ viewport, colorScheme: scheme, locale: "ar" });
  const p = await c.newPage();
  for (const [slug, path] of [["home", "/"], ["mushaf", "/mushaf/surah/1"], ["program", "/programs/memorization"]]) {
    await p.goto(base + path, { waitUntil: "networkidle" });
    await p.screenshot({ path: `${out}/${name}-${slug}.png`, fullPage: slug === "home" && name !== "dark" });
  }
  await c.close();
}
await b.close();
