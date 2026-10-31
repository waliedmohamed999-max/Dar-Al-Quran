// Builds an isolated dar_quran_test database. The development database is never touched.
import { execSync } from "node:child_process";
import { config } from "dotenv";
import { Client } from "pg";

export default async function setup() {
  config({ quiet: true });
  const swap = (u: string) => u.replace(/\/dar_quran(\?|$)/, "/dar_quran_test$1");
  const owner = process.env.DATABASE_URL!;
  const admin = new Client({ connectionString: owner });
  await admin.connect();
  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = 'dar_quran_test'");
  if (exists.rowCount === 0) await admin.query("CREATE DATABASE dar_quran_test");
  await admin.end();

  const env = { ...process.env, DATABASE_URL: swap(owner), APP_DATABASE_URL: swap(process.env.APP_DATABASE_URL!), APP_ENV: "test", DEMO_PASSWORD: process.env.DEMO_PASSWORD || "integration-test-password" };
  const run = (cmd: string) => execSync(cmd, { env, stdio: "pipe" });
  run("npx prisma migrate deploy");
  run("npx tsx scripts/db-setup.ts");
  const test = new Client({ connectionString: swap(owner) });
  await test.connect();
  const { rows } = await test.query("SELECT count(*)::int AS n FROM quran_ayahs");
  if (rows[0].n === 0) run("npx tsx scripts/quran-import.ts");
  run("npx tsx scripts/content-import.ts");
  run("npx tsx prisma/seed.ts");
  // Throwaway students from earlier runs would otherwise keep growing the demo halaqa. Test database only.
  await test.query(`DELETE FROM competition_registrations WHERE "studentId" IN (SELECT s.id FROM students s JOIN users u ON u.id = s."userId" WHERE u.email LIKE 't-%@test.invalid')`);
  await test.query(`DELETE FROM enrollments WHERE "studentId" IN (SELECT s.id FROM students s JOIN users u ON u.id = s."userId" WHERE u.email LIKE 't-%@test.invalid')`);
  const timing = await test.query("SELECT count(*)::int AS n FROM ayah_word_timings");
  await test.end();
  if (timing.rows[0].n === 0) run("npx tsx scripts/timing-import.ts");
}
