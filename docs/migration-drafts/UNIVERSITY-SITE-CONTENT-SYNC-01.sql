-- DRAFT ONLY — DO NOT APPLY FROM THIS PATH.
-- UNIVERSITY-SITE-CONTENT-SYNC-01
-- مطابقة بيانات الموقع العام المخزنة في قاعدة البيانات مع صفحة الكلية في موقع
-- جامعة إقليم سبأ (usr.edu.ye) — نُسخت النصوص كما هي من الصفحات بتاريخ 2026-10-04.
-- هذه كتابة بيانات إنتاجية: لا تُنفَّذ إلا بتفويض صريح، ويمكن إدخال القيم نفسها
-- يدوياً من /admin/settings بدلاً من تنفيذ هذا الملف.
--
-- يشمل فقط ما تأكد من المصدر. لم يُدرج: الرؤية، الأهداف، القيم، كلمة العميد،
-- نبذة الكلية، الهيكل التنظيمي، الكادر، وأوصاف البرامج (المنشورة مبتورة «…»).

BEGIN;

-- معلومات التواصل (صفحة «معلومات التواصل»)
UPDATE public.site_settings SET setting_value = 'itandcs@usr.edu.ye', updated_at = now()
 WHERE setting_key = 'contact_email';
UPDATE public.site_settings SET setting_value = '6302008', updated_at = now()
 WHERE setting_key = 'contact_phone';
UPDATE public.site_settings SET setting_value = 'اليمن - مأرب - المدينة — جامعة إقليم سبأ', updated_at = now()
 WHERE setting_key = 'contact_address';

-- رسالة الكلية (صفحة «الرسالة»)
UPDATE public.site_settings
   SET setting_value = 'تقديم برامج تعليمية وبحثية متميزة؛ لتأهيل كفاءات منافسة في مجال تكنولوجيا المعلومات وعلوم الحاسوب، والإسهام في خدمة المجتمع، وفقاً لمعايير الجودة والاعتماد الأكاديمي، ومتطلبات سوق العمل.',
       updated_at = now()
 WHERE setting_key = 'mission';

-- رابط البوابة: النطاق القديم portal.it.saba.edu.ye غير مستخدم.
UPDATE public.site_settings SET setting_value = 'https://quboolye.com/portal-login', updated_at = now()
 WHERE setting_key = 'portal_link' AND setting_value LIKE '%it.saba.edu.ye%';

-- أسماء البرامج الرسمية (صفحة «خطط البرامج الدراسية» — خمسة برامج بكالوريوس):
--   بكالوريوس الأمن السيبراني
--   بكالوريوس الذكاء الاصطناعي (يركز على علم البيانات)
--   بكالوريوس تكنولوجيا المعلومات
--   بكالوريوس علوم الحاسوب
--   بكالوريوس نظم المعلومات
-- تحديث الأسماء/الأوصاف في جدول البرامج مؤجل حتى تُراجع الرموز الفعلية في الإنتاج
-- وتتوفر الأوصاف الكاملة من صفحات البرامج.

COMMIT;
