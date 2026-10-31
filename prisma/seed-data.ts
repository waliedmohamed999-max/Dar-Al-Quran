// Starting content. Lesson text is general reference material written for review by a qualified
// teacher: every rule is seeded PENDING and is not published in production until approved.
// No Quranic text appears here; examples are selected from the imported text.

export const TAJWEED_RULES = [
  { slug: "makharij", category: "makharij", level: 1, sortOrder: 1, markupCode: null, titleAr: "مخارج الحروف", titleEn: "Articulation points",
    bodyAr: "المخرج هو موضع خروج الحرف الذي يتميز به عن غيره. وتجمع المخارج في خمسة مواضع رئيسة: الجوف، والحلق، واللسان، والشفتان، والخيشوم. ولمعرفة مخرج الحرف يُسكَّن أو يُشدَّد وتُدخل عليه همزة وصل ثم يُصغى إلى موضع انقطاع الصوت.",
    bodyEn: "An articulation point is where a letter is produced, distinguishing it from others. They are grouped in five main areas: the oral cavity, throat, tongue, lips and nasal passage. To find a letter's point, pronounce it with sukoon or shaddah after a connecting hamzah and notice where the sound stops." },
  { slug: "sifat", category: "makharij", level: 1, sortOrder: 2, markupCode: null, titleAr: "صفات الحروف", titleEn: "Letter characteristics",
    bodyAr: "الصفة هي الكيفية التي يخرج بها الحرف عند النطق به. ومنها صفات لها ضد مثل الجهر والهمس، والشدة والرخاوة، والاستعلاء والاستفال، ومنها صفات لا ضد لها مثل الصفير والقلقلة واللين.",
    bodyEn: "A characteristic is the manner in which a letter is produced. Some have opposites, such as voicing and whispering, or elevation and lowering. Others have no opposite, such as whistling, echoing and softness." },
  { slug: "izhar", category: "noon-tanween", level: 2, sortOrder: 3, markupCode: null, titleAr: "الإظهار الحلقي", titleEn: "Clear pronunciation (Izhar)",
    bodyAr: "إذا جاء بعد النون الساكنة أو التنوين أحد حروف الحلق الستة (ء هـ ع ح غ خ) نطقت النون أو التنوين واضحين من غير غنة زائدة.",
    bodyEn: "When noon sakinah or tanween is followed by one of the six throat letters, it is pronounced clearly without extra nasalization." },
  { slug: "idgham-ghunnah", category: "noon-tanween", level: 2, sortOrder: 4, markupCode: "a", titleAr: "الإدغام بغنة", titleEn: "Merging with nasalization",
    bodyAr: "إذا جاء بعد النون الساكنة أو التنوين أحد حروف (ي ن م و) في كلمتين أدغمت النون في الحرف التالي مع غنة بمقدار حركتين.",
    bodyEn: "When noon sakinah or tanween is followed by one of ي ن م و across two words, it merges into that letter with nasalization for two counts." },
  { slug: "idgham-no-ghunnah", category: "noon-tanween", level: 2, sortOrder: 5, markupCode: "u", titleAr: "الإدغام بغير غنة", titleEn: "Merging without nasalization",
    bodyAr: "إذا جاء بعد النون الساكنة أو التنوين حرف اللام أو الراء أدغمت النون فيهما من غير غنة.",
    bodyEn: "When noon sakinah or tanween is followed by ل or ر, it merges completely without nasalization." },
  { slug: "iqlab", category: "noon-tanween", level: 2, sortOrder: 6, markupCode: "i", titleAr: "الإقلاب", titleEn: "Conversion (Iqlab)",
    bodyAr: "إذا جاء بعد النون الساكنة أو التنوين حرف الباء قلبت النون ميماً مخفاة بغنة بمقدار حركتين.",
    bodyEn: "When noon sakinah or tanween is followed by ب, the noon becomes a hidden meem with nasalization for two counts." },
  { slug: "ikhfa", category: "noon-tanween", level: 2, sortOrder: 7, markupCode: "f", titleAr: "الإخفاء الحقيقي", titleEn: "Concealment (Ikhfa)",
    bodyAr: "إذا جاء بعد النون الساكنة أو التنوين أحد الحروف الخمسة عشر الباقية أخفيت النون عند الحرف مع غنة بمقدار حركتين.",
    bodyEn: "When noon sakinah or tanween precedes one of the remaining fifteen letters, it is concealed with nasalization for two counts." },
  { slug: "ikhfa-shafawi", category: "meem", level: 2, sortOrder: 8, markupCode: "c", titleAr: "الإخفاء الشفوي", titleEn: "Labial concealment",
    bodyAr: "إذا جاء بعد الميم الساكنة حرف الباء أخفيت الميم مع غنة بمقدار حركتين.",
    bodyEn: "When meem sakinah is followed by ب, it is concealed with nasalization for two counts." },
  { slug: "idgham-shafawi", category: "meem", level: 2, sortOrder: 9, markupCode: "w", titleAr: "الإدغام الشفوي", titleEn: "Labial merging",
    bodyAr: "إذا جاء بعد الميم الساكنة ميم أخرى أدغمتا مع غنة بمقدار حركتين.",
    bodyEn: "When meem sakinah is followed by another meem, they merge with nasalization for two counts." },
  { slug: "izhar-shafawi", category: "meem", level: 2, sortOrder: 10, markupCode: null, titleAr: "الإظهار الشفوي", titleEn: "Labial clarity",
    bodyAr: "إذا جاء بعد الميم الساكنة أي حرف غير الباء والميم نطقت الميم واضحة، ويتأكد ذلك عند الواو والفاء.",
    bodyEn: "When meem sakinah is followed by any letter other than ب and م it is pronounced clearly, especially before و and ف." },
  { slug: "madd-natural", category: "madd", level: 2, sortOrder: 11, markupCode: "n", titleAr: "المد الطبيعي", titleEn: "Natural prolongation",
    bodyAr: "هو المد الذي لا تقوم ذات الحرف إلا به، ولا يتوقف على سبب من همز أو سكون، ومقداره حركتان.",
    bodyEn: "The basic prolongation without which the letter is incomplete. It needs no following hamzah or sukoon, and lasts two counts." },
  { slug: "madd-muttasil", category: "madd", level: 3, sortOrder: 12, markupCode: "o", titleAr: "المد الواجب المتصل", titleEn: "Connected obligatory madd",
    bodyAr: "أن يأتي بعد حرف المد همز في كلمة واحدة، ويمد لحفص من طريق الشاطبية أربع أو خمس حركات.",
    bodyEn: "A madd letter followed by hamzah in the same word. For Hafs via Ash-Shatibiyyah it lasts four or five counts." },
  { slug: "madd-munfasil", category: "madd", level: 3, sortOrder: 13, markupCode: "p", titleAr: "المد الجائز المنفصل", titleEn: "Separated permissible madd",
    bodyAr: "أن يأتي حرف المد في آخر كلمة والهمز في أول الكلمة التالية، ويمد لحفص من طريق الشاطبية أربع أو خمس حركات.",
    bodyEn: "A madd letter ending a word with hamzah beginning the next. For Hafs via Ash-Shatibiyyah it lasts four or five counts." },
  { slug: "madd-lazim", category: "madd", level: 3, sortOrder: 14, markupCode: "m", titleAr: "المد اللازم", titleEn: "Necessary madd",
    bodyAr: "أن يأتي بعد حرف المد سكون أصلي ثابت وصلاً ووقفاً، ويمد ست حركات.",
    bodyEn: "A madd letter followed by an original sukoon that remains in both continuing and stopping. It lasts six counts." },
  { slug: "qalqalah", category: "qalqalah", level: 2, sortOrder: 15, markupCode: "q", titleAr: "القلقلة", titleEn: "Echoing (Qalqalah)",
    bodyAr: "اضطراب الصوت عند النطق بالحرف الساكن حتى يسمع له نبرة قوية. وحروفها خمسة تجمع في (قطب جد)، وتكون أوضح عند الوقف.",
    bodyEn: "A slight echo when pronouncing a letter with sukoon. Its five letters are collected in قطب جد, and it is clearest when stopping." },
  { slug: "ghunnah", category: "ghunnah", level: 1, sortOrder: 16, markupCode: "g", titleAr: "الغنة", titleEn: "Nasalization (Ghunnah)",
    bodyAr: "صوت يخرج من الخيشوم لازم للنون والميم، ويظهر بوضوح في النون والميم المشددتين بمقدار حركتين.",
    bodyEn: "A nasal sound integral to ن and م, most evident when they carry shaddah, for two counts." },
  { slug: "tafkheem", category: "tafkheem", level: 2, sortOrder: 17, markupCode: null, titleAr: "التفخيم والترقيق", titleEn: "Heavy and light letters",
    bodyAr: "التفخيم تسمين الحرف والترقيق تنحيفه. وتفخم حروف الاستعلاء السبعة المجموعة في (خص ضغط قظ)، وترقق حروف الاستفال إلا ما استثني.",
    bodyEn: "Tafkheem makes a letter heavy and tarqeeq makes it light. The seven elevated letters in خص ضغط قظ are heavy, and the lowered letters are light with some exceptions." },
  { slug: "raa-lam", category: "tafkheem", level: 3, sortOrder: 18, markupCode: null, titleAr: "أحكام الراء واللام", titleEn: "Rules of Raa and Laam",
    bodyAr: "تفخم الراء إذا كانت مفتوحة أو مضمومة، وترقق إذا كانت مكسورة، ولها حالات تفصيلية عند السكون. وتفخم لام لفظ الجلالة إذا سبقها فتح أو ضم، وترقق إذا سبقها كسر.",
    bodyEn: "Raa is heavy with fathah or dammah and light with kasrah, with further detail when it has sukoon. The Laam in the name of Allah is heavy after fathah or dammah and light after kasrah." },
  { slug: "waqf", category: "waqf", level: 3, sortOrder: 19, markupCode: null, titleAr: "الوقف والابتداء", titleEn: "Stopping and starting",
    bodyAr: "الوقف قطع الصوت زمناً يتنفس فيه القارئ بنية استئناف القراءة، والابتداء الشروع فيها بعد قطع أو وقف. ويراعى فيهما تمام المعنى واتباع علامات الوقف في المصحف.",
    bodyEn: "Waqf is pausing to breathe with the intention of continuing, and ibtida is resuming. Both should respect the completeness of meaning and the stop signs in the mushaf." },
];

