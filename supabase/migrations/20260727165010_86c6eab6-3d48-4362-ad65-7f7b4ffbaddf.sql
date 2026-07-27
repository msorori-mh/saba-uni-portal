create or replace function public.enforce_staff_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if public.has_any_role(auth.uid(), array['admin', 'system_admin']) then
    return new;
  end if;

  if (old.user_id is distinct from new.user_id)
     or (old.role_type is distinct from new.role_type)
     or (old.department_id is distinct from new.department_id)
     or (old.department_scope is distinct from new.department_scope)
     or (old.status is distinct from new.status)
     or (old.employee_number is distinct from new.employee_number) then
    raise exception 'STAFF_PROFILE_PRIVILEGED_FIELD_UPDATE_DENIED'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_staff_profile_privileged_fields() from public, anon;

drop trigger if exists trg_enforce_staff_profile_privileged_fields on public.staff_profiles;
create trigger trg_enforce_staff_profile_privileged_fields
  before update on public.staff_profiles
  for each row
  execute function public.enforce_staff_profile_privileged_fields();

drop policy if exists "Staff can update own non privileged profile fields" on public.staff_profiles;
create policy "Staff can update own non privileged profile fields"
  on public.staff_profiles
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
