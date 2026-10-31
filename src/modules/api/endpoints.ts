// The REST API (/api/v1) as one table: each row gives the method, path, permission and schema,
// then calls a service. `npm run docs:api` generates docs/API.md from this table.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { AppError, forbidden } from "@/lib/errors";
import type { EndpointDef } from "@/lib/api";
import { withActor, systemDb } from "@/lib/db";
import { ROLES } from "@/lib/rbac";
import * as quran from "../quran/service";
import * as halaqat from "../halaqat/service";
import * as learning from "../learning/service";
import * as assess from "../assessments/service";
import * as people from "../people/service";
import * as cms from "../cms/service";
import * as reports from "../reports/service";
import * as ai from "../ai/service";
import * as live from "../halaqat/live";
import * as site from "../site/service";
import * as adhkar from "../adhkar/service";
import * as u from "../unified/service";
import * as judging from "../judging/service";
import * as finalExam from "../hadith/final-exam";
import * as study from "../quran/study";
import { assignReviewer } from "../cms/scholarly";

const SCHOLARLY = z.enum(["tafsir_source", "tajweed_rule", "tajweed_example", "dhikr", "hadith", "study_resource"]);
const ayahId = z.coerce.number().int().min(1).max(6236);
const decision = z.object({ approve: z.boolean() });

const multipart = async (req: NextRequest) => {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new AppError(400, "file_required");
  return { file, field: (k: string) => String(form.get(k) ?? ""), consent: form.get("consent") === "true" };
};

