# PORTAL-FINAL-PRODUCTION-APPLY-ONE-OWNER-RUNBOOK-01

**دليل التطبيق الفردي والتحقق الإنتاجي النهائي لقاعدة البيانات — بروتوكول المالك الأحادي (Apply-One Policy)**

- **المعرّف**: `PORTAL-FINAL-PRODUCTION-APPLY-ONE-OWNER-RUNBOOK-01`
- **الفرع المصشتق**: `docs/portal-final-production-runbook-prep-01`
- **شجرة العمل**: `C:\projects\saba-production-runbook-prep`
- **مرجع الـ RC غير شامل B1**: PR `#313` (`rc/portal-final-v4-prebuild-non-b1-01`) — الـ SHA الحالية: `e3db0cc330106518d5ab9ca6874d70d9e98b1411`
- **مرجع B1**: PR `#310` (`B1_FINAL_SHA=PENDING` لحين إغلاق `LONGRUN-18`)
- **وضع التنفيذ**: **PREPARATION ONLY** (`PRODUCTION_EXECUTION=NOT_AUTHORIZED`)
- **سياسة التطبيق**: **STRICT APPLY-ONE POLICY** (`max_migrations_per_apply_session=1`, `batch_apply_forbidden=true`, `parallel_apply_forbidden=true`, `ci_auto_apply_forbidden=true`)

---

## 1. بروتوكول التسلسل الملزم (Mandatory Sequence Policy)

تُطبّق كل migration إنتاجية بشكل فردي ومفصل باتباع دورة الحركة الثمانية التالية حصراً:

```
[1. PREFLIGHT] 
       │
       ▼
[2. OWNER GO] 
       │
       ▼
[3. APPLY EXACTLY ONE MIGRATION] 
       │
       ▼
[4. VERIFY OBJECT CREATION] 
       │
       ▼
[5. PROTECTED SURFACE CHECK] 
       │
       ▼
[6. RECORD EVIDENCE] 
       │
       ▼
[7. OWNER GO FOR NEXT STEP] 
       │
       ▼
[8. NEXT MIGRATION IN GRAPH]
```

### قواعد البروتوكول المشددة:
1. **يُمنع منعاً باتاً التطبيق الجماعي (Batch Apply)**: كل ملف SQL يُنفّذ في معاملة مستقّلة تماماً.
2. **قرار المالك المستقل (Owner Go Required)**: لا يجوز الانتقال لـ migration تالية دون قرار موافقة صريح ومستقل من المالك المسؤول لكل خطوة.
3. **التوقف الفوري عند أي انحراف (Stop-on-Anything)**: أي فشل في فحص ما قبل التشغيل (Preflight)، أو خطأ تنفيذ (Apply Failure)، أو عدم اكتمال الكائنات المتوقعة (Verify Failure)، أو أي خرق لثوابت السجلات المحمية ⇒ **توقف فوري وكامل للتسلسل**.
4. **التعافي إلى الأمام فقط (Forward-Only Recovery)**: يُمنع استخدام down-migrations أو `DELETE` أو إعادة كتابة السجلات التاريخية أو `migration repair`. أي تعافٍ يتم عبر migration جديدة مُراجعة ومُعتمدة تُطبق إلى الأمام (`ROLLBACK_BY_FORWARD`).

---

## 2. رسم بياني للتسلسل المعتمد (Release Migration Graph)

يتكون المخطط النهائي للإصدار المعتمد من PR #313 (بالإضافة إلى B1 المعلقة PR #310) من التسلسلات التالية:

```
[الأنظمة الأكاديمية (Councils C0 → C9)]
  C0 ──► C1 ──► C2 ──► C3 ──► C4 ──► C5 ──► C6 ──► C7 ──► C8 ──► C9
                                                                  │
[شؤون الخريجين (GA Foundation → Completion → Auth-04)]              │
  GA-Foundation ──► GA-Completion ──► GA-Auth-04 ─────────────────┼─► [مشاريع التخرج (GP)]
                                                                  │     GP Sequence ──► L4 Guard (20260808010000)
                                                                  │
[الخدمات الخمس B1 (PR #310 - PENDING)]                             │
  B1-Seq01 ──► ... ──► B1-Seq19/20 ──► B1-Academic-Effects(25..27) ──┘
```

---

## 3. مواصفات التنفيذ التفصيلية لكل Migration (Detailed Migration Execution Specifications)

---

