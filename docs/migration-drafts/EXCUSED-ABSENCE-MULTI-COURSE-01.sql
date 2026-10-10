-- EXCUSED-ABSENCE-MULTI-COURSE-01
--
-- One «غياب بعذر» request may now cover several of the student's enrolled
-- courses (or all of them) for the same absence date.
--
-- Shape (backward compatible):
--   * form_data.course_section_id            — unchanged, still required (first course).
--   * form_data.additional_course_section_ids — new, optional uuid array.
--   * absence_excuse_details.additional_course_section_ids uuid[] — new column.
--   * record_apply writes one student_excused_absences row per covered course.
--
-- The two large persistence functions are patched in place (exact, single-match
-- text replacement on the deployed definition) so nothing else in them changes.
-- Every patch aborts the whole transaction if its anchor is not found exactly
-- once, and is skipped if it was already applied (re-runnable).
--
-- Apply STUDENT-REQUEST-STAFF-VIEW-HOTFIX-01 first (reason vocabulary of the
-- applied-excuse table and the readable staff summary).

begin;

-- 1) Storage.
alter table public.absence_excuse_details
  add column if not exists additional_course_section_ids uuid[] not null default '{}'::uuid[];

-- One request used to mean one applied row; it now means one row per course.
alter table public.student_excused_absences drop constraint if exists sea_request_unique;
create unique index if not exists sea_request_section_unique
  on public.student_excused_absences (absence_excuse_request_id, course_section_id);
create index if not exists idx_sea_request
  on public.student_excused_absences (absence_excuse_request_id);

-- 2) Trusted validation of the extra courses: uuid array, de-duplicated, never
--    the primary course, each one an active enrollment of this student.
create or replace function public.b1_excused_absence_additional_sections(
  p_form jsonb,
  p_student_profile_id uuid,
  p_primary_section_id uuid
) returns uuid[]
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ids uuid[];
  v_id uuid;
begin
  if p_form is null or not (p_form ? 'additional_course_section_ids') then
    return '{}'::uuid[];
  end if;
  perform public.b1_assert_uuid_array_field(p_form, 'additional_course_section_ids');
  select coalesce(array_agg(distinct x.id), '{}'::uuid[])
    into v_ids
  from (
    select (e #>> '{}')::uuid as id
    from jsonb_array_elements(p_form -> 'additional_course_section_ids') e
  ) x
  where p_primary_section_id is null or x.id <> p_primary_section_id;
  if cardinality(v_ids) > 30 then
    raise exception 'B1_ABSENCE_INPUT_INVALID' using errcode = '23514';
  end if;
  foreach v_id in array v_ids loop
    perform public.assert_b1_active_course_enrollment(p_student_profile_id, v_id);
  end loop;
  return v_ids;
end;
$function$;

revoke all on function public.b1_excused_absence_additional_sections(jsonb, uuid, uuid) from public;
revoke all on function public.b1_excused_absence_additional_sections(jsonb, uuid, uuid) from anon, authenticated;
grant execute on function public.b1_excused_absence_additional_sections(jsonb, uuid, uuid) to service_role;

-- 3) Draft allowlist: one new key for excused_absence, everything else as deployed.
create or replace function public.b1_draft_form_allowlist(p_canonical text)
returns text[]
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$
  select case p_canonical
    when 'enrollment_suspension' then array[
      'target_academic_year','target_semester','suspension_reason','suspension_duration_type','notes','terms_acknowledgment'
    ]
    when 'excused_absence' then array[
      'course_section_id','additional_course_section_ids','absence_date','reason_type','absence_reason_detail','excuse_documents'
    ]
    when 'department_transfer' then array[
      'target_department_id','target_program_id','transfer_reason','secondary_certificate_file'
    ]
    when 'final_chance' then array[
      'target_academic_year','target_semester','reason','chance_type'
    ]
    when 'file_withdrawal' then array[
      'withdrawal_reason','impact_acknowledgment'
    ]
    else array[]::text[]
  end;
$function$;

-- 5) In-place patches of the deployed functions.
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
    raise notice 'EXCUSED-ABSENCE-MULTI-COURSE-01: % already patched', p_fn;
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

