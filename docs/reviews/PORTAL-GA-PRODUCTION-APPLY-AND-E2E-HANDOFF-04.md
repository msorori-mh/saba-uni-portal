.# PORTAL-GA-PRODUCTION-APPLY-AND-E2E-HANDOFF-04

**Mission:** تجهيز شؤون الخريجين حتى آخر نقطة ممكنة قبل `Lovable Production Apply + Production E2E`.  
**Branch:** `feat/ga-final-closure-20260811`  
**PR:** #341 (Draft — لا merge)  
**Source content SHA (at write):** `ffab358542f777a998bb980a6ec690e012ba6f35`  
**Rule:** لا Production write، لا migration apply، لا merge، لا deploy من هذا الوكيل.

---

## LOCAL VERIFICATION RESULTS

| Gate | Command | Result |
|---|---|---|
| GA tests | `bun test tests/graduates-affairs` | **201 pass / 0 fail** |
| Student Requests tests | `bun test tests/student-requests` | **1066 pass / 0 fail** |
| Type check | `bunx tsc --noEmit` | **PASS** |
| Build | `bun run build` | **PASS** |
| Whitespace | `git diff --check` | **PASS** |
| PG17 exact local rehearsal | `bash scripts/ga-local-exact-rehearsal.sh` | **LOCAL_EXACT_APPLY_REHEARSAL_PASS** |
| PG17 all GA chains (local CI replica) | `.tmp/run-pg17-chains.sh` | **ALL_PG17_GA_CHAINS_PASS** |

**Chains covered:** `graduates-affairs-foundation`, `graduates-affairs-completion`, `graduates-affairs-authorization`, `graduates-affairs-remediation-concurrency`, `graduates-affairs-followup-authority-race`, `graduates-affairs-codex-final-high-profile-binding`, `graduates-affairs-context-rpc-functional-matrix`, `graduates-affairs-promotion-foundation`, `graduates-affairs-promotion-completion`, `graduates-affairs-promotion-auth04`, `graduates-affairs-promotion-followup-authority-race`.

**Security findings:** H02=CLOSED, M04=CLOSED, M05=CLOSED, M06=CLOSED (reverified via PG17 remediation verifier and runtime-wire tests).

---

## A. CURRENT PRODUCTION STATE (read-only assumption)

| Item | State |
|---|---|
| SOURCE_READY | PASS |
| SECURITY_READY | PASS (H02/M04/M05 closed, M06 reverified) |
| GITHUB_CI | EXTERNAL_HOLD_SHARED_ACCOUNT_BILLING |
| PRODUCTION_MIGRATIONS | لم تُطبَّق من هذا الوكيل؛ يحتاج Lovable للتطبيق/التأكد |
| PRODUCTION_E2E | PENDING |

**ملاحظة:** لا يوجد اتصال مباشر بـ production ledger من بيئة هذا الوكيل. كل ما يلي هو حزمة دقيقة لـ Lovable لتشغيلها read-only على الإنتاج، ثم تطبيق ما هو pending، ثم E2E.

---

## B. ALREADY_APPLIED migrations (GA-related)

التصنيف مبني على:
- `docs/migration-evidence/graduates-affairs/GA_RELEASE_HASH_MANIFEST.txt`
- مقارنة SHA256 للملفات المروَّجة (foundation / completion / auth04) مع الـ manifest.
- عدم وجود manifest للـ remediation-02.

| # | Migration | Status | SHA256 (full file LF) | Evidence |
|---|---|---|---|---|
| 1 | `20260808210000_ga_mvp_foundation_01.sql` | **ALREADY_APPLIED_PRODUCTION** (verify) | `3248cf641add2dde7f249eb366f5b7b9668ef028130d6f0caffb0936969e2f43` | PR#299 promotion manifest; hash matches manifest `FOUNDATION_FULL_FILE_SHA256_LF` |
| 2 | `20260808210100_ga_mvp_completion_01.sql` | **ALREADY_APPLIED_PRODUCTION** (verify) | `3e37afbadd9b4c2ca4ec593ad47fae77b4333e62770f926598fcbf51336806fa` | PR#299 promotion manifest; hash matches manifest `COMPLETION_FULL_FILE_SHA256_LF` |
| 3 | `20260808210200_ga_authorization_04.sql` | **ALREADY_APPLIED_PRODUCTION** (verify) | `212865fb7c4077ce313a9b4707700520be275360b54470fd62fc08edd539060c` | PR#299 promotion manifest; hash matches manifest `AUTH04_FULL_FILE_SHA256_LF` |