const t = (key: string, titleAr: string, bodyAr: string, titleEn: string, bodyEn: string) => ({ key, titleAr, bodyAr, titleEn, bodyEn });

export const NOTIFICATION_TEMPLATES = [
  t("enrollment.active", "تم قبولك في الحلقة", "أصبحت عضواً فعالاً في الحلقة.", "Enrollment approved", "You are now an active member of the halaqa."),
  t("enrollment.waitlisted", "أضيف الطلب إلى قائمة الانتظار", "الحلقة مكتملة حالياً وسنبلغك عند توفر مقعد.", "Added to waiting list", "The halaqa is full. We will notify you when a seat opens."),
  t("enrollment.rejected", "لم يقبل طلب الانتساب", "يمكنك التواصل مع إدارة الدار لاختيار حلقة مناسبة.", "Enrollment not approved", "Please contact the administration to find a suitable halaqa."),
  t("attendance.absent", "إشعار غياب", "سجل غياب الطالب عن حصة بتاريخ {date}.", "Absence notice", "The student was marked absent on {date}."),
  t("task.assigned", "مهمة جديدة", "أضاف معلمك مهمة جديدة إلى برنامجك.", "New task", "Your teacher added a new task to your program."),
  t("task.reminder", "تذكير بورد اليوم", "لديك مهام لم تكتمل بعد في برنامج اليوم.", "Today's reminder", "You have unfinished tasks in today's program."),
  t("session.reminder", "تذكير بموعد الحصة", "حصة {halaqa} قريباً عند الساعة {time} UTC.", "Session reminder", "{halaqa} starts soon at {time} UTC."),
  t("recitation.submitted", "تسميع جديد", "أرسل طالب تسميعاً بانتظار استماعك وتقييمك.", "New recitation", "A student sent a recitation for your review."),
  t("review.approved", "تم اعتماد تسميعك", "بارك الله فيك. اعتمد معلمك هذا المقطع.", "Recitation approved", "Well done. Your teacher approved this segment."),
  t("review.resubmit", "فرصة لإعادة التسميع", "راجع ملاحظات معلمك ثم أعد التسميع متى كنت مستعداً.", "Another attempt", "Review your teacher's notes and recite again when ready."),
  t("assessment.graded", "نتيجة الاختبار", "صدرت نتيجة اختبارك: {score}%.", "Assessment result", "Your result is available: {score}%."),
  t("certificate.issued", "إصدار شهادة", "صدرت شهادة: {title}.", "Certificate issued", "Certificate issued: {title}."),
  t("guardian.approved", "تم اعتماد الربط", "اعتمدت الإدارة ربط حسابك بالطالب.", "Link approved", "The administration approved your link to the student."),
  t("guardian.rejected", "تعذر اعتماد الربط", "يرجى التواصل مع الإدارة لاستكمال التحقق.", "Link not approved", "Please contact the administration to complete verification."),
  t("message.received", "رسالة جديدة", "وصلتك رسالة جديدة بخصوص متابعة الطالب.", "New message", "You have a new message about a student's progress."),
  t("ai.referred", "سؤال محال إليك", "أحال المساعد سؤالاً من طالب إليك لعدم كفاية المصادر.", "Question referred to you", "The assistant referred a student's question to you."),
  t("ai.resolved", "أجاب المعلم عن سؤالك", "وصل رد على سؤالك المحال.", "Your question was answered", "A person replied to your referred question."),
  t("hadith.assigned", "أحاديث جديدة للحفظ", "عين لك معلمك أحاديث في خطتك.", "New hadiths to memorize", "Your teacher assigned hadiths to your plan."),
  t("placement.approved", "اعتمد مستواك", "اعتمد المعلم تقييم مستواك ومسارك.", "Level confirmed", "A teacher confirmed your level and track."),
  t("appeal.decided", "قرار الاعتراض", "صدر قرار في اعتراضك.", "Appeal decision", "A decision was made on your appeal."),
  t("report.weekly", "التقرير الأسبوعي", "خلال الأسبوع: {done} مهمة مكتملة و{absent} غياب.", "Weekly report", "This week: {done} tasks completed, {absent} absences."),
];

