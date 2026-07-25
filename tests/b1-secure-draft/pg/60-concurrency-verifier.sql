do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.student_requests
  where student_profile_id = '91919191-9191-9191-9191-919191919191'
    and request_type = 'enrollment_suspension'
    and status = 'draft';
  if v_count <> 1 then
    raise exception 'B1_CONCURRENT_CREATE_DUPLICATE: count=%', v_count;
  end if;
end $$;

select 'B1_CONCURRENT_CREATE_ONE_DRAFT_PASS' as status;
