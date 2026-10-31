import { systemDb } from "@/lib/db";
import { getActor } from "@/lib/session";
import { ayahsWhere, basmalaText, listRecitations, listSurahs } from "@/modules/quran/service";
import { MushafReader } from "./mushaf-reader";

export async function MushafView({ where, pageMode, initialAyahId }: { where: Parameters<typeof ayahsWhere>[0]; pageMode?: boolean; initialAyahId?: number }) {
  const [ayahs, surahs, recitations, actor, basmala] = await Promise.all([ayahsWhere(where), listSurahs(), listRecitations(), getActor(), basmalaText()]);
  // Voice practice sends audio to the browser vendor, so a minor needs the same guardian consent as recordings.
  const student = actor?.studentId ? await systemDb().student.findUnique({ where: { id: actor.studentId }, select: { isMinor: true, recordingConsentAt: true } }) : null;
  return (
    <MushafReader
      // Colours load on demand when a mode needs them, so plain reading ships only the text.
      ayahs={ayahs.map((a) => ({ ...a, spans: null }))}
      surahs={surahs.filter((s) => ayahs.some((a) => a.surahId === s.id))}
      basmala={basmala}
      recitations={recitations.map((r) => ({ slug: r.slug, urlTemplate: r.urlTemplate, nameAr: r.reciter.nameAr, nameEn: r.reciter.nameEn, style: r.style }))}
      signedIn={Boolean(actor)}
      canTrack={Boolean(actor?.studentId)}
      initialAyahId={initialAyahId}
      pageMode={pageMode}
      reciteAllowed={!student?.isMinor || Boolean(student.recordingConsentAt)}
    />
  );
}
