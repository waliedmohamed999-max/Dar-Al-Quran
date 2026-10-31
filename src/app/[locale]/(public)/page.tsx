import Link from "next/link";
import { BadgeCheck, BookOpenCheck, CalendarDays, ClipboardCheck, Headphones, LineChart, MessageSquareText, MonitorPlay, Users } from "lucide-react";
import { FaqSearch, PlacementQuiz, Tabs } from "@/components/academy";
import { MushafView } from "@/components/mushaf-view";
import { DEMO_LABEL, GuardianPreview, StudentPreview, TeacherFeedbackPreview } from "@/components/previews";
import { systemDb } from "@/lib/db";
import { fmtDate } from "@/lib/i18n";
import { pageCtx, type PageParams } from "@/lib/page";
import { getActor } from "@/lib/session";
import { aiStatus } from "@/modules/ai/service";
import { getSetting, publicContent } from "@/modules/cms/service";
import type { HomeSettings } from "@/modules/site/config";
import { listPrograms, publicCounts } from "@/modules/site/service";

function Heading({ eyebrow, title, text }: { eyebrow?: string; title: string; text?: string }) {
  return (
    <header className="mx-auto mb-10 max-w-2xl text-center">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2 className="text-3xl text-brand sm:text-4xl">{title}</h2>
      {text && <p className="mt-3 text-ink-2">{text}</p>}
    </header>
  );
}

