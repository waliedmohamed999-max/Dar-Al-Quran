export const SKILL_LABELS: Record<string, [string, string]> = {
  reading_accuracy: ["سلامة القراءة", "Reading accuracy"], reading_fluency: ["طلاقة القراءة", "Reading fluency"], tajweed_knowledge: ["معرفة التجويد", "Tajweed knowledge"], tajweed_application: ["تطبيق التجويد", "Tajweed application"],
  memorization: ["الحفظ", "Memorization"], memorization_retention: ["ثبات الحفظ", "Memorization retention"], quran_understanding: ["فهم القرآن", "Quran understanding"],
};
export const TRACK_LABELS: Record<string, [string, string]> = {
  foundation: ["التأسيس", "Foundation"], recitation_correction: ["تصحيح التلاوة", "Recitation correction"], memorization_beginner: ["الحفظ المبتدئ", "Beginner memorization"], memorization_intermediate: ["الحفظ المتوسط", "Intermediate memorization"],
  memorization_advanced: ["الحفظ المتقدم", "Advanced memorization"], consolidation: ["تثبيت المحفوظ", "Consolidation"], tajweed_mastery: ["إتقان التجويد", "Tajweed mastery"], advanced_exam_prep: ["التأهيل لاختبارات الحفظ المتقدمة", "Advanced exam preparation"],
};
export const AYAH_STATUS: Record<string, [string, string]> = {
  NOT_STARTED: ["لم تبدأ", "Not started"], PRACTICING: ["قيد التدريب", "Practising"], READY: ["جاهزة للتسميع", "Ready to recite"], RECITED: ["تم تسميعها", "Recited"], NEEDS_REVIEW: ["تحتاج مراجعة", "Needs review"], MASTERED: ["متقنة باعتماد المعلم", "Mastered, teacher approved"],
};
/** General study steps by skill, not a ruling or a level decision. Offered for the weakest rated skills. */
export const SKILL_ADVICE: Record<string, [string, string]> = {
  reading_accuracy: ["ركز على تصحيح القراءة مع المعلم قبل زيادة مقدار الحفظ.", "Work on correct reading with your teacher before increasing memorization."],
  reading_fluency: ["اقرأ يومياً مع الاستماع إلى قارئ في وضع الاستماع بالمصحف.", "Read daily while listening to a reciter in the mushaf's listen mode."],
  tajweed_knowledge: ["ابدأ دروس أكاديمية التجويد من المستوى المناسب.", "Start the tajweed academy lessons at a suitable level."],
  tajweed_application: ["سجل تلاوتك واطلب ملاحظة المعلم على تطبيق الأحكام.", "Record your recitation and ask your teacher for feedback on application."],
  memorization: ["اختر مقداراً يومياً صغيراً واستخدم وضع الحفظ بالإخفاء المتدرج.", "Choose a small daily amount and use the memorize mode's gradual hiding."],
  memorization_retention: ["قدم المراجعة على الجديد، واتبع أولويات المراجعة المقترحة.", "Put revision before new portions and follow the suggested revision priorities."],
  quran_understanding: ["ادرس السورة التي تحفظها في مركز التفسير من مصادر معتمدة.", "Study the surah you are memorizing in the tafsir centre from approved sources."],
};
export const REVISION_REASONS: Record<string, [string, string]> = {
  overdue: ["تأخرت مراجعته", "Overdue"], weak_results: ["نتائج ضعيفة", "Weak results"], recent_failure: ["تعثر حديث", "Recent difficulty"],
  new_segment: ["مقطع جديد", "New segment"], long_segment: ["مقطع طويل", "Long segment"], teacher_difficulty: ["صعوبة حددها المعلم", "Teacher-rated difficulty"],
};