const LEGAL_NOTE_AR = "<p><strong>مسودة:</strong> هذا النص نموذج أولي ويجب مراجعته قانونياً وفق بلد التشغيل قبل الإطلاق.</p>";
const LEGAL_NOTE_EN = "<p><strong>Draft:</strong> this is an initial template and needs legal review for the country of operation before launch.</p>";

const page = (type: "PAGE" | "FAQ", slug: string, locale: "ar" | "en", title: string, body: string, sortOrder = 0) => ({ type, slug, locale, title, body, sortOrder });

export const PAGES = [
  page("PAGE", "privacy", "ar", "سياسة الخصوصية", `${LEGAL_NOTE_AR}<h2>البيانات التي نجمعها</h2><p>الاسم والبريد الإلكتروني، وسجلات التعلم من حضور ومهام وتقييمات، والتسجيلات الصوتية التي يرسلها الطالب بموافقته.</p><h2>حماية القاصرين</h2><p>لا تقبل تسجيلات الطالب القاصر إلا بعد موافقة ولي أمر مرتبط بحسابه ربطاً معتمداً من الإدارة، ولولي الأمر سحب الموافقة في أي وقت.</p><h2>الوصول والاحتفاظ</h2><p>التسجيلات خاصة ولا يصل إليها إلا الطالب ومعلمه ومن تخوله الصلاحيات، وتحذف تلقائياً بعد انتهاء مدة الاحتفاظ المحددة. ويمكنك طلب نسخة من بياناتك من صفحة حسابك.</p>`),
  page("PAGE", "privacy", "en", "Privacy policy", `${LEGAL_NOTE_EN}<h2>Data we collect</h2><p>Name and email, learning records such as attendance, tasks and assessments, and audio recordings a student submits with consent.</p><h2>Minors</h2><p>A minor's recordings are accepted only after consent from a guardian whose link was approved by the administration. Guardians may withdraw consent at any time.</p><h2>Access and retention</h2><p>Recordings are private, available only to the student, their teacher and authorized staff, and are deleted automatically after the retention period. You can download a copy of your data from your account page.</p>`),
  page("PAGE", "terms", "ar", "الشروط والأحكام", `${LEGAL_NOTE_AR}<h2>استخدام المنصة</h2><p>المنصة مخصصة لتعليم القرآن الكريم، ويلتزم المستخدم بالأدب في التواصل وبحماية بيانات دخوله.</p><h2>الشهادات</h2><p>لا تصدر الشهادة إلا بعد اعتماد بشري مخول من الدار، وهي شهادة من الدار نفسها ولا تعني اعتماداً حكومياً ما لم ينص على ذلك بإثبات.</p>`),
  page("PAGE", "terms", "en", "Terms of use", `${LEGAL_NOTE_EN}<h2>Using the platform</h2><p>The platform is for Quran education. Users agree to communicate respectfully and to protect their login details.</p><h2>Certificates</h2><p>A certificate is issued only after approval by an authorized person at Dar Al-Quran. It is issued by the school and does not imply government accreditation unless evidence states so.</p>`),
  page("FAQ", "who", "ar", "لمن هذه المنصة؟", "<p>للطلاب من مختلف الأعمار والمستويات، ولأولياء الأمور والمعلمين وإدارة الدار.</p>", 1),
  page("FAQ", "who", "en", "Who is this platform for?", "<p>Students of all ages and levels, guardians, teachers and school administrators.</p>", 1),
  page("FAQ", "progress", "ar", "كيف يحسب التقدم؟", "<p>يحسب من السجلات الفعلية فقط: المقاطع التي اعتمدها المعلم، والمهام المكتملة، والحضور، ودرجات المراجعة.</p>", 2),
  page("FAQ", "progress", "en", "How is progress calculated?", "<p>Only from actual records: segments approved by the teacher, completed tasks, attendance and revision grades.</p>", 2),
  page("FAQ", "recording", "ar", "هل تقيّم التسجيلات آلياً؟", "<p>لا. يستمع المعلم إلى كل تسجيل ويقيمه بنفسه، ولا تمنح شهادة إتقان اعتماداً على تقييم آلي.</p>", 3),
  page("FAQ", "recording", "en", "Are recordings graded automatically?", "<p>No. A teacher listens to each recording and evaluates it, and no mastery certificate relies on automated grading.</p>", 3),
  page("FAQ", "quran-text", "ar", "ما مصدر نص المصحف؟", "<p>نص عثماني برواية حفص عن عاصم من مشروع تنزيل، ويفحص بانتظام مقابل بصمات سلامة رقمية.</p>", 4),
  page("FAQ", "quran-text", "en", "Where does the Quran text come from?", "<p>Uthmani text, Hafs from Asim, from the Tanzil project, regularly checked against digital integrity fingerprints.</p>", 4),
];

