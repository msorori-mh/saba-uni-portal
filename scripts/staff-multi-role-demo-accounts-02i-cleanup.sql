-- PORTAL_STAFF_MULTI_ROLE_DEMO_ACCOUNTS_02I cleanup
-- Exact TEST_ONLY rollback. Never execute against accounts lacking the 02I marker.

begin;

do $guard$
begin
  if exists (
    select 1 from auth.users
    where id::text like '02a90000-%'
      and not (raw_user_meta_data @> '{"test_only":true,"purpose":"PORTAL_STAFF_MULTI_ROLE_DEMO_ACCOUNTS_02I"}'::jsonb)
  ) then
    raise exception '02I cleanup fail-closed: an exact user id lacks the TEST_ONLY marker';
  end if;
end
$guard$;

delete from public.user_roles
where id='02a90040-0000-4000-8000-000000000004'::uuid
  and user_id='02a90000-0000-4000-8000-000000000004'::uuid
  and role='admin';

delete from public.staff_service_role_assignments
where id::text like '02a90030-%'
  and user_id::text like '02a90000-%';

delete from public.staff_profile_departments
where staff_profile_id::text like '02a90020-%'
  and department_id='ce485c67-5f7c-498d-b120-4b1130a86ae8'::uuid;

delete from public.staff_profiles
where id::text like '02a90020-%'
  and user_id::text like '02a90000-%'
  and employee_number like 'TEST-STAFF-02I-%';

delete from auth.identities i
using auth.users u
where i.user_id=u.id
  and u.id::text like '02a90000-%'
  and u.raw_user_meta_data @> '{"test_only":true,"purpose":"PORTAL_STAFF_MULTI_ROLE_DEMO_ACCOUNTS_02I"}'::jsonb;

delete from auth.users
where id::text like '02a90000-%'
  and raw_user_meta_data @> '{"test_only":true,"purpose":"PORTAL_STAFF_MULTI_ROLE_DEMO_ACCOUNTS_02I"}'::jsonb;

commit;
