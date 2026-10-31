// Shared, browser-safe definitions for the configurable public site.
export type HomeSettings = { heroTitleAr?: string; heroTextAr?: string; ctaPrimaryAr?: string; ctaFinalAr?: string; hidden?: string[] };
export type SeoSettings = { descriptionAr?: string; descriptionEn?: string };
export type SocialSettings = { youtube?: string; x?: string; facebook?: string; instagram?: string };

export const HOME_SECTIONS: [string, string, string][] = [
  ["welcome", "التعريف بالدار", "Welcome"], ["programs", "البرامج", "Programs"], ["placement", "اكتشف مستواك", "Placement"], ["showcase", "المصحف التفاعلي", "Mushaf showcase"],
  ["journey", "رحلة التعلم", "Learning journey"], ["dashboard", "معاينة اللوحة", "Dashboard preview"], ["assistant", "المساعد الذكي", "AI assistant"], ["live", "الفصول المباشرة", "Live classes"],
  ["library", "المكتبة", "Library"], ["certificates", "الشهادات", "Certificates"], ["news", "الأخبار", "News"], ["experience", "الطالب وولي الأمر", "Student and guardian"], ["faq", "الأسئلة الشائعة", "FAQ"],
];
