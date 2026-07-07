# STUDENT-REQUESTS-STAGING-APPLY-PREP-02

**التاريخ:** 2026-07-07  
**المستودع:** `C:\projects\saba-uni-portal-git`  
**الفرع المرجعي:** `main` @ `08f1d59`  
**النوع:** خطة تطبيق staging — read-only (لا apply)

---

## 1. Executive Summary

| البند | القرار |
|-------|--------|
| **القرار** | **READY_FOR_STAGING_APPLY_WITH_APPROVAL** |
| **تطبيق migrations على staging لاحقاً؟** | **نعم** — بعد backup + موافقة + smoke tests |
| **Blockers** | **1 soft blocker** — انظر §1.1 |

### 1.1 Soft blocker (قبل التطبيق)

| ID | Blocker | الإجراء |
|----|---------|---------|
| **SB-1** | `20260711020000_student_requests_p1_foundations.sql` **غير موجود على `main`** — ملف untracked محلياً فقط | **commit/merge** إلى الفرع المستخدم لـ staging apply قبل تضمينه في الدفعة |

باقي migrations (130000–190000 + 110000) **موجودة على `main`**.

### 1.2 خلاصة

- ترتيب التطبيق **صحيح** كما هو موثّق أدناه.
- **150000 إلزامي مباشرة بعد 140000** — لا تترك staging على 140000 بدون 150000.
- لا seed workflows — inboxes فارغة **متوقع**.
- Production **ممنوع** قبل staging PASS + smoke tests + موافقة.

---

## 2. Migration Order

### 2.1 دفعة طلبات الطلاب (الترتيب الإلزامي)

| # | Timestamp | الملف | على `main`؟ |
|---|-----------|-------|-------------|
| 1 | `20260710130000` | `student_request_types_schema.sql` | ✅ |
| 2 | `20260710140000` | `student_request_types_rpc_rls.sql` | ✅ |
| 3 | `20260710150000` | `student_request_types_rls_submit_bypass_fix.sql` | ✅ **فوراً بعد 140000** |
| 4 | `20260710160000` | `student_request_processing_units_schema.sql` | ✅ |
| 5 | `20260710170000` | `student_request_admin_workflow_schema.sql` | ✅ |
| 6 | `20260710180000` | `student_request_actor_rpc_rls.sql` | ✅ |
| 7 | `20260710190000` | `student_request_workflow_runtime.sql` | ✅ |
| 8 | `20260711000000` | `staff_profiles_university_email.sql` | ✅ |
| 9 | `20260711020000` | `student_requests_p1_foundations.sql` | ⚠️ **محلي فقط — SB-1** |

### 2.2 Preconditions (يجب أن تكون مطبّقة مسبقاً على staging)

| Migration | الغرض |
|-----------|--------|
| `20260601000207` + related | `request_types`, `student_requests` base |
| `20260706120000` | `student_affairs_workflow_foundation` — legacy workflow JSON |
| `20260707120000` | workflow security hardening |
| `20260710120000` | council helpers (لا علاقة مباشرة — نفس timeline) |

**قبل apply:** راجع `supabase_migrations.schema_migrations` على staging لتحديد آخر migration مطبّق.

---

## 3. Dependency Review

### 3.1 سلسلة 130000 → 190000

```text
130000 (request_audience columns + FK NOT VALID)
  ↓
140000 (RPCs: get_available_request_types, create/submit, audience helpers)
  ↓  ⚠️ MUST NOT STOP HERE ON STAGING
150000 (RLS sr_update_self + protect_student_request trigger + submit bypass flag)
  ↓
160000 (request_processing_units/roles/assignments)
  ↓
170000 (request_type_workflows/steps + student_request_workflow_* runtime tables)
  ↓
180000 (actor RPCs: inbox, act_on_step — requires 160000+170000)
  ↓
190000 (initialize_student_request_workflow — replaces submit_student_request; requires 140000+150000+170000+180000)
```

### 3.2 140000 ↔ 150000 (submit bypass) — **حرج**

| بدون 150000 بعد 140000 | الخطر |
|------------------------|-------|
| RLS `sr_update_self` القديم | طالب قد يحدّث `status` إلى `submitted` **مباشرة** متجاوزاً فحص audience في RPC |
| بدون trigger `protect_student_request` | نفس الثغرة على مستوى DB |

**150000 ي:**

- يعيد تعريف policy `sr_update_self` — يمنع `status = submitted` عبر UPDATE مباشر.
- يضيف trigger + `set_config('student_request.submit_via_rpc', '1')` داخل `submit_student_request`.
- **190000 يستبدل `submit_student_request` مرة أخرى** — يفترض وجود 150000.

