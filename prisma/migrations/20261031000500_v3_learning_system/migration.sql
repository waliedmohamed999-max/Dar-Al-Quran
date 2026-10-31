-- CreateEnum
CREATE TYPE "DhikrCategory" AS ENUM ('MORNING_EVENING', 'SLEEP', 'WAKING', 'AFTER_PRAYER', 'FOOD', 'ENTRY_EXIT', 'TRAVEL', 'GENERAL');

-- CreateEnum
CREATE TYPE "HadithStatus" AS ENUM ('ASSIGNED', 'PRACTICING', 'READY', 'SUBMITTED', 'MASTERED', 'NEEDS_RETRY');

-- CreateEnum
CREATE TYPE "PlacementStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED');

-- CreateEnum
CREATE TYPE "AyahStatus" AS ENUM ('NOT_STARTED', 'PRACTICING', 'READY', 'RECITED', 'NEEDS_REVIEW', 'MASTERED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "QuestionType" ADD VALUE 'TRUE_FALSE';
ALTER TYPE "QuestionType" ADD VALUE 'COMPLETE_TEXT';
ALTER TYPE "QuestionType" ADD VALUE 'ORDER';
ALTER TYPE "QuestionType" ADD VALUE 'RECITATION';
ALTER TYPE "QuestionType" ADD VALUE 'ORAL';

-- DropIndex
DROP INDEX "assessment_attempts_assessmentId_studentId_key";

-- AlterTable
ALTER TABLE "assessment_answers" ADD COLUMN     "fileId" TEXT;

-- AlterTable
ALTER TABLE "assessment_attempts" ADD COLUMN     "attemptNo" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "questionOrder" JSONB;

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "track" TEXT;

-- CreateTable
CREATE TABLE "adhkar" (
    "id" TEXT NOT NULL,
    "externalRef" TEXT,
    "category" "DhikrCategory" NOT NULL,
    "titleAr" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "repeat" INTEGER,
    "sourceName" TEXT NOT NULL,
    "takhrij" TEXT,
    "explanation" TEXT,
    "explanationSource" TEXT,
    "audioUrl" TEXT,
    "licenseNote" TEXT NOT NULL,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "adhkar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adhkar_favorites" (
    "userId" TEXT NOT NULL,
    "dhikrId" TEXT NOT NULL,

    CONSTRAINT "adhkar_favorites_pkey" PRIMARY KEY ("userId","dhikrId")
);

-- CreateTable
CREATE TABLE "adhkar_preferences" (
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Riyadh',
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "morningMin" INTEGER DEFAULT 420,
    "eveningMin" INTEGER DEFAULT 1020,
    "sleepMin" INTEGER,
    "wakeMin" INTEGER,
    "days" INTEGER[] DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6]::INTEGER[],
    "dndStartMin" INTEGER,
    "dndEndMin" INTEGER,
    "minIntervalMin" INTEGER NOT NULL DEFAULT 60,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT false,
    "usePrayerTimes" BOOLEAN NOT NULL DEFAULT false,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "calcMethod" TEXT NOT NULL DEFAULT 'UmmAlQura',
    "lastSentAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "adhkar_preferences_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adhkar_notification_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "adhkar_notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hadith_collections" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "descriptionAr" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "licenseNote" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hadith_collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hadith_entries" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "narrator" TEXT,
    "sourceRef" TEXT,
    "topic" TEXT,
    "grade" TEXT,
    "gradeSource" TEXT,
    "explanation" TEXT,
    "explanationSource" TEXT,
    "vocabulary" JSONB,
    "benefits" TEXT,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "hadith_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hadith_memorizations" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "hadithId" TEXT NOT NULL,
    "status" "HadithStatus" NOT NULL DEFAULT 'ASSIGNED',
    "assignedById" TEXT,
    "reciteBy" DATE,
    "ease" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "intervalDays" INTEGER NOT NULL DEFAULT 1,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "nextReviewAt" DATE,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hadith_memorizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hadith_submissions" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "hadithId" TEXT NOT NULL,
    "fileId" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "consentGivenBy" TEXT NOT NULL,
    "deleteAfter" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hadith_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hadith_reviews" (
    "id" TEXT NOT NULL,
    "memorizationId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "memorizationScore" INTEGER NOT NULL,
    "understandingScore" INTEGER NOT NULL,
    "decision" "ReviewDecision" NOT NULL,
    "mistakes" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hadith_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "placement_assessments" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "PlacementStatus" NOT NULL DEFAULT 'DRAFT',
    "stage" INTEGER NOT NULL DEFAULT 1,
    "intake" JSONB NOT NULL DEFAULT '{}',
    "tajweedAnswers" JSONB NOT NULL DEFAULT '{}',
    "tajweedPercent" INTEGER,
    "memorizationAnswers" JSONB NOT NULL DEFAULT '{}',
    "memorizationPercent" INTEGER,
    "readingFileId" TEXT,
    "memorizationFileId" TEXT,
    "recommendedTrack" TEXT,
    "approvedTrack" TEXT,
    "teacherNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "placement_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_skills" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "assessedById" TEXT,
    "assessmentId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitions" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "ageGroup" TEXT,
    "conditions" TEXT,
    "criteria" TEXT NOT NULL,
    "resultsMethod" TEXT NOT NULL,
    "prizes" TEXT,
    "registrationOpensAt" TIMESTAMP(3) NOT NULL,
    "registrationClosesAt" TIMESTAMP(3) NOT NULL,
    "examStartsAt" TIMESTAMP(3) NOT NULL,
    "examEndsAt" TIMESTAMP(3) NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "randomize" BOOLEAN NOT NULL DEFAULT true,
    "leaderboardEnabled" BOOLEAN NOT NULL DEFAULT false,
    "resultsPublished" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "assessmentId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competition_registrations" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "showOnLeaderboard" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competition_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_events" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_appeals" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "decision" TEXT,
    "decidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_appeals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ayah_progress" (
    "studentId" TEXT NOT NULL,
    "ayahId" INTEGER NOT NULL,
    "status" "AyahStatus" NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ayah_progress_pkey" PRIMARY KEY ("studentId","ayahId")
);

-- CreateTable
CREATE TABLE "ayah_notes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ayahId" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ayah_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_progress" (
    "studentId" TEXT NOT NULL,
    "ruleSlug" TEXT NOT NULL,
    "scorePercent" INTEGER,
    "completedAt" TIMESTAMP(3),
    "teacherNote" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_progress_pkey" PRIMARY KEY ("studentId","ruleSlug")
);

-- CreateTable
CREATE TABLE "tafsir_progress" (
    "studentId" TEXT NOT NULL,
    "surahId" INTEGER NOT NULL,
    "ayahUpTo" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tafsir_progress_pkey" PRIMARY KEY ("studentId","surahId")
);

-- CreateIndex
CREATE UNIQUE INDEX "adhkar_externalRef_key" ON "adhkar"("externalRef");

-- CreateIndex
CREATE INDEX "adhkar_category_reviewStatus_sortOrder_idx" ON "adhkar"("category", "reviewStatus", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_userId_idx" ON "push_subscriptions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "adhkar_notification_logs_userId_slot_localDate_key" ON "adhkar_notification_logs"("userId", "slot", "localDate");

-- CreateIndex
CREATE UNIQUE INDEX "hadith_collections_slug_key" ON "hadith_collections"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "hadith_entries_collectionId_number_key" ON "hadith_entries"("collectionId", "number");

-- CreateIndex
CREATE INDEX "hadith_memorizations_studentId_nextReviewAt_idx" ON "hadith_memorizations"("studentId", "nextReviewAt");

-- CreateIndex
CREATE UNIQUE INDEX "hadith_memorizations_studentId_hadithId_key" ON "hadith_memorizations"("studentId", "hadithId");

-- CreateIndex
CREATE INDEX "hadith_submissions_status_createdAt_idx" ON "hadith_submissions"("status", "createdAt");

-- CreateIndex
CREATE INDEX "hadith_reviews_studentId_createdAt_idx" ON "hadith_reviews"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "placement_assessments_studentId_status_idx" ON "placement_assessments"("studentId", "status");

-- CreateIndex
CREATE INDEX "placement_assessments_status_updatedAt_idx" ON "placement_assessments"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "student_skills_studentId_skill_createdAt_idx" ON "student_skills"("studentId", "skill", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "competitions_slug_key" ON "competitions"("slug");

-- CreateIndex
CREATE INDEX "competitions_published_examStartsAt_idx" ON "competitions"("published", "examStartsAt");

-- CreateIndex
CREATE UNIQUE INDEX "competition_registrations_competitionId_studentId_key" ON "competition_registrations"("competitionId", "studentId");

-- CreateIndex
CREATE INDEX "exam_events_attemptId_createdAt_idx" ON "exam_events"("attemptId", "createdAt");

-- CreateIndex
CREATE INDEX "exam_appeals_status_createdAt_idx" ON "exam_appeals"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ayah_progress_studentId_status_idx" ON "ayah_progress"("studentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ayah_notes_userId_ayahId_key" ON "ayah_notes"("userId", "ayahId");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_attempts_assessmentId_studentId_attemptNo_key" ON "assessment_attempts"("assessmentId", "studentId", "attemptNo");

-- AddForeignKey
ALTER TABLE "adhkar_favorites" ADD CONSTRAINT "adhkar_favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adhkar_favorites" ADD CONSTRAINT "adhkar_favorites_dhikrId_fkey" FOREIGN KEY ("dhikrId") REFERENCES "adhkar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adhkar_preferences" ADD CONSTRAINT "adhkar_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adhkar_notification_logs" ADD CONSTRAINT "adhkar_notification_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hadith_entries" ADD CONSTRAINT "hadith_entries_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "hadith_collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hadith_memorizations" ADD CONSTRAINT "hadith_memorizations_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hadith_memorizations" ADD CONSTRAINT "hadith_memorizations_hadithId_fkey" FOREIGN KEY ("hadithId") REFERENCES "hadith_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hadith_submissions" ADD CONSTRAINT "hadith_submissions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hadith_submissions" ADD CONSTRAINT "hadith_submissions_hadithId_fkey" FOREIGN KEY ("hadithId") REFERENCES "hadith_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hadith_submissions" ADD CONSTRAINT "hadith_submissions_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hadith_reviews" ADD CONSTRAINT "hadith_reviews_memorizationId_fkey" FOREIGN KEY ("memorizationId") REFERENCES "hadith_memorizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_assessments" ADD CONSTRAINT "placement_assessments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_skills" ADD CONSTRAINT "student_skills_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_skills" ADD CONSTRAINT "student_skills_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "placement_assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition_registrations" ADD CONSTRAINT "competition_registrations_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition_registrations" ADD CONSTRAINT "competition_registrations_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_events" ADD CONSTRAINT "exam_events_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "assessment_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_appeals" ADD CONSTRAINT "exam_appeals_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "assessment_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ayah_progress" ADD CONSTRAINT "ayah_progress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ayah_progress" ADD CONSTRAINT "ayah_progress_ayahId_fkey" FOREIGN KEY ("ayahId") REFERENCES "quran_ayahs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ayah_notes" ADD CONSTRAINT "ayah_notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ayah_notes" ADD CONSTRAINT "ayah_notes_ayahId_fkey" FOREIGN KEY ("ayahId") REFERENCES "quran_ayahs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tafsir_progress" ADD CONSTRAINT "tafsir_progress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- V3 authorization. Personal rows belong to their user. Student rows follow the existing read
-- rules, and writes go through services that check the same functions first.
GRANT SELECT ON adhkar, hadith_collections, hadith_entries, competitions TO dar_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON adhkar_favorites, adhkar_preferences, push_subscriptions, ayah_notes TO dar_app;
GRANT SELECT ON adhkar_notification_logs TO dar_app;
GRANT SELECT ON hadith_memorizations, hadith_submissions, hadith_reviews, placement_assessments, student_skills,
  competition_registrations, ayah_progress, lesson_progress, tafsir_progress TO dar_app;
GRANT SELECT ON exam_events, exam_appeals TO dar_app;
GRANT SELECT ("fileId") ON assessment_answers TO dar_app;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['adhkar_favorites','adhkar_preferences','push_subscriptions','ayah_notes']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY own ON %I FOR ALL TO dar_app USING ("userId" = app.uid()) WITH CHECK ("userId" = app.uid())', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['hadith_memorizations','hadith_submissions','hadith_reviews','placement_assessments','student_skills',
    'competition_registrations','ayah_progress','lesson_progress','tafsir_progress','exam_appeals']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY read_scope ON %I FOR SELECT TO dar_app USING (app.can_read_student("studentId"))', t);
  END LOOP;
END $$;
ALTER TABLE adhkar_notification_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY own ON adhkar_notification_logs FOR SELECT TO dar_app USING ("userId" = app.uid());
ALTER TABLE exam_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY staff ON exam_events FOR SELECT TO dar_app USING (app.has_perm('assessments.manage'));

-- Pending or unpublished religious content is invisible to the application role for everyone
-- except people who review it.
ALTER TABLE adhkar ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_approved ON adhkar FOR SELECT TO dar_app USING ("reviewStatus" = 'APPROVED' OR app.has_perm('scholarly.review') OR app.has_perm('content.manage'));
ALTER TABLE hadith_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_approved ON hadith_entries FOR SELECT TO dar_app USING ("reviewStatus" = 'APPROVED' OR app.has_perm('scholarly.review') OR app.has_perm('content.manage'));
ALTER TABLE hadith_collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_published ON hadith_collections FOR SELECT TO dar_app USING (published OR app.has_perm('content.manage'));
ALTER TABLE competitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_published ON competitions FOR SELECT TO dar_app USING (published OR app.has_perm('assessments.manage'));