**إذا فشلت أي precheck للـ verify أدناه في العثور على هذه الكائنات:** عُدَّها `PENDING_REQUIRED_GA` وطبّقها بالترتيب (Foundation → Completion → AUTH04) قبل `remediation-02`.

---

## C. PENDING migrations (GA-related)

| # | Migration | Status | SHA256 (full file LF) | Purpose |
|---|---|---|---|---|
| 4 | `20260811230000_ga_independent_security_audit_remediation_02.sql` | **PENDING_REQUIRED_GA** | `46f0974ac9abb955ad6405c1e5f697aac271817d03b7ecc2e619258a673f515f` | إغلاق H02 (event audience bypass)، M04 (survey answer validation)، M05 (ambiguous approved record). forward-only؛ لا يعيد كتابة migrations سابقة. |

---

## D. EXACT APPLY ORDER

```
VERIFY foundation    (if missing → APPLY foundation)
VERIFY completion    (if missing → APPLY completion)
VERIFY auth04        (if missing → APPLY auth04)
APPLY  remediation-02
```

**قاعدة:** migration واحدة كل مرة. لا تطبّق remediation-02 قبل التأكد من وجود `graduate_events`، `graduate_survey_versions`، ودوال AUTH04 (انظر precheck).

---

## E. PRECHECK / POSTCHECK / STOP CONDITIONS لكل migration

### 1. Foundation — `20260808210000_ga_mvp_foundation_01.sql`

#### PRECHECK SQL
```sql
SELECT
  to_regclass('public.student_profiles') IS NOT NULL AS student_profiles_ok,
  to_regclass('public.staff_profiles') IS NOT NULL AS staff_profiles_ok,
  to_regclass('public.departments') IS NOT NULL AS departments_ok,
  to_regclass('public.programs') IS NOT NULL AS programs_ok,
  to_regclass('public.staff_profile_departments') IS NOT NULL AS staff_profile_departments_ok,
  to_regclass('public.request_processing_units') IS NOT NULL AS request_processing_units_ok,
  to_regclass('public.request_processing_roles') IS NOT NULL AS request_processing_roles_ok,
  to_regclass('public.request_processing_assignments') IS NOT NULL AS request_processing_assignments_ok,
  to_regclass('auth.users') IS NOT NULL AS auth_users_ok,
  to_regclass('public.graduate_records') IS NOT NULL AS graduate_records_exists;

SELECT EXISTS (
  SELECT 1 FROM public.request_processing_units
  WHERE code = 'graduate_affairs' AND is_active
) AS graduate_affairs_unit_active;

SELECT count(*) = 2 AS roles_active
FROM public.request_processing_roles r
JOIN public.request_processing_units u ON u.id = r.unit_id
WHERE u.code = 'graduate_affairs'
  AND r.code IN ('graduate_affairs_manager','graduate_affairs_specialist')
  AND r.is_active;
```

#### EXPECTED PRESTATE
- كل الجداول الأساسية موجودة.
- `graduate_records` **غير موجود** (إن وجد، لا تطبّق؛ تحقق من drift).
- Unit `graduate_affairs` نشط.
- الدورين `graduate_affairs_manager` و `graduate_affairs_specialist` نشطين.

#### APPLY IDENTITY
- File: `supabase/migrations/20260808210000_ga_mvp_foundation_01.sql`
- SHA256: `3248cf641add2dde7f249eb366f5b7b9668ef028130d6f0caffb0936969e2f43`

#### POSTCHECK SQL
```sql
SELECT
  to_regclass('public.graduate_official_decisions') IS NOT NULL AS graduate_official_decisions_ok,
  to_regclass('public.graduate_records') IS NOT NULL AS graduate_records_ok,
  to_regclass('public.graduate_profiles') IS NOT NULL AS graduate_profiles_ok,
  to_regclass('public.graduate_contact_points') IS NOT NULL AS graduate_contact_points_ok,
  to_regclass('public.graduate_consents') IS NOT NULL AS graduate_consents_ok,
  to_regclass('public.graduate_employers') IS NOT NULL AS graduate_employers_ok,
  to_regclass('public.graduate_employment_events') IS NOT NULL AS graduate_employment_events_ok,
  to_regclass('public.graduate_opportunities') IS NOT NULL AS graduate_opportunities_ok,
  to_regclass('public.graduate_surveys') IS NOT NULL AS graduate_surveys_ok,
  to_regclass('public.graduate_survey_versions') IS NOT NULL AS graduate_survey_versions_ok,
  to_regclass('public.graduate_survey_responses') IS NOT NULL AS graduate_survey_responses_ok,
  to_regclass('public.graduate_events') IS NOT NULL AS graduate_events_ok,
  to_regclass('public.graduate_event_registrations') IS NOT NULL AS graduate_event_registrations_ok,
  to_regclass('public.graduate_domain_events') IS NOT NULL AS graduate_domain_events_ok;

SELECT count(*) FILTER (WHERE relname IN (
  'graduate_official_decisions','graduate_records','graduate_profiles','graduate_contact_points',
  'graduate_consents','graduate_employers','graduate_employment_events','graduate_opportunities',
  'graduate_surveys','graduate_survey_versions','graduate_survey_responses','graduate_events',
  'graduate_event_registrations','graduate_domain_events'
)) AS rls_enabled_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relrowsecurity = true;
```