export const endpoints: EndpointDef[] = [
  // ---- Public ----
  { method: "POST", path: "/register", public: true, summary: "Create a student or guardian account", body: people.registerSchema, limit: { max: 10, windowSec: 3600 }, run: ({ body }) => people.register(body as never) },
  {
    method: "POST", path: "/contact", public: true, summary: "Send a contact message", limit: { max: 5, windowSec: 3600 },
    body: z.object({ name: z.string().trim().min(2).max(120), email: z.email(), subject: z.string().trim().min(2).max(160), body: z.string().trim().min(5).max(4000) }),
    run: async ({ body }) => { await systemDb().contactMessage.create({ data: body as never }); return { ok: true }; },
  },
  { method: "GET", path: "/quran/surahs", public: true, summary: "List surahs", run: () => quran.listSurahs() },
  { method: "GET", path: "/quran/surahs/:id/ayahs", public: true, summary: "Ayahs of a surah", run: ({ params }) => quran.ayahsWhere({ surahId: Number(params.id) }) },
  { method: "GET", path: "/quran/pages/:n", public: true, summary: "Ayahs of a mushaf page", run: ({ params }) => quran.ayahsWhere({ page: Number(params.n) }) },
  { method: "GET", path: "/quran/recitations", public: true, summary: "Available recitations", run: () => quran.listRecitations() },
  {
    method: "GET", path: "/quran/search", public: true, summary: "Search Quran text (?q=)", limit: { max: 60, windowSec: 60 },
    run: ({ req }) => quran.searchAyahs(req.nextUrl.searchParams.get("q") ?? ""),
  },
  { method: "GET", path: "/quran/ayahs/:id/tafsir", public: true, summary: "Approved tafsir sources for an ayah", run: async ({ params }) => {
    const id = ayahId.parse(params.id);
    const sources = await quran.approvedTafsirSources();
    return Promise.all(sources.map((s) => quran.tafsirFor(id, s.slug)));
  } },
  { method: "GET", path: "/quran/ayahs/:id/tajweed-rules", public: true, summary: "Approved tajweed rules present in an ayah", run: ({ params }) => quran.rulesForAyah(ayahId.parse(params.id)) },

  { method: "POST", path: "/placement", public: true, summary: "Preliminary program guidance; answers are not stored", limit: { max: 30, windowSec: 60 }, body: site.placementSchema, run: ({ body }) => site.recommendPrograms(body as never) },
  { method: "POST", path: "/newsletter", public: true, summary: "Subscribe with consent; confirmation email follows", limit: { max: 5, windowSec: 3600 }, body: site.subscribeSchema, run: ({ body }) => site.subscribe(body as never) },
  { method: "GET", path: "/search", public: true, summary: "Search public learning content (?q=)", limit: { max: 60, windowSec: 60 }, run: ({ req }) => site.publicSearch(req.nextUrl.searchParams.get("q") ?? "", req.nextUrl.searchParams.get("locale") ?? "ar") },
  { method: "POST", path: "/library/:id/favorite", summary: "Toggle a library favourite", run: ({ actor, params }) => site.toggleLibraryFavorite(actor!, params.id) },
  { method: "POST", path: "/programs", perm: "content.manage", summary: "Create a program", body: site.programSchema, run: ({ actor, body }) => site.saveProgram(actor!, null, body as never) },
  { method: "PUT", path: "/programs/:id", perm: "content.manage", summary: "Update a program", body: site.programSchema, run: ({ actor, params, body }) => site.saveProgram(actor!, params.id, body as never) },
  { method: "POST", path: "/lessons", perm: "content.manage", summary: "Create a lesson, pending review", body: site.lessonSchema, run: ({ actor, body }) => site.saveLesson(actor!, null, body as never) },
  { method: "PUT", path: "/lessons/:id", perm: "content.manage", summary: "Edit a lesson; returns it to review", body: site.lessonSchema, run: ({ actor, params, body }) => site.saveLesson(actor!, params.id, body as never) },

  {
    method: "PUT", path: "/settings/site", perm: "settings.manage", summary: "Home, SEO and social settings",
    body: z.object({
      home: z.object({ heroTitleAr: z.string().max(160).optional(), heroTextAr: z.string().max(500).optional(), ctaPrimaryAr: z.string().max(60).optional(), ctaFinalAr: z.string().max(160).optional(), hidden: z.array(z.string().max(30)).max(20).default([]) }).optional(),
      seo: z.object({ descriptionAr: z.string().max(300).optional(), descriptionEn: z.string().max(300).optional() }).optional(),
      social: z.object({ youtube: z.url({ protocol: /^https$/ }).optional(), x: z.url({ protocol: /^https$/ }).optional(), facebook: z.url({ protocol: /^https$/ }).optional(), instagram: z.url({ protocol: /^https$/ }).optional() }).optional(),
    }),
    run: async ({ actor, body }) => {
      for (const [key, value] of Object.entries(body as Record<string, object>)) await systemDb().setting.upsert({ where: { key }, update: { value: value as never }, create: { key, value: value as never } });
      await audit(actor!.id, "settings.site", "Setting", null, { keys: Object.keys(body as object) });
    },
  },

  // ---- Adhkar ----
  { method: "POST", path: "/adhkar/:id/favorite", summary: "Toggle a dhikr favourite", run: ({ actor, params }) => adhkar.toggleFavorite(actor!, params.id) },
  { method: "PUT", path: "/me/adhkar-preferences", summary: "Reminder schedule and consent", body: adhkar.prefsSchema, run: ({ actor, body }) => adhkar.savePreferences(actor!, body as never) },
  { method: "POST", path: "/me/push", summary: "Register a push subscription", limit: { max: 10, windowSec: 3600 }, body: adhkar.subscribeSchema, run: async ({ actor, body }) => { await adhkar.savePushSubscription(actor!, body as never); return { ok: true }; } },
  { method: "DELETE", path: "/me/push", summary: "Unsubscribe this browser, or all when none is named", body: z.object({ endpoint: z.string().max(2000).optional() }), run: async ({ actor, body }) => { await adhkar.removePushSubscription(actor!, (body as { endpoint?: string }).endpoint); return { ok: true }; } },
  { method: "POST", path: "/me/push/test", summary: "Send a test notification to my own browsers", limit: { max: 5, windowSec: 3600 }, run: ({ actor }) => adhkar.sendTestPush(actor!) },
  { method: "GET", path: "/me/adhkar-reminder", summary: "Latest unread reminder for the in-page card", run: ({ actor }) => adhkar.pendingReminder(actor!) },
  { method: "POST", path: "/adhkar", perm: "content.manage", summary: "Add a dhikr, pending review", body: adhkar.dhikrSchema, run: ({ actor, body }) => adhkar.saveDhikr(actor!, null, body as never) },
  { method: "PUT", path: "/adhkar/:id", perm: "content.manage", summary: "Edit a dhikr; returns it to review", body: adhkar.dhikrSchema, run: ({ actor, params, body }) => adhkar.saveDhikr(actor!, params.id, body as never) },

  // ---- Hadith ----
  { method: "POST", path: "/hadith/:id/start", summary: "Add a hadith to my plan", run: ({ actor, params }) => u.startHadith(actor!, params.id) },
  { method: "POST", path: "/hadith/assign", perm: "tasks.assign", summary: "Assign hadiths to students", body: u.assignHadithSchema, run: ({ actor, body }) => u.assignHadith(actor!, body as never) },
  { method: "POST", path: "/hadith/:id/submit", summary: "Send a hadith recitation (multipart)", limit: { max: 20, windowSec: 3600 }, run: async ({ actor, params, req }) => { const m = await multipart(req); const s = await u.submitHadith(actor!, params.id, m.consent, m.file); return { id: s.id }; } },
  { method: "GET", path: "/hadith-submissions/:id/audio", summary: "Short-lived private audio URL", limit: { max: 60, windowSec: 60 }, run: ({ actor, params }) => u.hadithAudio(actor!, params.id) },
  { method: "POST", path: "/hadith-submissions/:id/review", perm: "reviews.write", summary: "Teacher assessment of a hadith", body: u.hadithReviewSchema, run: ({ actor, params, body }) => u.reviewHadith(actor!, params.id, body as never) },

  { method: "PUT", path: "/hadith/:id", perm: "content.manage", summary: "Edit a hadith; returns it to review", body: u.hadithEditSchema, run: ({ actor, params, body }) => u.editHadith(actor!, params.id, body as never) },
  { method: "POST", path: "/hadith-collections/:id/publish", perm: "scholarly.review", summary: "Publish or hide a track", body: z.object({ published: z.boolean() }), run: ({ actor, params, body }) => u.publishCollection(actor!, params.id, (body as { published: boolean }).published) },

  { method: "POST", path: "/hadith-collections/:id/final-exam", perm: "assessments.manage", summary: "Build a draft final exam from reviewed text", body: finalExam.finalExamSchema, run: ({ actor, params, body }) => finalExam.buildFinalExam(actor!, params.id, body as never) },
  { method: "POST", path: "/hadith-collections/:id/final-exam/publish", perm: "scholarly.review", summary: "Publish the final exam of a fully reviewed track", run: ({ actor, params }) => finalExam.publishFinalExam(actor!, params.id) },

  // ---- Placement ----
  { method: "POST", path: "/placement/practice", summary: "Note that the unscored practice run was completed", run: async ({ actor }) => { await u.completePractice(actor!); return { ok: true }; } },
  { method: "PUT", path: "/placement/intake", summary: "Save the placement profile", body: u.intakeSchema, run: ({ actor, body }) => u.saveIntake(actor!, body as never) },
  { method: "POST", path: "/placement/audio", summary: "Reading or memorization recording (multipart)", limit: { max: 10, windowSec: 3600 }, run: async ({ actor, req }) => { const m = await multipart(req); const stage = z.enum(["reading", "memorization"]).parse(m.field("stage")); await u.savePlacementAudio(actor!, stage, m.consent, m.file); return { ok: true }; } },
  { method: "PUT", path: "/placement/tajweed", summary: "Save tajweed answers", body: z.object({ answers: z.record(z.string(), z.string().max(10)) }), run: ({ actor, body }) => u.savePlacementTajweed(actor!, (body as { answers: Record<string, string> }).answers) },
  { method: "GET", path: "/placement/memorization-check", summary: "Checks built from stored ayahs (?surah=)", run: ({ req }) => u.memorizationCheck(z.coerce.number().int().min(1).max(114).parse(req.nextUrl.searchParams.get("surah"))) },
  { method: "PUT", path: "/placement/memorization", summary: "Save memorization check answers", body: u.memorizationAnswerSchema, run: ({ actor, body }) => u.savePlacementMemorization(actor!, body as never) },
  { method: "POST", path: "/placement/submit", summary: "Send the assessment to a teacher", run: ({ actor }) => u.submitPlacement(actor!) },
  { method: "POST", path: "/placement/restart", summary: "Start a new assessment", run: ({ actor }) => u.startNewPlacement(actor!) },
  { method: "POST", path: "/placement/:id/review", perm: "reviews.write", summary: "Teacher sets skills and track", body: u.placementReviewSchema, run: ({ actor, params, body }) => u.reviewPlacement(actor!, params.id, body as never) },
  { method: "GET", path: "/placement/:id/audio/:stage", summary: "Short-lived recording URL", run: ({ actor, params }) => u.placementAudio(actor!, params.id, z.enum(["reading", "memorization"]).parse(params.stage)) },

  // ---- Competitions and exams ----
  { method: "POST", path: "/competitions", perm: "assessments.manage", summary: "Create a competition", body: u.competitionSchema, run: ({ actor, body }) => u.createCompetition(actor!, body as never) },
  { method: "POST", path: "/competitions/:id/register", summary: "Register for a competition", body: z.object({ showOnLeaderboard: z.boolean().default(false) }), run: ({ actor, params, body }) => u.registerCompetition(actor!, params.id, (body as { showOnLeaderboard: boolean }).showOnLeaderboard) },
  { method: "POST", path: "/competitions/:id/start", summary: "Start or resume an attempt", run: ({ actor, params }) => u.startExam(actor!, params.id) },
  { method: "POST", path: "/competitions/:id/publish-results", perm: "assessments.manage", summary: "Publish results", run: ({ actor, params }) => u.publishResults(actor!, params.id) },
  { method: "PUT", path: "/exams/:id/answer", summary: "Autosave an answer", limit: { max: 300, windowSec: 60 }, body: u.answerSchema, run: ({ actor, params, body }) => u.saveAnswer(actor!, params.id, body as never) },
  { method: "POST", path: "/exams/:id/audio", summary: "Recitation answer (multipart)", limit: { max: 20, windowSec: 600 }, run: async ({ actor, params, req }) => { const m = await multipart(req); await u.saveAudioAnswer(actor!, params.id, m.field("questionId"), m.consent, m.file); return { ok: true }; } },
  { method: "POST", path: "/exams/:id/finish", summary: "Final submission", run: ({ actor, params }) => u.finishExam(actor!, params.id) },
  { method: "GET", path: "/exams/:id/answers/:q/audio", summary: "Recitation answer URL for its student or teacher", run: ({ actor, params }) => u.examAnswerAudio(actor!, params.id, params.q) },
  { method: "POST", path: "/exams/:id/appeal", summary: "Appeal a result", limit: { max: 5, windowSec: 3600 }, body: z.object({ reason: z.string().trim().min(5).max(2000) }), run: ({ actor, params, body }) => u.fileAppeal(actor!, params.id, (body as { reason: string }).reason) },
  { method: "POST", path: "/appeals/:id/decide", perm: "assessments.manage", summary: "Decide an appeal, optionally correcting the score", body: judging.appealDecisionSchema, run: ({ actor, params, body }) => judging.decideAppeal(actor!, params.id, body as never) },

  // ---- Live oral judging ----
  { method: "POST", path: "/rubrics", perm: "assessments.manage", summary: "Create a judging rubric", body: judging.rubricSchema, run: ({ actor, body }) => judging.createRubric(actor!, body as never) },
  { method: "POST", path: "/judging", perm: "assessments.manage", summary: "Create a judging session from registrations", body: judging.sessionSchema, run: ({ actor, body }) => judging.createSession(actor!, body as never) },
  { method: "POST", path: "/judging/:id/open", summary: "Open a session (panel or manager)", run: async ({ actor, params }) => { await judging.openSession(actor!, params.id); return { ok: true }; } },
  { method: "POST", path: "/judging/:id/close", summary: "Close scoring; needs every score from every judge", run: async ({ actor, params }) => { await judging.closeSession(actor!, params.id); return { ok: true }; } },
  { method: "POST", path: "/judging/:id/approve", perm: "assessments.manage", summary: "Approve final results", run: async ({ actor, params }) => { await judging.approveSession(actor!, params.id); return { ok: true }; } },
  { method: "PUT", path: "/judging/entries/:id/status", summary: "Call a participant or mark absent", body: z.object({ status: z.enum(["WAITING", "ON_STAGE", "DONE", "ABSENT"]) }), run: async ({ actor, params, body }) => { await judging.callEntry(actor!, params.id, (body as { status: "WAITING" }).status); return { ok: true }; } },
  { method: "PUT", path: "/judging/entries/:id/scores", summary: "A judge's own scores", limit: { max: 300, windowSec: 60 }, body: judging.scoreSchema, run: async ({ actor, params, body }) => { await judging.submitScores(actor!, params.id, body as never); return { ok: true }; } },
  { method: "POST", path: "/judging/entries/:id/appeal", summary: "Appeal an approved oral result", limit: { max: 5, windowSec: 3600 }, body: z.object({ reason: z.string().trim().min(5).max(2000) }), run: ({ actor, params, body }) => judging.fileJudgingAppeal(actor!, params.id, (body as { reason: string }).reason) },
  { method: "POST", path: "/certificates/from-result", perm: "certificates.request", summary: "Request a certificate resting on a final passing result", body: judging.resultCertificateSchema, run: ({ actor, body }) => judging.requestResultCertificate(actor!, body as never) },

  // ---- Ayah progress and study ----
  { method: "PUT", path: "/me/ayah-status", summary: "Update ayah status (students: practice states only)", limit: { max: 200, windowSec: 60 }, body: u.ayahStatusSchema, run: ({ actor, body }) => u.updateAyahRange(actor!, body as never) },
  { method: "GET", path: "/me/notes/:ayah", summary: "My private ayah note", run: ({ actor, params }) => u.getAyahNote(actor!, ayahId.parse(params.ayah)) },
  { method: "PUT", path: "/me/notes/:ayah", summary: "Save my private ayah note", body: z.object({ body: z.string().trim().max(2000) }), run: ({ actor, params, body }) => u.saveAyahNote(actor!, ayahId.parse(params.ayah), (body as { body: string }).body) },
  { method: "GET", path: "/quran/ayahs/:id/word-rules", public: true, summary: "Approved rules for a word (?start=&end=)", run: ({ params, req }) => u.wordRules(ayahId.parse(params.id), Number(req.nextUrl.searchParams.get("start")), Number(req.nextUrl.searchParams.get("end"))) },
  { method: "POST", path: "/lessons/:slug/quiz", summary: "Submit a lesson quiz", body: z.object({ answers: z.record(z.string(), z.string().max(10)) }), run: ({ actor, params, body }) => u.submitLessonQuiz(actor!, params.slug, (body as { answers: Record<string, string> }).answers) },
  { method: "POST", path: "/lessons/:slug/complete", summary: "Mark a lesson complete", run: ({ actor, params }) => u.completeLesson(actor!, params.slug) },
  { method: "PUT", path: "/students/:id/lessons/:slug/note", perm: "reviews.write", summary: "Teacher note on a lesson", body: z.object({ note: z.string().trim().max(1000) }), run: ({ actor, params, body }) => u.lessonNote(actor!, params.id, params.slug, (body as { note: string }).note) },
  { method: "PUT", path: "/tafsir-progress", summary: "Save tafsir study position", body: z.object({ surahId: z.coerce.number().int().min(1).max(114), ayahUpTo: z.coerce.number().int().min(1) }), run: ({ actor, body }) => { const b = body as { surahId: number; ayahUpTo: number }; return u.saveTafsirProgress(actor!, b.surahId, b.ayahUpTo); } },

  { method: "PUT", path: "/memorizations/:id/difficulty", perm: "reviews.write", summary: "Teacher's teaching difficulty for a segment", body: u.difficultySchema, run: async ({ actor, params, body }) => { await u.setSegmentDifficulty(actor!, params.id, body as never); return { ok: true }; } },
  { method: "GET", path: "/quran/spans", public: true, summary: "Tajweed colour spans for an ayah id range (?from=&to=)", limit: { max: 120, windowSec: 60 }, run: ({ req }) => quran.spansFor(ayahId.parse(req.nextUrl.searchParams.get("from")), ayahId.parse(req.nextUrl.searchParams.get("to"))) },
  { method: "GET", path: "/quran/word-timings", public: true, summary: "Word timings of one ayah audio (?recitation=&surah=&ayah=)", limit: { max: 600, windowSec: 60 }, run: ({ req }) => quran.wordTimings(req.nextUrl.searchParams.get("recitation") ?? "", Number(req.nextUrl.searchParams.get("surah")), Number(req.nextUrl.searchParams.get("ayah"))) },
  { method: "GET", path: "/quran/surahs/:id/study", public: true, summary: "Approved, sourced word meanings, occasions and topics", run: ({ params }) => study.approvedStudyResources(z.coerce.number().int().min(1).max(114).parse(params.id)) },
  { method: "POST", path: "/study-resources", perm: "content.manage", summary: "Add a sourced study resource, pending review", body: study.studyResourceSchema, run: ({ actor, body }) => study.saveStudyResource(actor!, null, body as never) },
  { method: "PUT", path: "/study-resources/:id", perm: "content.manage", summary: "Edit a study resource; returns it to review", body: study.studyResourceSchema, run: ({ actor, params, body }) => study.saveStudyResource(actor!, params.id, body as never) },

  // ---- AI assistant ----
  { method: "POST", path: "/ai/ask", summary: "Ask from reviewed sources", limit: { max: 20, windowSec: 3600 }, body: ai.askSchema, run: ({ actor, body }) => ai.ask(actor!, (body as { question: string }).question) },
  { method: "POST", path: "/ai/referrals/:id/resolve", summary: "Answer a referred question", body: z.object({ reply: z.string().trim().min(2).max(2000) }), run: ({ actor, params, body }) => ai.resolveReferral(actor!, params.id, (body as { reply: string }).reply) },
  { method: "POST", path: "/ai/draft-questions", perm: "assessments.manage", summary: "Draft inactive questions from an approved lesson", limit: { max: 10, windowSec: 3600 }, body: z.object({ ruleSlug: z.string() }), run: ({ actor, body }) => ai.draftQuestions(actor!, (body as { ruleSlug: string }).ruleSlug) },
  { method: "POST", path: "/questions/:id/activate", perm: "assessments.manage", summary: "Activate a reviewed draft question", run: ({ actor, params }) => ai.activateQuestion(actor!, params.id) },
  { method: "PUT", path: "/ai/settings", perm: "ai.manage", summary: "Enable or disable the assistant", body: z.object({ enabled: z.boolean() }), run: async ({ actor, body }) => { await systemDb().setting.upsert({ where: { key: "ai" }, update: { value: body as never }, create: { key: "ai", value: body as never } }); return { actor: actor!.id }; } },
  { method: "PUT", path: "/guardian/students/:id/ai-consent", summary: "Guardian consent for the assistant", body: z.object({ granted: z.boolean() }), run: ({ actor, params, body }) => ai.setAiConsent(actor!, params.id, (body as { granted: boolean }).granted) },

  // ---- Live classes ----
  { method: "POST", path: "/live", summary: "Schedule an online session", body: live.createLiveSchema, run: ({ actor, body }) => live.createLiveSession(actor!, body as never) },
  { method: "POST", path: "/live/:id/join", summary: "Authorized join; logs presence", limit: { max: 30, windowSec: 60 }, run: ({ actor, params }) => live.joinLive(actor!, params.id) },
  { method: "GET", path: "/live/:id/state", summary: "Shared mushaf position", limit: { max: 60, windowSec: 60 }, run: ({ actor, params }) => live.liveState(actor!, params.id) },
  { method: "PUT", path: "/live/:id/share", summary: "Teacher sets the shared position", body: z.object({ surah: z.coerce.number().int().min(1).max(114), ayah: z.coerce.number().int().min(1) }), run: ({ actor, params, body }) => { const b = body as { surah: number; ayah: number }; return live.shareMushaf(actor!, params.id, b.surah, b.ayah); } },
  { method: "POST", path: "/live/:id/attendance", perm: "attendance.record", summary: "Fill attendance from join records", run: ({ actor, params }) => live.attendanceFromJoins(actor!, params.id) },
  { method: "POST", path: "/live/:id/homework", perm: "tasks.assign", summary: "Assign follow-up work to the halaqa", body: live.homeworkSchema, run: ({ actor, params, body }) => live.assignHomework(actor!, params.id, body as never) },

  // ---- Reader state ----
  { method: "GET", path: "/me/quran", summary: "Reading position and bookmarks", run: ({ actor }) => quran.myQuranState(actor!) },
  { method: "PUT", path: "/me/position", summary: "Save reading position", body: z.object({ ayahId }), run: ({ actor, body }) => quran.savePosition(actor!, (body as { ayahId: number }).ayahId) },
  { method: "POST", path: "/me/bookmarks", summary: "Toggle a favourite or bookmark", body: z.object({ ayahId, kind: z.enum(["FAVORITE", "BOOKMARK"]) }), run: ({ actor, body }) => { const b = body as { ayahId: number; kind: "FAVORITE" | "BOOKMARK" }; return quran.toggleBookmark(actor!, b.ayahId, b.kind); } },
  { method: "GET", path: "/me/export", summary: "Export my personal data", limit: { max: 5, windowSec: 3600 }, run: ({ actor }) => people.exportMyData(actor!) },
  { method: "GET", path: "/me/notifications", summary: "My notifications", run: ({ actor }) => people.myNotifications(actor!) },
  { method: "POST", path: "/me/notifications/:id/read", summary: "Mark as read", run: ({ actor, params }) => withActor(actor!, (tx) => tx.notification.updateMany({ where: { id: params.id, userId: actor!.id }, data: { readAt: new Date() } })) },
  {
    method: "PUT", path: "/me/preferences", summary: "Notification consent and limits",
    body: z.object({ emailEnabled: z.boolean(), mutedTypes: z.array(z.string().max(60)).max(50).default([]), maxEmailsPerDay: z.coerce.number().int().min(0).max(20).default(5) }),
    run: ({ actor, body }) => withActor(actor!, (tx) => tx.notificationPreference.upsert({ where: { userId: actor!.id }, update: body as never, create: { ...(body as object), userId: actor!.id } as never })),
  },

  // ---- Users and guardians ----
  { method: "POST", path: "/users", perm: "users.manage", summary: "Create an account (staff)", body: people.staffCreateSchema, run: ({ actor, body }) => people.createUserByStaff(actor!, body as never) },
  { method: "POST", path: "/users/:id/roles", perm: "roles.assign", summary: "Grant or revoke a role", body: z.object({ role: z.enum(ROLES), grant: z.boolean() }), run: ({ actor, params, body }) => { const b = body as { role: (typeof ROLES)[number]; grant: boolean }; return people.setRole(actor!, params.id, b.role, b.grant); } },
  { method: "PUT", path: "/users/:id/status", perm: "users.manage", summary: "Activate or suspend", body: z.object({ status: z.enum(["ACTIVE", "SUSPENDED", "DEACTIVATED"]) }), run: ({ actor, params, body }) => people.setUserStatus(actor!, params.id, (body as { status: "ACTIVE" }).status) },
  { method: "POST", path: "/guardian/links", summary: "Request a link to a student", limit: { max: 10, windowSec: 3600 }, body: z.object({ studentEmail: z.email().toLowerCase(), relation: z.string().trim().min(2).max(40) }), run: ({ actor, body }) => people.requestGuardianLink(actor!, body as never) },
  { method: "POST", path: "/guardian/links/:id/decide", perm: "guardians.link", summary: "Approve or reject a guardian link", body: z.object({ approve: z.boolean(), verified: z.boolean().default(false) }), run: ({ actor, params, body }) => { const b = body as { approve: boolean; verified: boolean }; return people.decideGuardianLink(actor!, params.id, b.approve, b.verified); } },
  { method: "POST", path: "/guardian/links/:id/revoke", perm: "guardians.link", summary: "Revoke a guardian link", run: ({ actor, params }) => people.revokeGuardianLink(actor!, params.id) },
  { method: "PUT", path: "/guardian/students/:id/consent", summary: "Guardian consent for recordings", body: z.object({ granted: z.boolean() }), run: ({ actor, params, body }) => people.setRecordingConsent(actor!, params.id, (body as { granted: boolean }).granted) },
  { method: "POST", path: "/messages", perm: "messages.send", summary: "Message within permitted pairs", limit: { max: 20, windowSec: 3600 }, body: z.object({ studentId: z.string().optional(), recipientId: z.string(), body: z.string().trim().min(1).max(2000) }), run: ({ actor, body }) => people.sendMessage(actor!, body as never) },

  // ---- Halaqas ----
  { method: "POST", path: "/halaqas", perm: "halaqas.manage", summary: "Create a halaqa", body: halaqat.halaqaSchema, run: ({ actor, body }) => halaqat.createHalaqa(actor!, body as never) },
  { method: "PATCH", path: "/halaqas/:id", perm: "halaqas.manage", summary: "Update a halaqa", body: halaqat.halaqaSchema.partial().extend({ active: z.boolean().optional() }), run: ({ actor, params, body }) => halaqat.updateHalaqa(actor!, params.id, body as never) },
  { method: "GET", path: "/halaqas/:id/meeting-link", summary: "Meeting link for members", run: ({ actor, params }) => halaqat.meetingLinkFor(actor!, params.id) },
  { method: "POST", path: "/halaqas/:id/sessions/generate", summary: "Generate sessions from the schedule", perm: "halaqas.manage", body: z.object({ weeks: z.coerce.number().int().min(1).max(26) }), run: ({ actor, params, body }) => halaqat.generateSessions(actor!, params.id, (body as { weeks: number }).weeks) },
  { method: "POST", path: "/halaqas/:id/enroll", perm: "enrollments.request", summary: "Request enrollment", body: z.object({ studentId: z.string().optional() }), run: ({ actor, params, body }) => { const sid = (body as { studentId?: string }).studentId ?? actor!.studentId; if (!sid) throw forbidden(); return halaqat.requestEnrollment(actor!, params.id, sid); } },
  { method: "POST", path: "/enrollments/:id/decide", perm: "halaqas.manage", summary: "Approve or reject enrollment", body: decision, run: ({ actor, params, body }) => halaqat.decideEnrollment(actor!, params.id, (body as { approve: boolean }).approve) },
  { method: "POST", path: "/enrollments/:id/withdraw", summary: "Withdraw from a halaqa", run: ({ actor, params }) => halaqat.withdrawEnrollment(actor!, params.id) },
  { method: "POST", path: "/sessions/:id/attendance", perm: "attendance.record", summary: "Record attendance", body: halaqat.attendanceSchema, run: ({ actor, params, body }) => halaqat.recordAttendance(actor!, params.id, body as never) },
  { method: "PUT", path: "/sessions/:id/substitute", perm: "halaqas.manage", summary: "Assign a substitute teacher", body: z.object({ teacherId: z.string().nullable() }), run: ({ actor, params, body }) => halaqat.setSubstitute(actor!, params.id, (body as { teacherId: string | null }).teacherId) },

  // ---- Learning ----
  { method: "POST", path: "/plans", perm: "plans.manage", summary: "Create a learning plan", body: learning.planSchema, run: ({ actor, body }) => learning.createPlan(actor!, body as never) },
  { method: "POST", path: "/students/:id/days/generate", summary: "Generate a suggested day", body: z.object({ date: z.coerce.date() }), run: ({ actor, params, body }) => learning.generateDay(actor!, params.id, (body as { date: Date }).date) },
  { method: "POST", path: "/tasks", perm: "tasks.assign", summary: "Assign tasks to one or more students", body: learning.taskSchema, run: ({ actor, body }) => learning.assignTasks(actor!, body as never) },
  { method: "PATCH", path: "/tasks/:id", summary: "Update task status or teacher note", body: z.object({ status: z.enum(["PENDING", "IN_PROGRESS", "DONE", "SKIPPED"]).optional(), teacherNote: z.string().trim().max(500).optional() }), run: ({ actor, params, body }) => learning.updateTask(actor!, params.id, body as never) },
  { method: "POST", path: "/tasks/:id/reschedule", summary: "Move a task, keeping its history", body: z.object({ date: z.coerce.date() }), run: ({ actor, params, body }) => learning.rescheduleTask(actor!, params.id, (body as { date: Date }).date) },
  {
    method: "POST", path: "/recitations", summary: "Upload a recitation (multipart)", limit: { max: 20, windowSec: 3600 },
    run: async ({ actor, req }) => {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw new AppError(400, "file_required");
      const fields = z.object({
        taskId: z.string().optional(),
        surahId: z.coerce.number().int().min(1).max(114),
        fromAyah: z.coerce.number().int().min(1),
        toAyah: z.coerce.number().int().min(1),
        note: z.string().max(500).optional(),
        consent: z.literal("true"),
      }).parse(Object.fromEntries([...form.entries()].filter(([k]) => k !== "file")));
      return learning.submitRecitation(actor!, { ...fields, consent: true, file });
    },
  },
  { method: "GET", path: "/recitations/:id/audio", summary: "Short-lived private audio URL", limit: { max: 60, windowSec: 60 }, run: ({ actor, params }) => learning.recitationAudioUrl(actor!, params.id) },
  { method: "DELETE", path: "/recitations/:id", summary: "Delete my recording", run: ({ actor, params }) => learning.deleteRecitation(actor!, params.id) },
  { method: "POST", path: "/recitations/:id/review", perm: "reviews.write", summary: "Teacher review with rubric", body: learning.reviewSchema, run: ({ actor, params, body }) => learning.reviewSubmission(actor!, params.id, body as never) },
  { method: "POST", path: "/memorizations/:id/revisions", perm: "reviews.write", summary: "Grade a revision", body: learning.gradeRevisionSchema, run: ({ actor, params, body }) => learning.gradeRevision(actor!, params.id, body as never) },
  { method: "GET", path: "/students/:id/progress", summary: "Progress computed from records", run: ({ actor, params }) => learning.studentProgress(actor!, params.id) },

  {
    method: "POST", path: "/curricula", perm: "plans.manage", summary: "Create a curriculum",
    body: z.object({ name: z.string().trim().min(2).max(120), level: z.coerce.number().int().min(1).max(10), direction: z.enum(["REVERSE", "FORWARD"]), description: z.string().trim().max(1000).optional() }),
    run: ({ actor, body }) => withActor(actor!, (tx) => tx.curriculum.create({ data: body as never })),
  },

  // ---- Assessments and certificates ----
  { method: "POST", path: "/questions", perm: "assessments.manage", summary: "Add to the question bank", body: assess.questionSchema, run: ({ actor, body }) => assess.createQuestion(actor!, body as never) },
  { method: "POST", path: "/assessments", perm: "assessments.manage", summary: "Create an assessment", body: assess.assessmentSchema, run: ({ actor, body }) => assess.createAssessment(actor!, body as never) },
  { method: "GET", path: "/assessments/:id", summary: "Assessment for students, without answers", run: ({ actor, params }) => assess.assessmentForStudent(actor!, params.id) },
  { method: "POST", path: "/assessments/:id/submit", summary: "Submit answers", body: assess.submitSchema, run: ({ actor, params, body }) => assess.submitAttempt(actor!, params.id, body as never) },
  { method: "POST", path: "/attempts/:id/grade", perm: "assessments.manage", summary: "Grade practical answers", body: assess.gradeSchema, run: ({ actor, params, body }) => assess.gradeAttempt(actor!, params.id, body as never) },
  { method: "POST", path: "/certificates", perm: "certificates.request", summary: "Request a certificate", body: assess.certificateSchema, run: ({ actor, body }) => assess.requestCertificate(actor!, body as never) },
  { method: "POST", path: "/certificates/:id/decide", perm: "certificates.approve", summary: "Human approval of a certificate", body: decision, run: ({ actor, params, body }) => assess.decideCertificate(actor!, params.id, (body as { approve: boolean }).approve) },
  { method: "POST", path: "/certificates/:id/revoke", perm: "certificates.approve", summary: "Revoke a certificate", run: ({ actor, params }) => assess.revokeCertificate(actor!, params.id) },
  { method: "GET", path: "/verify/:code", public: true, summary: "Public certificate verification", limit: { max: 30, windowSec: 60 }, run: ({ params }) => assess.verifyCertificate(params.code) },

  // ---- CMS, review and settings ----
  { method: "POST", path: "/content", perm: "content.manage", summary: "Create content", body: cms.contentSchema, run: ({ actor, body }) => cms.upsertContent(actor!, null, body as never) },
  { method: "PUT", path: "/content/:id", perm: "content.manage", summary: "Update content", body: cms.contentSchema, run: ({ actor, params, body }) => cms.upsertContent(actor!, params.id, body as never) },
  { method: "POST", path: "/content/:id/status", perm: "content.manage", summary: "Move through the review workflow", body: z.object({ status: z.enum(["DRAFT", "IN_REVIEW", "PUBLISHED", "ARCHIVED"]) }), run: ({ actor, params, body }) => cms.transitionContent(actor!, params.id, (body as { status: "DRAFT" }).status) },
  { method: "POST", path: "/scholarly/:target/:id", perm: "scholarly.review", summary: "Scholarly decision; a rejection needs its reason", body: z.object({ approve: z.boolean(), reason: z.string().trim().max(1000).optional() }), run: ({ actor, params, body }) => { const b = body as { approve: boolean; reason?: string }; return cms.scholarlyDecision(actor!, SCHOLARLY.parse(params.target), params.id, b.approve, b.reason); } },
  { method: "PUT", path: "/scholarly/:target/:id/reviewer", perm: "scholarly.review", summary: "Assign the responsible scholar", body: z.object({ reviewerId: z.string().min(1) }), run: async ({ actor, params, body }) => { await assignReviewer(actor!, SCHOLARLY.parse(params.target), params.id, (body as { reviewerId: string }).reviewerId); return { ok: true }; } },
  { method: "PUT", path: "/settings", perm: "settings.manage", summary: "Update settings", body: cms.settingsSchema, run: ({ actor, body }) => cms.updateSettings(actor!, body as never) },
  {
    method: "PUT", path: "/notification-templates/:key", perm: "notifications.manage", summary: "Edit a notification template",
    body: z.object({ titleAr: z.string().min(1).max(200), bodyAr: z.string().min(1).max(1000), titleEn: z.string().min(1).max(200), bodyEn: z.string().min(1).max(1000) }),
    run: ({ params, body }) => systemDb().notificationTemplate.update({ where: { key: params.key }, data: body as never }),
  },

  // ---- Reports ----
  {
    method: "GET", path: "/reports/export", perm: "reports.export", summary: "Export CSV, XLSX or PDF (?type=&format=)", limit: { max: 20, windowSec: 300 },
    run: ({ actor, req }) => {
      const q = Object.fromEntries(req.nextUrl.searchParams);
      const format = z.enum(["csv", "xlsx", "pdf"]).parse(q.format);
      const clean = Object.fromEntries(Object.entries(q).filter(([k, v]) => k !== "format" && v !== ""));
      return reports.exportReport(actor!, reports.reportFilter.parse(clean), format);
    },
  },
];

