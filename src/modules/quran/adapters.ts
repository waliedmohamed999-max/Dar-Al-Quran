// External Quran content sits behind these interfaces, so providers can change without touching
// the application. Terms and cache limits per provider: docs/DATA_LICENSES.md
import { toPlainText } from "@/lib/sanitize";

export interface TafsirAdapter {
  fetchAyah(ref: string, surah: number, ayah: number): Promise<string | null>;
}

export interface TimingAdapter {
  fetchSurah(ref: string, surah: number): Promise<{ audioUrl: string; ayahs: { ayah: number; startMs: number; endMs: number }[] } | null>;
}

const base = () => process.env.QF_API_BASE_URL ?? "https://api.quran.com/api/v4";
let token: { value: string; expires: number } | undefined;

async function qfHeaders(): Promise<Record<string, string>> {
  const { QF_CLIENT_ID: id, QF_CLIENT_SECRET: secret, QF_TOKEN_URL: url } = process.env;
  if (!id || !secret || !url) return {};
  if (!token || token.expires < Date.now()) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}` },
      body: "grant_type=client_credentials&scope=content",
    });
    if (!res.ok) throw new Error(`token request failed: ${res.status}`);
    const j = (await res.json()) as { access_token: string; expires_in: number };
    token = { value: j.access_token, expires: Date.now() + (j.expires_in - 60) * 1000 };
  }
  return { "x-auth-token": token.value, "x-client-id": id };
}

export const qfTafsir: TafsirAdapter = {
  async fetchAyah(ref, surah, ayah) {
    const id = ref.replace(/^qf:/, "");
    const res = await fetch(`${base()}/tafsirs/${id}/by_ayah/${surah}:${ayah}`, { headers: await qfHeaders(), signal: AbortSignal.timeout(10000) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`tafsir provider: ${res.status}`);
    const j = (await res.json()) as { tafsir?: { text?: string } };
    return j.tafsir?.text ? toPlainText(j.tafsir.text) : null;
  },
};

export const qfTiming: TimingAdapter = {
  async fetchSurah(ref, surah) {
    const id = ref.replace(/^qf:/, "");
    const res = await fetch(`${base()}/chapter_recitations/${id}/${surah}?segments=true`, { headers: await qfHeaders(), signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { audio_file?: { audio_url: string; timestamps?: { verse_key: string; timestamp_from: number; timestamp_to: number }[] } };
    if (!j.audio_file?.timestamps?.length) return null;
    return {
      audioUrl: j.audio_file.audio_url,
      ayahs: j.audio_file.timestamps.map((t) => ({ ayah: Number(t.verse_key.split(":")[1]), startMs: t.timestamp_from, endMs: t.timestamp_to })),
    };
  },
};

export const tafsirAdapterFor = (ref: string): TafsirAdapter => {
  if (ref.startsWith("qf:")) return qfTafsir;
  throw new Error(`unknown tafsir adapter: ${ref}`);
};

export function buildAudioUrl(template: string, surah: number, ayah: number, absolute: number): string {
  return template
    .replace("{sss}", String(surah).padStart(3, "0"))
    .replace("{aaa}", String(ayah).padStart(3, "0"))
    .replace("{n}", String(absolute));
}