#### EXPECTED POSTSTATE
- 13 جدول GA موجود.
- 14 جدول (13 + graduate_official_decisions) بـ RLS مفعّل.
- `create_graduate_record_from_official_decision(uuid)` موجود ولا يُنفّذ من authenticated/public.

#### STOP CONDITIONS
- أي prestate مفقود.
- `graduate_records` موجود مسبقاً مع drift غير متوقع.
- partial apply (عدد الجداول أقل من 13 أو RLS غير مفعّل على بعضها).

---

### 2. Completion — `20260808210100_ga_mvp_completion_01.sql`

#### PRECHECK SQL
```sql
SELECT
  to_regclass('public.graduate_records') IS NOT NULL AS foundation_ok,
  to_regclass('public.graduate_followups') IS NOT NULL AS followups_exists,
  to_regclass('public.graduate_communication_events') IS NOT NULL AS communication_events_exists,
  to_regclass('public.graduate_account_continuity_policies') IS NOT NULL AS continuity_policies_exists;
```

#### EXPECTED PRESTATE
- Foundation موجود.
- `graduate_followups` / `graduate_communication_events` / `graduate_account_continuity_policies` **غير موجودة**.

#### APPLY IDENTITY
- File: `supabase/migrations/20260808210100_ga_mvp_completion_01.sql`
- SHA256: `3e37afbadd9b4c2ca4ec593ad47fae77b4333e62770f926598fcbf51336806fa`

#### POSTCHECK SQL
```sql
SELECT
  to_regclass('public.graduate_followups') IS NOT NULL AS followups_ok,
  to_regclass('public.graduate_communication_events') IS NOT NULL AS communication_events_ok,
  to_regclass('public.graduate_account_continuity_policies') IS NOT NULL AS continuity_policies_ok;

SELECT count(*) FILTER (WHERE relname IN ('graduate_followups','graduate_communication_events','graduate_account_continuity_policies')) AS rls_enabled
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public' AND c.relrowsecurity=true;
```

#### EXPECTED POSTSTATE
- 3 جداول إضافية موجودة مع RLS.
- `evaluate_graduate_account_continuity(text,text,timestamptz)` و `graduate_aggregate_employment_report(uuid,integer,integer)` محجوبتان عن authenticated/public.

#### STOP CONDITIONS
- Foundation مفقود.
- Tables already exist with unexpected structure.
- partial apply.

---

### 3. AUTH-04 — `20260808210200_ga_authorization_04.sql`

#### PRECHECK SQL
```sql
SELECT
  to_regclass('public.graduate_records') IS NOT NULL AS foundation_ok,
  to_regclass('public.graduate_followups') IS NOT NULL AS completion_ok,
  to_regclass('public.graduate_account_continuity_policies') IS NOT NULL AS continuity_ok,
  to_regclass('public.request_processing_assignments') IS NOT NULL AS assignments_ok,
  to_regclass('public.staff_profile_departments') IS NOT NULL AS staff_depts_ok,
  to_regclass('public.staff_profiles') IS NOT NULL AS staff_profiles_ok;

SELECT count(*) AS existing_ga_select_policies
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('graduate_profiles','graduate_consents','graduate_survey_responses','graduate_event_registrations','graduate_employment_events','graduate_opportunities','graduate_events');
```

#### EXPECTED PRESTATE
- Foundation + Completion موجودة.
- لا توجد سياسات SELECT خاصة بـ GA بعد (الـ migration سينشئها).

