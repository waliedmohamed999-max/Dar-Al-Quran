import { redirect } from "next/navigation";
import { guard, pageCtx, type PageParams } from "@/lib/page";

export default async function Dashboard({ params }: PageParams) {
  const { locale, lp } = await pageCtx(params);
  const a = await guard(locale);
  const keys = a.roles.map((r) => r.key);
  if (keys.some((k) => ["super_admin", "admin", "supervisor"].includes(k))) redirect(lp("/admin"));
  if (a.teacherId) redirect(lp("/teacher"));
  if (a.guardianId) redirect(lp("/guardian"));
  if (a.studentId) redirect(lp("/student"));
  redirect(lp("/account"));
}