-- 5a) Draft save.
select pg_temp.ea_multi_patch(
  'public.persist_b1_draft_form_and_details(uuid, text, jsonb, public.student_profiles)'::regprocedure,
  'b1_excused_absence_additional_sections',
  array[
    $o$perform public.b1_assert_uuid_array_field(p_form, 'secondary_certificate_file');$o$,
    $n$perform public.b1_assert_uuid_array_field(p_form, 'secondary_certificate_file');
  perform public.b1_assert_uuid_array_field(p_form, 'additional_course_section_ids');$n$,

    $o$request_id, course_section_id, absence_date, reason_type, absence_reason_detail$o$,
    $n$request_id, course_section_id, absence_date, reason_type, absence_reason_detail, additional_course_section_ids$n$,

    $o$p_request_id, v_section, v_date, v_reason_type, coalesce(v_detail, '')$o$,
    $n$p_request_id, v_section, v_date, v_reason_type, coalesce(v_detail, ''),
        public.b1_excused_absence_additional_sections(p_form, p_profile.id, v_section)$n$,

    $o$course_section_id = excluded.course_section_id,$o$,
    $n$course_section_id = excluded.course_section_id,
        additional_course_section_ids = excluded.additional_course_section_ids,$n$
  ]
);

-- 5b) Submit-time validated persistence.
select pg_temp.ea_multi_patch(
  'public.persist_validated_b1_request_details(uuid, text, jsonb, uuid[])'::regprocedure,
  'b1_excused_absence_additional_sections',
  array[
    $o$ARRAY['course_section_id','absence_date','reason_type','absence_reason_detail','excuse_documents']$o$,
    $n$ARRAY['course_section_id','additional_course_section_ids','absence_date','reason_type','absence_reason_detail','excuse_documents']$n$,

    $o$INSERT INTO public.absence_excuse_details(request_id,course_section_id,absence_date,reason_type,absence_reason_detail)$o$,
    $n$INSERT INTO public.absence_excuse_details(request_id,course_section_id,absence_date,reason_type,absence_reason_detail,additional_course_section_ids)$n$,

    $o$p_form_data->>'reason_type',btrim(p_form_data->>'absence_reason_detail'))$o$,
    $n$p_form_data->>'reason_type',btrim(p_form_data->>'absence_reason_detail'),
        public.b1_excused_absence_additional_sections(p_form_data,v_profile.id,v_section))$n$,

    $o$DO UPDATE SET course_section_id=EXCLUDED.course_section_id,absence_date=EXCLUDED.absence_date,$o$,
    $n$DO UPDATE SET course_section_id=EXCLUDED.course_section_id,absence_date=EXCLUDED.absence_date,
        additional_course_section_ids=EXCLUDED.additional_course_section_ids,$n$
  ]
);

-- 5c) Record-apply effect: one applied row per covered course. An extra course
--     the student is no longer enrolled in is skipped, never blocking the rest.
select pg_temp.ea_multi_patch(
  'public.apply_b1_excused_absence_effect(uuid)'::regprocedure,
  'additional_course_section_ids',
  array[
    $o$ON CONFLICT (student_profile_id,course_section_id,absence_date) DO NOTHING;$o$,
    $n$ON CONFLICT (student_profile_id,course_section_id,absence_date) DO NOTHING;
  INSERT INTO public.student_excused_absences(student_profile_id,course_section_id,absence_date,reason_type,absence_excuse_request_id)
    SELECT v_request.student_profile_id,x.section_id,v_details.absence_date,v_details.reason_type,p_request_id
    FROM (SELECT DISTINCT u.section_id FROM unnest(v_details.additional_course_section_ids) AS u(section_id)) x
    WHERE x.section_id<>v_details.course_section_id
      AND EXISTS (SELECT 1 FROM public.student_enrollments e WHERE e.student_profile_id=v_request.student_profile_id
        AND e.course_section_id=x.section_id AND e.enrollment_status='enrolled')
    ON CONFLICT (student_profile_id,course_section_id,absence_date) DO NOTHING;$n$,

    $o$jsonb_build_object('effect','excused_absence','course_section_id',v_details.course_section_id,'absence_date',v_details.absence_date)$o$,
    $n$jsonb_build_object('effect','excused_absence','course_section_id',v_details.course_section_id,
        'additional_course_section_ids',to_jsonb(v_details.additional_course_section_ids),'absence_date',v_details.absence_date)$n$
  ]
);

notify pgrst, 'reload schema';

commit;

-- Post-check (read-only): every row must be true.
select 'column' as item,
       exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'absence_excuse_details'
                 and column_name = 'additional_course_section_ids') as ok
union all
select 'allowlist', 'additional_course_section_ids' = any (public.b1_draft_form_allowlist('excused_absence'))
union all
select 'draft_persist', position('b1_excused_absence_additional_sections' in pg_get_functiondef(
  'public.persist_b1_draft_form_and_details(uuid, text, jsonb, public.student_profiles)'::regprocedure)) > 0
union all
select 'submit_persist', position('b1_excused_absence_additional_sections' in pg_get_functiondef(
  'public.persist_validated_b1_request_details(uuid, text, jsonb, uuid[])'::regprocedure)) > 0
union all
select 'record_apply', position('additional_course_section_ids' in pg_get_functiondef(
  'public.apply_b1_excused_absence_effect(uuid)'::regprocedure)) > 0;