export const DEMO_QUESTIONS = [
  { kind: "TAJWEED" as const, type: "MULTIPLE_CHOICE" as const, promptAr: "[تجريبي] كم مقدار الغنة في الإخفاء؟", promptEn: "[Demo] How long is the nasalization in ikhfa?", correctKey: "b",
    options: [{ key: "a", textAr: "حركة واحدة", textEn: "One count" }, { key: "b", textAr: "حركتان", textEn: "Two counts" }, { key: "c", textAr: "ست حركات", textEn: "Six counts" }] },
  { kind: "TAJWEED" as const, type: "MULTIPLE_CHOICE" as const, promptAr: "[تجريبي] ما حروف القلقلة؟", promptEn: "[Demo] Which letters have qalqalah?", correctKey: "a",
    options: [{ key: "a", textAr: "قطب جد", textEn: "ق ط ب ج د" }, { key: "b", textAr: "يرملون", textEn: "ي ر م ل و ن" }, { key: "c", textAr: "خص ضغط قظ", textEn: "خ ص ض غ ط ق ظ" }] },
  { kind: "TAJWEED" as const, type: "PRACTICAL" as const, promptAr: "[تجريبي] اذكر مثالاً من حفظك على القلقلة ووضح سبب الحكم.", promptEn: "[Demo] Give an example of qalqalah from your memorization and explain it." },
];

