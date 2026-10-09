# LOVABLE-EXIT-01 — فصل البوابة عن Lovable

قرار المالك (2026-10-09): فصل كامل — قاعدة بيانات Supabase باسم الكلية + استضافة على
Cloudflare Workers + بقاء النطاق `quboolye.com` (مسجّل في Hostinger).

| العنصر | قبل | بعد |
| --- | --- | --- |
| قاعدة البيانات | Lovable Cloud (`wpmicqriltrowwonknox`) | Supabase باسم الكلية (`pwapivqjofdsevycegph`) |
| الاستضافة | نشر Lovable | Cloudflare Workers (خط النشر مبني على `cloudflare-staging-04d.yml`) |
| النطاق | يشير إلى Lovable | DNS على Cloudflare، التسجيل يبقى في Hostinger |
| تطبيق الجوال | يحمّل `quboolye.com` | بلا تغيير — لا APK جديد |

## قاعدة الأمان

لا تُكتب كلمات مرور ولا مفاتيح سرية في المحادثة أو المستودع. كل سرّ يضعه المالك في
GitHub ← Settings ← Environments ← `supabase-migration` ← Secrets، وسير العمل يستخدمه.

## المراحل

1. **التصدير (المالك)** — Lovable ← More ← Cloud ← Overview ← Advanced settings ← Export data.
   يصل بريد عند الجاهزية؛ التنزيل من More ← Cloud ← Storage. الصيغة: أرشيف PostgreSQL
   (`.backup`، custom format، zstd)، ويشمل حسابات المستخدمين وتجزئات كلمات المرور.
   تصدير واحد كل 24 ساعة.
2. **الرفع (المالك)** — في مشروع Supabase الجديد: Storage ← New bucket باسم `migration-private`
   (**Private**) ← رفع ملف `.backup`.
3. **الجرد (سير العمل `Supabase Migration 01 — Inspect`)** — ينزّل الملف من الـbucket الخاص
   ويُخرج قائمة المحتويات بالأسماء والأعداد فقط (بلا بيانات). لا يكتب في أي قاعدة.
4. **الاستعادة** (`Supabase Migration 02 — Restore`) — بناءً على الجرد (2026-10-09): الأرشيف
   `saba-uni-portal_261008.backup` (pg_dump 18.6، 5029 عنصراً). يُستعاد في معاملة واحدة:
   كل `public` (213 جدولاً، 687 دالة، 391 سياسة، 232 trigger، الصلاحيات والبيانات) +
   صفوف `auth.users` و`auth.identities` + تعريفات `storage.buckets` وسياسات `storage`.
   لا يُستعاد: نسخة `backup_20261002` القديمة (119 جدولاً — تبقى داخل الأرشيف)، الجلسات
   وسجلات التدقيق، أسرار `vault` (مرتبطة بمفتاح المشروع القديم)، المخططات والامتدادات التي
   يديرها Supabase. يرفض سير العمل أي قاعدة غير المشروع الجديد أو أي هدف غير فارغ.
   الوضع `plan` يعرض الخطة دون كتابة؛ `restore` يكتب ويتطلب كتابة معرّف المشروع.
   السر المطلوب: `TARGET_DB_URL` (Session pooler) في بيئة `supabase-migration`.
5. **الملفات** — 78 ملفاً (≈12 MB) في 14 bucket تُنقل بسكربت منفصل.
6. **الاستضافة** — Worker إنتاج على Cloudflare + بروفة كاملة على رابط workers.dev مقابل القاعدة الجديدة.
7. **ليلة التحويل** — إيقاف قصير، تصدير نهائي واستعادة، نقل DNS إلى Cloudflare، فحص، فتح.
8. **بعد أسبوع مستقر** — إيقاف نشر Lovable.

## ما ينقل يدوياً خارج الأرشيف

- إعدادات Auth في Supabase: Site URL، Redirect URLs، قوالب البريد، SMTP.
- أسرار الخادم: `SUPABASE_SERVICE_ROLE_KEY`، `RESEND_API_KEY` (إن استُخدم)، `SITE_URL`.
- الجلسات لا تنتقل: كل مستخدم يسجّل الدخول مرة بعد التحويل بنفس كلمة مروره.

المرجع: [Lovable — Deploying and hosting outside Lovable](https://docs.lovable.dev/tips-tricks/external-deployment-hosting).
