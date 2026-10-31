# دار القرآن الكريم | Dar Al-Quran

منظومة ويب لتعليم القرآن الكريم والسنة وتحفيظهما وإدارتهما لدار واحدة بإدارة مركزية: مصحف معلم، تجويد، تفسير موثق، برنامج يومي، تسميع يقيمه المعلم، فصول مباشرة، مساعد ذكي مقيد بالمصادر، ولوحات للطالب والمعلم وولي الأمر والإدارة.

**التقنيات:** Next.js 16 و TypeScript و Tailwind 4 و PostgreSQL مع Prisma و Better Auth و Zod وتخزين S3.

## التشغيل المحلي

المتطلبات: Node 20.9 أو أحدث، و Docker.

```bash
npm ci
cp .env.example .env        # ثم املأ الأسرار: راجع التعليقات داخل الملف
docker compose up -d
npx prisma generate
npm run db:migrate
npm run db:setup            # كلمة مرور دور dar_app والحاوية الخاصة
npm run quran:fetch
npm run quran:import
npm run quran:verify
npm run content:fetch      # الأذكار والأحاديث، تستورد بانتظار المراجعة
npm run content:import
npm run db:seed
npm run timing:import       # توقيت الكلمات، بعد db:seed لأنه يحتاج جدول التلاوات
npm run dev                 # http://localhost:3000
npm run worker              # في طرفية أخرى: البريد والتذكيرات والحذف الدوري
```

البريد في التطوير يظهر في Mailpit على http://localhost:8025.

## حسابات التجربة (التطوير فقط)

تنشأ عند ضبط `DEMO_PASSWORD` في `.env`، ولا تنشأ إذا كان `APP_ENV=production`. كلمة المرور هي قيمة `DEMO_PASSWORD`.

| الدور | البريد |
|---|---|
| مدير عام | super@demo.test |
| مدير الدار | admin@demo.test |
| مشرف | supervisor@demo.test |
| معلم | teacher@demo.test و teacher2@demo.test |
| طالب | student@demo.test و student2@demo.test |
| طالب قاصر | student3@demo.test |
| ولي أمر | guardian@demo.test |

## الاختبارات

```bash
npm run lint              # فحص الأنواع
npm test                  # وحدات
npm run test:integration  # على قاعدة dar_quran_test منفصلة
npm run build && npm run test:e2e   # متصفح، سطح مكتب وهاتف، مع axe
npm run test:gate         # بوابة الاعتماد بخادم إنتاج
npm run test:media        # صوت وميكروفون، يحتاج شبكة
npm run test:browsers     # Firefox و WebKit و Chrome
npm run release:check     # موانع الإطلاق الآلية
```

شغل اختبارات التكامل مرة قبل e2e لأنها تجهز قاعدة الاختبار.

## التوثيق

**تقارير الإطلاق في [docs/release](docs/release/):** [الميزات](docs/release/FEATURES.md)، [الاختبارات](docs/release/TEST_RESULTS.md)، [الثغرات](docs/release/VULNERABILITIES.md)، [سجل المصادر](docs/release/SOURCES_REGISTER.md)، [الاعتماد العلمي](docs/release/SCHOLARLY_APPROVALS.md)، [فروق النص](docs/release/QURAN_TEXT_DIFFERENCES.md)، [المتطلبات القانونية](docs/release/LEGAL_REQUIREMENTS.md)، [Lighthouse](docs/release/LIGHTHOUSE.md)، [UAT](docs/release/UAT_PLAN.md)، [Go / No-Go](docs/release/GO_NO_GO.md)، [سجل التعديلات](docs/release/WORK_LOG.md).

- [حالة الخصائص والمشكلات](docs/STATUS.md)
- [تحليل الفجوات للمرحلة الثالثة](docs/GAP_ANALYSIS.md)
- [المعمارية](docs/ARCHITECTURE.md)
- [الأمان والخصوصية](docs/SECURITY.md)
- [مصادر البيانات والتراخيص](docs/DATA_LICENSES.md)
- [التشغيل والنشر والصيانة](docs/OPERATIONS.md)
- [واجهة API](docs/API.md)
