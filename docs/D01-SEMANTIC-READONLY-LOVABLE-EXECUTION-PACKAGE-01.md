# D01-SEMANTIC-READONLY-LOVABLE-EXECUTION-PACKAGE-01

| الحقل | القيمة |
|---|---|
| الحالة | `READY_FOR_AUTHORIZED_READONLY_EXECUTION` — حزمة قراءة فقط، **لم تُنفَّذ** (`D01_LOVABLE_AUDIT_NOT_EXECUTED`) |
| البرنامج | `PORTAL-OVERNIGHT-AUTONOMOUS-SOURCE-ACCELERATION-01` — المسار J |
| المستودع | `msorori-mh/saba-uni-portal` (خاص) |
| القاعدة | `main @ debf9d041f7c05794f6df33877f1dff91253625e` |
| الفرع | `docs/d01-semantic-readonly-lovable-package-01` |
| التدقيق المعتمد (مصدر الاستعلامات) | `docs/migration-drafts/DEPARTMENT-CHAIRS-SEMANTIC-AUDIT-READONLY-01.sql` — blob `72fad14644249e32fc3a1de24c77102c462b3245` (مدمج عبر PR #201) |
| تقرير المسار B المرجعي | `docs/DEPARTMENT-CHAIRS-SEMANTIC-AUDIT-AND-D01-REFRESH-01-REPORT.md` — blob `eb1dd4f9089322e6dc88f50b91d49c543b12f92f` |
| ذراع الإصلاح (HOLD منفصل) | `docs/migration-drafts/DEPARTMENT-CHAIRS-SEMANTIC-FIX-PACKAGE-02-PREFLIGHT.sql` — blob `4b6b7adbed8ed237f294a75655958a98b6505096` |
| قناة التنفيذ | Lovable — قناة **Read database** فقط |
| طبيعة الحزمة | مستندات فقط؛ SELECT فقط؛ صفر تعديل على الإنتاج؛ **لا تنفيذ D-01** |

---

## 1. الغرض

هذه الحزمة تُعبّئ التدقيق الدلالي المعتمد من المسار B (المدمج في `main` عبر PR #201) كحزمة تنفيذ جاهزة للصق عبر قناة **Lovable Read database**، بهدف:

1. تصنيف كراسي الأقسام الثلاثة (CS / IT / IS) إلى أحد **رموز النتائج السبعة** (§4) بشكل حتمي وقابل للتدقيق.
2. أرشفة أدلة قراءة-فقط كاملة تصلح أساسًا لقرار D-01 لاحقًا.
3. منع أي اعتماد على تسمية الأدوار: **لا مطابقة جزئية لكلمة chair إطلاقًا** — التعريف الدلالي الرسمي (استطلاع SCHEMA-INVENTORY §11) هو: صف فعّال حاليًا في `request_processing_assignments` بشرط وحدة `request_processing_units.code = 'department'` (فعّالة) + دور `request_processing_roles.code = 'department_head'` (فعّال) + `assignment_type = 'faculty_profile'` + نطاق `department_id` + نافذة `is_active / starts_at / ends_at`، والهوية عبر `faculty_profile_id -> faculty_profiles.id -> (employee_number, user_id, department_id)`.

### الكراسي القياسية الثلاثة (مثبتة بالرقم الأكاديمي)

| القسم | dept_id | الرقم الأكاديمي | الاسم المعتمد (تأكيد ثانوي) |
|---|---|---|---|
| CS | `11111111-1111-4111-8111-111111111111` | `F2025006` | د. أسامة عبدالجليل أحمد سيف |
| IT | `ce485c67-5f7c-498d-b120-4b1130a86ae8` | `F2025005` | د. خالد قاسم محمد البراحي |
| IS | `22222222-2222-4222-8222-222222222222` | `F2025004` | د. رمزي حميد الجابري |

المطابقة بالرقم الأكاديمي وUUID فقط؛ الأسماء العربية المخزنة بصياغة مبسطة وهي تأكيدات ثانوية لا أساس للمطابقة.

### الحالة الحالية وفق تقرير المسار B (تُؤكَّد عند التشغيل، لا تُفترض)

- **CS**: 0 تعيين فعّال — التصنيف المتوقع `MISSING` أو `INACTIVE` (حسب وجود صف تاريخي غير فعّال).
- **IT**: تعيينان فعّالان متزامنان — التصنيف المتوقع `DUPLICATE` (خالد الشرعي `912bdb96-3fb9-494c-8caa-7778c7d0d402` + صف أسامة الخاطئ `7ab0b14f-9007-40d6-9aaf-f1cba454ac8f`).
- **IS**: تعيين فعّال واحد — التصنيف المتوقع `MATCHED` (رمزي `4d0f434e-57ab-40b2-8a6f-5f27f330db97`).

أي انحراف عن هذه الحالة المتوقعة ⇒ إيقاف وتصعيد وفق §5/§8.

---

## 2. المتطلبات — الأعمدة التسعة

كل تشغيلة يجب أن تُنتج وتُؤرشف البيانات التسعة التالية لكل قسم (CS/IT/IS). مصدر كل عمود من استعلامات §3:

| # | العمود المطلوب | المصدر الدقيق |
|---|---|---|
| 1 | **الهوية** (identity) | `Q-AUDIT.semantic_position` (هوية الحامل عبر `faculty_profile`) + `S1` (ملفات `faculty_profiles` للأرقام الثلاثة) + `Q-AUDIT.matched_profile_count` |
| 2 | **الرقم الأكاديمي** (academic number) | `Q-AUDIT.expected_academic_number` مقابل رقم الحامل داخل `semantic_position` |
| 3 | **القسم** (department) | `Q-AUDIT.dept_label` + مرتكزات `dept_id` في جدول §1 |
| 4 | **الدور الدلالي** (semantic role) | مرتكز `chair_scope` داخل `Q-AUDIT`: وحدة `code='department'` + دور `code='department_head'` + `assignment_type='faculty_profile'` (يظهر نصًا في بادئة `semantic_position`) |
| 5 | **التعيين الفعّال** (active assignment) | `Q-AUDIT.active_assignment_count` (فعّال وضمن النافذة الحالية) |
| 6 | **كشف التكرار** (duplicate detection) | `Q-AUDIT.duplicate_count` + تفصيل الأعضاء المتزامنين من `S2` |
| 7 | **كشف الوحدة الخاطئة** (wrong-unit detection) | `Q-AUDIT.wrong_unit_count` + `holder_department_id` في `S2` |
| 8 | **التعيين المنتهي** (expired assignment) | `Q-AUDIT.expired_window_count` + صفوف `S2` بحالة `window_state='expired'` (`ends_at <= now()`) |
| 9 | **التعيين المستقبلي** (future assignment) | صفوف `S2` بحالة `window_state='future'` (`starts_at > now()`) — ضمن نفس محمّل النافذة في `Q-AUDIT` |

إضافة إلى الأعمدة التشخيصية الإلزامية في الأدلة: `inactive_assignment_count` و`out_of_scope_active_head_count` و`final_classification` (التصنيف الخام ثماني الحالات) الذي يُترجَم إلى رمز النتيجة وفق §4.

---

## 3. استعلامات SELECT الجاهزة للصق في Lovable Read

### 3.1 Q-AUDIT — الاستعلام الرئيسي (منقول حرفيًا بايت-بايت من التدقيق المعتمد)

الملف المصدر: `docs/migration-drafts/DEPARTMENT-CHAIRS-SEMANTIC-AUDIT-READONLY-01.sql` (blob `72fad14644249e32fc3a1de24c77102c462b3245`). يُلصَق كاملًا ويُنفَّذ كدفعة واحدة. يعمل داخل معاملة `SERIALIZABLE READ ONLY` وينتهي بـ `ROLLBACK`؛ صفر كتابة. ملاحظة `search_path`: المخطط `b_chairs` خاص بمختبر PG17 المحلي ولا وجود له في الإنتاج فيُتجاهل وتُحل الأسماء إلى `public` — يُترك السطر كما هو حفاظًا على التطابق الحرفي مع المعتمد.

```sql
-- ============================================================================
-- DEPARTMENT-CHAIRS-SEMANTIC-AUDIT-READONLY-01
-- Track B: DEPARTMENT-CHAIRS-SEMANTIC-AUDIT-AND-D01-REFRESH-01
-- Base: main @ 45148e0939d6e2d8f2baba792df4ca79907df8ac
--
-- READ-ONLY semantic audit of department chairs for CS / IT / IS.
-- Runs inside a READ ONLY transaction and ends with ROLLBACK. Zero writes.
--
-- SEMANTIC definition of a department chair (recon SCHEMA-INVENTORY §11):
--   an active, currently-effective row in request_processing_assignments with
--     unit  request_processing_units.code = 'department'      (is_active)
--     role  request_processing_roles.code = 'department_head' (is_active)
--     assignment_type = 'faculty_profile'
--     department_id   = the audited department
--   whose identity resolves faculty_profile_id -> faculty_profiles.id
--   -> (employee_number, user_id, department_id).
-- NO reliance on role naming: no substring matching on role codes, no
-- position_title parsing, no CMS faculty.admin_position. The official codes
-- are exactly 'department' + 'department_head' (recon §11: no role code
-- contains the chair substring anywhere in the schema).
--
-- Detection layers (per department):
--   1. identity   : faculty_profiles.employee_number = expected academic number
--   2. unit/dept  : assignment.department_id vs linked profile.department_id
--   3. window     : is_active + starts_at/ends_at (current / future / expired)
--   4. duplicates : >1 concurrently active chair assignments
--   5. wrong-unit : active assignment whose holder profile belongs to another dept
--
-- Final classification per department (deterministic priority order):
--   AMBIGUOUS       matched profile count > 1, or the single active assignment
--                   has an unresolvable identity (NULL/missing faculty_profile_id)
--   DUPLICATE       > 1 concurrently active chair assignments
--   WRONG_UNIT      exactly 1 active assignment, holder profile.department_id
--                   <> audited department
--   WRONG_IDENTITY  exactly 1 active assignment, holder in-unit but
--                   holder employee_number <> expected academic number
--   MATCHED         exactly 1 active assignment, holder employee_number =
--                   expected, holder profile in-unit
--   INACTIVE        0 active; >= 1 chair row with is_active = false (history kept)
--   EXPIRED         0 active; >= 1 chair row flagged active but outside the
--                   effective window (ends_at <= now() or starts_at > now())
--   MISSING         no chair assignment rows at all for the department
--
-- Runtime-version pin (recon §7 / D01-CURRENT-STATE §4.5): this audit targets
-- the DEPLOYED workflow actor functions of migration
-- 20260710180000_student_request_actor_rpc_rls.sql
-- (user_matches_workflow_runtime_step with the registrar/admin fast-path and
-- the is_department_head_of-based fallback). The strict-binding rewrite
-- docs/migration-drafts/STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql
-- is an UNAPPLIED draft and is NOT what this audit measures.
--
-- search_path note: 'b_chairs' is the local PG17 harness schema; it does not
-- exist in production and is ignored there, so names resolve to public.
-- ============================================================================

BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY;
SET LOCAL search_path TO b_chairs, public;

WITH expected_chairs(dept_id, dept_label, expected_employee_number) AS (
  VALUES
    ('11111111-1111-4111-8111-111111111111'::uuid, 'CS', 'F2025006'),
    ('ce485c67-5f7c-498d-b120-4b1130a86ae8'::uuid, 'IT', 'F2025005'),
    ('22222222-2222-4222-8222-222222222222'::uuid, 'IS', 'F2025004')
),
-- >>SHARED:CLASSIFICATION_BODY>>
chair_scope AS (
  -- semantic anchor: exact unit code + exact role code, both active
  SELECT u.id AS unit_id, r.id AS role_id
  FROM request_processing_units u
  JOIN request_processing_roles r ON r.unit_id = u.id
  WHERE u.code = 'department'
    AND u.is_active
    AND r.code = 'department_head'
    AND r.is_active
),
chair_assignments AS (
  SELECT
    a.id,
    a.department_id,
    a.faculty_profile_id,
    a.is_active,
    (a.is_active
       AND (a.starts_at IS NULL OR a.starts_at <= now())
       AND (a.ends_at   IS NULL OR a.ends_at   >  now())) AS is_current,
    (a.is_active
       AND NOT ((a.starts_at IS NULL OR a.starts_at <= now())
            AND (a.ends_at   IS NULL OR a.ends_at   >  now()))) AS is_window_inactive
  FROM request_processing_assignments a
  JOIN chair_scope cs ON cs.unit_id = a.unit_id AND cs.role_id = a.role_id
  WHERE a.assignment_type = 'faculty_profile'
),
per_dept AS (
  SELECT
    p.dept_label,
    p.dept_id,
    p.expected_employee_number,
    (SELECT count(*) FROM faculty_profiles fp
      WHERE fp.employee_number = p.expected_employee_number) AS matched_profile_count,
    (SELECT count(*) FROM chair_assignments ca
      WHERE ca.department_id = p.dept_id) AS total_assignment_count,
    (SELECT count(*) FROM chair_assignments ca
      WHERE ca.department_id = p.dept_id AND ca.is_current) AS active_assignment_count,
    (SELECT count(*) FROM chair_assignments ca
      WHERE ca.department_id = p.dept_id AND NOT ca.is_active) AS inactive_assignment_count,
    (SELECT count(*) FROM chair_assignments ca
      WHERE ca.department_id = p.dept_id AND ca.is_window_inactive) AS expired_window_count
  FROM expected_chairs p
),
single_active AS (
  -- populated only when exactly one active assignment exists (cardinality = 1)
  SELECT
    pd.dept_label,
    ca.faculty_profile_id AS holder_fp_id,
    fp.employee_number AS holder_employee_number,
    fp.department_id AS holder_dept_id
  FROM per_dept pd
  LEFT JOIN chair_assignments ca
    ON ca.department_id = pd.dept_id AND ca.is_current
  LEFT JOIN faculty_profiles fp
    ON fp.id = ca.faculty_profile_id
  WHERE pd.active_assignment_count = 1
),
resolved AS (
  SELECT
    pd.*,
    sa.holder_fp_id,
    sa.holder_employee_number,
    sa.holder_dept_id,
    (pd.active_assignment_count = 1
       AND (sa.holder_fp_id IS NULL OR sa.holder_employee_number IS NULL)) AS identity_unresolved,
    (SELECT count(*) FROM chair_assignments ca
      JOIN faculty_profiles fp ON fp.id = ca.faculty_profile_id
      WHERE ca.department_id = pd.dept_id
        AND ca.is_current
        AND fp.department_id IS DISTINCT FROM pd.dept_id) AS wrong_unit_count,
    GREATEST(pd.active_assignment_count - 1, 0) AS duplicate_count,
    (SELECT count(*) FROM chair_assignments ca
      WHERE ca.is_current
        AND ca.department_id NOT IN (SELECT dept_id FROM expected_chairs)) AS out_of_scope_active_head_count
  FROM per_dept pd
  LEFT JOIN single_active sa ON sa.dept_label = pd.dept_label
)
SELECT
  dept_label,
  expected_employee_number AS expected_academic_number,
  matched_profile_count,
  active_assignment_count,
  ('request_processing_assignments(unit=department,role=department_head,type=faculty_profile) -> ' ||
    CASE
      WHEN active_assignment_count = 1 AND NOT identity_unresolved
        THEN 'faculty_profile ' || holder_employee_number ||
             ' holder_dept=' || COALESCE(holder_dept_id::text, 'NULL')
      WHEN active_assignment_count = 1
        THEN 'UNRESOLVED_IDENTITY(null_or_missing_faculty_profile_link)'
      WHEN active_assignment_count > 1
        THEN active_assignment_count || '_concurrent_active_assignments'
      ELSE 'no_currently_effective_assignment'
    END) AS semantic_position,
  wrong_unit_count,
  duplicate_count,
  inactive_assignment_count,
  expired_window_count,
  out_of_scope_active_head_count,
  CASE
    WHEN matched_profile_count > 1 THEN 'AMBIGUOUS'
    WHEN active_assignment_count > 1 THEN 'DUPLICATE'
    WHEN active_assignment_count = 1 AND identity_unresolved THEN 'AMBIGUOUS'
    WHEN active_assignment_count = 1
         AND holder_dept_id IS DISTINCT FROM dept_id THEN 'WRONG_UNIT'
    WHEN active_assignment_count = 1
         AND holder_employee_number IS DISTINCT FROM expected_employee_number THEN 'WRONG_IDENTITY'
    WHEN active_assignment_count = 1 THEN 'MATCHED'
    WHEN inactive_assignment_count > 0 THEN 'INACTIVE'
    WHEN expired_window_count > 0 THEN 'EXPIRED'
    ELSE 'MISSING'
  END AS final_classification
FROM resolved
ORDER BY dept_label
-- <<SHARED:CLASSIFICATION_BODY>>
;

ROLLBACK;
```

المخرجات المتوقعة: 3 صفوف مرتبة أبجديًا حسب `dept_label` (CS ثم IS ثم IT)، بالأعمدة: `dept_label`, `expected_academic_number`, `matched_profile_count`, `active_assignment_count`, `semantic_position`, `wrong_unit_count`, `duplicate_count`, `inactive_assignment_count`, `expired_window_count`, `out_of_scope_active_head_count`, `final_classification`.

### 3.2 S1 — مسبار الهوية (داعم للأدلة، SELECT فقط)

يؤكد أن كل رقم أكاديمي متوقع يحل إلى ملف `faculty_profiles` واحد بالضبط (أعمدة مثبتة في التدقيق المعتمد وحزمة PREFLIGHT فقط):

```sql
-- S1: identity probe for the three canonical chairs (SELECT only)
SELECT
  fp.id,
  fp.employee_number,
  fp.user_id,
  fp.department_id,
  fp.status
FROM faculty_profiles fp
WHERE fp.employee_number IN ('F2025006', 'F2025005', 'F2025004')
ORDER BY fp.employee_number;
```

المتوقع: 3 صفوف، صف واحد لكل رقم. أي رقم بلا صف أو بأكثر من صف ⇒ يتوافق مع `matched_profile_count <> 1` في `Q-AUDIT` ويُعالَج وفق قواعد §4 (تعدد الملفات = `AMBIGUOUS`).

### 3.3 S2 — مسبار تفصيل التعيينات والنافذة (داعم للأدلة، SELECT فقط)

نفس المرتكز الدلالي (`chair_scope`: رمزا الوحدة والدور الحرفيان + `assignment_type='faculty_profile'` ولا شيء غيرها)، مع تفصيل حالة النافذة لكل صف: `current` (فعّال وضمن النافذة) / `future` (`starts_at > now()`) / `expired` (`ends_at <= now()`) / `disabled` (`is_active = false`). هذا المسبار هو مصدر عمودَي «التعيين المنتهي» و«التعيين المستقبلي» وقائمة أعضاء التكرار، ولا يحمل أي منطق تصنيف مستقل:

```sql
-- S2: per-assignment detail with explicit window state (SELECT only)
WITH chair_scope AS (
  SELECT u.id AS unit_id, r.id AS role_id
  FROM request_processing_units u
  JOIN request_processing_roles r ON r.unit_id = u.id
  WHERE u.code = 'department'
    AND u.is_active
    AND r.code = 'department_head'
    AND r.is_active
)
SELECT
  a.id AS assignment_id,
  a.department_id,
  a.faculty_profile_id,
  fp.employee_number AS holder_employee_number,
  fp.department_id AS holder_department_id,
  a.is_active,
  a.starts_at,
  a.ends_at,
  CASE
    WHEN NOT a.is_active THEN 'disabled'
    WHEN a.starts_at IS NOT NULL AND a.starts_at > now() THEN 'future'
    WHEN a.ends_at IS NOT NULL AND a.ends_at <= now() THEN 'expired'
    ELSE 'current'
  END AS window_state
FROM request_processing_assignments a
JOIN chair_scope cs ON cs.unit_id = a.unit_id AND cs.role_id = a.role_id
LEFT JOIN faculty_profiles fp ON fp.id = a.faculty_profile_id
WHERE a.assignment_type = 'faculty_profile'
ORDER BY a.department_id, a.is_active DESC, a.starts_at;
```

المتوقع وفق حالة B: صفّان `current` على IT (خالد `F2025005` + أسامة `F2025006` بحامل `holder_department_id` خارج IT أو داخله حسب ملفه — يُسجَّل كدليل)، صف `current` واحد على IS (رمزي `F2025004`)، ولا صف `current` على CS، و`out_of_scope_active_head_count = 0`.

---

## 4. قواعد النتائج السبع

التدقيق المعتمد يُخرج ثمانية تصنيفات خام في `final_classification`. هذه الحزمة توحّدها إلى **سبعة رموز نتائج تشغيلية** بقاعدة واحدة فقط: تصنيفا `INACTIVE` و`EXPIRED` يُسجَّلان معًا تحت رمز النتيجة `INACTIVE` (كلاهما «صفر فعّال حاليًا مع وجود صفوف تاريخية/خارج النافذة»)، مع **إبقاء التصنيف الخام كما هو في الأدلة**. الأولوية الحتمية (من `CASE` التدقيق، بلا أي تقدير بشري):

`AMBIGUOUS` ← `DUPLICATE` ← `WRONG_UNIT` ← `WRONG_IDENTITY` ← `MATCHED` ← `INACTIVE` (يشمل `EXPIRED`) ← `MISSING`.

| الكود | شرط SQL الدقيق (مطابق للتدقيق المعتمد) | الإجراء المطلوب من المُشغّل |
|---|---|---|
| `MATCHED` | `active_assignment_count = 1` **و** `holder_employee_number = expected_employee_number` **و** `holder_dept_id = dept_id` (أي وصول `CASE` إلى `WHEN active_assignment_count = 1 THEN 'MATCHED'`) | لا إجراء تصحيحي. أرشف الدليل في قالب §8 وسجّل «مطابق». |
| `MISSING` | `total_assignment_count = 0` (فرع `ELSE 'MISSING'`؛ لا صفوف كرسي إطلاقًا للقسم) | سجّل؛ ارفع لصاحب قرار D-01. **ممنوع** إنشاء أي تعيين أو حساب من هذه القناة. |
| `DUPLICATE` | `active_assignment_count > 1` (و`duplicate_count = active_assignment_count - 1`) | سجّل كل الصفوف الفعّالة المتزامنة من `S2` (المعرفات + الحاملون + النوافذ)؛ أوقف أي مسار إصلاح؛ ارفع لقرار D-01. **ممنوع** تعطيل أو حذف أي صف. |
| `WRONG_UNIT` | `active_assignment_count = 1` **و** `holder_dept_id IS DISTINCT FROM dept_id` | سجّل الحامل وقسم ملفه الفعلي (`S2.holder_department_id`)؛ ارفع لقرار D-01. أي نقل/تصحيح فقط عبر PACKAGE-02 بعد موافقة صريحة وبدليل النقل المطلوب فيها. |
| `WRONG_IDENTITY` | `active_assignment_count = 1` **و** `holder_employee_number IS DISTINCT FROM expected_employee_number` (والحامل داخل القسم) | سجّل الرقم الفعلي مقابل المتوقع؛ ارفع لقرار D-01؛ لا تصحيح ذاتي. |
| `INACTIVE` | `active_assignment_count = 0` **و** (`inactive_assignment_count > 0` **أو** `expired_window_count > 0`) — يشمل تصنيفَي التدقيق `INACTIVE` (صفوف `is_active = false`) و`EXPIRED` (صفوف موسومة فعّالة لكن خارج النافذة: `ends_at <= now()` أو `starts_at > now()`) | سجّل التصنيف الخام + عدد النوافذ المنتهية/المستقبلية من `S2`؛ القسم مرشح لقرار D-01 (لا رئيس فعّال حاليًا)؛ لا إجراء مباشر. |
| `AMBIGUOUS` | `matched_profile_count > 1` **أو** (`active_assignment_count = 1` **و** `identity_unresolved` حيث `identity_unresolved = (holder_fp_id IS NULL OR holder_employee_number IS NULL)`) | **إيقاف فوري كامل**: لا تصنيف بديل، لا قرار D-01، لا إصلاح، لا تخمين هوية. يُصعَّد فورًا لمالك البيانات وقائد المسار مع الأدلة الخام. **لا يُحل آليًا أبدًا.** |

---

## 5. تعليمات التشغيل خطوة-بخطوة (Lovable — قناة Read database)

**المتطلبات المسبقة**: تفويض صريح بتشغيل تدقيق قراءة-فقط؛ مشروع Lovable مرتبط بقاعدة بيانات الإنتاج (Supabase)؛ هذه الوثيقة مفتوحة؛ لا حاجة لأي صلاحية كتابة.

1. **افتح القناة**: في مشروع Lovable انتقل إلى قناة قراءة قاعدة البيانات (Read database / SQL read). تحقق أن القناة موجهة لمشروع الإنتاج وأنها للقراءة فقط. إن لم توجد قناة قراءة عاملة ⇒ توقف وسجّل `D01_LOVABLE_AUDIT_HOLD_READ_CHANNEL_REQUIRED`.
2. **نفّذ Q-AUDIT**: الصق كتلة §3.1 كاملة كنص واحد ونفّذها. المتوقع 3 صفوف (CS, IS, IT). أي خطأ تنفيذ أو عدد صفوف `<> 3` ⇒ توقف وسجّل `D01_LOVABLE_AUDIT_HOLD_OUTPUT_ANOMALY`.
3. **سجّل الأعمدة التسعة** لكل قسم من مخرجات Q-AUDIT (§2).
4. **نفّذ S1** (§3.2): المتوقع 3 صفوف. تحقق أن `matched_profile_count` في Q-AUDIT يطابق عدد صفوف S1 لكل رقم.
5. **نفّذ S2** (§3.3): سجّل `window_state` لكل تعيين (`current/future/expired/disabled`)؛ استخرج صفوف «التعيين المنتهي» و«التعيين المستقبلي» وقائمة أعضاء أي تكرار؛ تحقق أن عدد الرؤساء الفعّالين خارج CS/IT/IS يطابق `out_of_scope_active_head_count` (المتوقع 0 — أي قيمة أكبر ⇒ إيقاف وتصعيد).
6. **طبّق قواعد النتائج السبع** (§4) على كل قسم بأولوية الحسم الحتمية، وسجّل رمز النتيجة + التصنيف الخام معًا.
7. **قارن بالحالة المتوقعة** (§1): `IT=DUPLICATE`, `IS=MATCHED`, `CS=MISSING أو INACTIVE`. أي انحراف ⇒ توقف وسجّل `D01_LOVABLE_AUDIT_HOLD_STATE_DRIFT` وصعّد.
8. **املأ قالب الأدلة** (§8) كاملًا، وأرشف النص الخام لمخرجات الاستعلامات الثلاثة.
9. **سلّم الأدلة لصاحب قرار D-01**. انتهت الحزمة هنا — لا إصلاح ولا متابعة تنفيذية ضمن هذا المسار.

### أحكام الإيقاف العامة

أي مما يلي ⇒ إيقاف فوري + تصعيد + حكم `D01_LOVABLE_AUDIT_HOLD_<reason>`:

- ظهور `AMBIGUOUS` على أي قسم (لا يُحل آليًا أبدًا).
- `out_of_scope_active_head_count > 0`.
- فشل القناة أو خطأ SQL أو عدد صفوف غير متوقع.
- انحراف الحالة المقروءة عن حالة B المتوقعة دون تفسير موثق.
- أي طلب لتحويل القراءة إلى كتابة — **ممنوع منعًا باتًا في هذه الحزمة**.

### الأحكام النهائية الممكنة

- `D01_LOVABLE_AUDIT_COMPLETE` — نُفذت الخطوات 1–9 وأُرشفت الأدلة كاملة.
- `D01_LOVABLE_AUDIT_HOLD_<reason>` — توقف موثق مع سبب وأدلة خام.
- `D01_LOVABLE_AUDIT_NOT_EXECUTED` — الحالة الحالية لهذه الحزمة قبل أي تشغيل مفوَّض.

---

## 6. حدود الحزمة (صارمة)

- **لا `%chair%` إطلاقًا**: ممنوع أي اعتماد على مطابقة نصية جزئية لكلمة chair في رموز الأدوار أو غيرها (هذا هو خلل D-02 Q3d الموثق في الاستطلاع — ذلك المسبار استخدم أيضًا العمود `d.code` غير الموجود). الرموز الرسمية الحرفية فقط: `'department'` + `'department_head'`.
- **لا `d.code`**: جدول `departments` بلا عمود `code` (SCHEMA-INVENTORY §2.1/§13.1).
- **لا اشتقاق نصي**: ممنوع `position_title` وممنوع CMS `faculty.admin_position` كمصدر لرئاسة القسم.
- **SELECT فقط**: ممنوع أي DML/DDL (`INSERT/UPDATE/DELETE/MERGE/CREATE/ALTER/DROP/TRUNCATE/GRANT`)؛ ممنوع إنشاء حسابات أو ملفات تعريف.
- **لا تنفيذ D-01** ولا أي جزء من PACKAGE-02 ضمن هذه الحزمة.
- **صفر تعديل على الإنتاج**: الحزمة مستند توجيهي + استعلامات قراءة فقط؛ لم يُنفَّذ أي SQL على الإنتاج في هذه المرحلة.
- **تثبيت نسخة وقت التشغيل**: التدقيق يقيس دوال الممثلين **المنشورة** في الهجرة `20260710180000_student_request_actor_rpc_rls.sql`؛ مسودة التشديد `STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql` غير مُطبَّقة ولا تُفترَض ولا تُطبَّق هنا.

---

## 7. العلاقة بذراع الإصلاح (PACKAGE-02)

هذه الحزمة هي **ذراع التدقيق للقراءة فقط** (المسار J). الذراع العلاجية هي `DEPARTMENT-CHAIRS-SEMANTIC-FIX-PACKAGE-02` من المسار B (أمامية فقط، أربعة ملفات على `main`)، وهي في وضع **HOLD — تتطلب تفويضًا صريحًا منفصلًا**.

التسلسل الملزم (لا يُتجاوز):

1. **تدقيق** — تشغيل هذه الحزمة عبر Lovable Read وأرشفة الأدلة (§8).
2. **قرار D-01** — صاحب القرار يستعرض الأدلة ويقرر.
3. **فقط بموافقة صريحة موثقة**: `…-PACKAGE-02-PREFLIGHT.sql` (قراءة فقط، 14 بندًا كلها `ok=true` إلزامي) ← `…-PACKAGE-02.sql` ← `…-PACKAGE-02-POST-VERIFIER.sql` (fail-closed) ← وعند الحاجة `…-PACKAGE-02-ROLLBACK-BY-FORWARD.sql`.

ممنوع تشغيل أي إصلاح استنادًا إلى نتائج غير مؤرشفة أو قبل قرار D-01 الصريح.

---

## 8. قالب الأدلة (يُملأ عند التشغيل ويُؤرشف)

```text
- التاريخ/الوقت (UTC): ____
- المُشغّل: ____    القناة: Lovable Read database    مشروع Supabase: ____
- مرجع main: debf9d041f7c05794f6df33877f1dff91253625e
- blob التدقيق المعتمد: 72fad14644249e32fc3a1de24c77102c462b3245
- Q-AUDIT (3 صفوف، نص خام مؤرشف):
  CS: matched_profile_count=_ active=_ wrong_unit=_ dup=_ inactive=_ expired_window=_ out_of_scope=_ final_classification=_
  IS: matched_profile_count=_ active=_ wrong_unit=_ dup=_ inactive=_ expired_window=_ out_of_scope=_ final_classification=_
  IT: matched_profile_count=_ active=_ wrong_unit=_ dup=_ inactive=_ expired_window=_ out_of_scope=_ final_classification=_
- S1 (نص خام): ____  (3 صفوف؟ نعم/لا)
- S2 (نص خام لكل صف: assignment_id / holder_employee_number / holder_department_id / window_state): ____
- رموز النتائج المستخرجة (§4):  CS=____  IS=____  IT=____
- انحراف عن حالة B المتوقعة (IT=DUPLICATE / IS=MATCHED / CS=MISSING|INACTIVE)؟ ____  (نعم ⇒ HOLD + تصعيد)
- حالات AMBIGUOUS؟ ____  (نعم ⇒ إيقاف فوري + تصعيد، لا حل آلي)
- الحكم النهائي: D01_LOVABLE_AUDIT_COMPLETE / D01_LOVABLE_AUDIT_HOLD_<reason>
- موضع أرشفة الأدلة: ____
```

---

- طبيعة التسليم: **مصدر فقط (docs-only)** — لم يُنفَّذ أي SQL على الإنتاج، ولم يُعدَّل أي ملف إنتاجي، ولم يُتخذ أي قرار D-01.
- **يحتاج مراجعة مستقلة قبل الدمج — لا دمج تلقائي.**
