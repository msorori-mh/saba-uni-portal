do $$ begin
  if to_regclass('public.graduation_projects') is null then
    raise exception 'GP_MVP_STORAGE_INSERT_FIX_A1_MISSING: graduation projects foundation required';
  end if;
  if to_regprocedure('public.create_graduation_project_file_upload_intent(uuid,text,text,bigint,uuid,text)') is null then
    raise exception 'GP_MVP_STORAGE_INSERT_FIX_A2_MISSING: graduation project storage RPCs required';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'graduation_projects_storage_insert'
  ) then
    raise exception 'GP_MVP_STORAGE_INSERT_FIX_POLICY_MISSING: graduation_projects_storage_insert policy missing';
  end if;
  if to_regprocedure('public.can_upload_graduation_project_object(text)') is not null then
    raise exception 'GP_MVP_STORAGE_INSERT_FIX_PREDICATE_EXISTS: can_upload_graduation_project_object already present';
  end if;
end $$;

create or replace function public.can_upload_graduation_project_object(
  p_object_name text
) returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return false;
  end if;

  return exists (
    select 1
    from public.graduation_project_files f
    where f.object_key = p_object_name
      and f.upload_status = 'pending'
      and exists (
        select 1
        from public.graduation_project_assignments a
        where a.id = f.uploaded_by_assignment_id
          and a.project_id = f.project_id
          and a.user_id = auth.uid()
          and a.active = true
          and a.ended_at is null
      )
  );
end $$;

revoke all on function public.can_upload_graduation_project_object(text) from public, anon;
grant execute on function public.can_upload_graduation_project_object(text) to authenticated;

drop policy if exists graduation_projects_storage_insert on storage.objects;

create policy graduation_projects_storage_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'graduation-projects'
    and public.can_upload_graduation_project_object(name)
    and name like 'graduation-projects/%'
    and name not like '%..%'
  );