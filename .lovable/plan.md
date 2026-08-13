# تنفيذ Migration B فقط — تأمين cdp_instantiate_from_syllabus

اعتماد: Migration A تبقى HOLD حتى حسم `A / USR02`. لا استيراد للمجموعات السبع منفردة. هذه المهمة تقتصر على التصليب الأمني المستقل.

## الهدف

سحب التنفيذ المباشر لدالة `public.cdp_instantiate_from_syllabus(uuid)` من كل أدوار العملاء، مع بقاء المسارات الداخلية المصرَّح بها تعمل.

## ما سيُطبَّق (Migration واحدة فقط)

ترقية المسودة `docs/migration-drafts/CDP-INSTANTIATE-AUTHORIZATION-HARDENING-01.sql` إلى migration مؤرَّخة، بمحتواها كما هو:

- `REVOKE ALL ... FROM PUBLIC` و`FROM anon` و`FROM authenticated`
- `GRANT EXECUTE ... TO service_role` فقط
- لا `CREATE OR REPLACE` للدالة، ولا تعديل لأي migration مطبقة، ولا bypass عام لأي دور

## أساس أمان المستدعين (مثبت مسبقًا من فحص الإنتاج للقراءة فقط)

`syllabus_approve_version`، `cdp_regenerate_section_plan`، `cdp_section_autoplan` جميعها SECURITY DEFINER مملوكة لـ`postgres`، لذلك تستمر بالعمل بعد السحب. إعادة التوليد الإدارية تبقى متاحة عبر `cdp_regenerate_section_plan` المؤمَّنة.

## Preflight قبل التطبيق

1. تأكيد وجود الدالة وتوقيعها ومالكها و`prosecdef = true`.
2. لقطة `proacl` الحالية قبل التغيير.
3. تأكيد أن أحدث migration في السجل هو الأخير المعروف، دون تطبيق جزئي معلّق.
4. تأكيد بقاء المستدعين الثلاثة SECURITY DEFINER بمالك `postgres`.

## Verify بعد التطبيق

1. `proacl` لا يحوي `authenticated=X` ولا `anon=X` ولا مدخل PUBLIC.
2. وجود `service_role=X` فقط (إضافة إلى المالك).
3. تسجيل الـmigration في السجل بنجاح، بلا تطبيق جزئي.
4. مصفوفة تفويض: استدعاء مباشر من دور مسجَّل ⇒ DENY؛ المسارات المصرَّح بها ⇒ PASS.
5. عدم تأثر `enrollment_certificate` ولا السجلات المحمية.

## خارج النطاق صراحةً

- Migration A (canonicalization لنظام الدراسة) — تبقى HOLD.
- أي استيراد أو كتابة على `course_sections`.
- أي Publish أو Deploy أو بناء APK.
- أي تعديل في كود التطبيق أو الواجهة.

## القرار النهائي المتوقع

`PASS_CDP_INSTANTIATE_AUTHORIZATION_HARDENING_01` ثم التوقف، أو `HOLD_<EXACT_TECHNICAL_BLOCKER>` عند أي فشل، بلا reset ولا cleanup ولا تعديل يدوي للسجل.
