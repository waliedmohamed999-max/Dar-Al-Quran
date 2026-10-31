import type { MetadataRoute } from "next";
import { systemDb } from "@/lib/db";
import { approved } from "@/lib/scholarly";

const base = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = systemDb();
  const statics = ["", "/about", "/programs", "/mushaf", "/tajweed", "/tafsir", "/teachers", "/academy", "/library", "/news", "/verify", "/contact", "/privacy", "/terms"];
  const [rules, content, programs] = await Promise.all([
    db.tajweedRule.findMany({ where: { ...approved() }, select: { slug: true } }),
    db.contentPage.findMany({ where: { status: "PUBLISHED", type: { in: ["ARTICLE", "NEWS"] } }, select: { slug: true, locale: true, updatedAt: true } }),
    db.program.findMany({ where: { published: true }, select: { slug: true } }),
  ]);
  const both = (path: string) => [{ url: `${base()}${path}` }, { url: `${base()}/en${path}` }];
  return [
    ...statics.flatMap(both),
    ...Array.from({ length: 114 }, (_, i) => both(`/mushaf/surah/${i + 1}`)).flat(),
    ...rules.flatMap((r) => both(`/tajweed/${r.slug}`)),
    ...programs.flatMap((p) => both(`/programs/${p.slug}`)),
    ...content.map((c) => ({ url: `${base()}${c.locale === "en" ? "/en" : ""}/articles/${c.slug}`, lastModified: c.updatedAt })),
  ];
}
