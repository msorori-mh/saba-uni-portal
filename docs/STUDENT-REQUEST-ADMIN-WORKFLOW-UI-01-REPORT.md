# STUDENT-REQUEST-ADMIN-WORKFLOW-UI-01 Report

**التاريخ:** 2026-07-07  
**المستودع:** `C:\projects\saba-uni-portal-git`  
**GitHub:** [msorori-mh/saba-uni-portal](https://github.com/msorori-mh/saba-uni-portal)  
**القرار:** **PASS_WITH_NOTES**

---

## 1. Executive Summary

| البند | النتيجة |
|-------|---------|
| **القرار** | **PASS_WITH_NOTES** |
| **ما تم إنجازه** | صفحة إعداد دورة الحياة + محرر خطوات/انتقالات + ربط من قائمة أنواع الطلبات |
| **جاهزية كمسودة أولية** | **نعم** — واجهة عربية قابلة للتوسع؛ الحفظ معطّل حتى RPC الحفظ |

**الخلاصة:** أُضيف مسار `/admin/request-types/:id/workflow` مع محرر workflow أولي يقرأ الإعدادات عبر `admin_get_request_workflow_config` عند توفرها، ويعرض حالات فارغة/تحذيرات عند غياب المخطط أو RPC. زر الحفظ معطّل برسالة واضحة. لا كتابة مباشرة إلى جداول workflow.

---

## 2. Scope

| ضمن النطاق | خارج النطاق |
|------------|-------------|
| routes/components أدمن | migrations |
| client/server helpers للقراءة | DB apply / seed |
| تقرير المرحلة | `admin_save_request_workflow_config` |
| | INSERT/UPDATE مباشر من UI |
| | commit / push / PR |

---

## 3. Files Changed

### منشأة (هذه المرحلة)

| الملف |
|-------|
| `src/routes/admin/request-types.$id.workflow.tsx` |
| `src/components/admin/request-workflow/constants.ts` |
| `src/components/admin/request-workflow/WorkflowStepsEditor.tsx` |
| `src/components/admin/request-workflow/WorkflowTransitionsEditor.tsx` |
| `src/lib/admin-request-workflow-rpc.ts` |
| `src/lib/admin-request-workflow.functions.ts` |
| `docs/STUDENT-REQUEST-ADMIN-WORKFLOW-UI-01-REPORT.md` |

### معدّلة (هذه المرحلة)

| الملف | التغيير |
|-------|---------|
| `src/routes/admin/request-types.tsx` | زر «إعداد دورة الحياة» لكل نوع |
| `src/routeTree.gen.ts` | توليد تلقائي للمسار الجديد (عبر build) |

---

## 4. Admin UI Changes

### زر إعداد دورة الحياة

- **الموقع:** صفحة `/admin/request-types` — بجانب أزرار التعديل/الحذف/التفعيل لكل صف.
- **النص:** «إعداد دورة الحياة» مع أيقونة `GitBranch`.

### المسار الجديد

```
/admin/request-types/:id/workflow
```

مثال: `/admin/request-types/{uuid}/workflow`

- RBAC: يورث صلاحيات `/admin/request-types` عبر `resolveAdminRouteRoles` (prefix match).

### محتوى الصفحة

1. رأس: اسم نوع الطلب + الكود + رابط العودة.
2. شارة حالة workflow: لا يوجد / مسودة / نشط / مُوقوف.
3. ملخص إصدارات/خطوات/انتقالات من RPC إن وُجدت.
4. محرر **خطوات المعالجة**.
5. محرر **الانتقالات**.
6. منطقة الحفظ (معطّلة) مع ملاحظة عربية.

---

## 5. Workflow Builder Features

| الميزة | الوصف |
|--------|--------|
| **الخطوات** | إضافة/حذف/تعديل محلي: `step_key`, الاسم، الترتيب، نوع الإجراء، flags (ظهور، إشعار، إرجاع، رفض، تخطي) |
| **الجهات** | قائمة من `request_processing_units` عبر server fn؛ رسالة تحذير إذا المخطط غير مطبّق |
| **الأدوار** | قائمة من `request_processing_roles` مفلترة حسب الجهة |
| **الانتقالات** | من خطوة / نتيجة إجراء / إلى خطوة / افتراضي |
| **الحفظ** | زر معطّل — `ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE = false` |

عند نجاح `admin_get_request_workflow_config` تُحمَّل الخطوات والانتقالات إلى حالة محلية للتحرير (بدون حفظ).

---

## 6. Save Limitation

| البند | الحالة |
|-------|--------|
| RPC `admin_save_request_workflow_config` | **غير منفّذ** في migrations |
| `rpcAdminSaveRequestWorkflowConfig` | stub يرفع خطأ برسالة عربية |
| زر «حفظ دورة الحياة» | **disabled** دائماً في هذه المرحلة |
| رسالة المستخدم | «حفظ دورة الحياة يحتاج تفعيل خدمة الحفظ أولاً…» |
| كتابة مباشرة لجداول workflow | **ممنوعة** — لم تُستخدم |

---

## 7. Checks

| الفحص | النتيجة |
|-------|---------|
| `npm run build` | ✅ نجح (exit 0) |
| `git diff --check` | ✅ لا أخطاء whitespace — تحذير CRLF على `routeTree.gen.ts` (قديم/متوقع) |
| `git status --short` | ملفات UI workflow جديدة + تعديل `request-types.tsx` |

---

## 8. Deferred

- RPC `admin_save_request_workflow_config` + تفعيل زر الحفظ.
- تطبيق سلسلة migrations 130000–190000.
- seed/config لجهات المعالجة والمسميات.
- runtime smoke بعد apply + workflow config فعلي.
- إشعارات ومرفقات workflow.
- تحسينات UX (سحب-وإفلات للترتيب، معاينة بصرية للgraf).

---

## 9. No-Write Assurance

| البند | الحالة |
|-------|--------|
| تعديل قاعدة البيانات | ❌ |
| تشغيل migration | ❌ |
| إدخال بيانات / seed | ❌ |
| service role من الواجهة | ❌ (server fn يستخدم الأنماط القائمة فقط للقراءة) |
| INSERT/UPDATE workflow من UI | ❌ |
| commit | ❌ |
| push | ❌ |
| PR | ❌ |

---

## 10. PASS_WITH_NOTES — الملاحظات

1. **قراءة RPC** قد تفشل قبل apply — تُعرض رسالة «خدمة قيد التحديث» والمحرر يعمل كمسودة محلية.
2. **الجهات/المسميات** تعتمد migration 160000 + بيانات لاحقة؛ رسالة واضحة عند غياب الجدول.
3. **student_affairs** يرى الصفحة (nav) لكن `admin_get_request_workflow_config` في SQL يقتصر على admin/registrar — قد يرى خطأ صلاحية عند apply؛ يُوصى بمواءمة الأدوار في مرحلة RPC لاحقة.
4. **لا اختبار يدوي في المتصفح** في هذه المرحلة — الاعتماد على `npm run build`.
