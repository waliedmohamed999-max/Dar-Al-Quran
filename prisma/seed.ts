// Reference data always. Demo accounts and sample records only when APP_ENV is not production.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { PERMISSIONS, ROLE_NAMES, ROLE_PERMISSIONS, ROLES, type RoleKey } from "../src/lib/rbac";
import { skeleton, type TajweedSpan } from "../src/modules/quran/text";
import { V3_DEMO_QUESTIONS, DEMO_QUESTIONS, EXTRA_FAQ, NOTIFICATION_TEMPLATES, PAGES, PROGRAMS, TAJWEED_RULES } from "./seed-data";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const isProd = process.env.APP_ENV === "production";

const RECITERS = [
  { slug: "alafasy", nameAr: "مشاري راشد العفاسي", nameEn: "Mishary Alafasy", style: "murattal", folder: "Alafasy_128kbps" },
  { slug: "husary", nameAr: "محمود خليل الحصري", nameEn: "Mahmoud Khalil Al-Husary", style: "murattal", folder: "Husary_128kbps" },
  { slug: "husary-muallim", nameAr: "الحصري (المصحف المعلم)", nameEn: "Al-Husary (Muallim)", style: "muallim", folder: "Husary_Muallim_128kbps" },
  { slug: "minshawi", nameAr: "محمد صديق المنشاوي", nameEn: "Mohamed Siddiq Al-Minshawi", style: "murattal", folder: "Minshawy_Murattal_128kbps" },
  { slug: "abdulbasit", nameAr: "عبد الباسط عبد الصمد", nameEn: "Abdul Basit Abdul Samad", style: "murattal", folder: "Abdul_Basit_Murattal_192kbps" },
];

const TAFSIR = [
  { slug: "muyassar", nameAr: "التفسير الميسر", nameEn: "Al-Muyassar", author: "مجمع الملك فهد", beginner: true, adapterRef: "qf:16" },
  { slug: "saddi", nameAr: "تفسير السعدي", nameEn: "As-Sa'di", author: "عبد الرحمن السعدي", beginner: false, adapterRef: "qf:91" },
  { slug: "ibn-kathir", nameAr: "تفسير ابن كثير", nameEn: "Ibn Kathir", author: "ابن كثير", beginner: false, adapterRef: "qf:14" },
  { slug: "baghawi", nameAr: "تفسير البغوي", nameEn: "Al-Baghawi", author: "البغوي", beginner: false, adapterRef: "qf:94" },
];

async function reference() {
  for (const key of PERMISSIONS) await db.permission.upsert({ where: { key }, update: {}, create: { key } });
  for (const key of ROLES) {
    const role = await db.role.upsert({ where: { key }, update: {}, create: { key, nameAr: ROLE_NAMES[key].ar, nameEn: ROLE_NAMES[key].en } });
    const perms = await db.permission.findMany({ where: { key: { in: [...ROLE_PERMISSIONS[key]] } } });
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    await db.rolePermission.createMany({ data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })) });
  }
  for (const r of RECITERS) {
    const reciter = await db.reciter.upsert({ where: { slug: r.slug }, update: {}, create: { slug: r.slug, nameAr: r.nameAr, nameEn: r.nameEn } });
    await db.recitation.upsert({
      where: { slug: r.slug },
      update: {},
      create: {
        slug: r.slug, reciterId: reciter.id, riwayaId: 1, style: r.style, provider: "everyayah.com",
        urlTemplate: `https://everyayah.com/data/${r.folder}/{sss}{aaa}.mp3`,
        licenseNote: "Streamed from the provider. Rights remain with the reciter or publisher; confirm before production. See docs/DATA_LICENSES.md",
      },
    });
  }
  for (const t of TAFSIR) {
    await db.tafsirSource.upsert({
      where: { slug: t.slug }, update: {},
      create: { ...t, licenseNote: "Fetched from Quran Foundation API, cached up to 7 days per its developer terms. Confirm rights before production." },
    });
  }
  for (const t of NOTIFICATION_TEMPLATES) await db.notificationTemplate.upsert({ where: { key: t.key }, update: {}, create: t });
  for (const b of [{ key: "first_approved", nameAr: "أول مقطع معتمد", nameEn: "First approved segment" }, { key: "ten_approved", nameAr: "عشرة مقاطع معتمدة", nameEn: "Ten approved segments" }]) {
    await db.badge.upsert({ where: { key: b.key }, update: {}, create: b });
  }
  for (const r of TAJWEED_RULES) await db.tajweedRule.upsert({ where: { slug: r.slug }, update: { bodyAr: r.bodyAr, bodyEn: r.bodyEn, titleAr: r.titleAr, titleEn: r.titleEn }, create: { ...r, riwayaId: 1 } });
  await seedTajweedExamples();
  for (const [i, p] of PROGRAMS.entries()) await db.program.upsert({ where: { slug: p.slug }, update: {}, create: { ...p, sortOrder: i } });
  for (const p of [...PAGES, ...EXTRA_FAQ]) {
    await db.contentPage.upsert({
      where: { type_slug_locale: { type: p.type, slug: p.slug, locale: p.locale } },
      update: {},
      create: { ...p, status: "PUBLISHED", publishedAt: new Date() },
    });
  }
  await db.permission.deleteMany({ where: { key: { notIn: [...PERMISSIONS] } } });
  await db.setting.upsert({ where: { key: "brand" }, update: {}, create: { key: "brand", value: { nameAr: "دار القرآن الكريم", nameEn: "Dar Al-Quran" } } });
}

