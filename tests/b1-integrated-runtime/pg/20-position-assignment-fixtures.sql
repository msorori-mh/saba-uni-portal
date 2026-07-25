-- TEST_ONLY: convert transfer dept-head resolution to position_assignment
-- (initializer requires position_assignment for source/target department heads).

do $$
declare
  v_unit uuid;
  v_role uuid;
  v_cs uuid := '55555555-5555-4555-8555-555555555501';
  v_it uuid := '55555555-5555-4555-8555-555555555502';
  v_pa_cs uuid := 'aa000000-0000-4000-8000-0000000000c1';
  v_pa_it uuid := 'aa000000-0000-4000-8000-0000000000c2';
  v_chair_cs uuid := '22222222-2222-4222-8222-22222222220b';
  v_chair_it uuid := '22222222-2222-4222-8222-22222222220c';
begin
  insert into storage.buckets(id, name, public)
  values ('student-request-secure-attachments', 'student-request-secure-attachments', false)
  on conflict (id) do nothing;

  select id into v_unit from public.request_processing_units where code = 'department';
  select id into v_role from public.request_processing_roles
    where code = 'department_head' and unit_id = v_unit;

  insert into public.position_assignments(id, user_id, is_active, assigned_from)
  values
    (v_pa_cs, v_chair_cs, true, current_date),
    (v_pa_it, v_chair_it, true, current_date)
  on conflict (id) do update set user_id = excluded.user_id, is_active = true;

  -- Disable faculty_profile chair rows so they cannot satisfy the dept-scoped filter.
  update public.request_processing_assignments
     set is_active = false
   where unit_id = v_unit and role_id = v_role and assignment_type = 'faculty_profile';

  insert into public.request_processing_assignments(
    unit_id, role_id, assignment_type, position_assignment_id, department_id, is_active
  ) values
    (v_unit, v_role, 'position_assignment', v_pa_cs, v_cs, true),
    (v_unit, v_role, 'position_assignment', v_pa_it, v_it, true);
end $$;
