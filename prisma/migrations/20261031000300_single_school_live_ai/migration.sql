-- The platform serves one school under central administration, so branches are removed.
-- A branch name is kept as the halaqa's location when it has none, and duplicate role rows
-- merge. A role that was scoped to a branch becomes a school-wide role.
UPDATE halaqas h SET location = b.name FROM branches b WHERE h."branchId" = b.id AND h.location IS NULL;
DELETE FROM user_roles a USING user_roles b WHERE a.ctid > b.ctid AND a."userId" = b."userId" AND a."roleId" = b."roleId";
DELETE FROM permissions WHERE key = 'branches.manage';

DROP POLICY manage ON students;
DROP POLICY manage ON halaqas;
DROP POLICY manage ON branches;
DROP POLICY read_all ON branches;

CREATE OR REPLACE FUNCTION app.is_staff_for_student(sid text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM students s WHERE s.id = sid) AND app.has_perm('students.view_all')
$$;
CREATE OR REPLACE FUNCTION app.can_manage_halaqa(hid text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM halaqas h WHERE h.id = hid) AND app.has_perm('halaqas.manage')
$$;
DROP FUNCTION app.has_perm_in_branch(text, text);

CREATE POLICY manage ON students FOR ALL TO dar_app USING (app.has_perm('users.manage')) WITH CHECK (app.has_perm('users.manage'));
CREATE POLICY manage ON halaqas FOR ALL TO dar_app USING (app.has_perm('halaqas.manage')) WITH CHECK (app.has_perm('halaqas.manage'));

-- CreateEnum
CREATE TYPE "AiStatus" AS ENUM ('ANSWERED', 'SOURCES_ONLY', 'REFERRED', 'RESOLVED');

-- AlterEnum
ALTER TYPE "ContentType" ADD VALUE 'LIBRARY';

-- DropForeignKey
ALTER TABLE "halaqas" DROP CONSTRAINT "halaqas_branchId_fkey";

-- DropForeignKey
ALTER TABLE "students" DROP CONSTRAINT "students_branchId_fkey";

-- DropForeignKey
ALTER TABLE "teachers" DROP CONSTRAINT "teachers_branchId_fkey";

-- DropForeignKey
ALTER TABLE "user_roles" DROP CONSTRAINT "user_roles_branchId_fkey";

-- DropIndex
DROP INDEX "halaqas_branchId_idx";

-- DropIndex
DROP INDEX "students_branchId_idx";

-- DropIndex
DROP INDEX "teachers_branchId_idx";

-- DropIndex
DROP INDEX "user_roles_branchId_idx";

-- DropIndex
DROP INDEX "user_roles_userId_roleId_branchId_key";

-- AlterTable
ALTER TABLE "halaqa_sessions" ADD COLUMN     "isOnline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "liveRoom" TEXT,
ADD COLUMN     "recordingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sharedAyah" INTEGER,
ADD COLUMN     "sharedSurah" INTEGER;

-- AlterTable
ALTER TABLE "halaqas" DROP COLUMN "branchId";

-- AlterTable
ALTER TABLE "messages" ALTER COLUMN "studentId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "aiDraft" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "students" DROP COLUMN "branchId",
ADD COLUMN     "aiConsentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "teachers" DROP COLUMN "branchId";

-- AlterTable
ALTER TABLE "user_roles" DROP COLUMN "branchId";

-- DropTable
DROP TABLE "branches";

-- CreateTable
CREATE TABLE "live_joins" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_joins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_interactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "studentId" TEXT,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "citations" JSONB NOT NULL DEFAULT '[]',
    "status" "AiStatus" NOT NULL,
    "model" TEXT,
    "teacherReply" TEXT,
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "live_joins_sessionId_userId_key" ON "live_joins"("sessionId", "userId");

-- CreateIndex
CREATE INDEX "ai_interactions_userId_createdAt_idx" ON "ai_interactions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_interactions_status_createdAt_idx" ON "ai_interactions"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "halaqa_sessions_liveRoom_key" ON "halaqa_sessions"("liveRoom");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_userId_roleId_key" ON "user_roles"("userId", "roleId");

-- AddForeignKey
ALTER TABLE "live_joins" ADD CONSTRAINT "live_joins_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "halaqa_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_joins" ADD CONSTRAINT "live_joins_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_interactions" ADD CONSTRAINT "ai_interactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Live classes and AI. Writes go through server code after its checks; reads are scoped here.
GRANT SELECT ON live_joins, ai_interactions TO dar_app;
ALTER TABLE live_joins ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_scope ON live_joins FOR SELECT TO dar_app USING (
  "userId" = app.uid() OR EXISTS (SELECT 1 FROM halaqa_sessions s WHERE s.id = "sessionId" AND (app.teaches_halaqa(s."halaqaId") OR app.can_manage_halaqa(s."halaqaId"))));
ALTER TABLE ai_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_scope ON ai_interactions FOR SELECT TO dar_app USING (
  "userId" = app.uid() OR app.has_perm('ai.manage') OR ("studentId" IS NOT NULL AND app.teaches_student("studentId")));