const prog = (slug: string, titleAr: string, titleEn: string, summaryAr: string, summaryEn: string, overviewAr: string, objectivesAr: string[], audienceAr: string[], levelsAr: string[], curriculumAr: string[], outcomesAr: string[], requirementsAr: string[], featured = false, requiresQualifiedTeachers = false) =>
  ({ slug, titleAr, titleEn, summaryAr, summaryEn, overviewAr, objectivesAr, audienceAr, levelsAr, curriculumAr, outcomesAr, requirementsAr, featured, requiresQualifiedTeachers });

const LEVELS = ["مبتدئ", "متوسط", "متقدم"];

// Starting descriptions the school reviews and edits. Instructor information stays empty until verified.
export const PROGRAMS = [
  prog("memorization", "حفظ القرآن الكريم", "Quran memorization", "خطة حفظ فردية مع تسميع ومراجعة بإشراف المعلم.", "An individual plan with recitation and revision under a teacher.", "مسار متدرج لحفظ كتاب الله وفق وقت الطالب ومستواه، يجمع الاستماع والترديد والتسميع والمراجعة المتباعدة.", ["حفظ متقن بوتيرة مناسبة", "ربط الحفظ بالتلاوة الصحيحة", "بناء عادة يومية مع القرآن"], ["من يقرأ القرآن قراءة مقبولة"], LEVELS, ["ورد يومي جديد", "استماع وترديد", "تسميع للمعلم", "مراجعة قريبة وبعيدة"], ["حفظ المقدار المعتمد في الخطة", "متابعة موثقة لكل مقطع"], ["قراءة يتحقق منها المعلم"], true),
  prog("revision", "تثبيت ومراجعة القرآن", "Consolidation and revision", "لمن حفظ أجزاء ويريد تثبيتها بمراجعة منتظمة.", "For those who want to secure what they have memorized.", "برنامج يركز على تثبيت المحفوظ بمواعيد مراجعة تتكيف مع جودة الأداء وقرار المعلم.", ["تثبيت المحفوظ", "علاج مواضع النسيان"], ["الحفاظ بدرجاتهم المختلفة"], LEVELS, ["تقييم المحفوظ", "جدول مراجعة متباعدة", "تسميع دوري"], ["مراجعة منتظمة موثقة"], ["تحديد المقدار المحفوظ"], true),
  prog("recitation", "التلاوة وتصحيح القراءة", "Recitation and correction", "تصحيح النطق وضبط التلاوة مع معلم.", "Correct pronunciation and recitation with a teacher.", "يصحح فيه المعلم تلاوة الطالب ويدربه على النطق السليم وضبط الحركات.", ["نطق صحيح للحروف", "ضبط الحركات"], ["من يقرأ ببطء أو بأخطاء"], LEVELS, ["تقييم القراءة", "تدريب على قصار السور", "تطبيق عملي"], ["تلاوة أكثر صحة وطلاقة"], ["معرفة الحروف"], true),
  prog("tajweed", "أحكام التجويد", "Tajweed rules", "دروس متدرجة وتطبيق عملي واختبارات قصيرة.", "Graded lessons, practice and short quizzes.", "دراسة أحكام التجويد برواية حفص عن عاصم بأمثلة من المصحف وتطبيق مع المعلم.", ["فهم الأحكام", "تطبيقها في التلاوة"], ["من يقرأ القرآن"], LEVELS, ["مخارج الحروف وصفاتها", "النون والميم", "المدود", "الوقف والابتداء"], ["تطبيق الأحكام الأساسية بإشراف المعلم"], ["قراءة مقبولة"], true),
  prog("tafsir", "التفسير والتدبر", "Tafsir and reflection", "فهم معاني الآيات من مصادر مذكورة بأسمائها.", "Understand the ayahs from named sources.", "قراءة منظمة في التفسير من مصادر معتمدة مع مقارنة بينها وتأمل المعاني.", ["فهم معاني الآيات", "ربط الحفظ بالمعنى"], ["الراغبون في فهم القرآن"], LEVELS, ["قراءة ميسرة", "مقارنة التفاسير", "جلسات تدبر"], ["فهم أعمق لما يحفظه الطالب"], ["لا يوجد شرط"], true),
  prog("qiraat", "القراءات القرآنية", "Quranic readings", "مسار متخصص يفتح عند توفر معلمين مؤهلين.", "A specialist track that opens when qualified teachers are available.", "مدخل إلى علم القراءات لمن أتقن رواية حفص، ولا يفتح إلا بمعلم مؤهل. تعتمد المنصة حالياً رواية حفص عن عاصم في نصوصها.", ["التعرف على علم القراءات"], ["من أتقن التلاوة والتجويد"], ["متقدم"], ["يحدده المعلم المؤهل"], ["يحددها المعلم المؤهل"], ["إتقان رواية حفص"], false, true),
  prog("ijazah", "مسار الإتقان والإجازة", "Mastery and ijazah track", "يفتح عند توفر معلمين مجازين متحقق منهم.", "Opens when verified, qualified teachers are available.", "مسار للمتقنين يتوقف على توفر معلم مجاز متحقق من إجازته، وتكون الإجازة منه وفق سنده لا من المنصة.", ["إتقان التلاوة بالعرض على المعلم"], ["الحفاظ المتقنون"], ["متقدم"], ["عرض كامل على المعلم"], ["يحددها المعلم المجاز"], ["حفظ متقن وتقييم من المعلم"], false, true),
  prog("young-readers", "تأسيس القراءة للصغار", "Reading foundations for children", "تعليم الحروف والقراءة للأطفال بمتابعة ولي الأمر.", "Letters and reading for children, with guardian follow-up.", "برنامج للأطفال يبدأ بالحروف والحركات وينتقل إلى قصار السور، بموافقة ولي الأمر ومتابعته.", ["معرفة الحروف والحركات", "قراءة قصار السور"], ["الأطفال بموافقة ولي الأمر"], ["مبتدئ"], ["الحروف", "الحركات", "الكلمات", "قصار السور"], ["قراءة أولية صحيحة"], ["ربط حساب ولي الأمر"], true),
  prog("adult-learning", "برنامج تعليم الكبار", "Adult learning", "بداية ميسرة للكبار في أوقات مرنة.", "A gentle start for adults at flexible times.", "برنامج يراعي ظروف الكبار، يبدأ من مستوى الدارس ويتدرج في القراءة ثم الحفظ.", ["قراءة صحيحة", "ورد يناسب الوقت المتاح"], ["البالغون من كل المستويات"], LEVELS, ["تقييم أولي", "قراءة وتصحيح", "حفظ اختياري"], ["تحسن القراءة والثقة بها"], ["لا يوجد شرط"]),
  prog("intensive-revision", "برنامج المراجعة المكثفة", "Intensive revision", "مراجعة مكثفة لمن يريد تثبيتاً سريعاً.", "Intensive revision for rapid consolidation.", "جدول مكثف لمن لديهم وقت كاف، بورد مراجعة أكبر وتسميع أكثر تواتراً.", ["تثبيت قدر كبير في مدة أقصر"], ["الحفاظ المتفرغون"], ["متوسط", "متقدم"], ["ورد مراجعة كبير", "تسميع متكرر"], ["تحسن إتقان المراجعة"], ["وقت يومي كاف"]),
];

