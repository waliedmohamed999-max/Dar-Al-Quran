import { Empty, PageHeader } from "@/components/ui";
import { systemDb } from "@/lib/db";
import { pageCtx, type PageParams } from "@/lib/page";

export const metadata = { title: "المعلمون | Teachers" };

export default async function Teachers({ params }: PageParams) {
  const { t } = await pageCtx(params);
  // Only teachers who opted in appear publicly, and only their name and bio.
  const teachers = await systemDb().teacher.findMany({ where: { isPublic: true, user: { status: "ACTIVE" } }, select: { id: true, bio: true, user: { select: { name: true } } } });
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <PageHeader title={t("المعلمون", "Teachers")} />
      {teachers.length === 0 ? <Empty title={t("لم تنشر ملفات المعلمين بعد.", "Teacher profiles have not been published yet.")} /> : (
        <ul className="grid gap-4 md:grid-cols-3">
          {teachers.map((x) => <li key={x.id} className="card"><h2 className="text-lg text-brand">{x.user.name}</h2>{x.bio && <p className="mt-1 text-sm text-ink-2">{x.bio}</p>}</li>)}
        </ul>
      )}
    </div>
  );
}
