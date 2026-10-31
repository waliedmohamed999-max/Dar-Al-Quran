import { systemDb } from "@/lib/db";
import { env } from "@/lib/env";
import { deleteObject } from "@/lib/storage";
import { addDays } from "./srs";

/**
 * Removes recordings past their date. Students consent to this limit for every recording, so the sweep
 * covers recitations, hadith, placement and exam audio. The database row survives without the audio.
 */
export async function purgeExpiredRecordings(now = new Date()) {
  const db = systemDb();
  const cutoff = addDays(now, -env.recordingRetentionDays);
  const remove = async (file: { id: string; storageKey: string }) => {
    await deleteObject(file.storageKey);
    await db.file.update({ where: { id: file.id }, data: { deletedAt: now } });
  };
  let removed = 0;
  const recitations = await db.recitationSubmission.findMany({ where: { deleteAfter: { lt: now }, status: { not: "DELETED" } }, include: { file: true }, take: 500 });
  for (const s of recitations) {
    try {
      if (s.file && !s.file.deletedAt) { await remove(s.file); removed += 1; }
      await db.recitationSubmission.update({ where: { id: s.id }, data: { status: "DELETED" } });
    } catch (e) { console.error("[retention] recitation", s.id, (e as Error).name); }
  }
  const hadith = await db.hadithSubmission.findMany({ where: { deleteAfter: { lt: now }, status: { not: "DELETED" } }, take: 500 });
  for (const s of hadith) await db.hadithSubmission.update({ where: { id: s.id }, data: { status: "DELETED" } });
  // Everything else, including placement and exam audio, has no row of its own to carry a date.
  const files = await db.file.findMany({ where: { kind: "RECITATION", deletedAt: null, createdAt: { lt: cutoff } }, take: 1000 });
  for (const f of files) {
    try { await remove(f); removed += 1; } catch (e) { console.error("[retention] file", f.id, (e as Error).name); }
  }
  return { removed, recitations: recitations.length, hadith: hadith.length };
}
