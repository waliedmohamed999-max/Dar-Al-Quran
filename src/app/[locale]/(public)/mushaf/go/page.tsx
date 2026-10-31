import { redirect } from "next/navigation";
import { pageCtx, type PageParams, type SearchProps } from "@/lib/page";

export default async function Go({ params, searchParams }: PageParams & SearchProps) {
  const { lp } = await pageCtx(params);
  const sp = await searchParams;
  const surah = Math.min(114, Math.max(1, Number(sp.surah) || 1));
  redirect(lp(`/mushaf/surah/${surah}?ayah=${Math.max(1, Number(sp.ayah) || 1)}`));
}
