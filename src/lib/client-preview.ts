// Synthetic public content only. No accounts or copied customer records.
export const previewPrograms = [
  ["memorization", "حفظ القرآن الكريم", "Quran memorization", "خطة حفظ متدرجة مع متابعة المعلم ومراجعة يومية."],
  ["recitation", "تصحيح التلاوة", "Correct recitation", "تعلم القراءة الصحيحة وتحسين الأداء خطوة بخطوة."],
  ["tajweed", "أحكام التجويد", "Tajweed", "دروس مبسطة وتدريبات عملية بإشراف المعلم."],
  ["revision", "تثبيت الحفظ والمراجعة", "Revision", "برنامج منتظم للمراجعة وتثبيت ما تم حفظه."],
  ["young-readers", "براعم القرآن", "Young readers", "رحلة تعليمية مناسبة للأطفال لتعلم القراءة والحفظ."],
  ["adult-learning", "تعليم الكبار", "Adult learning", "بداية ميسرة لتعلم القراءة والتلاوة في مواعيد مرنة."],
].map(([slug, titleAr, titleEn, summaryAr], sortOrder) => ({
  id: `preview-${slug}`, slug, titleAr, titleEn, summaryAr,
  summaryEn: "A guided learning program with teacher feedback and regular practice.",
  featured: true, published: true, sortOrder,
}));