**قاعدة:** لا تطبّق 140000 على staging بدون 150000 في **نفس جلسة apply** (أو apply 150000 فوراً إذا كان 140000 مطبّقاً سابقاً).

### 3.3 110000 staff email

| البند | التقييم |
|-------|---------|
| يعتمد على student requests؟ | ❌ — مستقل |
| additive؟ | ✅ `ADD COLUMN IF NOT EXISTS email` على `staff_profiles` |
| يكسر staging في نفس الدفعة؟ | ❌ — آمن ضمن الدفعة |
| ترتيب vs 11020000 | **110000 قبل أو بعد 11020000** — كلاهما independent؛ الترتيب الموصى: 110000 ثم 11020000 |

### 3.4 11020000 P1 foundations

| يعتمد على | السبب |
|-----------|--------|
| 130000 | `request_types`, audience helpers |
| 140000 | `student_request_type_is_eligible`, `has_any_role` |
| 160000 | FK `request_processing_units/roles` في parallel members |
| 170000 | FK optional `student_request_workflow_steps` |
| 190000 | **لا hard dependency** — stubs منفصلة؛ لكن logical order بعد runtime |

**لا يعتمد على:** seed workflows، cutover، P2 code rename.

---

## 4. Risk Review

### 4.1 مخاطر قبل التطبيق

| ID | المخاطرة | الشدة | Mitigation |
|----|----------|-------|------------|
| R-1 | كود UI على `main` يستدعي RPCs (`get_available_request_types_for_current_student`, `submit_student_request`) | Medium | `mapStudentRequestRpcError` يعرض «خدمة قيد التحديث» حتى apply — **متوقع** |
| R-2 | تطبيق 140000 بدون 150000 | **High** | apply متسلسل؛ تحقق من `protect_student_request` trigger |
| R-3 | `student_requests_type_request_types_code_fk` NOT VALID (130000) | Low | لا VALIDATE في هذه الدفعة — orphan codes مقبولة مؤقتاً |
| R-4 | لا seed لـ `request_type_workflows` / processing units | Low | inboxes فارغة؛ legacy path يعمل |
| R-5 | `admin_save_request_workflow_config` غير منفّذ | Low | UI save معطّل (`ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE=false`) |
| R-6 | dual runtime (legacy + new tables) | Medium | متوقع — لا cutover في هذه الدفعة |
| R-7 | 110000 staff `email` column — UI/import قد يتوقع العمود | Low | additive nullable؛ login لا يتغير حتى wiring لاحق |
| R-8 | 11020000 غير على main (SB-1) | Medium | merge قبل staging |
| R-9 | Migration Review CI — `DROP POLICY` في 150000 | Low | يستخدم DO block + dynamic DROP — **PASS** (مُصلّح في PR97) |

### 4.2 سلوك متوقع بعد apply (ليس bug)

- قائمة طلبات الطالب تعمل عبر RPCs الجديدة.
- workflow admin **read-only** save.
- actor inbox فارغ (no seed).
- P1 stubs callable لكن **غير موصولة** بـ create/submit.
- `initialize_student_request_workflow` no-op بدون active workflow config.

---

## 5. Required Backup

**إلزامي قبل أي staging apply:**

1. **Supabase dashboard → Database → Backups** — snapshot يدوي أو تأكيد PITR مفعّل.
2. **Export schema-only** (optional): `pg_dump --schema-only` للمقارنة post-apply.
3. **سجّل** `SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 20;` قبل apply.

**Rollback:** destructive rollback (DROP columns/tables) **غير مفضل**. الخطة الآمنة:

- restore من backup/snapshot.
- أو revert forward-fix migration لاحقاً (phase منفصلة).

---

## 6. Staging Apply Instructions

> **لا تنفّذ هذه الخطوات في هذه المرحلة** — للتنفيذ لاحقاً بموافقة.

### 6.1 Pre-flight

```powershell
cd C:\projects\saba-uni-portal-git
git checkout main
git pull origin main
# تأكد من وجود 11020000 — resolve SB-1
git status supabase/migrations/20260711020000_student_requests_p1_foundations.sql
```

```sql
-- على staging DB
SELECT version FROM supabase_migrations.schema_migrations
WHERE version LIKE '202607%'
ORDER BY version;
```

### 6.2 Apply (staging only)

```powershell
# Option A: Supabase CLI linked to staging project
supabase link --project-ref <STAGING_REF>
supabase db push

# Option B: Dashboard SQL — run migrations in order §2.1 one file at a time
```

