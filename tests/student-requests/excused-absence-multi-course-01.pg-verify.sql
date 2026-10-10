-- EXCUSED-ABSENCE-MULTI-COURSE-01 — verifier. Any failed assertion aborts the chain.
\set ON_ERROR_STOP on

insert into public.student_profiles(id, user_id, full_name_ar, academic_number) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1', 'طالبة الاختبار', 'T-1'),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000b2', 'طالب آخر', 'T-2');
insert into public.request_types(code, name_ar) values ('excused_absence', 'غياب بعذر');
insert into public.courses(id, code, name_ar)
select ('00000000-0000-4000-8000-00000000c00' || g)::uuid, 'C' || g, 'مقرر ' || g from generate_series(1, 4) g;
insert into public.course_offerings(id, course_id)
select ('00000000-0000-4000-8000-00000000d00' || g)::uuid, ('00000000-0000-4000-8000-00000000c00' || g)::uuid from generate_series(1, 4) g;
insert into public.course_sections(id, course_offering_id)
select ('00000000-0000-4000-8000-00000000e00' || g)::uuid, ('00000000-0000-4000-8000-00000000d00' || g)::uuid from generate_series(1, 4) g;
-- Student 1 is enrolled in sections 1..3; section 4 belongs to student 2 only.
insert into public.student_enrollments(student_profile_id, course_section_id)
select '00000000-0000-4000-8000-0000000000a1', ('00000000-0000-4000-8000-00000000e00' || g)::uuid from generate_series(1, 3) g;
insert into public.student_enrollments(student_profile_id, course_section_id)
values ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000e004');
insert into public.student_requests(id, student_profile_id, request_type, status, request_number) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1', 'excused_absence', 'draft', 'R-1'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000a1', 'excused_absence', 'draft', 'R-2');

select set_config('test.uid', '00000000-0000-4000-8000-0000000000b1', false);

do $verify$
declare
  v_profile public.student_profiles%rowtype;
  v_req constant uuid := '00000000-0000-4000-8000-0000000000f1';
  v_single constant uuid := '00000000-0000-4000-8000-0000000000f2';
  s1 constant text := '00000000-0000-4000-8000-00000000e001';
  s2 constant text := '00000000-0000-4000-8000-00000000e002';
  s3 constant text := '00000000-0000-4000-8000-00000000e003';
  s4 constant text := '00000000-0000-4000-8000-00000000e004';
  v_base jsonb;
  v_extra uuid[];
  v_n int;
  v_summary jsonb;
  v_failed boolean;
