# GP-3 — تصحيح عقد المسودة/النشر وإغلاق الملف

## نتيجة الفحص الحالي (مثبتة من الإنتاج والمصدر)

- `gp_admin_save_policy_draft` **لا** يستدعي أي تحقق: حفظ المسودة الناقصة مسموح بالفعل على مستوى قاعدة البيانات.
- `gp_admin_publish_policy` يستدعي `gp_validate_policy` ويرفع `GP_POLICY_VALIDATION_FAILED` عند وجود أي خطأ — الحماية Backend-side وليست UI فقط.
- الخلل الوحيد في الواجهة: زر «حفظ كمسودة» معطّل عندما تكون قائمة الأخطاء غير فارغة، أي أن المنع جاء من الواجهة لا من الخادم.
- الفترات (`proposal_window_*`, `defense_window_*`) اليوم **اختيارية** عند النشر؛ التحقق يفرض فقط: البداية والنهاية معًا، والبداية قبل النهاية.

## المطلوب تنفيذه

### 1. فصل عقد الحفظ عن عقد النشر (واجهة)
- `validateGraduationProjectPolicy` تُقسم إلى مستويين:
  - `validateDraftPolicy` — أخطاء بنيوية فقط (قيم خارج المدى، الحد الأعلى أقل من الأدنى، فترة ببداية بلا نهاية، منع المشرف المشارك). لا تعتبر الحقول الفارغة خطأ.
  - `validatePolicyForPublish` — كل ما سبق + إلزامية كل الحقول الأكاديمية (مرآة لـ `gp_validate_policy`).
- في اللوحة: زر «حفظ كمسودة» يُعطَّل فقط بأخطاء المسودة؛ زر «نشر الإصدار» يُعطَّل بأخطاء النشر، مع عرض قائمتين منفصلتين: «يمنع الحفظ» و«يمنع النشر».
- عند فتح مسودة ناقصة تظهر رسالة إرشادية: المسودة قابلة للحفظ المرحلي، والنشر يتطلب اكتمالها.

### 2. حسم سلوك الفترات عند النشر (قاعدة البيانات)
Migration تُحدّث `gp_validate_policy` فقط لتضيف إلزامية الفترات عند النشر:
- `proposal_window_start` و`proposal_window_end` مطلوبان.
- `defense_window_start` و`defense_window_end` مطلوبان.
- تبقى قواعد الاتساق كما هي (البداية قبل النهاية).
لا تغيير على الأعمدة (تظل nullable لدعم المسودات)، ولا على `gp_admin_save_policy_draft`، ولا على المشاريع الستة الحالية.

### 3. إثبات العقد
اختبارات وحدة على مستويي التحقق + تحقق تنفيذي على الإنتاج بمسودة TEST_ONLY:
- حفظ مسودة ناقصة → ALLOW.
- نشر المسودة الناقصة → DENY برسالة الحقول الناقصة.
- استكمال القيم والفترات ثم النشر → ALLOW.
ثم تُحذف المسودة الاختبارية دون المساس بأي بيانات أخرى.

## العقد النهائي بعد التنفيذ

```text
INCOMPLETE_DRAFT_SAVE         = ALLOW
INCOMPLETE_POLICY_PUBLISH     = DENY   (backend: gp_validate_policy)
COMPLETE_VALID_POLICY_PUBLISH = ALLOW
PROPOSAL/DEFENSE_WINDOWS      = REQUIRED_AT_PUBLISH (documented)
```

## بعدها

إغلاق GP-3 والانتقال مباشرة إلى GA-1 (كتالوج أنواع المتابعات)، GA-2 (Workflow مُصدَّر للمتابعات)، GA-3 (تثبيت المتابعات الجديدة على إصدار الـWorkflow).

## تفاصيل تقنية

- ملفات: `src/lib/graduation-projects/policies.ts`، `src/components/graduation-projects/GraduationProjectPolicyPanel.tsx`، `tests/graduation-projects/policies.test.ts`.
- Migration واحدة فقط: `CREATE OR REPLACE FUNCTION public.gp_validate_policy` (forward-only، بلا تعديل أي migration مطبقة).
- لا تغيير على `gp_effective_policy` ولا على منطق fail-closed لإنشاء المشاريع.
