import { PageHeader } from "@/components/ui";
import { pageCtx, type PageParams } from "@/lib/page";
import { publicPage } from "@/modules/cms/service";

export const metadata = { title: "عن الدار | About" };

export default async function About({ params }: PageParams) {
  const { locale, t } = await pageCtx(params);
  const page = await publicPage("PAGE", "about", locale);
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <PageHeader title={page?.title ?? t("عن الدار", "About us")} />
      {page ? <div className="prose-body" dangerouslySetInnerHTML={{ __html: page.body }} /> : (
        <div className="prose-body">
          <p>{t("دار القرآن الكريم منصة تعليمية لإدارة الحلقات وتعليم القرآن الكريم وتحفيظه، تجمع الطالب والمعلم وولي الأمر والإدارة في مكان واحد.", "Dar Al-Quran is a learning platform for running halaqas and for teaching and memorizing the Quran, bringing students, teachers, guardians and administrators together.")}</p>
          <h2>{t("منهجنا", "Our approach")}</h2>
          <ul>
            <li>{t("القرار التعليمي بيد المعلم، والأنظمة أداة مساندة له.", "Educational decisions rest with the teacher; the system supports them.")}</li>
            <li>{t("لا نولّد نصوص آيات أو تفاسير، ونذكر مصدر كل محتوى علمي.", "We never generate ayah text or tafsir, and we name the source of all scholarly content.")}</li>
            <li>{t("التقدم يحسب من سجلات فعلية وليس من تقديرات.", "Progress comes from actual records, not estimates.")}</li>
            <li>{t("خصوصية الطلاب، خصوصاً الأطفال، أولوية في التصميم.", "Students' privacy, especially children's, is a design priority.")}</li>
          </ul>
        </div>
      )}
    </div>
  );
}