/** Example candidates come from the annotation data rather than memory, and remain PENDING review. */
async function seedTajweedExamples() {
  const rules = await db.tajweedRule.findMany({ where: { markupCode: { not: null } } });
  const anns = await db.tajweedAnnotation.findMany({ include: { ayah: true }, orderBy: { ayahId: "asc" } });
  for (const rule of rules) {
    let added = 0;
    for (const a of anns) {
      if (added >= 3) break;
      if (a.ayah.text.length > 120) continue;
      const span = (JSON.parse(a.markup) as TajweedSpan[]).find((s) => s[2] === rule.markupCode);
      if (!span) continue;
      const text = a.ayah.text;
      const start = text.lastIndexOf(" ", span[0]) + 1;
      let end = text.indexOf(" ", span[1]);
      if (end === -1) end = text.length;
      await db.tajweedExample.upsert({
        where: { ruleId_ayahId: { ruleId: rule.id, ayahId: a.ayahId } },
        update: {},
        create: { ruleId: rule.id, ayahId: a.ayahId, excerpt: text.slice(start, end) },
      });
      added += 1;
    }
  }
}

async function makeUser(email: string, name: string, role: RoleKey, password: string) {
  let user = await db.user.findUnique({ where: { email } });
  if (!user) {
    user = await db.user.create({ data: { email, name, emailVerified: true, isDemo: true } });
    await db.authAccount.create({ data: { userId: user.id, accountId: user.id, providerId: "credential", password: await hashPassword(password) } });
  }
  const r = await db.role.findUniqueOrThrow({ where: { key: role } });
  await db.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: r.id } }, update: {}, create: { userId: user.id, roleId: r.id } });
  return user;
}

const today = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); };
const offset = (n: number) => new Date(today().getTime() + n * 86400000);

