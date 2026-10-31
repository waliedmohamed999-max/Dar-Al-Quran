# سجل التعديلات: إغلاق الفجوات

2026-10-31. لم يعاد ضبط أي قاعدة بيانات. أخذت نسخة قبل الترحيل `backups/dar-20261031-143240.sql.gz`. ولا توجد إيداعات Git لأنه لم يطلب ذلك.

| # | التعديل | الملفات الأساسية | التحقق |
|---|---|---|---|
| 1 | ترحيل أمامي: التحكيم، الموارد، توقيت الكلمات، الصعوبة | `prisma/migrations/20261031000600_gap_closure` | `migrate deploy` على التطوير والاختبار |
| 2 | استبدال `exceljs` | `src/modules/reports/xlsx.ts` | 0 ثغرات، وحدات |
| 3 | بوابة اعتماد موحدة | `src/lib/scholarly.ts` | `test:gate` |
| 4 | شروط الاعتماد والنشر | `src/modules/cms/service.ts`، `unified/service.ts` | تكامل |
| 5 | فحص آيات الأذكار | `src/modules/adhkar/quotes.ts`، `scripts/quotes-check.ts` | وحدات |
| 6 | Push: إلغاء، تجربة، إصلاح تفعيل العامل | `adhkar/service.ts`، `components/v3.tsx` | Chrome مع FCM |
| 7 | اختبار الحديث النهائي | `src/modules/hadith/final-exam.ts` | تكامل |
| 8 | التحكيم الشفهي والشهادات والاعتراضات | `src/modules/judging/service.ts`، `/admin/judging`، `/judging` | تكامل ومتصفح |
| 9 | التجربة والصوت والتقرير في تحديد المستوى | `components/placement-aids.tsx` | متصفح |
| 10 | الصعوبة والمراجعة والخريطة والتقارير | `unified/service.ts`، `student/map`، `reports/[id]` | وحدات وتكامل |
| 11 | مزامنة الكلمات | `scripts/timing-import.ts`، `mushaf-reader.tsx` | وسائط حية |
| 12 | الموارد الدراسية والوسائط | `quran/study.ts`، `/admin/study-resources` | تكامل |
| 13 | الحذف الآلي الشامل | `learning/retention.ts` | تكامل |
| 14 | تجميع الإشعارات | `learning/service.ts`، `judging/service.ts` | متصفح وتكامل |
| 15 | إصلاح الدخول وأيقونة الموقع | `auth-forms.tsx`، `app/icon.svg` | متصفح و Lighthouse |
| 16 | التصميم الجديد | `globals.css`، `(app)/layout.tsx`، `site.tsx`، `ui.tsx` | axe على كل الصفحات |
| 17 | فروق النص، والتقارير، والأدوات | `docs/release/`، `scripts/` | |

تصحيح: ذكرت سابقاً 267 ذكراً، والعدد الفعلي في القاعدة 266.

نتائج التشغيل في [TEST_RESULTS.md](TEST_RESULTS.md).
