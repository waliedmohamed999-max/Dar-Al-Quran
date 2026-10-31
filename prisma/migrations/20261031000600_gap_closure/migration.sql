-- CreateEnum
CREATE TYPE "StudyResourceKind" AS ENUM ('VOCABULARY', 'ASBAB', 'TOPIC');

-- CreateEnum
CREATE TYPE "JudgingStatus" AS ENUM ('SCHEDULED', 'OPEN', 'CLOSED', 'APPROVED');

-- CreateEnum
CREATE TYPE "JudgingEntryStatus" AS ENUM ('WAITING', 'ON_STAGE', 'DONE', 'ABSENT');

-- AlterTable
ALTER TABLE "adhkar" ADD COLUMN     "audioLicense" TEXT,
ADD COLUMN     "audioSource" TEXT,
ADD COLUMN     "quoteCheck" JSONB,
ADD COLUMN     "quoteCheckedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "certificates" ADD COLUMN     "evidenceId" TEXT,
ADD COLUMN     "evidenceType" TEXT;

-- AlterTable
ALTER TABLE "exam_appeals" ADD COLUMN     "judgingEntryId" TEXT,
ADD COLUMN     "newScore" INTEGER,
ADD COLUMN     "previousScore" INTEGER,
ALTER COLUMN "attemptId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "hadith_collections" ADD COLUMN     "finalCompetitionId" TEXT;

-- AlterTable
ALTER TABLE "memorization_records" ADD COLUMN     "difficulty" INTEGER,
ADD COLUMN     "difficultyNote" TEXT,
ADD COLUMN     "difficultySetAt" TIMESTAMP(3),
ADD COLUMN     "difficultySetById" TEXT;

-- AlterTable
ALTER TABLE "placement_assessments" ADD COLUMN     "practiceCompletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "tajweed_rules" ADD COLUMN     "audioUrl" TEXT,
ADD COLUMN     "mediaLicense" TEXT,
ADD COLUMN     "mediaSource" TEXT,
ADD COLUMN     "videoUrl" TEXT;

-- CreateTable
CREATE TABLE "ayah_word_timings" (
    "recitationId" INTEGER NOT NULL,
    "surahId" INTEGER NOT NULL,
    "ayahNumber" INTEGER NOT NULL,
    "segments" JSONB NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "ayah_word_timings_pkey" PRIMARY KEY ("recitationId","surahId","ayahNumber")
);

-- CreateTable
CREATE TABLE "study_resources" (
    "id" TEXT NOT NULL,
    "kind" "StudyResourceKind" NOT NULL,
    "surahId" INTEGER NOT NULL,
    "fromAyah" INTEGER NOT NULL,
    "toAyah" INTEGER NOT NULL,
    "term" TEXT,
    "body" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "licenseNote" TEXT NOT NULL,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rubrics" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rubrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rubric_criteria" (
    "id" TEXT NOT NULL,
    "rubricId" TEXT NOT NULL,
    "labelAr" TEXT NOT NULL,
    "labelEn" TEXT,
    "guidanceAr" TEXT NOT NULL,
    "maxScore" INTEGER NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rubric_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "judging_sessions" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "rubricId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "passPercent" INTEGER NOT NULL DEFAULT 60,
    "status" "JudgingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "judging_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "judging_judges" (
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "judging_judges_pkey" PRIMARY KEY ("sessionId","userId")
);

-- CreateTable
CREATE TABLE "judging_entries" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "status" "JudgingEntryStatus" NOT NULL DEFAULT 'WAITING',
    "finalPercent" INTEGER,

    CONSTRAINT "judging_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "judging_scores" (
    "entryId" TEXT NOT NULL,
    "judgeId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "judging_scores_pkey" PRIMARY KEY ("entryId","judgeId","criterionId")
);

-- CreateIndex
CREATE INDEX "study_resources_surahId_kind_reviewStatus_idx" ON "study_resources"("surahId", "kind", "reviewStatus");

-- CreateIndex
CREATE INDEX "judging_sessions_competitionId_idx" ON "judging_sessions"("competitionId");

-- CreateIndex
CREATE UNIQUE INDEX "judging_entries_sessionId_studentId_key" ON "judging_entries"("sessionId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "judging_entries_sessionId_code_key" ON "judging_entries"("sessionId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_studentId_evidenceType_evidenceId_key" ON "certificates"("studentId", "evidenceType", "evidenceId");

-- CreateIndex
CREATE UNIQUE INDEX "hadith_collections_finalCompetitionId_key" ON "hadith_collections"("finalCompetitionId");

-- AddForeignKey
ALTER TABLE "ayah_word_timings" ADD CONSTRAINT "ayah_word_timings_recitationId_fkey" FOREIGN KEY ("recitationId") REFERENCES "recitations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rubric_criteria" ADD CONSTRAINT "rubric_criteria_rubricId_fkey" FOREIGN KEY ("rubricId") REFERENCES "rubrics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judging_sessions" ADD CONSTRAINT "judging_sessions_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "competitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judging_sessions" ADD CONSTRAINT "judging_sessions_rubricId_fkey" FOREIGN KEY ("rubricId") REFERENCES "rubrics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judging_judges" ADD CONSTRAINT "judging_judges_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "judging_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judging_entries" ADD CONSTRAINT "judging_entries_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "judging_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judging_entries" ADD CONSTRAINT "judging_entries_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judging_scores" ADD CONSTRAINT "judging_scores_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "judging_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judging_scores" ADD CONSTRAINT "judging_scores_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "rubric_criteria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Scores, entries and study drafts are reached only through services after their permission checks.
-- RLS with no policy and no grant denies the restricted application role outright.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ayah_word_timings','study_resources','rubrics','rubric_criteria','judging_sessions','judging_judges','judging_entries','judging_scores'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON %I FROM dar_app', t);
  END LOOP;
END $$;
