# LOVABLE-EXIT-02 — دليل ليلة الانتقال

اعتمد المالك في 2026-10-09 أن تُنفَّذ تعديلات الإنتاج يدوياً من هذا الدليل ليلة الانتقال،
لا أن تُجهَّز مسبقاً كطلب دمج.

المشروع القديم هو `wpmicqriltrowwonknox` (Lovable Cloud)، والجديد `pwapivqjofdsevycegph`
(Supabase الكلية).

لا تُكتب كلمة مرور ولا مفتاح في المحادثة أو المستودع. الأسرار مكانها GitHub ← Settings ←
Environments ← `supabase-migration` فقط.

---

## أ. قبل الليلة (بلا أثر على المستخدمين)

| # | الخطوة | المنفّذ | التحقق |
|---|---|---|---|
| A1 | إضافة `quboolye.com` إلى Cloudflare (Add a domain ← Free). **دون تغيير Nameservers في Hostinger.** | المالك | قائمة سجلات DNS المستوردة محفوظة كصورة (تلزم للتراجع) |
| A2 | مراجعة السجلات المستوردة: إبقاء سجلات البريد (MX, SPF, DKIM, DMARC) والتحقق كما هي | المالك + الوكيل | لا يُحذف أي سجل بريد |
| A3 | حساب Resend، وتوثيق النطاق `quboolye.com`، وإضافة سجلات Resend في Cloudflare | المالك | Resend يعرض النطاق Verified بعد نقل NS |
| A4 | إضافة السر `RESEND_API_KEY` إلى بيئة `supabase-migration` | المالك | يظهر في قائمة الأسرار |
| A5 | Supabase الجديد ← Authentication ← URL Configuration: Site URL = `https://quboolye.com`، وRedirect URLs = `https://quboolye.com/**` و`https://www.quboolye.com/**` | المالك | محفوظ |
| A6 | تنزيل ملفات التخزين من Lovable (Cloud ← Storage)، لكل حاوية بمجلداتها | المالك | 77 ملفاً، والقائمة الدقيقة يستخرجها الوكيل من قاعدة الإنتاج |
| A7 | تجهيز أداة «تفريغ المشروع الجديد ثم الاستعادة» وتجربتها على المشروع الجديد نفسه (بيانات البروفة فقط) | الوكيل + تأكيد المالك | استعادة ثانية ناجحة بأعداد مطابقة |
| A8 | تجهيز فرع `claude/lovable-exit-cutover` بالتعديلات في القسم ج **دون دمج**، ثم مراجعته | المالك أو وكيل مخوّل | فحوص CI خضراء على الفرع |

---

## ب. ترتيب ليلة الانتقال

يُختار وقت هادئ، ويُبلَّغ المستخدمون بتوقف قصير.

1. **تجميد:** لا موافقات ولا طلبات جديدة، فأي إدخال بعد التصدير يضيع.
2. **تصدير نهائي** من Lovable، ثم رفعه إلى الحاوية `migration-private` باسم جديد.
3. **جرد** بتشغيل Migration 01 على الملف الجديد.
4. **تفريغ المشروع الجديد** بالأداة من الخطوة A7، ثم **استعادة** بتشغيل Migration 02 بوضع `restore`.
   - يجب أن تطابق أعداد الجداول والدوال والسياسات والمستخدمين الإنتاجَ.
   - بعدها يُحذف الدور `sandbox_exec`: `grant sandbox_exec to postgres; drop owned by sandbox_exec; drop role sandbox_exec;`
5. **الملفات:** رفع الملفات من الخطوة A6 إلى الحاويات نفسها، بالمسارات نفسها حرفياً.
6. **دمج فرع الانتقال** (القسم ج). بعد الدمج لن تعمل نسخة Lovable مع الكود الجديد، وهذا متوقع.
7. **نقل النطاق:** Hostinger ← Domains ← quboolye.com ← Nameservers ← قيم Cloudflare.
   - في البداية تبقى السجلات المستوردة تشير إلى Lovable، فلا ينقطع الموقع.
   - الانتظار حتى يصبح النطاق Active في Cloudflare (من دقائق إلى ساعات).
8. **النشر الإنتاجي:** تشغيل سير العمل الإنتاجي (القسم د) بـSHA رأس main. يضيف `quboolye.com`
   و`www.quboolye.com` كنطاقات مخصصة للعامل، فيحل محل سجلات Lovable.
9. **الفحص** (القسم هـ)، ثم فتح البوابة.

---

## ج. تعديلات الكود (فرع واحد، تُدمج في الخطوة 6)

القيمة الجديدة في كل الحالات `pwapivqjofdsevycegph`.

### ملفات التشغيل

| الملف | السطر الحالي | يصبح |
|---|---|---|
| `src/integrations/supabase/staging-isolation.ts` (سطر 20) | `const PRODUCTION_REF_FRAGMENTS = ["wpmicq", "riltrow", "wonknox"] as const;` | `const PRODUCTION_REF_FRAGMENTS = ["pwapiv", "qjofdsev", "ycegph"] as const;` |
| `vite.config.ts` (سطر 18) | `const PRODUCTION_SUPABASE_PROJECT_REF = "wpmicqriltrowwonknox";` | `const PRODUCTION_SUPABASE_PROJECT_REF = "pwapivqjofdsevycegph";` |
| `src/lib/native/file-redirect.ts` (سطر 23) | `export const SIGNED_STORAGE_HOST = "wpmicqriltrowwonknox.supabase.co";` | `export const SIGNED_STORAGE_HOST = "pwapivqjofdsevycegph.supabase.co";` |
| `supabase/config.toml` (سطر 1) | `project_id = "wpmicqriltrowwonknox"` | `project_id = "pwapivqjofdsevycegph"` |
| `scripts/staging/cloudflare-staging-contract.ts` (سطر 16) | `["wpmicq", "riltrow", "wonknox"].join("")` | `["pwapiv", "qjofdsev", "ycegph"].join("")` |