### أولاً: نظام المجالس الأكاديمية (Academic Councils C0 → C9)

#### 1.1 Council C0: Base Council Attachments & Schema
- **sequence**: `COUNCILS-MIG-01`
- **system**: `Councils (C0)`
- **migration filename**: `20260708120000_council_topic_attachments.sql`
- **dependency**: `GA Foundation Baseline`
- **expected pre-state**: `supabase_migrations.schema_migrations` لا يحتوي على اسم الملف أو الـ SHA؛ جدول `council_topics` موجود.
- **read-only preflight**:
  ```sql
  SELECT count(*) FROM information_schema.tables WHERE table_name = 'council_topic_attachments';
  ```
  *المتوقع*: `0`
- **OWNER_GO_REQUIRED**: `GATE_OWNER_COUNCILS_C0`
- **single migration apply template**:
  ```bash
  supabase migration up --local # أو التنفيذ الفردي المباشر عبر psql المعتمد في جلسة واحدة
  ```
- **post-verifier**:
  ```sql
  SELECT count(*) FROM information_schema.tables WHERE table_name = 'council_topic_attachments';
  ```
  *المتوقع*: `1`
- **protected surfaces**: عدم مساس جدول `council_topics` أو سجلات المجالس السابقة.
- **stop condition**: فشل إنشأ الجدول أو انحراف الصلاحيات.
- **forward-recovery strategy**: تطبيق migration أمامي يتضمن `CREATE TABLE IF NOT EXISTS` وتصحيح الصلاحيات (`ROLLBACK_BY_FORWARD`).

#### 1.2 Council C1: Department Councils Seed Data
- **sequence**: `COUNCILS-MIG-02`
- **system**: `Councils (C1)`
- **migration filename**: `20260709120000_department_councils_seed.sql`
- **dependency**: `COUNCILS-MIG-01`
- **expected pre-state**: `council_topic_attachments` موجود؛ `councils` لا تحتوي على البيانات البذرية الحديثة.
- **read-only preflight**:
  ```sql
  SELECT count(*) FROM councils WHERE code LIKE 'DEPT_%';
  ```
- **OWNER_GO_REQUIRED**: `GATE_OWNER_COUNCILS_C1`
- **single migration apply template**:
  ```sql
  -- Apply strictly: 20260709120000_department_councils_seed.sql
  ```
- **post-verifier**:
  ```sql
  SELECT count(*) >= 1 FROM councils WHERE code LIKE 'DEPT_%';
  ```
- **protected surfaces**: `councils` القائمة ورؤساء الأقسام المعينين سابقاً.
- **stop condition**: تعارض في المفاتيح الفريدة (`code`) أو فشل الـ INSERT.
- **forward-recovery strategy**: migration تصحيح بيانات بذرية بالتقدم `ON CONFLICT DO UPDATE` (`ROLLBACK_BY_FORWARD`).

#### 1.3 Council C2: Schedule Helpers & Meeting Utilities
- **sequence**: `COUNCILS-MIG-03`
- **system**: `Councils (C2)`
- **migration filename**: `20260710120000_council_meeting_schedule_helpers.sql`
- **dependency**: `COUNCILS-MIG-02`
- **expected pre-state**: الجداول الأساسية موجودة؛ دوال المساعدة غير مضافة.
- **read-only preflight**:
  ```sql
  SELECT count(*) FROM pg_proc WHERE proname = 'get_next_council_meeting_date';
  ```
- **OWNER_GO_REQUIRED**: `GATE_OWNER_COUNCILS_C2`
- **single migration apply template**:
  ```sql
  -- Apply strictly: 20260710120000_council_meeting_schedule_helpers.sql
  ```
- **post-verifier**:
  ```sql
  SELECT count(*) FROM pg_proc WHERE proname = 'get_next_council_meeting_date';
  ```
  *المتوقع*: `>= 1`
- **protected surfaces**: دوال وحزم المجالس السابقة.
- **stop condition**: أخطاء بناء SQL في الدوال أو تعارض التوقيعات.
- **forward-recovery strategy**: `CREATE OR REPLACE FUNCTION` لتصحيح الدالة بحزمة جديدة (`ROLLBACK_BY_FORWARD`).