export const EXTRA_FAQ = [
  page("FAQ", "register", "ar", "كيف أسجل؟", "<p>أنشئ حساباً طالباً أو ولي أمر، وأكد بريدك، ثم اطلب الانتساب إلى حلقة.</p>", 5),
  page("FAQ", "online", "ar", "هل توجد حصص عن بعد؟", "<p>نعم عندما تهيئ الدار مزود الاجتماعات أو رابط الحلقة، ويدخلها أعضاء الحلقة ومعلمها فقط.</p>", 6),
  page("FAQ", "schedule", "ar", "كيف تحدد المواعيد؟", "<p>لكل حلقة جدولها الأسبوعي الظاهر قبل طلب الانتساب.</p>", 7),
  page("FAQ", "parent", "ar", "كيف يتابع ولي الأمر ابنه؟", "<p>يطلب الربط من حسابه، وتتحقق الإدارة من الصلة قبل إظهار أي بيانات.</p>", 8),
  page("FAQ", "privacy-faq", "ar", "كيف تحمى بيانات الطلاب؟", "<p>صلاحيات تفرض على مستوى قاعدة البيانات، وتسجيلات خاصة تحذف بعد مدة الاحتفاظ.</p>", 9),
];

type Opt = { key: string; textAr: string; textEn: string };
const mc = (tag: string, promptAr: string, promptEn: string, correctKey: string, options: Opt[]) => ({ kind: "TAJWEED" as const, type: "MULTIPLE_CHOICE" as const, tag, promptAr: `[تجريبي] ${promptAr}`, promptEn: `[Demo] ${promptEn}`, correctKey, options });
const o = (key: string, textAr: string, textEn: string): Opt => ({ key, textAr, textEn });
const MADD = [o("a", "حركتان", "Two counts"), o("b", "أربع أو خمس حركات", "Four or five counts"), o("c", "ست حركات", "Six counts")];