export default async function Home({ params }: PageParams) {
  const { locale, t, lp } = await pageCtx(params);
  const [home, programs, faq, news, library, counts, ai, actor, firstAyahs] = await Promise.all([
    getSetting<HomeSettings>("home", {}), listPrograms(), publicContent("FAQ", locale), systemDb().contentPage.findMany({ where: { status: "PUBLISHED", locale, type: { in: ["NEWS", "EVENT", "ARTICLE"] } }, orderBy: [{ featured: "desc" }, { publishedAt: "desc" }], take: 3 }),
    systemDb().contentPage.count({ where: { status: "PUBLISHED", type: "LIBRARY", locale } }), publicCounts(), aiStatus(), getActor(),
    systemDb().quranAyah.findMany({ where: { surahId: 1, ayahNumber: { lte: 3 } }, orderBy: { id: "asc" }, select: { id: true, text: true, ayahNumber: true } }),
  ]);
  const shown = (key: string) => !home.hidden?.includes(key);
  const start = actor ? lp("/dashboard") : lp("/register");
  const featured = programs.filter((p) => p.featured);
  const cards = (featured.length ? featured : programs).slice(0, 6);
  const journey = [
    [t("أنشئ حسابك", "Create an account"), t("سجل طالباً أو ولي أمر وأكد بريدك.", "Register as a student or guardian.")],
    [t("اكتشف مستواك", "Discover your level"), t("توصية مبدئية يؤكدها المعلم.", "A preliminary recommendation a teacher confirms.")],
    [t("انضم إلى برنامج", "Join a program"), t("اختر حلقة تناسب وقتك ومستواك.", "Choose a halaqa for your time and level.")],
    [t("استلم خطتك", "Receive your plan"), t("خطة شخصية يعتمدها معلمك.", "A personal plan your teacher approves.")],
    [t("احضر دروسك", "Attend your lessons"), t("حضورياً أو في فصل مباشر.", "In person or in a live class.")],
    [t("أنجز ورد اليوم", "Complete your tasks"), t("حفظ ومراجعة واستماع.", "Memorization, revision and listening.")],
    [t("استقبل التوجيه", "Receive feedback"), t("يستمع معلمك ويقيم بنفسه.", "Your teacher listens and assesses.")],
    [t("تابع تقدمك", "Track your progress"), t("أرقام من سجلاتك الفعلية.", "Figures from your actual records.")],
  ];
  const aiReady = ai.enabled;

  return (
    <>
      {/* B: Hero. The window shows real stored ayahs, not a decorative image. */}
      <section className="hero pattern overflow-hidden">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 lg:grid-cols-2 lg:py-24">
          <div >
            <p className="hero-gold mb-3 font-semibold">{t("دار القرآن الكريم", "Dar Al-Quran")}</p>
            <h1 className="text-4xl leading-tight sm:text-6xl">{home.heroTitleAr && locale === "ar" ? home.heroTitleAr : t("رحلتك مع القرآن تبدأ من هنا", "Your journey with the Quran begins here")}</h1>
            <p className="mt-5 max-w-xl text-lg opacity-90">{home.heroTextAr && locale === "ar" ? home.heroTextAr : t("منصة تعليمية متكاملة لتعلّم القرآن الكريم وحفظه وإتقان تلاوته وتدبّر معانيه، تجمع بين أصالة التعليم وأحدث التقنيات.", "A complete platform to learn, memorize, recite and reflect on the Quran, joining authentic teaching with modern technology.")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="btn btn-gold" href={start}>{home.ctaPrimaryAr && locale === "ar" ? home.ctaPrimaryAr : t("ابدأ رحلتك القرآنية", "Begin your Quran journey")}</Link>
              <Link className="btn btn-ghost" href={lp("/mushaf")}>{t("اكتشف المصحف المعلم", "Explore the teaching mushaf")}</Link>
            </div>
            <dl className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm">
              <div><dt className="opacity-75">{t("سورة", "Surahs")}</dt><dd className="hero-gold text-2xl font-bold">{counts.surahs}</dd></div>
              <div><dt className="opacity-75">{t("آية بتلاوة لكل آية", "Ayahs with audio")}</dt><dd className="hero-gold text-2xl font-bold">{counts.ayahs.toLocaleString("en")}</dd></div>
              <div><dt className="opacity-75">{t("قراء", "Reciters")}</dt><dd className="hero-gold text-2xl font-bold">{counts.recitations}</dd></div>
            </dl>
          </div>
          <div className="device" aria-label={t("معاينة من المصحف المعلم", "Preview of the teaching mushaf")}>
            <div className="device-bar"><span /><span /><span /><strong>{t("المصحف المعلم · الفاتحة", "Teaching mushaf · Al-Fatiha")}</strong></div>
            <div className="quran p-5" lang="ar" dir="rtl" style={{ "--quran-size": "1.55rem" } as React.CSSProperties}>
              {firstAyahs.map((a, i) => <span key={a.id} className={i === 1 ? "bg-highlight rounded" : ""}>{a.text}<span className="ayah-end" aria-hidden="true">{a.ayahNumber}</span> </span>)}
            </div>
            <div className="device-foot"><Headphones className="size-4" aria-hidden="true" />{t("تمييز الآية الجارية، تكرار وسرعة وتفسير", "Current ayah highlight, repeat, speed and tafsir")}</div>
          </div>
        </div>
      </section>

      {shown("welcome") && (
        <section className="mx-auto max-w-6xl px-4 py-20">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.3fr]">
            <div>
              <p className="eyebrow">{t("مرحباً بكم في الدار", "Welcome")}</p>
              <h2 className="text-3xl text-brand sm:text-4xl">{t("تعليم أصيل بأدوات عصرية", "Authentic teaching with modern tools")}</h2>
              <p className="mt-4 text-ink-2">{t("التعليم الرقمي يقرب المعلم من طالبه ويحفظ أثر كل خطوة، لكنه لا يغني عن التلقي. لذلك يبقى القرار التعليمي بيد المعلم.", "Digital learning brings teachers closer and preserves each step, but it does not replace learning from a teacher, so educational decisions stay with the teacher.")}</p>
              <Link className="mt-4 inline-block underline" href={lp("/about")}>{t("تعرف على الدار", "About the school")}</Link>
            </div>
            <dl className="grid gap-4 sm:grid-cols-2">
              {[[t("رسالتنا", "Mission"), t("تيسير تعلم القرآن تلاوة وحفظاً وفهماً بصحبة معلم ومتابعة منتظمة.", "Make learning the Quran easier with a teacher and regular follow-up.")],
                [t("رؤيتنا", "Vision"), t("طريق واضح لكل طالب يناسب مستواه ووقته.", "A clear path for each student, suited to level and time.")],
                [t("فلسفتنا التعليمية", "Philosophy"), t("التدرج، والمراجعة قبل الجديد، والتشجيع دون إحباط.", "Gradual progress, revision before new material, encouragement without discouragement.")],
                [t("منهجنا", "Approach"), t("تعلم، فحفظ، فمراجعة متباعدة، ففهم من مصادر موثقة.", "Learn, memorize, revise at spaced intervals, understand from documented sources.")]].map(([a, b]) => (
                <div key={a} className="card"><dt className="text-lg font-bold text-brand">{a}</dt><dd className="mt-1 text-sm text-ink-2">{b}</dd></div>
              ))}
            </dl>
          </div>
        </section>
      )}

      {shown("programs") && cards.length > 0 && (
        <section className="bg-surface py-20">
          <div className="mx-auto max-w-6xl px-4">
            <Heading eyebrow={t("المسارات", "Tracks")} title={t("البرامج التعليمية", "Learning programs")} text={t("لكل مسار صفحته بأهدافه ومنهجه ومتطلباته.", "Each track has its own page with objectives, curriculum and requirements.")} />
            <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {cards.map((p, i) => <li key={p.id}><Link href={lp(`/programs/${p.slug}`)} className="card lift block h-full no-underline"><span className="text-sm font-bold text-gold">{String(i + 1).padStart(2, "0")}</span><h3 className="mt-1 text-xl text-brand">{locale === "ar" ? p.titleAr : p.titleEn}</h3><p className="mt-1 text-sm text-ink-2">{locale === "ar" ? p.summaryAr : p.summaryEn}</p></Link></li>)}
            </ul>
            <p className="mt-6 text-center"><Link className="btn btn-ghost" href={lp("/programs")}>{t(`جميع البرامج (${programs.length})`, `All programs (${programs.length})`)}</Link></p>
          </div>
        </section>
      )}

      {shown("placement") && programs.length > 0 && (
        <section id="placement" className="py-20">
          <div className="mx-auto max-w-3xl px-4">
            <Heading eyebrow={t("دقيقة واحدة", "One minute")} title={t("اكتشف مستواك القرآني", "Discover your Quran level")} text={t("خمسة أسئلة لتوصية مبدئية، أما مستوى القراءة الفعلي فيحدده المعلم.", "Five questions for a preliminary recommendation. A teacher determines your actual reading level.")} />
            <div className="card shadow-sm"><PlacementQuiz programs={programs.map((p) => ({ slug: p.slug, titleAr: p.titleAr, titleEn: p.titleEn, summaryAr: p.summaryAr, summaryEn: p.summaryEn }))} /></div>
          </div>
        </section>
      )}

      {shown("showcase") && (
        <section className="bg-surface py-20">
          <div className="mx-auto max-w-7xl px-4">
            <Heading eyebrow={t("جرب الآن دون تسجيل", "Try it without registering")} title={t("المصحف المعلم بين يديك", "The teaching mushaf in your hands")} text={t("هذه هي الأداة الحقيقية: اختر القارئ والتكرار، جرب وضع المراجعة، واضغط آية لتفسيرها وأحكامها.", "This is the real tool: choose a reciter and repetition, try review mode, and tap an ayah for tafsir and rules.")} />
            <MushafView where={{ surahId: 1 }} />
            <p className="mt-5 text-center"><Link className="btn btn-primary" href={lp("/mushaf")}>{t("افتح الفهرس الكامل", "Open the full index")}</Link></p>
          </div>
        </section>
      )}

      {shown("journey") && (
        <section className="mx-auto max-w-6xl px-4 py-20">
          <Heading eyebrow={t("كيف تعمل الأكاديمية", "How the academy works")} title={t("رحلة تعلم واضحة الخطوات", "A learning journey with clear steps")} />
          <ol className="journey">
            {journey.map(([a, b], i) => <li key={a}><span className="journey-dot">{i + 1}</span><h3 className="font-bold text-brand">{a}</h3><p className="text-sm text-ink-2">{b}</p></li>)}
          </ol>
        </section>
      )}

      {shown("dashboard") && (
        <section className="bg-surface-2 py-20">
          <div className="mx-auto max-w-5xl px-4">
            <Heading eyebrow={DEMO_LABEL(locale)} title={t("هكذا تبدو لوحة الطالب", "What the student dashboard looks like")} text={t("بيانات توضيحية للعرض فقط. لوحتك الفعلية تظهر سجلاتك بعد الدخول.", "Illustrative data for display only. Your real dashboard shows your records after you sign in.")} />
            <StudentPreview locale={locale} />
          </div>
        </section>
      )}

      {shown("assistant") && (
        <section className="mx-auto grid max-w-6xl gap-10 px-4 py-20 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="eyebrow">{aiReady ? t("متاح للمسجلين", "Available to members") : t("معاينة، لم يفعل بعد", "Preview, not enabled yet")}</p>
            <h2 className="text-3xl text-brand sm:text-4xl">{t("مساعد تعلم يلتزم بالمصادر", "A learning assistant bound to its sources")}</h2>
            <p className="mt-3 text-ink-2">{t("يشرح دروس التجويد المعتمدة والتفسير الموثق، ويقترح تدريبات، ويساعد المعلم في التحضير. يعرض مراجعه دائماً، ولا يصدر فتاوى، ويحيل ما لم يحسم إلى المعلم.", "It explains approved tajweed lessons and documented tafsir, suggests practice, and helps teachers prepare. It always shows references, issues no rulings, and refers unsettled questions to a teacher.")}</p>
            {aiReady && <Link className="btn btn-primary mt-5" href={lp("/ai")}>{t("اسأل المساعد", "Ask the assistant")}</Link>}
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {[[t("نص الآيات من المصدر", "Ayah text from the source"), t("يدرج النص المحفوظ حرفياً، ولا يكتبه النموذج.", "Stored text is inserted verbatim, never written by the model.")], [t("فحص كل إجابة", "Every answer checked"), t("تحجب الإجابة بلا مرجع صحيح وتحال إلى المعلم.", "Answers without valid references are blocked and referred.")], [t("قرار بشري", "A human decision"), t("أسئلة الأحكام تحال مباشرة إلى المختص.", "Questions of ruling go straight to a qualified person.")], [t("موافقة ولي الأمر", "Guardian consent"), t("لا يستخدمه القاصر قبل موافقة وليه.", "Minors need a guardian's consent first.")]].map(([a, b]) => <li key={a} className="card"><strong className="text-brand">{a}</strong><p className="mt-1 text-sm text-ink-2">{b}</p></li>)}
          </ul>
        </section>
      )}

      {shown("live") && (
        <section className="band py-20">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="mb-2 text-center text-3xl sm:text-4xl">{t("الفصول القرآنية المباشرة", "Live Quran classes")}</h2>
            <p className="mx-auto mb-10 max-w-2xl text-center opacity-90">{t("يدخل أعضاء الحلقة ومعلمها فقط، ولا تسجل الحصص افتراضياً.", "Only the halaqa's members and teacher can join, and sessions are not recorded by default.")}</p>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {([[MonitorPlay, t("فصل أونلاين", "Online room")], [BookOpenCheck, t("مصحف مشترك", "Shared mushaf")], [CalendarDays, t("جدولة وتذكير", "Scheduling and reminders")], [ClipboardCheck, t("حضور وواجبات", "Attendance and follow-up")]] as const).map(([I, a]) => <li key={a} className="rounded-xl border border-white/20 p-5"><I className="hero-gold mb-2 size-6" aria-hidden="true" /><strong>{a}</strong></li>)}
            </ul>
            <p className="mt-8 text-center"><Link className="btn btn-gold" href={actor ? lp("/live") : lp("/register")}>{actor ? t("فصولي المباشرة", "My live classes") : t("انضم إلى حلقة", "Join a halaqa")}</Link></p>
          </div>
        </section>
      )}

      {shown("library") && (
        <section className="mx-auto max-w-6xl px-4 py-20">
          <Heading eyebrow={t("المكتبة", "Library")} title={t("مكتبة قرآنية رقمية", "A digital Quran library")} text={library ? t(`${library} مادة منشورة بعد المراجعة، إلى جانب التلاوات والدروس.`, `${library} reviewed items, alongside recitations and lessons.`) : t("تلاوات ودروس وتفسير، وتضاف المواد بعد مراجعتها.", "Recitations, lessons and tafsir, with more added after review.")} />
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[[t("التلاوات القرآنية", "Recitations"), "/mushaf"], [t("دروس التجويد", "Tajweed lessons"), "/tajweed"], [t("موارد التفسير", "Tafsir resources"), "/tafsir"], [t("شروح الحفظ", "Memorization guides"), "/library?category=memorization"], [t("محاضرات ومقالات", "Lectures and articles"), "/library?category=lectures"], [t("موارد للتنزيل", "Downloads"), "/library?category=downloads"]].map(([a, h]) => <li key={h}><Link href={lp(h)} className="card lift block no-underline font-semibold text-brand">{a}</Link></li>)}
          </ul>
        </section>
      )}

      {shown("certificates") && (
        <section className="bg-surface py-20">
          <div className="mx-auto grid max-w-5xl gap-8 px-4 md:grid-cols-2 md:items-center">
            <div>
              <BadgeCheck className="mb-2 size-9 text-gold" aria-hidden="true" />
              <h2 className="text-3xl text-brand">{t("إنجازات موثقة وشهادات قابلة للتحقق", "Documented achievements, verifiable certificates")}</h2>
              <p className="mt-2 text-ink-2">{t("تصدر الشهادة باعتماد شخص مخول، وتحمل معرفاً ورمز تحقق. يعرض التحقق العام أقل قدر من البيانات، ولا يظهر اسم القاصر.", "A certificate needs approval from an authorized person and has an ID and QR code. Public verification shows minimal data, and never a minor's name.")}</p>
            </div>
            <form action={lp("/verify")} className="card">
              <label htmlFor="cert" className="label">{t("معرف الشهادة", "Certificate ID")}</label>
              <input id="cert" name="code" dir="ltr" className="input" required />
              <button className="btn btn-primary mt-3 w-full">{t("تحقق الآن", "Verify now")}</button>
            </form>
          </div>
        </section>
      )}

      {shown("news") && news.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-20">
          <Heading title={t("أخبار الدار", "School news")} />
          <ul className="grid gap-4 md:grid-cols-3">{news.map((n) => <li key={n.id}><Link href={lp(`/articles/${n.slug}`)} className="card lift block h-full no-underline">{n.publishedAt && <span className="text-xs text-ink-2">{fmtDate(locale, n.publishedAt)}</span>}<h3 className="text-lg text-brand">{n.title}</h3>{n.excerpt && <p className="mt-1 text-sm text-ink-2">{n.excerpt}</p>}</Link></li>)}</ul>
          <p className="mt-6 text-center"><Link className="btn btn-ghost" href={lp("/news")}>{t("كل الأخبار", "All news")}</Link></p>
        </section>
      )}

      {shown("experience") && (
        <section className="bg-surface-2 py-20">
          <div className="mx-auto max-w-5xl px-4">
            <Heading eyebrow={DEMO_LABEL(locale)} title={t("تجربة متكاملة للطالب وولي الأمر", "One experience for students and guardians")} />
            <Tabs label={t("اختر التجربة", "Choose an experience")} items={[
              { key: "student", title: t("الطالب", "Student"), content: <TeacherFeedbackPreview locale={locale} /> },
              { key: "guardian", title: t("ولي الأمر", "Guardian"), content: <GuardianPreview locale={locale} /> },
            ]} />
            <ul className="mt-6 grid gap-3 sm:grid-cols-3 text-sm">
              {([[Users, t("ولي الأمر يرى ابنه المعتمد فقط", "Guardians see only their approved child")], [LineChart, t("التقدم من سجلات فعلية", "Progress from actual records")], [MessageSquareText, t("تواصل منظم مع المعلم", "Structured contact with the teacher")]] as const).map(([I, a]) => <li key={a} className="flex items-center gap-2"><I className="size-5 shrink-0 text-gold" aria-hidden="true" />{a}</li>)}
            </ul>
          </div>
        </section>
      )}

      {shown("faq") && faq.length > 0 && (
        <section id="faq" className="mx-auto max-w-3xl px-4 py-20">
          <Heading title={t("الأسئلة الشائعة", "Frequently asked questions")} />
          <FaqSearch items={faq.map((f) => ({ id: f.id, title: f.title, body: f.body }))} />
        </section>
      )}

      <section className="hero pattern">
        <div className="mx-auto max-w-3xl px-4 py-20 text-center">
          <h2 className="text-3xl sm:text-5xl">{home.ctaFinalAr && locale === "ar" ? home.ctaFinalAr : t("ابدأ اليوم رحلتك مع كتاب الله", "Begin your journey with the Quran today")}</h2>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link className="btn btn-gold" href={start}>{t("سجل الآن", "Register now")}</Link>
            <Link className="btn btn-ghost" href={lp("/programs")}>{t("تصفح البرامج", "Browse programs")}</Link>
          </div>
        </div>
      </section>
    </>
  );
}