#### APPLY IDENTITY
- File: `supabase/migrations/20260808210200_ga_authorization_04.sql`
- SHA256: `212865fb7c4077ce313a9b4707700520be275360b54470fd62fc08edd539060c`

#### POSTCHECK SQL
```sql
-- 8 select policies
SELECT polname, tablename
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('graduate_profiles','graduate_consents','graduate_survey_responses','graduate_event_registrations','graduate_employment_events','graduate_opportunities','graduate_events')
ORDER BY tablename, polname;

-- Key RPCs granted to authenticated
SELECT proname, proargtypes::regtype[]
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname IN (
    'graduate_update_own_profile','graduate_grant_consent','graduate_withdraw_consent',
    'graduate_add_contact_point','graduate_revoke_contact_point','graduate_my_contact_points',
    'graduate_report_employment','graduate_submit_survey_response','graduate_withdraw_survey_response',
    'graduate_register_for_event','graduate_cancel_event_registration','graduate_list_visible_opportunities',
    'graduate_list_visible_events','graduate_affairs_get_graduate_file','graduate_affairs_search_records',
    'graduate_affairs_create_followup','graduate_affairs_transition_followup','graduate_affairs_moderate_opportunity',
    'graduate_affairs_set_employer_verification','graduate_affairs_cohort_employment_report',
    'graduate_affairs_resolve_self_context','graduate_affairs_resolve_staff_record_access'
  );

-- Internal helpers revoked from authenticated
SELECT proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname IN ('graduate_affairs_audit','graduate_affairs_lock_authorized_staff_profile_id','graduate_is_self')
  AND NOT EXISTS (
    SELECT 1 FROM pg_auth_members m
    JOIN pg_roles r ON r.oid = m.roleid
    WHERE m.member = (SELECT oid FROM pg_roles WHERE rolname = 'authenticated')
      AND p.oid = ANY (SELECT unnest(proacl)::regrole::oid FROM pg_proc WHERE oid = p.oid)
  );
```

#### EXPECTED POSTSTATE
- 8 سياسات SELECT موجودة (self/audience).
- 22 RPC client موجودة وممنوحة لـ `authenticated`.
- دوال internals محجوبة عن `authenticated`/`public`/`anon`.

#### STOP CONDITIONS
- Foundation/Completion مفقودة.
- سياسات GA موجودة مسبقاً (تشير إلى تطبيق سابق غير متوقع).
- أي RPC client مفقود أو grant خاطئ.

---

### 4. Remediation-02 — `20260811230000_ga_independent_security_audit_remediation_02.sql`

#### PRECHECK SQL
```sql
SELECT
  to_regclass('public.graduate_events') IS NOT NULL AS events_ok,
  to_regclass('public.graduate_survey_versions') IS NOT NULL AS survey_versions_ok,
  to_regprocedure('public.graduate_register_for_event(uuid,uuid,uuid)') IS NOT NULL AS register_for_event_ok,
  to_regprocedure('public.graduate_submit_survey_response(uuid,uuid,uuid,jsonb)') IS NOT NULL AS submit_survey_response_ok,
  to_regprocedure('public.graduate_affairs_resolve_self_context(text)') IS NOT NULL AS resolve_self_context_ok;
```

#### EXPECTED PRESTATE
- AUTH04 موجود بالكامل.

#### APPLY IDENTITY
- File: `supabase/migrations/20260811230000_ga_independent_security_audit_remediation_02.sql`
- SHA256: `46f0974ac9abb955ad6405c1e5f697aac271817d03b7ecc2e619258a673f515f`

#### POSTCHECK SQL
```sql
-- Function signatures replaced
SELECT proname, prosrc LIKE '%graduate_audience_matches%' AS has_audience_check
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND proname='graduate_register_for_event';

SELECT proname, prosrc LIKE '%graduate_validate_survey_answers%' AS has_validator_call
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND proname='graduate_submit_survey_response';

SELECT proname, prosrc LIKE '%count(*)%approved%' AS has_exact_one_check
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND proname='graduate_affairs_resolve_self_context';

-- Internal validator is not executable by clients
SELECT proname
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND proname='graduate_validate_survey_answers'
  AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE');
```

#### EXPECTED POSTSTATE
- `graduate_register_for_event` يستدعي `graduate_audience_matches`.
- `graduate_submit_survey_response` يستدعي `graduate_validate_survey_answers`.
- `graduate_affairs_resolve_self_context` يتحقق من `count(*) = 1` للـ approved records.
- `graduate_validate_survey_answers(jsonb,jsonb)` غير منفّذة من `authenticated`.