// Follows the seeded lesson text. Demo only; production question banks are written by the school.
export const V3_DEMO_QUESTIONS = [
  mc("placement", "ما مقدار المد الطبيعي؟", "How long is the natural madd?", "a", MADD),
  mc("placement", "ما مقدار المد اللازم؟", "How long is the necessary madd?", "c", MADD),
  mc("placement", "ما الحرف الذي تقلب عنده النون الساكنة ميماً؟", "Before which letter does noon sakinah become meem?", "b", [o("a", "الميم", "Meem"), o("b", "الباء", "Baa"), o("c", "الواو", "Waw")]),
  mc("rule:qalqalah", "ما حروف القلقلة؟", "Which letters have qalqalah?", "a", [o("a", "قطب جد", "ق ط ب ج د"), o("b", "يرملون", "ي ر م ل و ن")]),
  mc("rule:iqlab", "ما مقدار الغنة في الإقلاب؟", "How long is the ghunnah in iqlab?", "a", MADD),
  mc("exam-demo", "ما مقدار المد الطبيعي؟", "How long is the natural madd?", "a", MADD),
  { kind: "TAJWEED" as const, type: "TRUE_FALSE" as const, tag: "exam-demo", promptAr: "[تجريبي] تكون القلقلة أوضح عند الوقف.", promptEn: "[Demo] Qalqalah is clearest when stopping.", correctKey: "t", options: [o("t", "صح", "True"), o("f", "خطأ", "False")] },
  { kind: "TAJWEED" as const, type: "COMPLETE_TEXT" as const, tag: "exam-demo", promptAr: "[تجريبي] أكمل: حروف القلقلة تجمع في كلمتي ...", promptEn: "[Demo] Complete: the qalqalah letters are collected in ...", correctKey: "قطب جد" },
  { kind: "TAJWEED" as const, type: "ORDER" as const, tag: "exam-demo", promptAr: "[تجريبي] رتب المدود من الأقصر إلى الأطول.", promptEn: "[Demo] Order these from shortest to longest.", correctKey: "a,b,c", options: MADD },
  { kind: "TAJWEED" as const, type: "RECITATION" as const, tag: "exam-demo", promptAr: "[تجريبي] سجل قراءتك لسورة الإخلاص.", promptEn: "[Demo] Record your reading of Al-Ikhlas." },
];