#### 1.4 Councils C3 → C9 Sequential Steps (Hardening, Intake, Attendance, Notifications & Security)
- **sequence**: `COUNCILS-MIG-04` إلى `COUNCILS-MIG-10`
- **system**: `Councils (C3 → C9)`
- **migration filenames**: المزيج الكامل المدمج في PR #311 (#311 Academic Councils).
- **dependency**: الخطوة السابقة مباشرة (C(n-1)).
- **expected pre-state**: نجاح الخطوة C(n-1) وإثبات كائناتها في Catalog.
- **read-only preflight**: فحص وجود الدوال والسياسات الخاصة بالخطوة المعلنة.
- **OWNER_GO_REQUIRED**: `GATE_OWNER_COUNCILS_C3` حتى `GATE_OWNER_COUNCILS_C9` لكل خطوة مفردة.
- **single migration apply template**: تنفيذ المعاملة المفردة للملف المخصص حصراً.
- **post-verifier**: استعلام Catalog مخصص يثبت وجود السياسات/الدوال الجديدة.
- **protected surfaces**: جداول القرارات والمجالس التاريخية والمرفقات.
- **stop condition**: أي فشل RLS، أو رفض صلاحية، أو خطأ تركيب SQL.
- **forward-recovery strategy**: إصلاح RLS أو الدوال عبر migration تكميلية أماميًا (`ROLLBACK_BY_FORWARD`).

---

### ثانياً: نظام شؤون الخريجين (Graduates Affairs GA)

#### 2.1 GA Foundation: Email & Request Foundations
- **sequence**: `GA-MIG-01`
- **system**: `Graduates Affairs (GA)`
- **migration filename**: `20260711000000_staff_profiles_university_email.sql`
- **dependency**: Base Production Migration Tip
- **expected pre-state**: العمود `university_email` غير موجود في `staff_profiles` أو غير مكيّف.
- **read-only preflight**:
  ```sql
  SELECT count(*) FROM information_schema.columns WHERE table_name = 'staff_profiles' AND column_name = 'university_email';
  ```
- **OWNER_GO_REQUIRED**: `GATE_OWNER_GA_FOUNDATION`
- **single migration apply template**:
  ```sql
  -- Apply strictly: 20260711000000_staff_profiles_university_email.sql
  ```
- **post-verifier**:
  ```sql
  SELECT count(*) FROM information_schema.columns WHERE table_name = 'staff_profiles' AND column_name = 'university_email';
  ```
  *المتوقع*: `1`
- **protected surfaces**: سجلات الموظفين الحالية ووسوم البريد الإلكتروني.
- **stop condition**: فشل إضافة العمود أو تعارض القيود.
- **forward-recovery strategy**: migration تصحيح هيكلية العمود إلى الأمام (`ROLLBACK_BY_FORWARD`).

#### 2.2 GA Completion & Admin Restrict Workflow Activation
- **sequence**: `GA-MIG-02`
- **system**: `Graduates Affairs (GA)`
- **migration filename**: `20260713010000_restrict_workflow_activation_to_admins.sql`
- **dependency**: `GA-MIG-01`
- **expected pre-state**: دالة/سياسة تفعيل سير العمل مسموحة للجميع أو غير مقيدة بالأدمن حصراً.
- **read-only preflight**: فحص نص السياسة الحالي على `student_request_workflows`.
- **OWNER_GO_REQUIRED**: `GATE_OWNER_GA_COMPLETION`
- **single migration apply template**:
  ```sql
  -- Apply strictly: 20260713010000_restrict_workflow_activation_to_admins.sql
  ```
- **post-verifier**:
  ```sql
  SELECT count(*) FROM pg_policies WHERE tablename = 'student_request_workflows' AND policyname LIKE '%admin%';
  ```
- **protected surfaces**: جميع نماذج وسلسلة سير الطلبات المعتمدة.
- **stop condition**: حظر الأدمن المشكوك فيه أو تعطل صلاحيات التفعيل.
- **forward-recovery strategy**: إعادة صياغة سياسة RLS بمستند تصحيحي أمامي (`ROLLBACK_BY_FORWARD`).

