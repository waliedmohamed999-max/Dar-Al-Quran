// Compares calculated prayer times with published figures. The figures below were read from Egyptian press
// in search results, and are secondary sources: no official table could be retrieved. See docs/release/TEST_RESULTS.md.
import { prayerMinutes } from "../src/modules/adhkar/engine";

const CAIRO = { latitude: 30.04, longitude: 31.24, calcMethod: "Egyptian", timezone: "Africa/Cairo" };
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const toMin = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };

const published: { date: [number, number, number]; times: Record<string, string> }[] = [
  { date: [2026, 8, 3], times: { fajr: "04:37", dhuhr: "13:01", asr: "16:38", maghrib: "19:47", isha: "21:13" } },
  { date: [2026, 10, 18], times: { fajr: "05:32" } },
  { date: [2026, 10, 25], times: { fajr: "05:36" } },
];

let worst = 0;
for (const row of published) {
  const [year, month, day] = row.date;
  const c = prayerMinutes(CAIRO, { year, month, day }) as unknown as Record<string, number>;
  for (const [k, v] of Object.entries(row.times)) {
    const diff = Math.abs(c[k] - toMin(v));
    worst = Math.max(worst, diff);
    console.log(`${row.date.join("-")} ${k}: calculated ${hm(c[k])}, published ${v}, difference ${diff} min`);
  }
}
console.log(`largest difference: ${worst} min`);
