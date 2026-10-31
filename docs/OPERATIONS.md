# التشغيل والنشر والصيانة

## البيئات

تحددها `APP_ENV`: development أو staging أو production. لا تنشأ بيانات تجريبية في production، ولا تفهرس محركات البحث غيرها. استخدم أسراراً مستقلة لكل بيئة.

## النشر

```bash
docker compose --profile app build
docker compose run --rm app npx prisma migrate deploy
docker compose run --rm app npx tsx scripts/db-setup.ts
docker compose run --rm app npx tsx scripts/quran-fetch.ts
docker compose run --rm app npx tsx scripts/quran-import.ts
docker compose run --rm app npx tsx scripts/quran-verify.ts
docker compose run --rm app npx tsx scripts/content-fetch.ts
docker compose run --rm app npx tsx scripts/content-import.ts
docker compose run --rm app npx tsx scripts/timing-import.ts
docker compose run --rm app npx tsx scripts/quotes-check.ts
docker compose run --rm app npx tsx prisma/seed.ts
docker compose run --rm app npx tsx scripts/release-check.ts
docker compose --profile app up -d
```

**لا تنشر قبل أن تكتمل [قائمة Go / No-Go](release/GO_NO_GO.md).** `release-check` يقرأ فقط، ويخرج برمز 1 عند وجود مانع.

- ضع التطبيق خلف وكيل عكسي بشهادة HTTPS يستبدل `X-Forwarded-For`.
- اضبط `NEXT_PUBLIC_APP_URL` و `LIVE_JITSI_DOMAIN` و `S3_ENDPOINT` **قبل البناء** لأنها تدخل في CSP.
- في الإنتاج استخدم PostgreSQL مدارة وتخزين S3 حقيقياً وخادم SMTP، لا الخدمات التطويرية في compose.
- لا توجد حسابات افتراضية في الإنتاج: سجل حساباً، ثم امنحه دور `super_admin` في جدول `user_roles`.

## التحديث

1. `npm run backup`، ثم انسخ الملف خارج الخادم.
2. ابن الصورة الجديدة، ثم `prisma migrate deploy`. لا تستخدم `migrate reset` أو `migrate dev` على بيانات حقيقية.
3. شغل التطبيق والعامل، ثم تحقق من `/api/health` و`npm run quran:verify`.
4. **للتراجع:** أعد الصورة السابقة. الترحيلات للأمام فقط، فإذا كان الترحيل غير متوافق فاستعد النسخة في قاعدة جديدة بعد إيقاف الكتابة.

## قبل الإطلاق

راجع المحتوى في `/admin/scholarly`: مصادر التفسير ودروس التجويد لا تظهر قبل اعتمادها. وراجع البرامج في `/admin/programs`؛ نصوصها الأولية مقترحة وتحتاج اعتماد الدار.

## تذكيرات الأذكار

تعمل عبر العامل، فيلزم تشغيله. لإشعارات المتصفح: `npx web-push generate-vapid-keys` ثم اضبط `VAPID_PUBLIC_KEY` و`VAPID_PRIVATE_KEY` و`VAPID_SUBJECT`. تتطلب HTTPS في الإنتاج. لا تشغل الإشعارات صوتاً.

للتأكد من التسليم الفعلي: `npx tsx scripts/push-live-test.ts chrome` بعد البناء، وهو يولد مفاتيح مؤقتة ولا يستخدم مفاتيح الإنتاج.

## مسارات الحديث

بعد اعتماد الأحاديث من `/admin/scholarly`، انشر المسار من `/admin/hadith`.

## المعلم الذكي

راجع الخصوصية، ثم اضبط `AI_ANTHROPIC_API_KEY`، ثم فعله من `/admin/ai`. دون مفتاح يعرض المصادر المطابقة فقط. النموذج الافتراضي `claude-opus-5-5` ويغير بـ `AI_MODEL`، وبديل الخادم عند رفض النموذج مفعل.

## ألوان التجويد وتوقيت الكلمات

تبقى ألوان التجويد مخفية في الإنتاج حتى يضبط `TAJWEED_COLOURS_APPROVED=true` بقرار المشرف العلمي. وتوقيت الكلمات يستورده `timing:import` بعد تعبئة جدول التلاوات، للقراء الذين يطابق مجلد صوتهم بيانات quran-align.

## الفصول المباشرة

اضبط `LIVE_JITSI_DOMAIN` على خادم Jitsi خاص أو JaaS، فخدمة meet.jit.si العامة تقيد التضمين. دون ذلك يستخدم رابط الاجتماع المشفر للحلقة.

## النسخ الاحتياطي

```bash
npm run backup          # مقترح يومياً عبر cron، ثم انسخ الملف خارج الخادم
npm run restore:test    # مقترح شهرياً: يستعيد في قاعدة مؤقتة dar_restore_test ويقارن بصمة القرآن
```

**الاستعادة الفعلية:** أوقف التطبيق والعامل، وأنشئ قاعدة جديدة، واستعد فيها `gunzip -c ملف.sql.gz | psql`، ثم `db:setup` لدور التطبيق و`quran:verify`، ثم وجه `DATABASE_URL` إليها وشغل. لا تستعد فوق قاعدة قائمة، واحتفظ بالقديمة حتى تتأكد.

انسخ تخزين S3 بسياسة المزود، واحفظ `FIELD_ENCRYPTION_KEY` منفصلاً؛ فقدانه يعني فقد روابط الاجتماعات.

## المراقبة

- `GET /api/health`: حالة القاعدة وعدد المهام المعلقة والفاشلة، دون بيانات شخصية.
- لوحة الإدارة تنبه إلى المهام الفاشلة، وتفاصيلها في جدول `jobs`.
- العامل يكتب سجلات JSON. لا يوجد تكامل Sentry بعد.

## الصيانة

- بعد تعديل `schema.prisma`: `npm run db:migrate:dev`. سياسات RLS في ترحيلات يدوية، وأي جدول جديد للطلاب يحتاج سياسة واختباراً.
- عند إضافة API: عدل جدول endpoints ثم `npm run docs:api`.
- `npm audit` دورياً.
- الوسائط الحية: `npm run test:media`، وبوابة الاعتماد: `npm run test:gate`، والمتصفحات: `npm run test:browsers`.
- تقييم المعلم الذكي بنموذج حقيقي: `AI_EVAL_API_KEY=... npm run ai:eval` بمفتاح غير إنتاجي، وهو مدفوع.
