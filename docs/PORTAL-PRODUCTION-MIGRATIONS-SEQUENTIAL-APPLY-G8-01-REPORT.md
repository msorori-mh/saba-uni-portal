# PORTAL-PRODUCTION-MIGRATIONS-SEQUENTIAL-APPLY-G8-01 — تقرير

## البيئة
- Supabase project ref: `wpmicqriltrowwonknox`
- Repo: `msorori-mh/saba-uni-portal` / branch `main`
- HEAD: `a5f2d4d8ccda0a1034c0f02f91379ba365a43e46`
- commit الأمني الأدنى `0929253900ce33c85702043696a6d6ee952538b8`: ancestor of HEAD ✓
- Migration المستهدفة (وحدها): `supabase/migrations/20260711000000_staff_profiles_university_email.sql`
- وقت التنفيذ: 2026-07-09 (UTC — سجل الأداة المُدارة)

## التحقق القانوني من المصدر
- Git blob SHA (من `git rev-parse HEAD:<path>`): `3efb8d806ba780847b70c3efc65c597255cf54ba` — مطابق للمعتمد ✓
- `git cat-file blob 3efb8d80…` → `/tmp/g8-canonical.sql`
- canonical bytes: **410**
- canonical SHA256: `79fdf651893538c19a994fc4283ba75641d63ca401f99238edfb3aa35c45b55a`
- `git status`/`git diff --check`/`git diff --exit-code`: نظيف
- المحتوى المُطبق (verbatim من Git object):
  ```sql
  ALTER TABLE public.staff_profiles
    ADD COLUMN IF NOT EXISTS email text;

  COMMENT ON COLUMN public.staff_profiles.email IS
    'University login email for staff portal access. Auth.users.email should match when create_login=true.';
  ```

## Migration history
- قبل G8: G1–G7 مسجلة؛ G8/G9 غير مسجلة.
- بعد G8: G8 مسجلة مرة واحدة؛ G9 غير مسجلة.

## عمود staff_profiles.email
### قبل
- `information_schema.columns` → 0 rows (العمود غير موجود).

### بعد
| column | data_type | is_nullable | default | identity | generation |
|---|---|---|---|---|---|
| email | text | YES | — | — | — |

- التعليق: `University login email for staff portal access. Auth.users.email should match when create_login=true.` ✓
- لا identity، لا generated expression، لا UNIQUE، لا index، لا FK، لا CHECK جديد.

## سلامة البيانات
| | قبل | بعد |
|---|---|---|
| staff_profiles total | 6 | 6 |
| non_null_email_rows | — | 0 |

- لا INSERT / DELETE / UPDATE على صفوف موجودة.
- لا إنشاء مستخدم في `auth.users` ولا تعديل بريد أي حساب.

## RLS / Policies / Grants / Constraints / Indexes (بلا تغيير)
- RLS: enabled (t) — قبل وبعد.
- Policies (5) بلا تغيير: `Admins can delete staff profiles`, `Admins can insert staff profiles`, `Admins or self can update staff profile`, `Privileged roles can view all staff profiles`, `Staff can view own profile`.
- Constraints (6) بلا تغيير: pkey, employee_number_key, user_unique, user_id_fkey, department_id_fkey, department_scope_check.
- Indexes (5) بلا تغيير: pkey, employee_number_key, user_unique, idx_staff_profiles_dept, idx_staff_profiles_user.
- Grants الفعلية: كما هي (sandbox_exec: SELECT/INSERT).
- Triggers/owner: بلا تغيير.

## التأثير على G7 والنظام القديم
- الدوال الثلاث لا تزال موجودة: `get_active_workflow_for_request_type`, `initialize_student_request_workflow`, `submit_student_request` — بلا تغيير في التوقيع أو ACL.
- runtime workflow tables فارغة كما كانت (0/0).
- legacy counts دون تغيير:
  - `request_types` = 12
  - `student_requests` = 15
  - `student_service_request_steps` = 16
  - `student_service_request_events` = 26
- `request_types.workflow_schema` لم يُمس.
- لا import / login flow اختُبر.

## Database Linter
- baseline بعد G7: 222
- بعد G8: 222 (بلا findings جديدة تخص `staff_profiles.email` — العمود nullable بلا default ولا policies جديدة).

## حدود التوقف
- G8 مسجلة مرة واحدة.
- G9 غير مسجلة ولا يوجد أي من كائناتها (`student_request_service_windows`, `student_request_fee_assessments`, `student_request_parallel_groups`, `student_request_parallel_group_members`, `central_signatory_references`, ولا أعمدة G9 في `student_profiles`).
- لا Publish / Deploy.
- لا seed / تعبئة بريد / repair / rollback.

## القرار
**PASS_G8_APPLIED_READY_FOR_G9**