begin
  select * into v_profile from public.student_profiles where id = '00000000-0000-4000-8000-0000000000a1';
  v_base := jsonb_build_object('course_section_id', s1, 'absence_date', (current_date - 1)::text,
    'reason_type', 'official', 'absence_reason_detail', 'مهمة رسمية خارج المحافظة');

  -- 1) Allowlist carries the new key, and only for this service.
  if not ('additional_course_section_ids' = any (public.b1_draft_form_allowlist('excused_absence'))) then
    raise exception 'allowlist missing new key'; end if;
  if 'additional_course_section_ids' = any (public.b1_draft_form_allowlist('department_transfer')) then
    raise exception 'allowlist leaked to another service'; end if;

  -- 2) Draft save with extra courses: stored de-duplicated and without the primary.
  perform public.persist_b1_draft_form_and_details(v_req, 'excused_absence',
    v_base || jsonb_build_object('additional_course_section_ids', jsonb_build_array(s2, s3, s2, s1)), v_profile);
  select additional_course_section_ids into v_extra from public.absence_excuse_details where request_id = v_req;
  if v_extra is distinct from array[s2, s3]::uuid[] then raise exception 'draft extras wrong: %', v_extra; end if;

  -- 3) Draft save without the key clears the extras (single-course request still works).
  perform public.persist_b1_draft_form_and_details(v_req, 'excused_absence', v_base, v_profile);
  select additional_course_section_ids into v_extra from public.absence_excuse_details where request_id = v_req;
  if v_extra <> '{}'::uuid[] then raise exception 'draft extras not cleared: %', v_extra; end if;

  -- 4) Negative: a course the student is not enrolled in is rejected (draft and submit).
  v_failed := false;
  begin
    perform public.persist_b1_draft_form_and_details(v_req, 'excused_absence',
      v_base || jsonb_build_object('additional_course_section_ids', jsonb_build_array(s4)), v_profile);
  exception when others then
    v_failed := sqlerrm = 'B1_ACTIVE_COURSE_ENROLLMENT_REQUIRED';
  end;
  if not v_failed then raise exception 'draft accepted a foreign course'; end if;
  v_failed := false;
  begin
    perform public.persist_validated_b1_request_details(v_req, 'excused_absence',
      v_base || jsonb_build_object('additional_course_section_ids', jsonb_build_array(s2, s4)), '{}'::uuid[]);
  exception when others then
    v_failed := sqlerrm = 'B1_ACTIVE_COURSE_ENROLLMENT_REQUIRED';
  end;
  if not v_failed then raise exception 'submit accepted a foreign course'; end if;

  -- 5) Negative: malformed values are rejected.
  v_failed := false;
  begin
    perform public.persist_b1_draft_form_and_details(v_req, 'excused_absence',
      v_base || jsonb_build_object('additional_course_section_ids', 'all'), v_profile);
  exception when others then
    v_failed := sqlerrm = 'B1_DRAFT_FIELD_TYPE_INVALID';
  end;
  if not v_failed then raise exception 'draft accepted a non-array value'; end if;
  v_failed := false;
  begin
    perform public.persist_validated_b1_request_details(v_req, 'excused_absence',
      v_base || jsonb_build_object('additional_course_section_ids', jsonb_build_array('not-a-uuid')), '{}'::uuid[]);
  exception when others then
    v_failed := true;
  end;
  if not v_failed then raise exception 'submit accepted a malformed id'; end if;
  v_failed := false;
  begin
    perform public.persist_validated_b1_request_details(v_req, 'excused_absence',
      v_base || jsonb_build_object('unexpected_key', 'x'), '{}'::uuid[]);
  exception when others then
    v_failed := sqlerrm = 'B1_UNEXPECTED_FORM_FIELD';
  end;
  if not v_failed then raise exception 'submit allowlist no longer strict'; end if;

  -- 6) Submit-time persistence with all remaining courses.
  perform public.persist_validated_b1_request_details(v_req, 'excused_absence',
    v_base || jsonb_build_object('additional_course_section_ids', jsonb_build_array(s3, s2)), '{}'::uuid[]);
  select additional_course_section_ids into v_extra from public.absence_excuse_details where request_id = v_req;
  if v_extra is distinct from array[s2, s3]::uuid[] then raise exception 'submit extras wrong: %', v_extra; end if;
  update public.student_requests
    set status = 'in_review',
        form_data = v_base || jsonb_build_object('additional_course_section_ids', jsonb_build_array(s3, s2))
    where id = v_req;

  -- 7) Staff summary: Arabic labels, course names, no raw keys or UUIDs.
  insert into public.request_type_workflow_steps(id, step_key, action_type)
    values ('00000000-0000-4000-8000-000000000071', 'record_apply', 'apply_decision');
  insert into public.student_request_workflow_steps(id, student_request_id, workflow_step_id, status, step_order, step_key, step_name_ar)
    values ('00000000-0000-4000-8000-000000000081', v_req, '00000000-0000-4000-8000-000000000071', 'active', 7, 'record_apply', 'تطبيق العذر');
  v_summary := public.get_b1_assigned_request_details_for_actor(v_req) -> 'formDataSummary';
  if jsonb_array_length(v_summary) <> 4 then raise exception 'summary rows: %', v_summary; end if;
  if v_summary -> 0 ->> 'labelAr' <> 'المقررات المشمولة بالعذر (3)' then raise exception 'summary label: %', v_summary -> 0; end if;
  if v_summary -> 0 ->> 'valueAr' <> 'C1 — مقرر 1، C2 — مقرر 2، C3 — مقرر 3' then raise exception 'summary courses: %', v_summary -> 0; end if;
  if v_summary -> 2 ->> 'valueAr' <> 'رسمي' then raise exception 'summary reason: %', v_summary -> 2; end if;
  if v_summary::text ~ '[0-9a-f]{8}-[0-9a-f]{4}-' or v_summary::text like '%course_section_id%' then
    raise exception 'summary leaks raw keys or ids: %', v_summary; end if;

  -- 8) Record apply: one row per covered course, with a canonical reason the
  --    legacy check used to reject; an extra course dropped meanwhile is skipped.
  delete from public.student_enrollments
    where student_profile_id = v_profile.id and course_section_id = s3::uuid;
  perform set_config('b1.atomic_action', '1', true);
  perform public.apply_b1_excused_absence_effect(v_req);
  select count(*) into v_n from public.student_excused_absences where absence_excuse_request_id = v_req;
  if v_n <> 2 then raise exception 'applied rows: % (expected 2)', v_n; end if;
  if exists (select 1 from public.student_excused_absences
             where absence_excuse_request_id = v_req and course_section_id = s3::uuid) then
    raise exception 'applied to a dropped course'; end if;
  if not exists (select 1 from public.student_excused_absences
                 where absence_excuse_request_id = v_req and reason_type = 'official') then
    raise exception 'canonical reason not stored'; end if;
  if (select record_applied_at from public.absence_excuse_details where request_id = v_req) is null then
    raise exception 'record_applied_at not set'; end if;
  -- Idempotent replay.
  perform public.apply_b1_excused_absence_effect(v_req);
  select count(*) into v_n from public.student_excused_absences where absence_excuse_request_id = v_req;
  if v_n <> 2 then raise exception 'replay duplicated rows: %', v_n; end if;
  if (select payload -> 'additional_course_section_ids' from public.student_request_workflow_events
      where student_request_id = v_req and event_type = 'academic_effect_applied') is null then
    raise exception 'event payload missing extras'; end if;

  -- 9) Single-course request keeps its exact old behaviour.
  perform public.persist_validated_b1_request_details(v_single, 'excused_absence',
    jsonb_build_object('course_section_id', s2, 'absence_date', (current_date - 2)::text,
      'reason_type', 'medical', 'absence_reason_detail', 'مراجعة طبية'), '{}'::uuid[]);
  update public.student_requests set status = 'in_review' where id = v_single;
  insert into public.student_request_workflow_steps(id, student_request_id, workflow_step_id, status, step_order, step_key, step_name_ar)
    values ('00000000-0000-4000-8000-000000000082', v_single, '00000000-0000-4000-8000-000000000071', 'active', 7, 'record_apply', 'تطبيق العذر');
  perform public.apply_b1_excused_absence_effect(v_single);
  select count(*) into v_n from public.student_excused_absences where absence_excuse_request_id = v_single;
  if v_n <> 1 then raise exception 'single-course applied rows: %', v_n; end if;

  -- 10) The validation helper is not callable by client roles.
  if has_function_privilege('authenticated', 'public.b1_excused_absence_additional_sections(jsonb, uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'public.b1_excused_absence_staff_summary(uuid)', 'execute') then
    raise exception 'helper exposed to client roles'; end if;

  -- 11) Staff request detail returns the student's program.
  if position('program_name_ar' in pg_get_functiondef('public.get_student_request_detail_for_actor(uuid)'::regprocedure)) = 0 then
    raise exception 'program name patch missing'; end if;

  raise notice 'EXCUSED-ABSENCE-MULTI-COURSE-01 verifier PASS';
end
$verify$;
