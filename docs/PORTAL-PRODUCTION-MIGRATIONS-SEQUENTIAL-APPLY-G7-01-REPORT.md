# PORTAL-PRODUCTION-MIGRATIONS-SEQUENTIAL-APPLY-G7-01 — تقرير

## البيئة
- Supabase project ref: `wpmicqriltrowwonknox`
- Repo: `msorori-mh/saba-uni-portal` / branch `main`
- Migration: `supabase/migrations/20260710190000_student_request_workflow_runtime.sql`

## التحقق القانوني من المصدر
- Git blob SHA: `a91af19853042922541729c6f8f78f895b83d62a` (مطابق لـ `git rev-parse HEAD:<path>`)
- canonical blob SHA256 (`git cat-file blob` → `/tmp/g7-canonical.sql`): `7a2ddcb5ae3f672200115ae13eb63a6379f8074dee9dc722e08333c873f06932`
- working-tree raw SHA256: مطابق (LF فقط، بدون CRLF)
- `git status`/`git diff`: نظيف
- commit الأمني `0929253900ce33c85702043696a6d6ee952538b8` هو ancestor لـ HEAD ✓
- الحجم: 11,810 بايت

## التنفيذ
- استدعاء واحد لأداة Supabase migration المُدارة — نجاح.
- المحتوى مأخوذ حرفياً من Git object القانوني.

## الدوال المضافة
- `public.get_active_workflow_for_request_type(uuid)`
- `public.initialize_student_request_workflow(uuid)`
- `public.submit_student_request(uuid)` (يضم بوابة auth: `IF v_uid IS NULL THEN RAISE EXCEPTION … ERRCODE '28000'`)

## ACL
| Role | get_active_workflow | initialize_workflow | submit_student_request |
|---|---|---|---|
| anon | ✗ | ✗ | ✗ |
| authenticated | ✗ | ✗ | ✓ |

REVOKE من `PUBLIC, anon, authenticated` للدالتين الداخليتين، وREVOKE من `PUBLIC, anon` مع GRANT `TO authenticated` لـ `submit_student_request` — كل ذلك مضمن في migration.

## Database Linter
- baseline قبل: 223
- بعد G7: 222 (لم تُضف findings جديدة ذات صلة)

## حالات الحدود
- لم تُنشأ runtime rows (`student_request_workflow_steps` = 0، `student_request_workflow_events` = 0).
- لم تُطبق G8 أثناء G7.
- لا Publish/Deploy.
- لا seed/config/تعديل RLS/policies للجداول القديمة.

## القرار
**PASS_G7_APPLIED_READY_FOR_G8**
