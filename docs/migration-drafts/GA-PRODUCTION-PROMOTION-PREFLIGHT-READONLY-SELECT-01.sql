-- PORTAL-24H-GRADUATES-AFFAIRS-PRODUCTION-FULL-CLOSURE-01
-- SELECT-only production preflight companion for Lovable MCP / read-only channels.
-- No DML. No DDL. No DO blocks that raise. Returns one diagnostic row.
--
-- Interpreting preflight_status:
--   READY_FOR_APPLY_FOUNDATION — all hard gates green for GA1
--   HOLD_*                     — exact stop reason (do not apply)
--
-- Report every production read. Prefer this script when the DO-block
-- preflight (GA-PRODUCTION-PROMOTION-PREFLIGHT-01.sql) cannot run.

WITH
ledger AS (
  SELECT
    EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'supabase_migrations'
        AND table_name = 'schema_migrations'
    ) AS ledger_present,
    COALESCE((
      SELECT count(*)::int
      FROM supabase_migrations.schema_migrations
      WHERE version IN ('20260808210000', '20260808210100', '20260808210200')
         OR name IN (
           '20260808210000_ga_mvp_foundation_01',
           '20260808210100_ga_mvp_completion_01',
           '20260808210200_ga_authorization_04'
         )
    ), 0) AS ga_ledger_rows,
    (SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 1) AS migration_tip
),
catalog AS (
  SELECT
    (
      SELECT count(*)::int
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname LIKE 'graduate_%'
        AND c.relkind IN ('r', 'v', 'm', 'S', 't')
    ) AS graduate_objects,
    (
      SELECT count(*)::int
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname LIKE 'graduate_%'
    ) AS graduate_functions,
    (
      SELECT count(*)::int
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
        AND t.typname LIKE 'graduate_%'
    ) AS graduate_types
),
unit_roles AS (
  SELECT
    EXISTS (
      SELECT 1 FROM public.request_processing_units
      WHERE code = 'graduate_affairs' AND is_active
    ) AS unit_ok,
    (
      SELECT count(*)::int
      FROM public.request_processing_roles r
      JOIN public.request_processing_units u ON u.id = r.unit_id
      WHERE u.code = 'graduate_affairs'
        AND r.code IN ('graduate_affairs_manager', 'graduate_affairs_specialist')
        AND r.is_active
    ) AS active_role_count
),
upstream AS (
  SELECT
    to_regclass('public.student_profiles') IS NOT NULL AS has_student_profiles,
    to_regclass('public.staff_profiles') IS NOT NULL AS has_staff_profiles,
    to_regclass('public.departments') IS NOT NULL AS has_departments,
    to_regclass('public.programs') IS NOT NULL AS has_programs,
    to_regclass('public.staff_profile_departments') IS NOT NULL AS has_staff_profile_departments,
    to_regclass('public.request_processing_assignments') IS NOT NULL AS has_assignments
),
staff_ambiguity AS (
  SELECT coalesce(sum(cnt), 0)::int AS ambiguous_staff_user_groups
  FROM (
    SELECT count(*) AS cnt
    FROM public.staff_profiles sp
    WHERE sp.status = 'active'
    GROUP BY sp.user_id
    HAVING count(*) > 1
  ) x
),
assignments AS (
  SELECT
    (
      SELECT count(*)::int
      FROM public.request_processing_assignments a
      JOIN public.request_processing_units u ON u.id = a.unit_id AND u.code = 'graduate_affairs'
      JOIN public.request_processing_roles r ON r.id = a.role_id AND r.code = 'graduate_affairs_manager'
      JOIN public.staff_profiles sp ON sp.id = a.staff_profile_id
      WHERE a.is_active
        AND a.assignment_type = 'staff_profile'
        AND sp.status = 'active'
        AND (a.starts_at IS NULL OR a.starts_at <= now())
        AND (a.ends_at IS NULL OR a.ends_at > now())
    ) AS active_managers,
    (
      SELECT count(*)::int
      FROM public.request_processing_assignments a
      JOIN public.request_processing_units u ON u.id = a.unit_id AND u.code = 'graduate_affairs'
      JOIN public.request_processing_roles r ON r.id = a.role_id AND r.code = 'graduate_affairs_specialist'
      JOIN public.staff_profiles sp ON sp.id = a.staff_profile_id
      WHERE a.is_active
        AND a.assignment_type = 'staff_profile'
        AND sp.status = 'active'
        AND (a.starts_at IS NULL OR a.starts_at <= now())
        AND (a.ends_at IS NULL OR a.ends_at > now())
    ) AS active_specialists,
    (
      SELECT count(*)::int
      FROM public.request_processing_assignments a
      JOIN public.request_processing_units u ON u.id = a.unit_id AND u.code = 'graduate_affairs'
      JOIN public.request_processing_roles r ON r.id = a.role_id AND r.code = 'graduate_affairs_specialist'
      JOIN public.staff_profiles sp ON sp.id = a.staff_profile_id
      WHERE a.is_active
        AND a.assignment_type = 'staff_profile'
        AND sp.status = 'active'
        AND (a.starts_at IS NULL OR a.starts_at <= now())
        AND (a.ends_at IS NULL OR a.ends_at > now())
        AND NOT EXISTS (
          SELECT 1 FROM public.staff_profile_departments spd
          WHERE spd.staff_profile_id = a.staff_profile_id
        )
    ) AS specialists_without_department_scope,
    (
      SELECT count(*)::int
      FROM public.request_processing_assignments a
      JOIN public.request_processing_units u ON u.id = a.unit_id AND u.code = 'graduate_affairs'
      JOIN public.request_processing_roles r
        ON r.id = a.role_id
       AND r.code IN ('graduate_affairs_manager', 'graduate_affairs_specialist')
      WHERE a.is_active
        AND a.assignment_type = 'user'
        AND (
          SELECT count(*)
          FROM public.staff_profiles sp
          WHERE sp.user_id = a.user_id AND sp.status = 'active'
        ) <> 1
    ) AS direct_user_assignment_bad
),
councils_gate AS (
  SELECT
    (
      SELECT count(*)::int
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname LIKE 'get_council_report_%'
    ) AS council_report_rpcs,
    to_regclass('public.ac_notifications') IS NOT NULL AS has_ac_notifications,
    (
      SELECT count(*)::int
      FROM supabase_migrations.schema_migrations
      WHERE version IN (
        '20260808150000',
        '20260808160000',
        '20260808170000',
        '20260808171000',
        '20260808180000',
        '20260810180000'
      )
    ) AS c5_c9_ledger_hits
),
scored AS (
  SELECT
    l.*,
    c.*,
    ur.*,
    up.*,
    sa.*,
    a.*,
    cg.*,
    CASE
      WHEN c.graduate_objects > 0 OR c.graduate_functions > 0 OR c.graduate_types > 0
        THEN 'HOLD_GA_PARTIAL_OR_APPLIED_OBJECTS'
      WHEN l.ga_ledger_rows > 0
        THEN 'HOLD_GA_LEDGER_ALREADY_PRESENT'
      WHEN NOT ur.unit_ok
        THEN 'HOLD_GRADUATE_AFFAIRS_UNIT_MISSING'
      WHEN ur.active_role_count <> 2
        THEN 'HOLD_GRADUATE_AFFAIRS_ROLES_INCOMPLETE'
      WHEN NOT (
        up.has_student_profiles
        AND up.has_staff_profiles
        AND up.has_departments
        AND up.has_programs
        AND up.has_staff_profile_departments
        AND up.has_assignments
      )
        THEN 'HOLD_UPSTREAM_SCHEMA_MISSING'
      WHEN sa.ambiguous_staff_user_groups > 0
        THEN 'HOLD_AMBIGUOUS_STAFF_PROFILES'
      WHEN a.direct_user_assignment_bad > 0
        THEN 'HOLD_DIRECT_USER_ASSIGNMENT_UNRESOLVED'
      WHEN a.specialists_without_department_scope > 0
        THEN 'HOLD_SPECIALIST_MISSING_DEPARTMENT_SCOPE'
      ELSE 'READY_FOR_APPLY_FOUNDATION'
    END AS preflight_status,
    CASE
      WHEN cg.council_report_rpcs > 0 AND cg.has_ac_notifications AND cg.c5_c9_ledger_hits > 0
        THEN 'C9_SIGNALS_PRESENT'
      ELSE 'C9_NOT_VERIFIED'
    END AS councils_write_gate_signal
  FROM ledger l
  CROSS JOIN catalog c
  CROSS JOIN unit_roles ur
  CROSS JOIN upstream up
  CROSS JOIN staff_ambiguity sa
  CROSS JOIN assignments a
  CROSS JOIN councils_gate cg
)
SELECT
  preflight_status,
  councils_write_gate_signal,
  migration_tip,
  ga_ledger_rows,
  graduate_objects,
  graduate_functions,
  graduate_types,
  unit_ok,
  active_role_count,
  active_managers,
  active_specialists,
  specialists_without_department_scope,
  direct_user_assignment_bad,
  ambiguous_staff_user_groups,
  has_student_profiles,
  has_staff_profiles,
  has_departments,
  has_programs,
  has_staff_profile_departments,
  has_assignments,
  council_report_rpcs,
  has_ac_notifications,
  c5_c9_ledger_hits,
  'PORTAL-24H-GRADUATES-AFFAIRS-PRODUCTION-FULL-CLOSURE-01' AS mission,
  current_setting('server_version') AS pg_version
FROM scored;
