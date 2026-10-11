-- STUDENT-REQUEST-STAFF-VIEW-HOTFIX-01
--
-- Three defects found while rehearsing «غياب بعذر» end to end:
--
-- 1) «تسجيل العذر لدى مسجل الكلية» fails for two of the four excuse types. The
--    form and absence_excuse_details store the canonical vocabulary (medical,
--    family_emergency, official, other) while student_excused_absences.sea_reason_chk
--    still accepts only the legacy one (medical, family, emergency, other); the
--    step copies the reason verbatim. Fix: accept both vocabularies (additive).
--
-- 2) The staff request workspace shows raw form keys and UUIDs
--    («course_section_id: 9fb1e7ae-…», «reason_type: medical»). Fix: an Arabic
--    summary with the course name for this service.
--
-- 3) The staff request detail never returns the student's program, so the
--    panel always shows «البرنامج: —». Fix: return program_name_ar.
--
-- No row is read for change, rewritten or removed. Deployed functions are
-- patched in place by exact single-match replacement; a patch whose anchor is
-- not found exactly once aborts the whole transaction, and an already-applied
-- patch is skipped (re-runnable).

begin;

-- 1) Reason vocabulary accepted by the applied-excuse table.
alter table public.student_excused_absences drop constraint if exists sea_reason_chk;
alter table public.student_excused_absences
  add constraint sea_reason_chk check (
    reason_type in ('medical', 'family_emergency', 'official', 'other', 'family', 'emergency')
  );

-- 2) Readable staff summary for «غياب بعذر». Reads the optional
--    additional_course_section_ids key too (EXCUSED-ABSENCE-MULTI-COURSE-01);
--    with a single course it shows that course only.
create or replace function public.b1_excused_absence_staff_summary(p_request_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with r as (
    select coalesce(sr.form_data, '{}'::jsonb) as f
    from public.student_requests sr
    where sr.id = p_request_id
  ),
  ids as (
    select 0 as ord, nullif(r.f ->> 'course_section_id', '') as id from r
    union all
    select 1, e.id
    from r
    cross join lateral jsonb_array_elements_text(
      case when jsonb_typeof(r.f -> 'additional_course_section_ids') = 'array'
           then r.f -> 'additional_course_section_ids' else '[]'::jsonb end
    ) as e(id)
  ),
  courses as (
    select string_agg(distinct_courses.label, '، ' order by distinct_courses.ord, distinct_courses.label) as labels,
           count(*) as n
    from (
      select min(ids.ord) as ord,
             coalesce(c.code, '') || ' — ' || coalesce(c.name_ar, '') as label
      from ids
      join public.course_sections cs on cs.id::text = ids.id
      join public.course_offerings co on co.id = cs.course_offering_id
      join public.courses c on c.id = co.course_id
      group by cs.id, c.code, c.name_ar
    ) distinct_courses
  )
  select jsonb_build_array(
    jsonb_build_object(
      'labelAr', case when courses.n > 1 then 'المقررات المشمولة بالعذر (' || courses.n || ')' else 'المقرر' end,
      'valueAr', coalesce(courses.labels, '—')
    ),
    jsonb_build_object('labelAr', 'تاريخ بداية الغياب', 'valueAr', coalesce(nullif(r.f ->> 'absence_date', ''), '—')),
    jsonb_build_object('labelAr', 'نوع العذر', 'valueAr', case r.f ->> 'reason_type'
      when 'medical' then 'طبي'
      when 'family_emergency' then 'طارئ عائلي'
      when 'official' then 'رسمي'
      when 'other' then 'أخرى'
      else coalesce(nullif(r.f ->> 'reason_type', ''), '—') end),
    jsonb_build_object('labelAr', 'سبب الغياب', 'valueAr', coalesce(nullif(btrim(r.f ->> 'absence_reason_detail'), ''), '—'))
  )
  from r cross join courses;
$function$;

revoke all on function public.b1_excused_absence_staff_summary(uuid) from public;
revoke all on function public.b1_excused_absence_staff_summary(uuid) from anon, authenticated;
grant execute on function public.b1_excused_absence_staff_summary(uuid) to service_role;

create or replace function pg_temp.ea_multi_patch(
  p_fn regprocedure,
  p_marker text,
  p_pairs text[]
) returns void
language plpgsql
as $patch$
declare
  v_def text := pg_get_functiondef(p_fn);
  v_old text;
  v_new text;
  v_hits int;
  i int;
begin
  if position(p_marker in v_def) > 0 then
    raise notice 'STUDENT-REQUEST-STAFF-VIEW-HOTFIX-01: % already patched', p_fn;
    return;
  end if;
  if array_length(p_pairs, 1) is null or array_length(p_pairs, 1) % 2 <> 0 then
    raise exception 'EA_MULTI_PATCH_PAIRS_INVALID for %', p_fn;
  end if;
  i := 1;
  while i < array_length(p_pairs, 1) loop
    v_old := p_pairs[i];
    v_new := p_pairs[i + 1];
    v_hits := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_hits <> 1 then
      raise exception 'EA_MULTI_PATCH_ANCHOR_MISMATCH: % anchor #% matched % time(s)', p_fn, (i + 1) / 2, v_hits;
    end if;
    v_def := replace(v_def, v_old, v_new);
    i := i + 2;
  end loop;
  if position(p_marker in v_def) = 0 then
    raise exception 'EA_MULTI_PATCH_MARKER_MISSING for %', p_fn;
  end if;
  execute v_def;
end;
$patch$;

-- 2b) Staff request details use it for this service only.
select pg_temp.ea_multi_patch(
  'public.get_b1_assigned_request_details_for_actor(uuid)'::regprocedure,
  'b1_excused_absence_staff_summary',
  array[
    $o$from jsonb_each_text(coalesce(v_r.form_data, '{}'::jsonb)) as e(key, value);$o$,
    $n$from jsonb_each_text(coalesce(v_r.form_data, '{}'::jsonb)) as e(key, value);
  if v_canon = 'excused_absence' then
    v_summary := public.b1_excused_absence_staff_summary(v_r.id);
  end if;$n$
  ]
);

-- 3) Program name in the staff request detail.
select pg_temp.ea_multi_patch(
  'public.get_student_request_detail_for_actor(uuid)'::regprocedure,
  'program_name_ar',
  array[
    $o$'department_name_ar', d.name_ar,$o$,
    $n$'department_name_ar', d.name_ar,
      'program_name_ar', (SELECT pr.name_ar FROM public.programs pr WHERE pr.id = sp.program_id),$n$
  ]
);

notify pgrst, 'reload schema';

commit;

-- Post-check (read-only): every row must be true.
select 'reason_check' as item, pg_get_constraintdef(oid) like '%family_emergency%' as ok
from pg_constraint
where conrelid = 'public.student_excused_absences'::regclass and conname = 'sea_reason_chk'
union all
select 'staff_summary', position('b1_excused_absence_staff_summary' in pg_get_functiondef(
  'public.get_b1_assigned_request_details_for_actor(uuid)'::regprocedure)) > 0
union all
select 'program_name', position('program_name_ar' in pg_get_functiondef(
  'public.get_student_request_detail_for_actor(uuid)'::regprocedure)) > 0;
