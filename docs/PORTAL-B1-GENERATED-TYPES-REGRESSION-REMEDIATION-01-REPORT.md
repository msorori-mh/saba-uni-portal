# PORTAL-B1-GENERATED-TYPES-REGRESSION-REMEDIATION-01 — تقرير الإصلاح (SOURCE-ONLY)

استعادة تعريفات B1 المولّدة المحذوفة من `src/integrations/supabase/types.ts` على فرع مستقل من أحدث `origin/main`. لا DB write ولا migration apply ولا توليد من الإنتاج.

## المرجع والسبب

- **origin/main المستخدم:** `765e1a4367a2b12e9d69ad46d9d8eec6c8c999bf` («Checked SEQ07 read-only G4-01»).
- **المرجع الموثوق للأنواع:** `c1a6a8e317fcd79ce2a4d19d0e15184ae2dd6ff4` (دمج PR #221 — آخر نقطة خضراء مثبتة).
- **الـcommit الذي أحدث الحذف:** `82e3d6df0dbd4dc15413e45dbf40b7fbbf677707` («Changes») — حذف 192 سطراً من `types.ts`. أما `63936a4f` فلمس `routeTree.gen.ts` فقط، و`d58b0db`/`765e1a4` أعادا footer الجذر ولم يمسّا `types.ts`.
- **إثبات الانحدار:** `git diff c1a6a8e origin/main -- types.ts` = **192 سطراً محذوفاً، 0 إضافات** — أي أن التغيير الوحيد على الملف منذ المرجع الموثوق هو الحذف، فلا توجد أنواع أحدث من PR #221 في هذا الملف لتحمى (بقية الملف بقيت كما هي حرفياً).

## تعريفات B1 المستعادة (القائمة الكاملة للمحذوفات)

جداول (`Tables`):
1. `file_withdrawal_details` (Row/Insert/Update)
2. `student_request_attachment_uploads` (Row/Insert/Update) — سطح المرفقات الآمنة

دوال (`Functions`):
3. `authorize_student_request_attachment_download`
4. `complete_student_request_attachment_upload`
5. `create_student_request_attachment_upload_intent`
6. `get_owned_student_request_attachment_upload`
7. `list_my_student_request_attachments`
8. `reject_student_request_attachment`

## طريقة الإصلاح (G2)

- طُبّقت الرقعة العكسية الموجهة: `git diff c1a6a8e origin/main -- types.ts | git apply -R` — إعادة إدراج الأسطر الـ192 المحذوفة فقط في مواضعها الأصلية، دون لمس أي سطر آخر.
- لم يُستبدل الملف كاملاً؛ بعد التطبيق: `git diff c1a6a8e -- types.ts` = **0 أسطر** (المطابق الحرفي للمرجع الموثوق)، و`git diff origin/main` = +192 فقط.
- لم تُخترع أي أنواع يدوياً، ولم يُولَّد الملف من Production (SEQ07→20 غير مطبقة هناك عمداً). التعريفات المستعادة هي نفسها المطابقة للـmigrations وعقود B1 المصدرية — واختبار Contract Freeze هو من يفرض هذه المطابقة (مقوّى، غير مخفف).

## نتائج التحقق

| الأمر | النتيجة |
|---|---|
| freeze test قبل الإصلاح | 4 pass / **1 fail** (السطر 109 — إثبات الفشل) |
| freeze test بعد الإصلاح | **5 pass / 0 fail** |
| `bun test tests/student-requests` | **823 pass / 0 fail** (77 ملفاً) |
| `bun test tests` | **1759 pass / 1 fail** — الفاشل الوحيد `tests/documents/enrollment-certificate-arabic-pdf-worker-runtime.test.ts` (G4 wrangler/Miniflare لا يصبح ready خلال 60s على هذا الجهاز Windows)؛ **سابق الوجود وبيئي** — مثبت على الشجرة النظيفة سابقاً، ويمر في CI (Linux). لم يُمسّ ملف الاختبار (خارج النطاق) |
| `bunx tsc --noEmit` | نجاح |
| `bunx eslint src/integrations/supabase/types.ts` | يفشل **بشكل مطابق قبل وبعد الإصلاح** (6493 خطأ prettier/CRLF على الملف عند `origin/main` نفسه): الملف مولّد وغير منسّق prettier من الأساس، وخطوة lint في CI **استشارية غير مانعة** («non-blocking during initial Production Hardening CI rollout»). أُبقي الملف مطابقاً حرفياً للتوليد الموثوق بدل إعادة تنسيق 6k+ سطر خارج نطاق «الاستعادة فقط» |
| `bun run build` | نجاح (vite + validate-tanstack-route-tree-register) |
| `git diff --check` | نظيف |

## تأكيدات النطاق

- لا DB write، لا migration apply، لا SQL، لا Production/Staging، لا توليد من قاعدة الإنتاج.
- الملفات المعدلة: `src/integrations/supabase/types.ts` فقط (+ هذا التقرير). لم تُمسّ Admin/Faculty/Student UI ولا PR #255 ولا route tree ولا migrations.

## الأثر المتوقع على PR #255

فشل CI في PR #255 (`Bun tests` — freeze test على سطر 109) سببه هذه الانحدارة على main وليس الـPR (موثّق في تعليق على PR #255). بعد دمج هذا الإصلاح إلى main، يُعاد تشغيل CI الخاص بـPR #255 فيتحول إلى الأخضر دون أي تغيير فيه (فشله المحلي المتبقٍ هو G4 البيئي فقط، ويمر في CI).

## القرار

**PASS_B1_GENERATED_TYPES_REGRESSION_REMEDIATION_PR_READY** — بانتظار تأكيد CI النهائي على الـPR.
