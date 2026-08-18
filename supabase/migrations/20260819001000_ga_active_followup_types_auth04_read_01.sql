-- GA BASELINE AUTH-04 READ CLOSURE 01
-- SOURCE ONLY: do not apply without explicit production migration approval.
-- Replaces the staff UI's direct table read with an actor-authorized RPC.

begin;

do $$ begin
  if to_regclass('public.graduate_followup_types') is null then
    raise exception 'GA_ACTIVE_FOLLOWUP_TYPES_PREFLIGHT: graduate_followup_types required';
  end if;
  if to_regprocedure('public.graduate_affairs_resolve_caller_authorized_staff_profile_id(text)') is null then
    raise exception 'GA_ACTIVE_FOLLOWUP_TYPES_PREFLIGHT: AUTH-04 resolver required';
  end if;
end $$;

create or replace function public.graduate_affairs_list_active_followup_types()
returns table (
  id uuid,
  code text,
  label_ar text,
  description_ar text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED';
  end if;

  if public.graduate_affairs_resolve_caller_authorized_staff_profile_id(
       'graduate_affairs_manager'
     ) is null
     and public.graduate_affairs_resolve_caller_authorized_staff_profile_id(
       'graduate_affairs_specialist'
     ) is null then
    raise exception 'GRADUATE_AFFAIRS_ACCESS_DENIED';
  end if;

  return query
  select t.id, t.code, t.label_ar, t.description_ar
  from public.graduate_followup_types t
  where t.is_active
  order by t.code;
end;
$$;

revoke all on function public.graduate_affairs_list_active_followup_types()
  from public, anon;
grant execute on function public.graduate_affairs_list_active_followup_types()
  to authenticated;

commit;