async function demo() {
  const password = process.env.DEMO_PASSWORD;
  if (!password) { console.log("DEMO_PASSWORD not set: demo data skipped"); return; }

  await makeUser("super@demo.test", "[تجريبي] المدير العام", "super_admin", password);
  await makeUser("admin@demo.test", "[تجريبي] مدير الدار", "admin", password);
  await makeUser("supervisor@demo.test", "[تجريبي] مشرف التعليم", "supervisor", password);
  const tUser = await makeUser("teacher@demo.test", "[تجريبي] معلم أول", "teacher", password);
  const t2User = await makeUser("teacher2@demo.test", "[تجريبي] معلم ثان", "teacher", password);
  const sUser = await makeUser("student@demo.test", "[تجريبي] طالب أول", "student", password);
  const s2User = await makeUser("student2@demo.test", "[تجريبي] طالب ثان", "student", password);
  const s3User = await makeUser("student3@demo.test", "[تجريبي] طالب قاصر", "student", password);
  const gUser = await makeUser("guardian@demo.test", "[تجريبي] ولي أمر", "guardian", password);

  const teacher = await db.teacher.upsert({ where: { userId: tUser.id }, update: {}, create: { userId: tUser.id, bio: "حساب تجريبي", isPublic: false } });
  const teacher2 = await db.teacher.upsert({ where: { userId: t2User.id }, update: {}, create: { userId: t2User.id, bio: "حساب تجريبي" } });
  const student = await db.student.upsert({ where: { userId: sUser.id }, update: {}, create: { userId: sUser.id, level: 2 } });
  const student2 = await db.student.upsert({ where: { userId: s2User.id }, update: {}, create: { userId: s2User.id } });
  const minor = await db.student.upsert({ where: { userId: s3User.id }, update: {}, create: { userId: s3User.id, isMinor: true } });
  const guardian = await db.guardian.upsert({ where: { userId: gUser.id }, update: {}, create: { userId: gUser.id } });
  await db.guardianStudentLink.upsert({
    where: { guardianId_studentId: { guardianId: guardian.id, studentId: minor.id } }, update: {},
    create: { guardianId: guardian.id, studentId: minor.id, relation: "ولي", status: "APPROVED", approvedAt: new Date() },
  });

  const mkHalaqa = async (name: string, teacherId: string) =>
    (await db.halaqa.findFirst({ where: { name } })) ??
    db.halaqa.create({
      data: {
        name, teacherId, level: 1, capacity: 12, mode: "HYBRID", ageGroup: "تجريبي",
        schedule: { create: [{ weekday: 0, startMin: 17 * 60, endMin: 18 * 60 + 30 }, { weekday: 2, startMin: 17 * 60, endMin: 18 * 60 + 30 }] },
      },
    });
  const halaqa = await mkHalaqa("[تجريبي] حلقة الفرقان", teacher.id);
  const halaqa2 = await mkHalaqa("[تجريبي] حلقة النور", teacher2.id);
  for (const [h, s] of [[halaqa.id, student.id], [halaqa.id, minor.id], [halaqa2.id, student2.id]]) {
    await db.enrollment.upsert({ where: { halaqaId_studentId: { halaqaId: h, studentId: s } }, update: {}, create: { halaqaId: h, studentId: s, status: "ACTIVE" } });
  }

  // Sessions: two past with attendance, four upcoming.
  for (const n of [-7, -3, 2, 4, 9, 11]) {
    const startsAt = new Date(offset(n).getTime() + 14 * 3600000);
    const session = await db.halaqaSession.upsert({
      where: { halaqaId_startsAt: { halaqaId: halaqa.id, startsAt } }, update: {},
      create: { halaqaId: halaqa.id, startsAt, endsAt: new Date(startsAt.getTime() + 90 * 60000), status: n < 0 ? "HELD" : "SCHEDULED" },
    });
    if (n < 0) {
      await db.attendance.upsert({ where: { sessionId_studentId: { sessionId: session.id, studentId: student.id } }, update: {}, create: { sessionId: session.id, studentId: student.id, status: "PRESENT", recordedById: tUser.id } });
      await db.attendance.upsert({ where: { sessionId_studentId: { sessionId: session.id, studentId: minor.id } }, update: {}, create: { sessionId: session.id, studentId: minor.id, status: n === -3 ? "ABSENT" : "PRESENT", recordedById: tUser.id } });
    }
  }

  const curriculum = (await db.curriculum.findFirst({ where: { name: "[تجريبي] جزء عم" } })) ?? (await db.curriculum.create({ data: { name: "[تجريبي] جزء عم", description: "منهج تجريبي من الناس إلى النبأ", level: 1 } }));
  const plan = (await db.learningPlan.findFirst({ where: { studentId: student.id, status: "ACTIVE" } })) ?? (await db.learningPlan.create({
    data: { studentId: student.id, teacherId: teacher.id, curriculumId: curriculum.id, dailyMinutes: 45, newAyahsPerDay: 3, studyDays: [0, 1, 2, 3, 4, 5, 6], cursorSurah: 112, cursorAyah: 1, direction: "REVERSE", startDate: offset(-7), goal: "تجريبي: إتمام جزء عم" },
  }));

  // Demonstration day from the brief. Every range is checked against real ayah counts by the DB data.
  if (!(await db.dailyTask.count({ where: { studentId: student.id, date: today() } }))) {
    const day = [
      { type: "NEW_MEMORIZATION", surahId: 112, fromAyah: 1, toAyah: 4, suggestedMinutes: 15, teacherNote: "تجريبي: ابدأ بالقراءة ثم الترديد" },
      { type: "LISTENING", surahId: 112, fromAyah: 1, toAyah: 4, suggestedMinutes: 5 },
      { type: "RECITATION", surahId: 112, fromAyah: 1, toAyah: 4, suggestedMinutes: 5 },
      { type: "NEAR_REVISION", surahId: 113, fromAyah: 1, toAyah: 5, suggestedMinutes: 5 },
      { type: "FAR_REVISION", surahId: 114, fromAyah: 1, toAyah: 6, suggestedMinutes: 5 },
      { type: "TAJWEED", ruleSlug: "qalqalah", suggestedMinutes: 5 },
      { type: "TAFSIR", surahId: 112, fromAyah: 1, toAyah: 1, suggestedMinutes: 5 },
    ] as const;
    for (const [i, t] of day.entries()) await db.dailyTask.create({ data: { ...t, studentId: student.id, planId: plan.id, date: today(), sortOrder: i, createdById: tUser.id } });
    await db.dailyTask.create({ data: { type: "NEAR_REVISION", surahId: 114, fromAyah: 1, toAyah: 6, studentId: student.id, planId: plan.id, date: offset(-1), status: "DONE", completedAt: offset(-1), suggestedMinutes: 5 } });
  }

  for (const [surahId, toAyah] of [[114, 6], [113, 5]]) {
    const mem = await db.memorizationRecord.upsert({
      where: { studentId_surahId_fromAyah_toAyah: { studentId: student.id, surahId, fromAyah: 1, toAyah } }, update: {},
      create: { studentId: student.id, surahId, fromAyah: 1, toAyah, status: "APPROVED", approvedById: tUser.id, approvedAt: offset(-5), nextReviewAt: offset(surahId === 114 ? 0 : 2), intervalDays: 3, repetitions: 2 },
    });
    if (!(await db.revisionRecord.count({ where: { memorizationId: mem.id } }))) {
      await db.revisionRecord.create({ data: { studentId: student.id, memorizationId: mem.id, quality: 4, intervalBefore: 1, intervalAfter: 3, dueAfter: offset(2), gradedById: tUser.id } });
    }
  }

  // Practice questions, clearly marked as demo. Correct answers follow the seeded lesson text.
  if (!(await db.question.count({ where: { isDemo: true } }))) {
    const ids = [];
    for (const q of DEMO_QUESTIONS) ids.push((await db.question.create({ data: { ...q, isDemo: true } })).id);
    await db.assessment.create({
      data: { title: "[تجريبي] اختبار تجويد قصير", kind: "TAJWEED", halaqaId: halaqa.id, createdById: tUser.id, published: true, items: { create: ids.map((questionId, sortOrder) => ({ questionId, sortOrder })) } },
    });
  }

  await demoV3(tUser.id);

  // Demo-only approvals so screens have content. Production starts PENDING for real scholars.
  await db.tafsirSource.updateMany({ where: { status: "PENDING" }, data: { status: "APPROVED", reviewedBy: "demo-seed", reviewedAt: new Date() } });
  await db.tajweedRule.updateMany({ where: { reviewStatus: "PENDING" }, data: { reviewStatus: "APPROVED", reviewedBy: "demo-seed", reviewedAt: new Date() } });

  console.log("Demo accounts ready, password is DEMO_PASSWORD from .env");
}

