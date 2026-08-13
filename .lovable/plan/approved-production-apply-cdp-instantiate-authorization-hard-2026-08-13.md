# APPROVED_PRODUCTION_APPLY_CDP_INSTANTIATE_AUTHORIZATION_HARDENING_01

Authorization is granted for ONE production migration only:

docs/migration-drafts/CDP-INSTANTIATE-AUTHORIZATION-HARDENING-01.sql

Migration A remains HOLD.

No course_sections import.

No deploy/publish/APK.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. PRE-APPLY

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Confirm for:

public.cdp_instantiate_from_syllabus(uuid)

- exists

- owner = postgres

- SECURITY DEFINER = true

- capture exact proacl

- capture normalized pg_get_functiondef/prosrc hash

Confirm these callers are still:

- syllabus_approve_version

- cdp_regenerate_section_plan

- cdp_section_autoplan

and each is SECURITY DEFINER, owner postgres.

Confirm migration ledger latest state and no partial pending migration.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

2. PROMOTE DRAFT

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create ONE timestamped migration under supabase/migrations/.

Its executable SQL must be semantically identical to the approved draft:

REVOKE ALL ON FUNCTION public.cdp_instantiate_from_syllabus(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.cdp_instantiate_from_syllabus(uuid) FROM anon;

REVOKE ALL ON FUNCTION public.cdp_instantiate_from_syllabus(uuid) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.cdp_instantiate_from_syllabus(uuid) TO service_role;

Before apply prove:

PROMOTED_VS_DRAFT = ZERO_SEMANTIC_DIFF

No CREATE OR REPLACE.

No function body change.

No unrelated ACL/RLS/schema/data change.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

3. APPLY

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Apply that ONE migration to Production.

Stop immediately on any error.

No cleanup/reset/manual ledger manipulation.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

4. POST-APPLY VERIFY

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

A. Ledger

- migration present exactly once

- no partial application

B. Function identity

- owner still postgres

- SECURITY DEFINER still true

- normalized pg_get_functiondef/prosrc hash EXACTLY unchanged from pre-apply

C. ACL

Expected effective direct execution:

- PUBLIC = NO EXECUTE

- anon = NO EXECUTE

- authenticated = NO EXECUTE

- service_role = EXECUTE

- owner postgres remains effective owner execution

D. Direct authorization matrix

- student direct call => DENY / permission denied

- ordinary faculty direct call => DENY

- unrelated staff direct call => DENY

- generic authenticated direct call => DENY

E. Legitimate internal paths

Verify without broadening permissions:

- syllabus_approve_version authorized path remains executable

- cdp_regenerate_section_plan authorized path remains executable

- cdp_section_autoplan internal trigger path remains valid

Prefer non-destructive/read-only verification where possible.

Do not create unnecessary production academic data merely to prove this gate.

F. Regression safety

Confirm no change to:

- enrollment_certificate

- protected student-request objects

- course_sections

- course materials data

- existing delivery-plan rows

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

5. STRICTLY FORBIDDEN

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Migration A

- any course_sections import/update

- any backfill

- web deploy/publish

- APK build

- application-code edits

- historical migration edits

- unrelated production writes

Return:

PRODUCTION_MIGRATION_VERSION=

MIGRATION_FILE=

SOURCE_SHA=

PROMOTED_VS_DRAFT=ZERO_SEMANTIC_DIFF

FUNCTION_BODY_HASH_UNCHANGED=PASS

OWNER_UNCHANGED=PASS

SECURITY_DEFINER_UNCHANGED=PASS

ACL_HARDENED=PASS

DIRECT_AUTH_MATRIX=PASS

AUTHORIZED_CALLERS=PASS

MIGRATION_LEDGER=PASS

UNRELATED_PRODUCTION_WRITES=0

COURSE_SECTIONS_WRITES=0

DEPLOY_PUBLISH=0

Final decision only if all gates pass:

PASS_CDP_INSTANTIATE_AUTHORIZATION_HARDENING_01

Otherwise:

HOLD_<EXACT_TECHNICAL_BLOCKER>

Then STOP.تنفيذ Migration B فقط — تأمين cdp_instantiate_from_syllabus

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