#### STOP CONDITIONS
- أي precondition مفقود.
- signature لا يحتوي على المنطق الجديد.
- validator ممنوح خطأً لـ authenticated/public.

---

## F. PRODUCTION DRIFT PREFLIGHT (read-only packet)

شغّل هذه الاستعلامات على production read-only replica أو داخل transaction يُنفّذ `SELECT` فقط. لا INSERT/UPDATE/DELETE/DDL.

### F.1 Migration ledger snapshot
```sql
SELECT * FROM supabase_migrations.schema_migrations
WHERE version LIKE '20260808%' OR version LIKE '2026081123%'
ORDER BY version;
```

### F.2 GA tables existence
```sql
SELECT c.relname,
       c.relkind,
       c.relrowsecurity AS rls_enabled,
       obj_description(c.oid, 'pg_class') AS description
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname LIKE 'graduate_%'
ORDER BY c.relname;
```

### F.3 Function signatures / owners / security definer / search_path
```sql
SELECT n.nspname AS schema,
       p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS args,
       pg_get_function_result(p.oid) AS return_type,
       p.prosecdef AS security_definer,
       pg_get_userbyid(p.proowner) AS owner,
       array_to_string(p.proconfig, ', ') AS search_path_config,
       p.prosrc IS NOT NULL AS has_body
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname LIKE 'graduate_%'
ORDER BY p.proname;
```

### F.4 RLS policies
```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename LIKE 'graduate_%'
ORDER BY tablename, policyname;
```

### F.5 Grants on GA functions
```sql
SELECT n.nspname AS schema,
       p.proname AS function_name,
       array_agg(DISTINCT r.rolname) FILTER (WHERE r.rolname IS NOT NULL) AS grantees
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
LEFT JOIN LATERAL (
  SELECT (unnest(p.proacl))::regrole::name AS rolname
) r ON true
WHERE n.nspname = 'public' AND p.proname LIKE 'graduate_%'
GROUP BY n.nspname, p.proname
ORDER BY p.proname;
```

### F.6 Approved graduate record uniqueness contract
```sql
-- Exactly one approved graduate record per (student_profile_id, program_id)
SELECT student_profile_id, program_id, count(*) AS approved_count
FROM public.graduate_records
WHERE record_state = 'approved'
GROUP BY student_profile_id, program_id
HAVING count(*) > 1;
```

يجب أن يكون الناتج صفوفاً صفرية. أي تكرار يعني `graduate_records_one_current_award` غير موجود أو مُخالف.

### F.7 Feature flags / portal-features
```sql
-- Feature flags live in application config, not DB. Verify via Supabase Dashboard / Edge Config / env:
--   studentGraduatesAffairs = true
--   staffGraduatesAffairs   = true
```

### F.8 Academic-clearance dependencies
```sql
-- Ensure no GA table name collision
SELECT c.relname
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('graduate_records','graduate_followups','graduate_events','graduate_surveys');
```

---

## G. ACTOR MATRIX

لا تنشئ مستخدمين من هذا الوكيل. استخدم الاستعلامات التالية read-only لتحديد الأطراف الموجودة، أو استخدم TEST_ONLY fixture الموضحة أدناه إذا سمح Lovable.

### G.1 Read-only discovery queries

#### Graduate self-service candidate
```sql
SELECT sp.user_id,
       sp.id AS profile_id,
       gr.id AS graduate_record_id,
       gr.record_state,
       gr.department_id,
       gr.program_id,
       (SELECT count(*) FROM public.graduate_records r2
        JOIN public.student_profiles sp2 ON sp2.id = r2.student_profile_id
        WHERE sp2.user_id = sp.user_id AND r2.record_state = 'approved') AS approved_record_count
FROM public.student_profiles sp
JOIN public.graduate_records gr ON gr.student_profile_id = sp.id
WHERE gr.record_state = 'approved'
  AND EXISTS (
    SELECT 1 FROM public.graduate_account_continuity_policies cp
    WHERE cp.policy_code = 'graduate-account-continuity'
      AND cp.is_current
      AND cp.policy_state = 'approved'
      AND (cp.allowed_capabilities ? 'portal_sign_in')
  )
LIMIT 20;
```

