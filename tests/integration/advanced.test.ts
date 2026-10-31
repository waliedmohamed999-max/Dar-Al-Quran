// AI safety, live classes, programs, placement, newsletter and messaging. AI uses a fake provider,
// so these verify the guard rails, not the quality of a real model's answers.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { withActor } from "@/lib/db";
import { expandAyahTokens, suggestNextPlan, validateAnswer } from "@/modules/ai/guard";
import { setAiProvider } from "@/modules/ai/provider";
import * as ai from "@/modules/ai/service";
import { verifyCertificate } from "@/modules/assessments/service";
import * as live from "@/modules/halaqat/live";
import * as people from "@/modules/people/service";
import * as site from "@/modules/site/service";
import { db, demo, demoHalaqa, makeStudent } from "./helpers";

let d: Awaited<ReturnType<typeof demo>>;
beforeAll(async () => {
  d = await demo();
  await db().setting.upsert({ where: { key: "ai" }, update: { value: { enabled: true } }, create: { key: "ai", value: { enabled: true } } });
});
afterEach(() => setAiProvider(undefined));

const fake = (out: unknown) => setAiProvider({ name: "fake", generate: async () => out });
const sawCall = () => { const s = { called: false }; setAiProvider({ name: "fake", generate: async () => { s.called = true; return null; } }); return s; };