#### 2.3 GA Authorization-04 Hardening
- **sequence**: `GA-MIG-03`
- **system**: `Graduates Affairs (GA Auth-04)`
- **migration filename**: `20260723061809_7f864e4b-262d-4dce-8475-d663377fb472.sql`
- **dependency**: `GA-MIG-02` (PR #299 المدمج)
- **expected pre-state**: صلاحيات GA بحاجة إلى تقييد الوصول المباشر عبر RPC.
- **read-only preflight**: فحص وجود شروط `processing_unit` و `processing_role` على RPC شؤون الخريجين.
- **OWNER_GO_REQUIRED**: `GATE_OWNER_GA_AUTH04`
- **single migration apply template**:
  ```sql
  -- Apply strictly PR #299 Auth-04 migration
  ```
- **post-verifier**:
  ```sql
  SELECT count(*) FROM pg_proc WHERE proname LIKE 'ga_%' AND prosecdef = true;
  ```
- **protected surfaces**: بيانات الخريجين ومستندات الإخلاء والتخريج.
- **stop condition**: فشل التحقق السلبي (ALLOW سمح لغير المخصصين).
- **forward-recovery strategy**: تحديث دالة RPC لمنع التجاوزات عبر migration أمامي (`ROLLBACK_BY_FORWARD`).

---

### ثالثاً: نظام مشاريع التخرج (Graduation Projects GP)

#### 3.1 GP Storage Policy & Auth Remediation
- **sequence**: `GP-MIG-01`
- **system**: `Graduation Projects (GP)`
- **migration filename**: `20260727120000_gp_storage_insert_policy_auth_01.sql` (أو ما يماثلها في PR #293)
- **dependency**: Base Schema
- **expected pre-state**: سياسة التخزين للمشاريع بحاجة إلى ضبط التحقق من جلسة المستندات المرفقة.
- **read-only preflight**:
  ```sql
  SELECT count(*) FROM pg_policies WHERE tablename = 'objects' AND policyname LIKE '%gp_student%';
  ```
- **OWNER_GO_REQUIRED**: `GATE_OWNER_GP_MIGRATIONS`
- **single migration apply template**:
  ```sql
  -- Apply strictly: GP Storage Policy Migration
  ```
- **post-verifier**:
  ```sql
  SELECT count(*) FROM pg_policies WHERE tablename = 'objects' AND policyname LIKE '%gp_student%';
  ```
- **protected surfaces**: حاويات تخزين المستندات الأكاديمية الحالية `storage.objects`.
- **stop condition**: السماح بالرفع لغير المخولين أو تعطل رفع الطلاب.
- **forward-recovery strategy**: تعديل سياسة RLS للـ bucket بـ SQL جديد أمامي (`ROLLBACK_BY_FORWARD`).

#### 3.2 GP Level-4 Student Eligibility Guard
- **sequence**: `GP-MIG-02`
- **system**: `Graduation Projects (GP L4 Guard)`
- **migration filename**: `20260808010000_gp_student_level4_only_eligibility_guard_01.sql`
- **dependency**: `GP-MIG-01`
- **expected pre-state**: طلاب المستويات 1-3 يمكنهم تسجيل مشاريع تخرج دلالياً دون حارس صلب في قاعدة البيانات.
- **read-only preflight**:
  ```sql
  SELECT count(*) FROM pg_proc WHERE proname = 'check_gp_student_level4_eligibility';
  ```
  *المتوقع*: `0`
- **OWNER_GO_REQUIRED**: `GATE_OWNER_GP_LEVEL4_ACTIVATION`
- **single migration apply template**:
  ```sql
  -- Apply strictly: 20260808010000_gp_student_level4_only_eligibility_guard_01.sql
  ```
- **post-verifier**:
  ```sql
  SELECT count(*) FROM pg_proc WHERE proname = 'check_gp_student_level4_eligibility';
  ```
  *المتوقع*: `1`
- **protected surfaces**: مشاريع التخرج القائمة وحالات تسجيل الطلاب الحالية.
- **stop condition**: حظر طالب مستوى 4 مستحق أو السماح لطالب مستوى أقل من 4.
- **forward-recovery strategy**: تصحيح شرط المستوى في دالة الحارس عبر migration أمامي (`ROLLBACK_BY_FORWARD`).

---

### رابعاً: نظام الخدمات الخمس B1 (PR #310 — PENDING)

*(ملاحظة: تبقى هذه المداخل معلقة بحالة `B1_FINAL_SHA=PENDING` لحين إغلاق `LONGRUN-18` وثبوت الـ SHA النهائي)*

#### 4.1 B1 Sequential Manifest (Entries 01 → 19 / 20)
- **sequence**: `B1-SEQ-01` إلى `B1-SEQ-19`
- **system**: `Student Requests B1 (Five Services)`
- **migration filenames**: المحددة في `docs/b1/B1-SEQUENTIAL-APPLY-MANIFEST.json`
- **dependency**: التسلسل المباشر للـ manifest (مثال: seq 04 يعتمد على seq 02 و 03).
- **expected pre-state**: حالة `NOT_APPLIED` مثبتة في الكتالوج لكل مدخل قبل تطبيقه.
- **read-only preflight**: تشغيل استعلامات Preflight الموثقة في `B1-SEQUENTIAL-APPLY-MANIFEST.json` لكل مدخل.
- **OWNER_GO_REQUIRED**: قرارات المالك البنائية `GATE_OWNER_B1_FRESH_BASELINE` لـ B1.
- **single migration apply template**: تطبيق المعاملة الفردية الواحدة لكل مدخل بالترتيب.
- **post-verifier**: مجسات الكائنات `expected_object_proof` واختبارات Bun التعاقدية.
- **protected surfaces**: وثيقة `enrollment_certificate` وسجلات الأسباب التاريخية.
- **stop condition**: أي فشل في فحص preflight أو verify أو خرق للسجلات المحمية.
- **forward-recovery strategy**: المعالجة بالتقدم فقط حصراً وفق `partial_apply_detection` و `rollback_by_forward`.

---

## 4. خطة التنفيذ لما بعد قاعدة البيانات (Post-Database Execution Plan)

تُحدد هذه الخطة الخطوات التشغيلية التتبعية التي تُنفذ **بعد** اكتمال تطبيق كافة الـ migrations وتأكيد سلامة قاعدة البيانات. **يُمنع تنفيذ أي من هذه الخطوات في المهمة الحالية**:

```
[1. Build Provenance Check]
            │
            ▼
[2. Deployment Owner Gate] ──► [3. Deploy Execution] ──► [4. Deployed SHA Proof Verification]
                                                                     │
                                                                     ▼
[6. Student / Faculty / Admin Smoke Tests] ◄── [5. Feature & Visibility Owner Decisions]
            │
            ▼
[7. E2E Verification Suites (B1 / Councils / GP L4 / GA)]
            │
            ▼
[8. Enrollment Certificate Regression Suite]
            │
            ▼
[9. Final Evidence Package Compilation & Sign-off]
```

### التفاصيل الخطوية للخطة:
1. **فحص أصل البناء (Build Provenance Check)**: تأكيد مطابقة الـ Git Commit SHA مع الـ Artifact المبني عبر CI.
2. **بوابة المالك للنشر (Deployment Owner Gate)**: الحصول على التخويل الصريح والمستقل لإجراء عملية النشر على بيئة الإنتاج.
3. **التطبيق والنشر (Deploy Execution)**: رفع الأداة والملفات الثابتة إلى بيئة الاستضافة الإنتاجية.
4. **إثبات بصمة الكود المنشور (Deployed SHA Proof Verification)**: إجراء قراءة عادية (Read-back) من البيئة المباشرة لتأكيد أن `DEPLOYED_SHA` يطابق `RC313_SHA` تماماً.
5. **قرارات المالك للظهور والخصائص (Feature/Visibility Owner Decisions)**: اتخاذ قرارات فردية لتفعيل رؤية الخدمات الخمس وخصائص المجالس وشؤون الخريجين (`student_visible=true`).
6. **الاختبارات الدخانية التفاعلية (Smoke Tests)**:
   - فحص واجهة الطالب (`student smoke`).
   - فحص واجهة عضو الهيئة التدريسية (`faculty smoke`).
   - فحص واجهة مسؤول النظام (`admin smoke`).
7. **حزم الاختبارات الطرفية الشاملة (E2E Verification Suites)**:
   - تشغيل اختبارات الخدمات الخمس B1.
   - تشغيل اختبارات المجالس الأكاديمية C0-C9.
   - تشغيل اختبار الإيجاب لطالب مستوى 4 في مشاريع التخرج.
   - تشغيل اختبار السلب لطلاب المستويات 1-3 في مشاريع التخرج.
   - تشغيل اختبارات شؤون الخريجين كاملة.
8. **فحص حماية شهادة القيد (Enrollment Certificate Regression Check)**: التأكد التام من أن خدمة شهادة القيد لم تتأثر بأي تعديل وبقيت مطابقة للـ Baseline المحمي.
9. **تجميع حزمة الأدلة النهائية (Final Evidence Package Compilation)**: حفظ جميع مخرجات الاستعلامات وسجلات الاختبارات وتواقيع الموافقة في حزمة أدلة رسمية.

---