/** Demo-only, marked content. Production keeps everything pending until real reviewers act. */
async function demoV3(authorId: string) {
  await db.dhikr.updateMany({ where: { reviewStatus: "PENDING" }, data: { reviewStatus: "APPROVED", reviewedBy: "demo-seed", reviewedAt: new Date() } });
  await db.hadithEntry.updateMany({ where: { reviewStatus: "PENDING" }, data: { reviewStatus: "APPROVED", reviewedBy: "demo-seed", reviewedAt: new Date() } });
  await db.hadithCollection.updateMany({ data: { published: true } });
  if (!(await db.question.count({ where: { tag: { startsWith: "placement" } } }))) {
    for (const q of V3_DEMO_QUESTIONS) await db.question.create({ data: { ...q, isDemo: true } });
  }
  if (!(await db.competition.count({ where: { isDemo: true } }))) {
    const qs = await db.question.findMany({ where: { isDemo: true, active: true, tag: "exam-demo" }, select: { id: true } });
    const a = await db.assessment.create({ data: { title: "[تجريبي] مسابقة التجويد", kind: "TAJWEED", createdById: authorId, items: { create: qs.map((q, i) => ({ questionId: q.id, sortOrder: i })) } } });
    const now = Date.now();
    await db.competition.create({ data: {
      slug: "demo-tajweed", title: "[تجريبي] مسابقة التجويد", description: "مسابقة تجريبية لعرض النظام، وليست مسابقة فعلية.", kind: "tajweed", level: "beginner", criteria: "تصحيح آلي للموضوعي، وتصحيح بشري للعملي.", resultsMethod: "في صفحة المسابقة بعد التحكيم.",
      registrationOpensAt: new Date(now - 86400000), registrationClosesAt: new Date(now + 30 * 86400000), examStartsAt: new Date(now - 86400000), examEndsAt: new Date(now + 60 * 86400000), durationMin: 30, maxAttempts: 2, leaderboardEnabled: true, published: true, isDemo: true, assessmentId: a.id, createdById: authorId,
    } });
  }
}

async function main() {
  const manifest = JSON.parse(readFileSync("data/quran/manifest.json", "utf8"));
  if ((await db.quranAyah.count()) !== manifest.counts.ayahs) throw new Error("Import Quran data first: npm run quran:fetch && npm run quran:import");
  void skeleton;
  await reference();
  if (!isProd) await demo();
  await db.$disconnect();
  console.log("seed complete");
}
main().catch((e) => { console.error(e); process.exit(1); });