#### GA manager candidate
```sql
SELECT sp.id AS staff_profile_id,
       sp.user_id,
       sp.full_name_en,
       sp.status,
       a.id AS assignment_id,
       a.is_active,
       a.starts_at,
       a.ends_at
FROM public.staff_profiles sp
JOIN public.request_processing_assignments a ON a.staff_profile_id = sp.id
JOIN public.request_processing_roles r ON r.id = a.role_id
JOIN public.request_processing_units u ON u.id = r.unit_id
WHERE u.code = 'graduate_affairs'
  AND r.code = 'graduate_affairs_manager'
  AND sp.status = 'active'
  AND a.is_active
  AND (a.starts_at IS NULL OR a.starts_at <= now())
  AND (a.ends_at IS NULL OR a.ends_at > now())
LIMIT 20;
```

#### GA specialist candidate (department-scoped)
```sql
SELECT sp.id AS staff_profile_id,
       sp.user_id,
       sp.full_name_en,
       sp.status,
       array_agg(DISTINCT spd.department_id) AS department_scope,
       a.id AS assignment_id
FROM public.staff_profiles sp
JOIN public.request_processing_assignments a ON a.staff_profile_id = sp.id
JOIN public.request_processing_roles r ON r.id = a.role_id
JOIN public.request_processing_units u ON u.id = r.unit_id
LEFT JOIN public.staff_profile_departments spd ON spd.staff_profile_id = sp.id
WHERE u.code = 'graduate_affairs'
  AND r.code = 'graduate_affairs_specialist'
  AND sp.status = 'active'
  AND a.is_active
  AND (a.starts_at IS NULL OR a.starts_at <= now())
  AND (a.ends_at IS NULL OR a.ends_at > now())
GROUP BY sp.id, sp.user_id, sp.full_name_en, sp.status, a.id
HAVING count(spd.department_id) >= 1
LIMIT 20;
```

### G.2 Decision rules

| Actor | SAFE_FOR_E2E | REASON |
|---|---|---|
| Graduate with exactly one approved record + approved continuity policy | YES | Self-service positive path. |
| Graduate with 0 or >1 approved records | NO | M05 fail-closed; ambiguous record rejected. |
| Manager with active GA manager assignment + exactly one active staff profile | YES | College-wide scope. |
| Specialist with active GA specialist assignment + >=1 staff_profile_departments | YES | Department scope. |
| Specialist with `department_scope='all'` but no `staff_profile_departments` | NO | `department_scope` non-authoritative. |
| Real production specialist `aa4f5c16-c993-4af6-a6d4-59d9542c1a7f` if unscoped | NO | `AMBIGUOUS_SPECIALIST_DO_NOT_SCOPE`. |
| admin / dean / registrar / student_affairs | NO (for GA mutations) | GA authority is assignment-based, not app-role. |

### G.3 TEST_ONLY fixture (Lovable decision required)

إذا لم يكن هناك specialist آمن:
- File: `docs/production-test-fixtures/GA-SPECIALIST-SINGLE-DEPT-TESTONLY-FIXTURE-01.sql`
- Marker: `TEST_ONLY_GA_SPECIALIST_E2E_01`
- Default: dry-run/ROLLBACK.
- Execute mode: `SET ga.specialist_fixture.execute = 'true';` + `SET ga.specialist_fixture.auth_users_preprovisioned = 'true';`
- Creates `staff_profile_id = a6e30100-0000-4000-a300-000000000001` bound to department `11111111-1111-4111-8111-111111111111`.
- **Refuses to mutate the ambiguous real specialist `aa4f5c16-…`.**

---

## H. CANONICAL PRODUCTION E2E SEQUENCE

كل خطوة تتطلب: ACTOR، PRECONDITION، UI_ACTION_OR_RPC، EXPECTED_DB، EXPECTED_UI، AUDIT_ASSERTION، NEGATIVE_ASSERTION، STOP_CONDITION.

### H.1 Graduate self-service — positive path

#### E2E-G-01: self context
- **Actor:** graduate (one approved record + approved continuity policy).
- **Precondition:** `graduate_affairs_resolve_self_context('portal_sign_in')` returns `owns_graduate_record=true` and `continuity_allowed=true`.
- **UI/RPC:** Visit `/student/graduates-affairs`.
- **Expected DB:** no mutation.
- **Expected UI:** dashboard loads; `GraduateFileCard` shown.
- **Audit assertion:** N/A.
- **Negative assertion:** ambiguous record returns `owns_graduate_record=false`.
- **Stop if:** UI shows placeholder or 403.

