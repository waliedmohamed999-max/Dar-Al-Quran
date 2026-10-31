// Go/No-Go checks that a machine can answer. Reads only. Exit code 1 means No-Go.
// Point DATABASE_URL at the environment being released and set APP_ENV=production.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

type Check = { name: string; ok: boolean; detail: string; blocking?: boolean };

async function main() {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const demo = "demo-seed";
  const c: Check[] = [];
  const add = (name: string, ok: boolean, detail: string, blocking = true) => c.push({ name, ok, detail, blocking });
  const count = async (n: Promise<number>) => n;

  add("APP_ENV=production", process.env.APP_ENV === "production", String(process.env.APP_ENV));
  add("عناوين HTTPS", /^https:/.test(process.env.NEXT_PUBLIC_APP_URL ?? ""), String(process.env.NEXT_PUBLIC_APP_URL));
  for (const k of ["BETTER_AUTH_SECRET", "FIELD_ENCRYPTION_KEY", "SMTP_HOST", "S3_ENDPOINT"]) add(`المتغير ${k}`, Boolean(process.env[k]), process.env[k] ? "مضبوط" : "غير مضبوط");
  add("لا توجد DEMO_PASSWORD", !process.env.DEMO_PASSWORD, process.env.DEMO_PASSWORD ? "مضبوطة" : "غير مضبوطة");

  add("TRUST_PROXY خلف وكيل عكسي", process.env.TRUST_PROXY === "true", String(process.env.TRUST_PROXY));
  add("المصادقة الثنائية غير معطلة", process.env.MFA_REQUIRED !== "false", String(process.env.MFA_REQUIRED ?? "افتراضي: إلزامية"));
  const adminsNoMfa = await db.user.count({ where: { status: "ACTIVE", twoFactorEnabled: false, roles: { some: { role: { key: { in: ["super_admin", "admin"] } } } } } });
  add("كل المديرين فعلوا المصادقة الثنائية", adminsNoMfa === 0, String(adminsNoMfa));
  const demoUsers = await count(db.user.count({ where: { isDemo: true } }));
  add("لا حسابات تجريبية", demoUsers === 0, String(demoUsers));
  const [dq, dc] = await Promise.all([db.question.count({ where: { isDemo: true, active: true } }), db.competition.count({ where: { isDemo: true, published: true } })]);
  add("لا أسئلة ومسابقات تجريبية", dq + dc === 0, `أسئلة ${dq}، مسابقات ${dc}`);

  const [da, dh, dr, ds] = await Promise.all([
    db.dhikr.count({ where: { reviewedBy: demo } }), db.hadithEntry.count({ where: { reviewedBy: demo } }), db.tajweedRule.count({ where: { reviewedBy: demo } }), db.tafsirSource.count({ where: { reviewedBy: demo } }),
  ]);
  add("لا اعتمادات تجريبية", da + dh + dr + ds === 0, `أذكار ${da}، أحاديث ${dh}، دروس ${dr}، مصادر تفسير ${ds}`);

  const ayahs = await db.quranAyah.count();
  add("عدد الآيات 6236", ayahs === 6236, String(ayahs));
  const manifest = JSON.parse(readFileSync("data/quran/manifest.json", "utf8"));
  add("بيان بصمات القرآن موجود", Boolean(manifest), "شغل npm run quran:verify للفحص الكامل");

  const undocHadith = await db.hadithEntry.count({ where: { reviewStatus: "APPROVED", OR: [{ grade: null }, { gradeSource: null }] } });
  add("كل حديث معتمد موثق الدرجة", undocHadith === 0, String(undocHadith));
  const undocDhikr = await db.dhikr.count({ where: { reviewStatus: "APPROVED", takhrij: null } });
  add("كل ذكر معتمد له تخريج", undocDhikr === 0, String(undocDhikr));
  const pubs = await db.hadithCollection.findMany({ where: { published: true }, include: { entries: { select: { reviewStatus: true } } } });
  const badPub = pubs.filter((p) => p.entries.some((e) => e.reviewStatus !== "APPROVED")).length;
  add("لا مسار حديث منشور بمحتوى غير معتمد", badPub === 0, String(badPub));

  add("قرار ألوان التجويد", process.env.TAJWEED_COLOURS_APPROVED === "true", "غير مفعلة: تعرض بلا ألوان حتى يقرر المشرف", false);
  add("المعلم الذكي", Boolean(process.env.AI_ANTHROPIC_API_KEY), "دون مفتاح يعرض المصادر فقط", false);
  add("الإشعارات", Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT), "دونها تذكيرات داخل الموقع فقط", false);
  add("Jitsi خاص", Boolean(process.env.LIVE_JITSI_DOMAIN), "دونه رابط اجتماع الحلقة", false);

  for (const x of c) console.log(`${x.ok ? "PASS" : x.blocking ? "FAIL" : "WARN"}  ${x.name}: ${x.detail}`);
  const failed = c.filter((x) => !x.ok && x.blocking).length;
  console.log(failed ? `\nNO-GO: ${failed} فحص مانع. وهذه الفحوص لا تغني عن قائمة Go/No-Go البشرية.` : "\nلا مانع آلياً. يلزم إكمال قائمة Go/No-Go البشرية.");
  await db.$disconnect();
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
