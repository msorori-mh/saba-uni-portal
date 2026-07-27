create or replace function public.b1_canonical_primary_stored_code(p_canonical text)
returns text
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with candidates as (
    select case p_canonical
      when 'enrollment_suspension' then array['enrollment_suspension']
      when 'excused_absence' then array['excused_absence','absence_excuse']
      when 'department_transfer' then array['department_transfer','transfer']
      when 'final_chance' then array['final_chance','extra_chance']
      when 'file_withdrawal' then array['file_withdrawal']
      else null::text[]
    end as codes
  ), resolved as (
    select c.code, ord
    from candidates
    cross join lateral unnest(candidates.codes) with ordinality as c(code, ord)
    join public.request_types rt on rt.code = c.code
    order by ord
    limit 1
  )
  select coalesce(
    (select code from resolved),
    (select (candidates.codes)[1] from candidates)
  );
$function$;

do $postcheck$
begin
  if public.b1_canonical_primary_stored_code('excused_absence') is distinct from 'excused_absence'
     or public.b1_canonical_primary_stored_code('department_transfer') is distinct from 'department_transfer'
     or public.b1_canonical_primary_stored_code('final_chance') is distinct from 'final_chance'
     or public.b1_canonical_primary_stored_code('enrollment_suspension') is distinct from 'enrollment_suspension'
     or public.b1_canonical_primary_stored_code('file_withdrawal') is distinct from 'file_withdrawal'
     or public.b1_canonical_primary_stored_code('anything_else') is not null then
    raise exception 'B1_CANONICAL_STORED_CODE_RESOLUTION_POSTCHECK_FAILED';
  end if;
end;
$postcheck$;