### الاختبارات التي تتبع مرجع الإنتاج

| الملف | التعديل |
|---|---|
| `tests/security/staging-publish-env-closure-03w.test.ts` (سطر 74) | `expectedProductionRef` = `["pwapiv", "qjofdsev", "ycegph"].join("")` |
| `tests/security/csp-report-only-2026-10.test.ts` (الأسطر 13، 78، 103، 104) | استبدال المرجع القديم بالجديد في المواضع الأربعة |
| `tests/mobile/native-file-redirect.test.ts` (الأسطر 5، 16 إلى 20) | استبدال المرجع القديم بالجديد في كل المواضع |
| `tests/security/cloudflare-staging-deployment-04d.test.ts` (سطر 82) | استبدال المرجع القديم بالجديد |
| `tests/security/assurance-02/target-guard.ts` (سطر 19) | `DENIED_FRAGMENTS = ["wpmicqriltrowwonknox", "pwapivqjofdsevycegph", "quboolye.com"]`، أي إضافة الجديد مع إبقاء القديم |

### ما لا يُغيَّر

- الإشارات التاريخية في `tests/b1-*`، و`docs/`، و`MATRIX.json`، و`portal-d02-*`: هذه سجلات أدلة سابقة.
- اختبارات `tests/mobile/offline-first/*`: تستخدم المرجع القديم كمثال فقط، ولا تعتمد عليه.

### ملاحظات

- بعد الدمج تتوقف البروفة (`saba-uni-portal-college`) تلقائياً، لأن ملف `staging` يرفض مرجع
  الإنتاج الجديد. هذا مقصود. يُحذف عاملها لاحقاً من لوحة Cloudflare.
- التحقق الإلزامي على الفرع: `bunx tsc --noEmit`، و`bun test tests/security tests/mobile tests/student-requests`،
  و`git diff --check`.

---

## د. سير العمل الإنتاجي `cloudflare-production.yml` (ضمن نفس الفرع)

يُنسخ من `cloudflare-college-rehearsal.yml` مع الفروق التالية فقط:

| البند | البروفة | الإنتاج |
|---|---|---|
| اسم العامل | `saba-uni-portal-college` | `saba-uni-portal-production` |
| `VITE_PORTAL_DEPLOY_TARGET` | `staging` | `production` |
| النطاقات | ممنوعة (workers.dev فقط) | `routes: [{ pattern: "quboolye.com", custom_domain: true }, { pattern: "www.quboolye.com", custom_domain: true }]`، وتُضاف في سكربت تحضير خاص بالإنتاج |
| أسرار العامل | `SUPABASE_URL`، `SUPABASE_PUBLISHABLE_KEY`، `SUPABASE_SERVICE_ROLE_KEY`، `PORTAL_DEPLOY_TARGET=staging` | نفس الثلاثة + `PORTAL_DEPLOY_TARGET=production` + `RESEND_API_KEY` + `SITE_URL=https://quboolye.com` |
| الفحص بعد النشر | `verify-cloudflare-staging-deployment.ts` على workers.dev | `/version.json` يطابق الـSHA، و`/` و`/portal-login` بحالة 200 على `https://quboolye.com` |
| البيئة | `supabase-migration` | `supabase-migration`، أو بيئة `production` بموافقة يدوية (Required reviewers = المالك) |

يبقى من البروفة: التشغيل يدوي فقط، ومن `main` فقط، والـSHA يساوي رأس main، وdry-run وحد الحجم، والتراجع عند فشل الفحص.

---

## هـ. فحص ما بعد الانتقال

| # | الاختبار | المتوقع |
|---|---|---|
| 1 | `https://quboolye.com` و`https://www.quboolye.com` | الصفحة الرئيسية، وشهادة HTTPS سليمة |
| 2 | دخول الإدارة، وطالب، وعضو هيئة تدريس، ورئيس قسم | يعمل بكلمات المرور نفسها، وكل مستخدم يسجّل الدخول مرة جديدة |
| 3 | طلب طالب ومعالجته خطوة واحدة | ينجح، ويُسجَّل في قاعدة الكلية |
| 4 | تحميل مادة مقرر وشهادة قيد صادرة | الملف يفتح |
| 5 | تطبيق الجوال (APK الحالي) | يفتح `quboolye.com/mobile/student-login` ويعمل دون تحديث |
| 6 | إشعار بريد تجريبي | يصل، ويظهر في `email_logs` بحالة `sent` |
| 7 | Lovable Cloud | لا تصله كتابات جديدة، أي تبقى أعداد جداوله ثابتة |

---

## و. التراجع (إن فشل الفحص)

1. في Cloudflare ← Workers ← `saba-uni-portal-production` ← Domains: إزالة النطاقين.
2. إعادة سجلات DNS لـ`quboolye.com` و`www` كما في صورة الخطوة A1، فتعود الحركة إلى Lovable.
3. قاعدة Lovable لم تُمس، لكن أي إدخال تم على القاعدة الجديدة بعد الفتح لا يعود تلقائياً.
4. لا يُرجَع `main` بـreset. يُفتح طلب دمج عكسي للتعديلات في القسم ج، وذلك فقط إن تقرر البقاء على Lovable.

## ز. بعد أسبوع مستقر

- إيقاف نشر Lovable (Unpublish) وإزالة النطاق منه.
- حذف عامل البروفة `saba-uni-portal-college`.
- إزالة الحاوية `migration-private` بعد حفظ نسخة التصدير الأخيرة خارجياً.
