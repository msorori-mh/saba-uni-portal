-- READ-ONLY production preflight for GP student Level-4 eligibility guard
-- Mission: GP-PRODUCTION-MIGRATION-DUPLICATE-SET-RECONCILIATION-AND-PROMOTION-01
-- Target migration: supabase/migrations/20260808010000_gp_student_level4_only_eligibility_guard_01.sql
-- Source draft SHA256: 9d85fb4b6d7cd5b1ad4c19fb99d913d13b48fce6c83fcde7fca10340a934f1d6
--
-- FAIL-CLOSED. SELECT / catalog probes only. No DML/DDL/RPC mutation.
-- Expected production scenario at promotion time: P1-U
--   ledger has exactly U1-U4; N1-N4 absent; L4 predicate absent.
--
-- Operator: run in a read-only session. Any RAISE stops apply.

begin;

do $$
declare
  v_u1 boolean;
  v_u2 boolean;
  v_u3 boolean;
  v_u4 boolean;
  v_n_any boolean;
  v_l4 boolean;
  v_a1 boolean;
  v_a2 boolean;
  v_a3 boolean;
  v_pred boolean;
  v_bucket_public boolean;
  v_bucket_exists boolean;
  v_policy text;
  v_level4 boolean;
  v_u_count integer;
begin
  -- 1) Migration ledger: exactly SET U complete; SET N absent
  select exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260806235348'
       or name = '8f36000d-c62c-416f-a84b-eeee7d400dd8'
  ) into v_u1;
  select exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260807000230'
       or name = 'a6771356-c3f3-4cba-9b90-e3f70afbb72b'
  ) into v_u2;
  select exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260807001114'
       or name = 'c22e6009-1472-43ef-9443-b002872bbba5'
  ) into v_u3;
  select exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260807023229'
       or name = '7adcb3fb-73a1-483c-8ca2-4c93645fb84b'
  ) into v_u4;

  select exists (
    select 1 from supabase_migrations.schema_migrations
    where version in ('20260806120000','20260806120100','20260806120200','20260807003000')
       or coalesce(name,'') like '%gp_mvp_package%'
       or coalesce(name,'') like '%gp_mvp_storage_insert%'
  ) into v_n_any;

  select count(*) into v_u_count
  from supabase_migrations.schema_migrations
  where version in ('20260806235348','20260807000230','20260807001114','20260807023229');

  if not (v_u1 and v_u2 and v_u3 and v_u4) then
    raise exception 'GP_L4_PREFLIGHT_WRONG_PREDECESSOR: complete SET U (U1-U4) required';
  end if;
  if v_u_count <> 4 then
    raise exception 'GP_L4_PREFLIGHT_UNEXPLAINED_GP_MIGRATION_STATE: expected exactly 4 SET U ledger rows';
  end if;
  if v_n_any then
    raise exception 'GP_L4_PREFLIGHT_MIXED_PREDECESSOR: SET N ledger entries present (scenario P2)';
  end if;

  -- 2) Object presence
  v_a1 := to_regclass('public.graduation_projects') is not null;
  v_a2 := to_regprocedure('public.create_graduation_project_file_upload_intent(uuid,text,text,bigint,uuid,text)') is not null;
  v_a3 := to_regprocedure('public.create_graduation_project_team(uuid,uuid,uuid,uuid,uuid,uuid,uuid)') is not null;
  v_pred := to_regprocedure('public.can_upload_graduation_project_object(text)') is not null;
  v_l4 := to_regprocedure('public.student_is_current_fourth_academic_level(uuid)') is not null;

  if not v_a1 then
    raise exception 'GP_L4_PREFLIGHT_A1_MISSING: graduation_projects required';
  end if;
  if not v_a2 then
    raise exception 'GP_L4_PREFLIGHT_A2_MISSING: upload intent RPC required';
  end if;
  if not v_a3 then
    raise exception 'GP_L4_PREFLIGHT_A3_MISSING: create_graduation_project_team required';
  end if;
  if not v_pred then
    raise exception 'GP_L4_PREFLIGHT_STORAGE_PREDICATE_MISSING: can_upload_graduation_project_object required';
  end if;
  if v_l4 then
    raise exception 'GP_L4_PREFLIGHT_L4_PREDICATE_EXISTS: student_is_current_fourth_academic_level already present';
  end if;

  -- 3) Bucket private
  select exists (
    select 1 from storage.buckets where id = 'graduation-projects'
  ), coalesce((
    select public from storage.buckets where id = 'graduation-projects'
  ), true)
  into v_bucket_exists, v_bucket_public;

  if not v_bucket_exists then
    raise exception 'GP_L4_PREFLIGHT_BUCKET_MISSING: graduation-projects bucket required';
  end if;
  if v_bucket_public then
    raise exception 'GP_L4_PREFLIGHT_BUCKET_PUBLIC: graduation-projects must be private';
  end if;

  -- 4) Predicate-bound storage INSERT policy
  select with_check into v_policy
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and policyname = 'graduation_projects_storage_insert';

  if v_policy is null then
    raise exception 'GP_L4_PREFLIGHT_STORAGE_POLICY_MISSING: graduation_projects_storage_insert required';
  end if;
  if position('can_upload_graduation_project_object' in v_policy) = 0 then
    raise exception 'GP_L4_PREFLIGHT_STORAGE_POLICY_NOT_PREDICATE_BOUND: expected can_upload_graduation_project_object(name)';
  end if;

  -- 5) Academic level 4 seed
  select exists (
    select 1 from public.academic_levels where level_number = 4
  ) into v_level4;
  if not v_level4 then
    raise exception 'GP_L4_PREFLIGHT_LEVEL4_MISSING: academic_levels.level_number=4 required';
  end if;

  raise notice 'GP_L4_PRODUCTION_PREFLIGHT_PASS scenario=P1-U draft_sha256=9d85fb4b6d7cd5b1ad4c19fb99d913d13b48fce6c83fcde7fca10340a934f1d6';
end $$;

-- Informational probes (do not fail). Operators should record results.
select version, name
from supabase_migrations.schema_migrations
where version in (
  '20260806120000','20260806120100','20260806120200','20260807003000',
  '20260806235348','20260807000230','20260807001114','20260807023229',
  '20260808010000'
)
order by version;

select
  to_regclass('public.graduation_projects')::text as a1_table,
  to_regprocedure('public.create_graduation_project_file_upload_intent(uuid,text,text,bigint,uuid,text)')::text as a2_rpc,
  to_regprocedure('public.create_graduation_project_team(uuid,uuid,uuid,uuid,uuid,uuid,uuid)')::text as a3_rpc,
  to_regprocedure('public.can_upload_graduation_project_object(text)')::text as storage_predicate,
  to_regprocedure('public.student_is_current_fourth_academic_level(uuid)')::text as l4_predicate;

select id, name, public from storage.buckets where id = 'graduation-projects';

select policyname, cmd, roles::text, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname = 'graduation_projects_storage_insert';

rollback;