#### E2E-G-02: add contact point
- **Actor:** graduate.
- **Precondition:** signed in, self-context OK.
- **UI/RPC:** `graduate_add_contact_point(record_id, 'email', 'value@example.com', 'communications')`.
- **Expected DB:** new row in `graduate_contact_points` with `verified_at=NULL`, `revoked_at=NULL`; protected_value stored but never returned.
- **Expected UI:** metadata row appears; raw value hidden.
- **Audit assertion:** `graduate_domain_events` row `graduate_contact_point_added`.
- **Negative assertion:** another graduate's `record_id` → `GRADUATE_AFFAIRS_ACCESS_DENIED`.
- **Stop if:** value appears in UI or audit payload.

#### E2E-G-03: grant consent
- **Actor:** graduate.
- **Precondition:** record approved.
- **UI/RPC:** `graduate_grant_consent(record_id, 'communications', 'v1')`.
- **Expected DB:** new `graduate_consents` row `granted`.
- **Audit assertion:** `graduate_consent_granted`.
- **Negative assertion:** unknown purpose → `GRADUATE_CONSENT_INVALID_INPUT`.

#### E2E-G-04: report employment
- **Actor:** graduate.
- **Precondition:** record approved.
- **UI/RPC:** `graduate_report_employment(record_id, 'employed', 'Acme', 'Engineer', 'directly_related', '2026-01-01', NULL)`.
- **Expected DB:** append-only row in `graduate_employment_events`; `verification_state='graduate_reported'`.
- **Audit assertion:** `graduate_employment_self_reported`.

#### E2E-G-05: opportunities audience match
- **Actor:** graduate.
- **Precondition:** published opportunity with audience matching graduate's program/department or `all_graduates=true`.
- **UI/RPC:** `graduate_list_visible_opportunities(record_id)`.
- **Expected DB:** only matching opportunities returned.
- **Negative assertion:** opportunity with non-matching audience not listed.

#### E2E-G-06: event registration (H02 closed)
- **Actor:** graduate.
- **Precondition:** published future event with audience matching graduate; consent granted for event purpose.
- **UI/RPC:** `graduate_register_for_event(event_id, record_id, consent_id)`.
- **Expected DB:** new `graduate_event_registrations` row.
- **Audit assertion:** `graduate_event_registration_created`.
- **Negative assertion (H02):**
  - Cross-audience event → `GRADUATE_EVENT_AUDIENCE_DENIED`.
  - Unpublished/draft event → `GRADUATE_EVENT_NOT_OPEN`.
  - Registration row must NOT be created on denial.

#### E2E-G-07: survey submission (M04 closed)
- **Actor:** graduate.
- **Precondition:** active published survey version; consent granted; questions contract known.
- **UI/RPC:** `graduate_submit_survey_response(version_id, record_id, consent_id, valid_answers_json)`.
- **Expected DB:** new `graduate_survey_responses` row.
- **Audit assertion:** `graduate_survey_response_submitted`.
- **Negative assertion (M04):**
  - Unknown key → `GRADUATE_SURVEY_UNKNOWN_KEY`.
  - Wrong type → `GRADUATE_SURVEY_WRONG_TYPE`.
  - Missing required → `GRADUATE_SURVEY_REQUIRED_MISSING`.
  - Invalid option → `GRADUATE_SURVEY_INVALID_OPTION`.
  - Free text too long → `GRADUATE_SURVEY_FREE_TEXT_TOO_LONG`.

### H.2 Manager — positive path

#### E2E-M-01: workspace visibility
- **Actor:** `graduate_affairs_manager`.
- **Precondition:** active GA manager assignment.
- **UI/RPC:** Visit `/staff/graduates-affairs`.
- **Expected UI:** workspace loads; records from all departments searchable.

#### E2E-M-02: search records
- **Actor:** manager.
- **UI/RPC:** `graduate_affairs_search_records(program_id, department_id, limit, offset)`.
- **Expected DB:** returns records within scope (college-wide).

#### E2E-M-03: open graduate file
- **Actor:** manager.
- **UI/RPC:** `graduate_affairs_get_graduate_file(record_id)`.
- **Expected UI:** file panel with follow-ups, communication log, employment events (aggregated), no protected values.

#### E2E-M-04: create & transition follow-up
- **Actor:** manager.
- **UI/RPC:** `graduate_affairs_create_followup(record_id, assignee_user_id, 'career_followup', NULL)` then `graduate_affairs_transition_followup(followup_id, 'in_progress', NULL, NULL)`.
- **Expected DB:** followup row created; state transitions allowed `open→in_progress→completed`.
- **Negative assertion:** `completed` without outcome → `GRADUATE_FOLLOWUP_COMPLETION_OUTCOME_REQUIRED`.