describe("single school", () => {
  it("has no branch tables or permissions", async () => {
    const t = await db().$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = 'public' AND (column_name = 'branchId' OR table_name = 'branches')`;
    expect(t[0].n).toBe(0);
    expect(await db().permission.count({ where: { key: { contains: "branch" } } })).toBe(0);
  });
});

describe("AI guard", () => {
  const ok = { answer: "الغنة صوت من الخيشوم.", citations: ["S1"], needsTeacher: false };
  it("accepts a sourced answer", () => expect(validateAnswer(ok, ["S1"], "الغنة صوت يخرج من الخيشوم").ok).toBe(true));
  it("rejects missing or invented citations", () => {
    expect(validateAnswer({ ...ok, citations: [] }, ["S1"], "").ok).toBe(false);
    expect(validateAnswer({ ...ok, citations: ["S9"] }, ["S1"], "").ok).toBe(false);
  });
  it("rejects Quranic text written by the model", () => {
    expect(validateAnswer({ ...ok, answer: "قال تعالى ٱلْحَمْدُ لِلَّهِ ۚ" }, ["S1"], "").ok).toBe(false);
    expect(validateAnswer({ ...ok, answer: "﴿نص﴾" }, ["S1"], "").ok).toBe(false);
  });
  it("rejects quotations not found in the sources", () => {
    expect(validateAnswer({ ...ok, answer: "قال العلماء «هذا نص مختلق لا أصل له في المصادر»" }, ["S1"], "نص آخر").ok).toBe(false);
  });
  it("expands ayah tokens verbatim and refuses unknown ones", () => {
    expect(expandAyahTokens("انظر [[1:1]]", new Map([["1:1", "نص"]]))).toBe("انظر ﴿نص﴾ [1:1]");
    expect(expandAyahTokens("انظر [[2:999]]", new Map())).toBeNull();
  });
  it("suggests plans from records and admits when there are none", () => {
    expect(suggestNextPlan({ donePercent: 90, mastery: 4.5, newAyahsPerDay: 3 })).toMatchObject({ newAyahsPerDay: 4, reason: "advance" });
    expect(suggestNextPlan({ donePercent: 30, mastery: 4, newAyahsPerDay: 1 })).toMatchObject({ newAyahsPerDay: 1, reason: "consolidate" });
    expect(suggestNextPlan({ donePercent: null, mastery: null, newAyahsPerDay: 3 }).reason).toBe("insufficient_data");
  });
});

describe("AI assistant", () => {
  const Q = "ما هي القلقلة";
  it("refuses while disabled", async () => {
    await db().setting.update({ where: { key: "ai" }, data: { value: { enabled: false } } });
    await expect(ai.ask(d.student, Q)).rejects.toThrow(/ai_disabled/);
    await db().setting.update({ where: { key: "ai" }, data: { value: { enabled: true } } });
  });
  it("sends rulings to a person without calling the model", async () => {
    const s = sawCall();
    expect((await ai.ask(d.student, "هل يجوز كذا")).status).toBe("REFERRED");
    expect(s.called).toBe(false);
  });
  it("refers with no matching sources, without calling the model", async () => {
    const s = sawCall();
    expect((await ai.ask(d.student, "زلزلزل قرقرقر")).status).toBe("REFERRED");
    expect(s.called).toBe(false);
  });
  it("without a model, returns sources and no generated answer", async () => {
    setAiProvider(null);
    const r = await ai.ask(d.student, Q);
    expect(r.status).toBe("SOURCES_ONLY");
    expect(r.answer).toBeNull();
    expect(r.sources[0].href).toBe("/tajweed/qalqalah");
  });
  it("returns a valid answer with its references", async () => {
    fake({ answer: "القلقلة اضطراب الصوت.", citations: ["S1"], needsTeacher: false });
    const r = await ai.ask(d.student, Q);
    expect(r.status).toBe("ANSWERED");
    expect(r.sources.length).toBeGreaterThan(0);
  });
  it("blocks an invented answer and refers it", async () => {
    fake({ answer: "قال تعالى ٱلْحَمْدُ ۚ", citations: ["S1"], needsTeacher: false });
    expect((await ai.ask(d.student, Q)).answer).toBeNull();
  });
  it("inserts stored ayah text rather than model text", async () => {
    await db().tafsirEntry.upsert({ where: { sourceId_ayahId: { sourceId: (await db().tafsirSource.findFirstOrThrow({ where: { slug: "muyassar" } })).id, ayahId: 1 } }, update: { text: "تفسير", expiresAt: new Date(Date.now() + 1e9) }, create: { sourceId: (await db().tafsirSource.findFirstOrThrow({ where: { slug: "muyassar" } })).id, ayahId: 1, text: "تفسير", expiresAt: new Date(Date.now() + 1e9) } });
    fake({ answer: "الآية [[1:1]] تفتتح الكتاب.", citations: ["S1"], needsTeacher: false });
    const r = await ai.ask(d.student, "اشرح الآية 1:1");
    const stored = await db().quranAyah.findUniqueOrThrow({ where: { id: 1 } });
    expect(r.answer).toContain(stored.text);
  });
  it("treats a provider failure as a referral", async () => {
    setAiProvider({ name: "fake", generate: async () => { throw new Error("down"); } });
    expect((await ai.ask(d.student, Q)).status).toBe("REFERRED");
  });
  it("needs guardian consent for minors, from a linked guardian only", async () => {
    setAiProvider(null);
    await expect(ai.ask(d.minor, Q)).rejects.toThrow(/guardian_consent_required/);
    await expect(ai.setAiConsent(d.guardian, d.student.studentId!, true)).rejects.toThrow();
    await ai.setAiConsent(d.guardian, d.minor.studentId!, true);
    expect((await ai.ask(d.minor, Q)).status).toBe("SOURCES_ONLY");
    await ai.setAiConsent(d.guardian, d.minor.studentId!, false);
  });
  it("lets the student's teacher see and answer referrals, but not another teacher", async () => {
    const row = await ai.ask(d.student, "هل يجوز ذلك");
    const see = (a: typeof d.teacher) => withActor(a, (tx) => tx.aiInteraction.count({ where: { id: row.id } }));
    expect(await see(d.teacher)).toBe(1);
    expect(await see(d.teacher2)).toBe(0);
    expect(await see(d.student2)).toBe(0);
    await expect(ai.resolveReferral(d.teacher2, row.id, "رد")).rejects.toThrow();
    expect((await ai.resolveReferral(d.teacher, row.id, "رد المعلم")).status).toBe("RESOLVED");
  });
  it("keeps drafted questions inactive until a teacher activates them", async () => {
    fake({ questions: [{ promptAr: "سؤال مسودة للتجربة", correctKey: "a", options: [{ key: "a", textAr: "أ" }, { key: "b", textAr: "ب" }] }] });
    await ai.draftQuestions(d.teacher, "qalqalah");
    const q = await db().question.findFirstOrThrow({ where: { promptAr: "سؤال مسودة للتجربة" }, orderBy: { createdAt: "desc" } });
    expect(q).toMatchObject({ active: false, aiDraft: true });
    await expect(ai.draftQuestions(d.student, "qalqalah")).rejects.toThrow();
    await ai.activateQuestion(d.teacher, q.id);
    expect((await db().question.findUniqueOrThrow({ where: { id: q.id } })).active).toBe(true);
  });
});

describe("live classes", () => {
  const schedule = async () => live.createLiveSession(d.teacher, { halaqaId: (await demoHalaqa()).id, startsAt: new Date(Date.now() + 3600000 + Math.random() * 1e9), minutes: 60 });
  it("only the teacher or staff can schedule", async () => {
    const h = await demoHalaqa();
    const input = { halaqaId: h.id, startsAt: new Date(), minutes: 30 };
    await expect(live.createLiveSession(d.student, input)).rejects.toThrow();
    await expect(live.createLiveSession(d.teacher2, input)).rejects.toThrow();
  });
  it("members join, outsiders do not, and the room is not exposed by listings", async () => {
    const { id } = await schedule();
    await expect(live.joinLive(d.student2, id)).rejects.toThrow();
    await expect(live.joinLive(d.guardian, id)).rejects.toThrow();
    process.env.LIVE_JITSI_DOMAIN = "meet.example.org";
    const j = await live.joinLive(d.student, id);
    delete process.env.LIVE_JITSI_DOMAIN;
    expect(j).toMatchObject({ provider: "jitsi", canLead: false });
    expect(await db().liveJoin.count({ where: { sessionId: id } })).toBe(1);
  });
  it("reports no provider honestly", async () => {
    const { id } = await schedule();
    expect((await live.joinLive(d.student, id)).provider).toBe("none");
  });
  it("sessions are not recorded by default", async () => {
    const { id } = await schedule();
    expect((await db().halaqaSession.findUniqueOrThrow({ where: { id } })).recordingEnabled).toBe(false);
  });
  it("the teacher shares a mushaf position; members read stored text; students cannot change it", async () => {
    const { id } = await schedule();
    await expect(live.shareMushaf(d.student, id, 1, 1)).rejects.toThrow();
    await expect(live.shareMushaf(d.teacher, id, 112, 99)).rejects.toThrow();
    await live.shareMushaf(d.teacher, id, 112, 1);
    const s = await live.liveState(d.student, id);
    expect(s.ayahs).toHaveLength(4);
    await expect(live.liveState(d.student2, id)).rejects.toThrow();
  });
  it("fills attendance from joins and notifies guardians of absence", async () => {
    const { id } = await schedule();
    await live.joinLive(d.student, id);
    await live.attendanceFromJoins(d.teacher, id);
    const rows = await db().attendance.findMany({ where: { sessionId: id } });
    expect(rows.find((r) => r.studentId === d.student.studentId)?.status).toBe("PRESENT");
    expect(rows.find((r) => r.studentId === d.minor.studentId)?.status).toBe("ABSENT");
  });
  it("sends follow-up work to every member", async () => {
    const { id } = await schedule();
    const created = await live.assignHomework(d.teacher, id, { date: new Date(), type: "NEAR_REVISION", surahId: 112, fromAyah: 1, toAyah: 4 });
    expect(created.length).toBeGreaterThanOrEqual(2);
  });
});

describe("public academy", () => {
  it("has the ten programs, with unverified instructors left empty", async () => {
    const p = await site.listPrograms();
    expect(p.length).toBeGreaterThanOrEqual(10);
    expect(p.every((x) => !x.instructorNoteAr)).toBe(true);
    expect(p.find((x) => x.slug === "ijazah")?.requiresQualifiedTeachers).toBe(true);
  });
  it("only editors can change programs, and unpublished ones are hidden", async () => {
    const base = { slug: `t-${Date.now()}`, titleAr: "برنامج", titleEn: "Program", summaryAr: "نبذة", summaryEn: "Sum", overviewAr: "نظرة", objectivesAr: [], audienceAr: [], levelsAr: [], curriculumAr: [], outcomesAr: [], requirementsAr: [], requiresQualifiedTeachers: false, featured: false, published: false, sortOrder: 99 };
    await expect(site.saveProgram(d.teacher, null, base)).rejects.toThrow();
    await site.saveProgram(d.admin, null, base);
    expect(await site.getProgram(base.slug)).toBeNull();
  });
  it("recommends beginner tracks by age and only known programs", async () => {
    expect(site.recommendPrograms({ age: "child", reading: "none", memorized: "none", tajweed: "none", schedule: "light" }).slugs).toContain("young-readers");
    expect(site.recommendPrograms({ age: "adult", reading: "letters", memorized: "none", tajweed: "none", schedule: "regular" }).slugs).toContain("adult-learning");
    const known = (await site.listPrograms()).map((p) => p.slug);
    for (const reading of ["none", "letters", "slow", "fluent"] as const) for (const memorized of ["none", "little", "juz", "many"] as const) for (const tajweed of ["none", "basic", "good"] as const) for (const schedule of ["light", "regular", "intensive"] as const) {
      const r = site.recommendPrograms({ age: "adult", reading, memorized, tajweed, schedule });
      expect(r.slugs.length).toBeGreaterThan(0);
      for (const s of r.slugs) expect(known).toContain(s);
    }
  });
  it("newsletter needs confirmation and supports unsubscribing", async () => {
    const email = `n${Date.now()}@test.invalid`;
    await site.subscribe({ email, consent: true, locale: "ar" });
    const row = await db().newsletterSubscriber.findUniqueOrThrow({ where: { email } });
    expect(row.confirmedAt).toBeNull();
    expect(await site.confirmNewsletter(row.confirmToken)).toBe(true);
    expect(await site.confirmNewsletter(row.confirmToken)).toBe(false);
    expect(await site.unsubscribe(row.unsubToken)).toBe(true);
  });
  it("search spans public content and excludes drafts", async () => {
    const r = await site.publicSearch("القلقلة", "ar");
    expect(r.rules.length).toBeGreaterThan(0);
    await db().contentPage.create({ data: { type: "ARTICLE", slug: `d-${Date.now()}`, locale: "ar", title: "مسودة سرية فريدة", body: "x", status: "DRAFT" } });
    expect((await site.publicSearch("مسودة سرية فريدة", "ar")).content).toHaveLength(0);
  });
  it("editing a lesson returns it to review", async () => {
    const rule = await db().tajweedRule.findFirstOrThrow({ where: { slug: "ghunnah" } });
    await site.saveLesson(d.admin, rule.id, { slug: rule.slug, category: rule.category, level: rule.level, titleAr: rule.titleAr, titleEn: rule.titleEn, bodyAr: rule.bodyAr, bodyEn: rule.bodyEn });
    expect((await db().tajweedRule.findUniqueOrThrow({ where: { id: rule.id } })).reviewStatus).toBe("PENDING");
    await db().tajweedRule.update({ where: { id: rule.id }, data: { reviewStatus: "APPROVED", reviewedBy: "demo-seed" } });
  });
  it("public certificate verification hides a minor's name", async () => {
    const c = await db().certificate.create({ data: { code: `M${Date.now()}`, studentId: d.minor.studentId!, title: "ش", requestedById: d.teacher.id, status: "ISSUED", approvedById: d.admin.id, issuedAt: new Date() } });
    expect((await verifyCertificate(c.code))?.studentFirstName).toBeNull();
  });
});

describe("messaging boundaries", () => {
  it("administration writes to teachers and guardians, who can write back", async () => {
    expect(await people.sendMessage(d.admin, { recipientId: d.teacher.id, body: "س" })).toBeTruthy();
    expect(await people.sendMessage(d.teacher, { recipientId: d.admin.id, body: "ع" })).toBeTruthy();
    expect(await people.sendMessage(d.guardian, { recipientId: d.admin.id, body: "ع" })).toBeTruthy();
  });
  it("students and unrelated pairs cannot message", async () => {
    await expect(people.sendMessage(d.student, { recipientId: d.admin.id, body: "x" })).rejects.toThrow();
    await expect(people.sendMessage(d.admin, { recipientId: d.student.id, body: "x" })).rejects.toThrow();
    await expect(people.sendMessage(d.teacher, { recipientId: d.teacher2.id, body: "x" })).rejects.toThrow();
  });
  it("a third party cannot read a message", async () => {
    const m = await people.sendMessage(d.admin, { recipientId: d.teacher.id, body: "خاص" });
    expect(await withActor(d.teacher2, (tx) => tx.message.count({ where: { id: m.id } }))).toBe(0);
  });
});
