// Word meanings, occasions of revelation and topics. Nothing is written by the system: staff enter text
// from a named reference, and it stays hidden until a scholarly reviewer approves it.
import { z } from "zod";
import { audit } from "@/lib/audit";
import { systemDb } from "@/lib/db";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { approved } from "@/lib/scholarly";
import type { Actor } from "@/lib/session";

export const studyResourceSchema = z.object({
  kind: z.enum(["VOCABULARY", "ASBAB", "TOPIC"]),
  surahId: z.coerce.number().int().min(1).max(114), fromAyah: z.coerce.number().int().min(1), toAyah: z.coerce.number().int().min(1),
  term: z.string().trim().max(120).optional(), body: z.string().trim().min(2).max(6000),
  sourceName: z.string().trim().min(2).max(200), sourceRef: z.string().trim().min(1).max(300), licenseNote: z.string().trim().min(2).max(300),
}).refine((r) => r.fromAyah <= r.toAyah, "invalid range").refine((r) => r.kind !== "VOCABULARY" || Boolean(r.term), "a word meaning needs its word");

export async function saveStudyResource(actor: Actor, id: string | null, input: z.infer<typeof studyResourceSchema>) {
  if (!actor.perms.has("content.manage")) throw forbidden();
  const db = systemDb();
  const surah = await db.quranSurah.findUnique({ where: { id: input.surahId } });
  if (!surah || input.toAyah > surah.ayahCount) throw badRequest("ayah_out_of_range");
  const reset = { reviewStatus: "PENDING" as const, reviewedBy: null, reviewedAt: null };
  if (id && !(await db.studyResource.findUnique({ where: { id } }))) throw notFound();
  const row = id ? await db.studyResource.update({ where: { id }, data: { ...input, ...reset } }) : await db.studyResource.create({ data: { ...input, ...reset, createdById: actor.id } });
  await audit(actor.id, id ? "study_resource.update" : "study_resource.create", "StudyResource", row.id);
  return row;
}

export const approvedStudyResources = (surahId: number) =>
  systemDb().studyResource.findMany({ where: { surahId, ...approved() }, orderBy: [{ kind: "asc" }, { fromAyah: "asc" }] });