**ترتيب apply إذا staging فارغ من هذه السلسلة:**

1. 130000 → 140000 → **150000** (لا تفصل)
2. 160000 → 170000 → 180000 → 190000
3. 110000
4. 11020000

**إذا staging لديه 130000–140000 فقط:**

- apply **150000 فوراً** قبل أي exposure للطلاب.
- ثم 160000–190000، 110000، 11020000.

### 6.3 Post-apply (same session)

```sql
-- Verify applied
SELECT version FROM supabase_migrations.schema_migrations
WHERE version IN (
  '20260710130000','20260710140000','20260710150000',
  '20260710160000','20260710170000','20260710180000',
  '20260710190000','20260711000000','20260711020000'
) ORDER BY version;

-- Verify submit bypass protection
SELECT tgname FROM pg_trigger WHERE tgname LIKE '%protect_student_request%';

-- Verify P1 columns
SELECT column_name FROM information_schema.columns
WHERE table_name = 'student_profiles'
  AND column_name IN (
    'student_study_status','transferred_current_year',
    'previous_suspension_semesters_count','consecutive_suspension_years_count'
  );
```

```powershell
# Regenerate types (phase منفصلة — after apply approval)
supabase gen types typescript --project-id <STAGING_REF> > src/integrations/supabase/types.ts
```

---

## 7. Post-Apply Smoke Tests

> **لا تنفّذ الآن** — checklist بعد apply.

| # | Test | Expected |
|---|------|----------|
| ST-1 | تسجيل دخول **أدمن** | ✅ dashboard loads |
| ST-2 | `/admin/request-types` | ✅ list loads |
| ST-3 | `/admin/request-types/:id/workflow` | ✅ read config؛ save **disabled** |
| ST-4 | تسجيل دخول **طالب active** | ✅ portal loads |
| ST-5 | `/student/requests/new` — قائمة الأنواع | ✅ types from RPC؛ graduate types disabled/hidden per audience |
| ST-6 | طالب **graduated** | ✅ يرى graduate-only؛ active_student hidden |
| ST-7 | إنشاء **draft** (generic form) | ✅ `create_student_request` |
| ST-8 | **Submit** draft | ✅ via RPC only؛ direct UPDATE to `submitted` **يفشل** |
| ST-9 | Submit bypass negative test | ❌ `UPDATE student_requests SET status='submitted'` as student → blocked |
| ST-10 | `/staff` portal | ✅ loads؛ staff role labels |
| ST-11 | Admin staff — حقل **email** | ✅ column exists (nullable) |
| ST-12 | RPC `get_student_request_eligibility_context(profile_id)` | ✅ JSON context (after 11020000) |
| ST-13 | RPC `check_student_request_basic_eligibility('enrollment_suspension', id)` | ✅ U-SUSP-1 rules in stub |
| ST-14 | Actor inbox (`get_my_request_actor_inbox`) | ✅ empty / no error (no seed) |
| ST-15 | Legacy request detail `/student/requests/:id` | ✅ timeline partial (legacy steps) |

---

## 8. Production Gate

**Production apply ممنوع** حتى:

| Gate | Required |
|------|----------|
| G-1 | Staging apply **PASS** (all §2.1 migrations) |
| G-2 | Smoke tests §7 **PASS** |
| G-3 | **User approval** explicit |
| G-4 | SB-1 resolved (11020000 on deployed branch) |
| G-5 | Backup plan confirmed |
| G-6 | No open **High** findings from staging |

---

## 9. No-Write Assurance

هذه المرحلة **لم تنفّذ:**

- DB writes / migrations apply / Supabase apply
- seed / Lovable publish
- commit / push / PR
- تعديل `src/routeTree.gen.ts`

**الكتابة الوحيدة:** هذا التقرير.

---

## Appendix A — Decision Tree

```text
هل staging لديه backup؟ ─no→ STOP
         │
        yes
         ↓
هل 11020000 على الفرع الم deploy؟ ─no→ merge/commit (SB-1)
         │
        yes
         ↓
apply 130000→140000→150000 (atomic pair 140+150)
         ↓
apply 160000→170000→180000→190000
         ↓
apply 110000 → 11020000
         ↓
smoke tests §7
         ↓
PASS + approval → production gate review
FAIL → restore backup / forward fix
```

---

## Appendix B — git status at prep time

```
 M src/routeTree.gen.ts
?? docs/STUDENT-REQUESTS-*.md (spec/audit/P1 reports)
?? supabase/migrations/20260711020000_student_requests_p1_foundations.sql
```

`git diff --check`: PASS (CRLF warning on routeTree only).
