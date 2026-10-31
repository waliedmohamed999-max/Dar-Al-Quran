-- Data minimization: birth date is not collected; isMinor is enough for consent rules.
ALTER TABLE "students" DROP COLUMN "birthDateEnc";
