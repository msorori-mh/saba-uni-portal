-- READ-ONLY immediate post-verifier for GP student Level-4 eligibility guard
-- Mission: GP-PRODUCTION-MIGRATION-DUPLICATE-SET-RECONCILIATION-AND-PROMOTION-01
-- Safe on production AFTER apply of 20260808010000_gp_student_level4_only_eligibility_guard_01.sql
-- SELECT / catalog only. No DML/DDL/RPC mutation. Ends in rollback.

begin;

do $$
declare
  v_missing text;
  v_bad_secdef text;
  v_bad_search text;
  v_policy text;
  v_auth_exec boolean;
  v_anon_exec boolean;
begin
  if to_regprocedure('public.student_is_current_fourth_academic_level(uuid)') is null then
    raise exception 'GP_L4_POST_VERIFIER_PREDICATE_MISSING';
  end if;

  select string_agg(expected, ', ' order by expected) into v_missing
  from (
    values
      ('student_is_current_fourth_academic_level'),
      ('require_student_gp_fourth_level_eligibility'),
      ('require_student_actor_gp_fourth_level'),
      ('require_caller_student_gp_fourth_level_when_student_only'),
      ('can_upload_graduation_project_object'),
      ('require_graduation_project_leader'),
      ('gp_team_mutator'),
      ('create_graduation_project_team'),
      ('add_graduation_project_team_member'),
      ('list_my_graduation_projects'),
      ('get_graduation_project_detail'),
      ('create_graduation_project_signed_download')
  ) e(expected)
  where not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = e.expected
  );
  if v_missing is not null then
    raise exception 'GP_L4_POST_VERIFIER_FUNCTIONS_MISSING: %', v_missing;
  end if;

  select string_agg(p.proname, ', ' order by p.proname) into v_bad_secdef
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'student_is_current_fourth_academic_level',
      'require_student_gp_fourth_level_eligibility',
      'require_student_actor_gp_fourth_level',
      'require_caller_student_gp_fourth_level_when_student_only',
      'can_upload_graduation_project_object',
      'require_graduation_project_leader',
      'gp_team_mutator',
      'create_graduation_project_team',
      'add_graduation_project_team_member',
      'list_my_graduation_projects',
      'get_graduation_project_detail',
      'create_graduation_project_signed_download'
    )
    and p.prosecdef is not true;
  if v_bad_secdef is not null then
    raise exception 'GP_L4_POST_VERIFIER_NOT_SECURITY_DEFINER: %', v_bad_secdef;
  end if;

  select string_agg(p.proname, ', ' order by p.proname) into v_bad_search
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'student_is_current_fourth_academic_level',
      'require_student_gp_fourth_level_eligibility',
      'require_student_actor_gp_fourth_level',
      'require_caller_student_gp_fourth_level_when_student_only',
      'can_upload_graduation_project_object',
      'require_graduation_project_leader',
      'gp_team_mutator',
      'create_graduation_project_team',
      'add_graduation_project_team_member',
      'list_my_graduation_projects',
      'get_graduation_project_detail',
      'create_graduation_project_signed_download'
    )
    and coalesce(array_to_string(p.proconfig, ','), '') not like '%search_path=public, pg_temp%';
  if v_bad_search is not null then
    raise exception 'GP_L4_POST_VERIFIER_BAD_SEARCH_PATH: %', v_bad_search;
  end if;

  select with_check into v_policy
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname = 'graduation_projects_storage_insert';
  if v_policy is null or position('can_upload_graduation_project_object' in v_policy) = 0 then
    raise exception 'GP_L4_POST_VERIFIER_POLICY_SHAPE';
  end if;

  select
    has_function_privilege('authenticated', 'public.student_is_current_fourth_academic_level(uuid)', 'EXECUTE'),
    has_function_privilege('anon', 'public.student_is_current_fourth_academic_level(uuid)', 'EXECUTE')
  into v_auth_exec, v_anon_exec;
  if v_auth_exec is not true or v_anon_exec is not false then
    raise exception 'GP_L4_POST_VERIFIER_PREDICATE_ACL';
  end if;

  if has_function_privilege('authenticated', 'public.require_student_gp_fourth_level_eligibility(uuid)', 'EXECUTE') then
    raise exception 'GP_L4_POST_VERIFIER_INTERNAL_HELPER_EXECUTABLE';
  end if;

  raise notice 'GP_L4_PRODUCTION_POST_VERIFIER_PASS';
end $$;

select p.proname, p.prosecdef, p.proconfig,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in (
  'student_is_current_fourth_academic_level',
  'require_student_gp_fourth_level_eligibility',
  'require_student_actor_gp_fourth_level',
  'require_caller_student_gp_fourth_level_when_student_only',
  'can_upload_graduation_project_object',
  'require_graduation_project_leader',
  'gp_team_mutator',
  'create_graduation_project_team',
  'add_graduation_project_team_member',
  'list_my_graduation_projects',
  'get_graduation_project_detail',
  'create_graduation_project_signed_download'
)
order by p.proname;

select policyname, roles::text, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname = 'graduation_projects_storage_insert';

rollback;