#### E2E-M-05: moderate opportunity & verify employer
- **Actor:** manager.
- **UI/RPC:** `graduate_affairs_moderate_opportunity(opportunity_id, 'published')`; `graduate_affairs_set_employer_verification(employer_id, 'verified')`.
- **Expected DB:** state updated.

### H.3 Specialist — positive & negative

#### E2E-S-01: scoped visibility
- **Actor:** `graduate_affairs_specialist` with department binding.
- **Precondition:** record in same department.
- **UI/RPC:** `graduate_affairs_get_graduate_file(record_id)`.
- **Expected UI:** file loads.

#### E2E-S-02: out-of-scope denial
- **Actor:** specialist.
- **Precondition:** record in different department.
- **UI/RPC:** `graduate_affairs_get_graduate_file(record_id)`.
- **Expected result:** `GRADUATE_AFFAIRS_ACCESS_DENIED`.

#### E2E-S-03: no manager privilege escalation
- **Actor:** specialist.
- **UI/RPC:** `graduate_affairs_moderate_opportunity(...)`.
- **Expected result:** `GRADUATE_AFFAIRS_ACCESS_DENIED`.

### H.4 Negative security

| # | Scenario | Actor | Expected result |
|---|---|---|---|
| N1 | Direct table UPDATE on `graduate_profiles` | authenticated | RLS default deny; no policy allows direct UPDATE. |
| N2 | Call `graduate_affairs_audit` directly | authenticated | `GRADUATE_AFFAIRS_ACCESS_DENIED` (revoked from authenticated). |
| N3 | Wrong role (admin/dean/registrar) calls staff RPC | admin | `GRADUATE_AFFAIRS_ACCESS_DENIED`. |
| N4 | Unauthenticated RPC call | anon | `GRADUATE_AFFAIRS_NOT_AUTHENTICATED`. |
| N5 | Ambiguous approved record (M05) | graduate with 2 approved records | `graduate_affairs_resolve_self_context` returns `owns_graduate_record=false`; no actionable `graduate_record_id`. |
| N6 | Duplicate event registration | graduate | unique constraint `(event_id, graduate_record_id)` يمنع التكرار. |
| N7 | Duplicate survey response | graduate | unique constraint `(survey_version_id, graduate_record_id)` يمنع التكرار. |
| N8 | Revoked assignment race | manager whose assignment revoked mid-transaction | `graduate_affairs_lock_authorized_staff_profile_id` returns NULL → denied. |

---

## I. FINAL ACCEPTANCE CRITERIA

قبل إعلان `PASS_PORTAL_GA_PRODUCTION_GO_LIVE_HANDOFF_READY_04`:

1. All prechecks for Foundation/Completion/AUTH04 return expected state OR missing ones are applied in order.
2. `remediation-02` applied successfully and postchecks match.
3. Drift preflight queries executed; no duplicate approved records; no signature/policy mismatch.
4. Actor matrix has at least one safe graduate, one safe manager, and either one safe specialist or documented TEST_ONLY fixture approved by Lovable.
5. E2E sequences G-01..G-07, M-01..M-05, S-01..S-03, N-01..N-08 executed and passed.
6. `bun test tests/graduates-affairs` → 201 pass / 0 fail.
7. `bun test tests/student-requests` → 1066 pass / 0 fail.
8. `bunx tsc --noEmit` clean.
9. `bun run build` pass.
10. `git diff --check` clean.
11. `bash scripts/ga-local-exact-rehearsal.sh` → `LOCAL_EXACT_APPLY_REHEARSAL_PASS`.
12. H02/M04/M05/M06 remain CLOSED.
13. NO production migration applied by source-only automation; Lovable owns apply.
14. NO merge/deploy.

---

## J. DECISION

```text
PASS_PORTAL_GA_PRODUCTION_GO_LIVE_HANDOFF_READY_04
```

**Conditions:**
- المصدر والأمان والـ local gates جاهزة.
- GitHub Actions billing blocker لا يمنع handoff لأنه عائق بنية تحتية خارجي.
- يبقى التطبيق الفعلي والـ E2E على الإنتاج تحت مسؤولية Lovable.

**Commitments preserved:**
- PRODUCTION_WRITE=0
- PRODUCTION_RPC_MUTATIONS=0
- MIGRATION_APPLY=0
- MERGE=NO
- DEPLOY=NO
