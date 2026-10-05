-- STUDENT-SERVICES-GLOBAL-SWITCH-01 — direct-RPC matrix (isolated cluster).
--   enabled  -> every student submit path works
--   disabled -> every student start/submit path is refused with
--               STUDENT_SERVICES_TEMPORARILY_DISABLED and writes nothing
--   disabled -> staff/system writes, resubmission of a returned request,
--               editing/cancelling an own draft still work
--   only admin | system_admin may flip the switch; every flip is audited
\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION public.h_ok(p_cond boolean, p_label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'CASE_FAIL: %', p_label; END IF;
  RAISE NOTICE 'ok: %', p_label;
END $$;

CREATE OR REPLACE FUNCTION public.h_login(p_uid text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('harness.uid', COALESCE(p_uid, ''), false); END $$;

-- Rows a refused student write must leave untouched.
CREATE OR REPLACE FUNCTION public.h_ssgs_data_fingerprint() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT md5(concat_ws('|',
    (SELECT coalesce(string_agg(md5(r::text), ',' ORDER BY r.id), '') FROM public.student_requests r),
    (SELECT coalesce(string_agg(md5(s::text), ',' ORDER BY s.id), '') FROM public.student_request_workflow_steps s),
    (SELECT count(*)::text FROM public.student_request_workflow_events),
    (SELECT count(*)::text FROM public.audit_logs)))
$$;

-- Runs p_sql as the current harness user; it MUST fail with p_expected and
-- MUST leave requests / runtime steps / events / audit rows unchanged.
CREATE OR REPLACE FUNCTION public.h_refused(p_label text, p_sql text, p_expected text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_before text := public.h_ssgs_data_fingerprint(); v_msg text;
BEGIN
  BEGIN
    EXECUTE p_sql;
    RAISE EXCEPTION 'CASE_FAIL: % — statement succeeded', p_label;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg LIKE 'CASE_FAIL:%' THEN RAISE; END IF;
    IF position(p_expected in v_msg) = 0 THEN
      RAISE EXCEPTION 'CASE_FAIL: % — expected %, got %', p_label, p_expected, v_msg;
    END IF;
  END;
  IF v_before IS DISTINCT FROM public.h_ssgs_data_fingerprint() THEN
    RAISE EXCEPTION 'CASE_FAIL: % — refused statement left rows behind', p_label;
  END IF;
  RAISE NOTICE 'ok: % -> %', p_label, p_expected;
END $$;

-- The user who is the direct assignee of the request's active runtime step.
CREATE OR REPLACE FUNCTION public.h_active_assignee(p_request uuid) RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(s.assigned_user_id, st.user_id, pa.user_id, fp.user_id)
  FROM public.student_request_workflow_steps s
  LEFT JOIN public.staff_profiles st ON st.id = s.assigned_staff_profile_id
  LEFT JOIN public.position_assignments pa ON pa.id = s.assigned_position_assignment_id
  LEFT JOIN public.faculty_profiles fp ON fp.id = s.assigned_faculty_profile_id
  WHERE s.student_request_id = p_request AND s.status = 'active'
  ORDER BY s.step_order LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.h_active_step(p_request uuid) RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT s.id FROM public.student_request_workflow_steps s
  WHERE s.student_request_id = p_request AND s.status = 'active'
  ORDER BY s.step_order LIMIT 1
$$;

-- Staff returns a B1 request to the student. Uses the real engine action as
-- the step's direct assignee; when the active workflow's first step does not
-- offer `return` (the free three-step cycle), the same end state is written as
-- a system write. Either way it is NOT a student write.
CREATE OR REPLACE FUNCTION public.h_staff_return_b1(p_request uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_msg text;
BEGIN
  PERFORM public.h_login(public.h_active_assignee(p_request)::text);
  BEGIN
    PERFORM public.act_on_b1_student_request_step_atomic(public.h_active_step(p_request),
      'return', 'يرجى استكمال المرفقات', '{}'::jsonb);
    RAISE NOTICE 'ok: setup — B1 request returned through act_on_b1_student_request_step_atomic';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg NOT LIKE 'B1_ACTION_TYPE_MISMATCH%' THEN RAISE; END IF;
    PERFORM public.h_login(NULL);
    PERFORM set_config('b1.atomic_action', '1', true);
    UPDATE public.student_request_workflow_steps
       SET status = 'returned', decision = 'returned', completed_at = now()
     WHERE student_request_id = p_request AND status = 'active';
    UPDATE public.student_requests SET status = 'returned_for_completion', rejection_reason = 'استكمال'
     WHERE id = p_request;
    RAISE NOTICE 'ok: setup — B1 request returned by a system write (cycle has no return on this step)';
  END;
  PERFORM public.h_login(NULL);
END $$;

\set student   '11111111-1111-1111-1111-000000000010'
\set student2  'aaaaaaaa-0000-0000-0000-000000000007'
\set student3  'aaaaaaaa-0000-0000-0000-000000000008'
\set profile   '77777777-7777-7777-7777-000000000001'
\set specialist '11111111-1111-1111-1111-000000000001'
\set admin     'aaaaaaaa-0000-0000-0000-000000000001'
\set sysadmin  'aaaaaaaa-0000-0000-0000-000000000002'

-- ---------------------------------------------------------------------------
-- 1. Default state after apply: ENABLED, nothing changes for anyone
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM public.h_ok((SELECT count(*) = 1 AND bool_and(enabled) AND bool_and(message_ar IS NULL)
                         AND bool_and(updated_by IS NULL) FROM public.student_services_switch),
    'seeded exactly one row, ENABLED, no message');
  PERFORM public.h_ok(public.student_services_enabled(), 'predicate answers enabled');
  PERFORM public.h_ok((SELECT count(*) = 0 FROM public.audit_logs WHERE entity_type = 'student_services_switch'),
    'applying the draft wrote no audit row');
  PERFORM public.h_login('11111111-1111-1111-1111-000000000010');
  PERFORM public.h_ok(public.get_student_services_status() - 'updated_at'
                        = '{"enabled": true, "message_ar": null}'::jsonb,
    'student reads: enabled, no notice');
END $$;

-- ---------------------------------------------------------------------------
-- 2. ENABLED: representative legacy, P1-atomic and B1 submissions all work.
--    Also prepares the rows the disabled phase needs (two drafts created
--    BEFORE the switch is turned off, and two requests staff returned).
-- ---------------------------------------------------------------------------
SELECT public.h_login(:'student');

SELECT public.create_student_request('enrollment_certificate', 'إفادة قيد', '{}'::jsonb, NULL) AS legacy_ok \gset
SELECT public.submit_student_request(:'legacy_ok') AS submitted \gset
SELECT public.h_ok((SELECT status = 'submitted' FROM public.student_requests WHERE id = :'legacy_ok'),
  'ENABLED legacy: create_student_request + submit_student_request -> submitted');

SELECT public.h_login(:'student2');
SELECT public.submit_student_request_with_details('replacement_student_card', 'بطاقة بدل فاقد',
  '{"loss_reason":"فقدان","loss_declaration_ack":true}'::jsonb) AS p1_ok \gset
SELECT public.h_login(:'student');
SELECT public.h_ok((SELECT status = 'submitted' FROM public.student_requests WHERE id = :'p1_ok'),
  'ENABLED P1 atomic: submit_student_request_with_details -> submitted');

INSERT INTO public.student_requests (student_profile_id, request_type, title, status)
VALUES (:'profile', 'excused_absence', 'غياب بعذر', 'draft') RETURNING id AS b1_ok \gset
SELECT public.submit_b1_student_request_atomic_core(:'b1_ok', 'excused_absence', '{}'::jsonb,
  (SELECT updated_at FROM public.student_requests WHERE id = :'b1_ok')) ->> 'success' AS b1_success \gset
SELECT public.h_ok(:'b1_success' = 'true'
  AND (SELECT status = 'submitted' FROM public.student_requests WHERE id = :'b1_ok')
  AND (SELECT count(*) > 0 FROM public.student_request_workflow_steps WHERE student_request_id = :'b1_ok'),
  'ENABLED B1: draft + submit_b1_student_request_atomic(_core) -> submitted with runtime steps');

-- drafts that already exist when the switch is turned off
SELECT public.create_student_request('enrollment_certificate', 'مسودة سابقة', '{}'::jsonb, NULL) AS legacy_draft \gset
INSERT INTO public.student_requests (student_profile_id, request_type, title, status)
VALUES (:'profile', 'excused_absence', 'مسودة غياب سابقة', 'draft') RETURNING id AS b1_draft \gset
SELECT public.create_student_request('enrollment_certificate', 'مسودة للإلغاء', '{}'::jsonb, NULL) AS cancel_draft \gset

-- requests staff sent back to the student (staff/system write, not the student)
SELECT public.create_student_request('enrollment_certificate', 'طلب مُعاد', '{}'::jsonb, NULL) AS legacy_returned \gset
SELECT public.submit_student_request(:'legacy_returned') AS s2 \gset
INSERT INTO public.student_requests (student_profile_id, request_type, title, status)
VALUES (:'profile', 'excused_absence', 'غياب مُعاد', 'draft') RETURNING id AS b1_returned \gset
SELECT public.submit_b1_student_request_atomic_core(:'b1_returned', 'excused_absence', '{}'::jsonb,
  (SELECT updated_at FROM public.student_requests WHERE id = :'b1_returned')) AS s3 \gset
-- B1: returned by staff (real `return` action where the active cycle offers it).
SELECT public.h_staff_return_b1(:'b1_returned');
-- legacy: the harness carries no legacy staff engine, so a staff member
-- (admin role, not the owner) writes the returned state directly.
SELECT public.h_login(:'admin');
UPDATE public.student_requests SET status = 'returned', rejection_reason = 'استكمال'
WHERE id = :'legacy_returned';
SELECT public.h_login(NULL);
SELECT public.h_ok((SELECT bool_and(status IN ('returned', 'returned_for_completion')) FROM public.student_requests
                    WHERE id IN (:'legacy_returned', :'b1_returned')),
  'setup: one legacy and one B1 request were returned to the student by staff');

-- ---------------------------------------------------------------------------
-- 3. Who may flip the switch: admin | system_admin ONLY (direct RPC)
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_uid text; v_before text;
BEGIN
  v_before := (SELECT md5(w::text) FROM public.student_services_switch w);

  PERFORM public.h_login(NULL);
  PERFORM public.h_refused('unauthenticated caller cannot flip',
    'SELECT public.admin_set_student_services_enabled(false, NULL)',
    'STUDENT_SERVICES_SWITCH_AUTH_REQUIRED');
  PERFORM public.h_refused('unauthenticated caller cannot read the admin view',
    'SELECT public.admin_get_student_services_switch()',
    'STUDENT_SERVICES_SWITCH_AUTH_REQUIRED');

  FOREACH v_uid IN ARRAY ARRAY[
    'aaaaaaaa-0000-0000-0000-000000000003',  -- dean
    'aaaaaaaa-0000-0000-0000-000000000004',  -- registrar
    'aaaaaaaa-0000-0000-0000-000000000005',  -- student_affairs
    'aaaaaaaa-0000-0000-0000-000000000006',  -- no role
    '11111111-1111-1111-1111-000000000001',  -- processing specialist (staff)
    '11111111-1111-1111-1111-000000000010'   -- student
  ] LOOP
    PERFORM public.h_login(v_uid);
    PERFORM public.h_refused('non-admin ' || v_uid || ' cannot disable',
      'SELECT public.admin_set_student_services_enabled(false, ''x'')',
      'STUDENT_SERVICES_SWITCH_ADMIN_REQUIRED');
    PERFORM public.h_refused('non-admin ' || v_uid || ' cannot enable',
      'SELECT public.admin_set_student_services_enabled(true, NULL)',
      'STUDENT_SERVICES_SWITCH_ADMIN_REQUIRED');
    PERFORM public.h_refused('non-admin ' || v_uid || ' cannot read who/when',
      'SELECT public.admin_get_student_services_switch()',
      'STUDENT_SERVICES_SWITCH_ADMIN_REQUIRED');
  END LOOP;

  PERFORM public.h_ok(v_before = (SELECT md5(w::text) FROM public.student_services_switch w),
    'switch row untouched by every refused caller');
  PERFORM public.h_ok((SELECT count(*) = 0 FROM public.audit_logs WHERE entity_type = 'student_services_switch'),
    'refused flips wrote no audit row');

  -- No table privilege for API roles: the RPC is the only write path.
  PERFORM public.h_ok(
    NOT has_table_privilege('authenticated', 'public.student_services_switch', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.student_services_switch', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.student_services_switch', 'INSERT')
    AND NOT has_table_privilege('anon', 'public.student_services_switch', 'SELECT')
    AND NOT has_table_privilege('service_role', 'public.student_services_switch', 'UPDATE'),
    'no direct table access for anon / authenticated; service_role is read-only');
  PERFORM public.h_ok(
    NOT has_function_privilege('anon', 'public.admin_set_student_services_enabled(boolean,text)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.get_student_services_status()', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.get_student_services_status()', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.guard_student_services_switch()', 'EXECUTE'),
    'EXECUTE: anon nothing, authenticated the RPCs, guard function not callable');
END $$;

-- The API role really cannot touch the table (privilege check, not RLS luck).
SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    UPDATE public.student_services_switch SET enabled = false;
    RAISE EXCEPTION 'CASE_FAIL: authenticated updated the switch table directly';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok: authenticated direct UPDATE -> permission denied';
  END;
  BEGIN
    PERFORM 1 FROM public.student_services_switch;
    RAISE EXCEPTION 'CASE_FAIL: authenticated selected the switch table directly';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok: authenticated direct SELECT -> permission denied';
  END;
END $$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- 4. Admin disables — validated + audited
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_res jsonb; v_audit record;
BEGIN
  PERFORM public.h_login('aaaaaaaa-0000-0000-0000-000000000001');

  PERFORM public.h_refused('message longer than 500 characters',
    format('SELECT public.admin_set_student_services_enabled(false, %L)', repeat('ا', 501)),
    'STUDENT_SERVICES_SWITCH_MESSAGE_TOO_LONG');
  PERFORM public.h_refused('markup in the message',
    'SELECT public.admin_set_student_services_enabled(false, ''<b>توقف</b>'')',
    'STUDENT_SERVICES_SWITCH_MESSAGE_PLAIN_TEXT_REQUIRED');
  PERFORM public.h_refused('control character in the message',
    format('SELECT public.admin_set_student_services_enabled(false, %L)', 'توقف' || chr(7)),
    'STUDENT_SERVICES_SWITCH_MESSAGE_PLAIN_TEXT_REQUIRED');
  PERFORM public.h_refused('NULL state',
    'SELECT public.admin_set_student_services_enabled(NULL, NULL)',
    'STUDENT_SERVICES_SWITCH_STATE_REQUIRED');
  PERFORM public.h_ok(public.student_services_enabled(), 'still enabled after the rejected inputs');

  v_res := public.admin_set_student_services_enabled(false, '  صيانة حتى نهاية الأسبوع.' || chr(10) || 'نعتذر عن الإزعاج  ');
  PERFORM public.h_ok((v_res->>'changed')::boolean AND NOT (v_res->>'enabled')::boolean
    AND v_res->>'message_ar' = 'صيانة حتى نهاية الأسبوع.' || chr(10) || 'نعتذر عن الإزعاج'
    AND v_res->>'updated_by' = 'aaaaaaaa-0000-0000-0000-000000000001',
    'admin disabled the services; message trimmed, line break kept, actor recorded');
  PERFORM public.h_ok(NOT public.student_services_enabled(), 'predicate answers disabled');

  SELECT * INTO v_audit FROM public.audit_logs WHERE entity_type = 'student_services_switch';
  PERFORM public.h_ok(
    (SELECT count(*) = 1 FROM public.audit_logs WHERE entity_type = 'student_services_switch')
    AND v_audit.action_type = 'student_services_disabled'
    AND v_audit.actor_user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
    AND v_audit.actor_role = 'admin'
    AND v_audit.old_values = '{"enabled": true, "message_ar": null}'::jsonb
    AND (v_audit.new_values->>'enabled')::boolean = false
    AND v_audit.new_values->>'message_ar' LIKE 'صيانة%',
    'exactly one audit row: action, actor, role, old and new values');

  v_res := public.admin_set_student_services_enabled(false, 'صيانة حتى نهاية الأسبوع.' || chr(10) || 'نعتذر عن الإزعاج');
  PERFORM public.h_ok(NOT (v_res->>'changed')::boolean
    AND (SELECT count(*) = 1 FROM public.audit_logs WHERE entity_type = 'student_services_switch'),
    'repeating the same state is a no-op and is not audited twice');

  v_res := public.admin_set_student_services_enabled(false, 'الخدمة متوقفة للصيانة.');
  PERFORM public.h_ok((v_res->>'changed')::boolean AND (SELECT count(*) = 1 FROM public.audit_logs
      WHERE entity_type = 'student_services_switch' AND action_type = 'student_services_message_updated'),
    'changing only the notice is audited as student_services_message_updated');

  PERFORM public.h_ok((public.admin_get_student_services_switch() - 'updated_at')
      = '{"enabled": false, "message_ar": "الخدمة متوقفة للصيانة.", "updated_by": "aaaaaaaa-0000-0000-0000-000000000001", "row_missing": false}'::jsonb,
    'admin view returns state, notice and who changed it');

  PERFORM public.h_login('11111111-1111-1111-1111-000000000010');
  PERFORM public.h_ok((public.get_student_services_status() - 'updated_at')
      = '{"enabled": false, "message_ar": "الخدمة متوقفة للصيانة."}'::jsonb,
    'student reads: disabled + the admin notice, and never who changed it');
END $$;

-- ---------------------------------------------------------------------------
-- 5. DISABLED: every student start / submit path is refused, nothing written
-- ---------------------------------------------------------------------------
SELECT public.h_login(:'student');

SELECT public.h_refused('legacy start: create_student_request',
  $q$SELECT public.create_student_request('enrollment_certificate', 'جديد', '{}'::jsonb, NULL)$q$,
  'STUDENT_SERVICES_TEMPORARILY_DISABLED');
SELECT public.h_refused('legacy submit of a draft created earlier: submit_student_request',
  format('SELECT public.submit_student_request(%L)', :'legacy_draft'),
  'STUDENT_SERVICES_TEMPORARILY_DISABLED');
SELECT public.h_login(:'student3');
SELECT public.h_refused('P1 atomic: submit_student_request_with_details',
  $q$SELECT public.submit_student_request_with_details('replacement_student_card', 'بطاقة',
       '{"loss_reason":"فقدان","loss_declaration_ack":true}'::jsonb)$q$,
  'STUDENT_SERVICES_TEMPORARILY_DISABLED');
SELECT public.h_login(:'student');
SELECT public.h_refused('B1 start: new draft row (create_b1_request_draft_for_student write)',
  format($q$INSERT INTO public.student_requests (student_profile_id, request_type, title, status)
            VALUES (%L, 'excused_absence', 'غياب', 'draft')$q$, :'profile'),
  'STUDENT_SERVICES_TEMPORARILY_DISABLED');
SELECT public.h_refused('B1 submit of a draft created earlier: submit_b1_student_request_atomic(_core)',
  format($q$SELECT public.submit_b1_student_request_atomic_core(%L, 'excused_absence', '{}'::jsonb,
            (SELECT updated_at FROM public.student_requests WHERE id = %L))$q$, :'b1_draft', :'b1_draft'),
  'STUDENT_SERVICES_TEMPORARILY_DISABLED');
SELECT public.h_refused('direct table INSERT already submitted (legacy client path)',
  format($q$INSERT INTO public.student_requests (student_profile_id, request_type, title, status)
            VALUES (%L, 'enrollment_certificate', 'مباشر', 'submitted')$q$, :'profile'),
  'STUDENT_SERVICES_TEMPORARILY_DISABLED');
SELECT public.h_refused('direct table UPDATE draft -> submitted',
  format($q$UPDATE public.student_requests SET status = 'submitted' WHERE id = %L$q$, :'legacy_draft'),
  'STUDENT_SERVICES_TEMPORARILY_DISABLED');
SELECT public.h_refused('direct table UPDATE draft -> under_review (any non-draft status)',
  format($q$UPDATE public.student_requests SET status = 'under_review' WHERE id = %L$q$, :'legacy_draft'),
  'STUDENT_SERVICES_TEMPORARILY_DISABLED');
SELECT public.h_refused('direct table UPDATE draft -> returned (cannot launder a draft into a resubmission)',
  format($q$UPDATE public.student_requests SET status = 'returned' WHERE id = %L$q$, :'legacy_draft'),
  'STUDENT_SERVICES_TEMPORARILY_DISABLED');

SELECT public.h_ok((SELECT bool_and(status = 'draft') FROM public.student_requests
                    WHERE id IN (:'legacy_draft', :'b1_draft')),
  'both earlier drafts are still drafts');
SELECT public.h_ok((SELECT count(*) = 0 FROM public.student_request_workflow_steps
                    WHERE student_request_id IN (:'legacy_draft', :'b1_draft')),
  'no runtime step was created for a refused submit');

-- ---------------------------------------------------------------------------
-- 6. DISABLED: what must keep working
-- ---------------------------------------------------------------------------
-- 6a. the student still manages what already exists
UPDATE public.student_requests SET title = 'مسودة سابقة (معدلة)' WHERE id = :'legacy_draft';
UPDATE public.student_requests SET status = 'cancelled' WHERE id = :'cancel_draft';
SELECT public.h_ok((SELECT title = 'مسودة سابقة (معدلة)' FROM public.student_requests WHERE id = :'legacy_draft')
  AND (SELECT status = 'cancelled' FROM public.student_requests WHERE id = :'cancel_draft'),
  'DISABLED: student may still edit and cancel an own draft');
SELECT public.h_ok((SELECT count(*) >= 7 FROM public.student_requests r
                    JOIN public.student_profiles sp ON sp.id = r.student_profile_id
                    WHERE sp.user_id = :'student'),
  'DISABLED: existing requests stay readable');

-- 6b. resubmitting a request staff returned is NOT a new service
SELECT public.submit_student_request(:'legacy_returned') AS r1 \gset
SELECT public.submit_b1_student_request_atomic_core(:'b1_returned', 'excused_absence', '{}'::jsonb,
  (SELECT updated_at FROM public.student_requests WHERE id = :'b1_returned')) AS r2 \gset
SELECT public.h_ok((SELECT bool_and(status = 'submitted') FROM public.student_requests
                    WHERE id IN (:'legacy_returned', :'b1_returned')),
  'DISABLED: returned legacy and returned B1 requests can still be resubmitted');

-- 6c. staff keep processing in-flight requests
-- (88888888-…-09 is the in-flight excused_absence request of the P1-08 chain)
SELECT public.h_login(:'specialist');
SELECT public.act_on_b1_student_request_step_atomic(
  (SELECT id FROM public.student_request_workflow_steps
   WHERE student_request_id = '88888888-8888-8888-8888-000000000009' AND step_key = 'student_affairs_intake'),
  'review', 'تمت المراجعة', '{}'::jsonb) ->> 'success' AS staff_ok \gset
SELECT public.h_ok(:'staff_ok' = 'true'
  AND (SELECT status = 'completed' FROM public.student_request_workflow_steps
       WHERE student_request_id = '88888888-8888-8888-8888-000000000009' AND step_key = 'student_affairs_intake'),
  'DISABLED: assigned staff still acts on an in-flight request');

-- 6d. staff / system writes on the request table are never treated as student writes
SELECT public.h_login(:'admin');
INSERT INTO public.student_requests (student_profile_id, request_type, title, status)
VALUES (:'profile', 'enrollment_certificate', 'أنشأه موظف', 'draft') RETURNING id AS staff_made \gset
UPDATE public.student_requests SET status = 'under_review' WHERE id = :'legacy_ok';
UPDATE public.student_requests SET status = 'submitted' WHERE id = :'staff_made';
SELECT public.h_login(NULL);
INSERT INTO public.student_requests (student_profile_id, request_type, title, status)
VALUES (:'profile', 'enrollment_certificate', 'أنشأه النظام', 'submitted') RETURNING id AS system_made \gset
SELECT public.h_ok((SELECT status = 'under_review' FROM public.student_requests WHERE id = :'legacy_ok')
  AND (SELECT bool_and(status = 'submitted') FROM public.student_requests WHERE id IN (:'staff_made', :'system_made')),
  'DISABLED: staff inserts / draft->submitted / status changes and service-role inserts are not blocked');

-- 6e. the single row can be neither deleted nor truncated
DO $$
BEGIN
  BEGIN
    DELETE FROM public.student_services_switch;
    RAISE EXCEPTION 'CASE_FAIL: switch row deleted';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: DELETE of the switch row refused';
  END;
  BEGIN
    TRUNCATE public.student_services_switch;
    RAISE EXCEPTION 'CASE_FAIL: switch table truncated';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: TRUNCATE of the switch table refused';
  END;
END $$;

-- ---------------------------------------------------------------------------
-- 7. system_admin re-enables — audited; the refused paths work again
-- ---------------------------------------------------------------------------
SELECT public.h_login(:'sysadmin');
SELECT (public.admin_set_student_services_enabled(true, NULL) ->> 'changed') AS reenabled \gset
SELECT public.h_ok(:'reenabled' = 'true' AND public.student_services_enabled()
  AND (SELECT count(*) = 1 FROM public.audit_logs WHERE entity_type = 'student_services_switch'
       AND action_type = 'student_services_enabled'
       AND actor_user_id = :'sysadmin' AND actor_role = 'system_admin'
       AND (old_values->>'enabled')::boolean = false AND (new_values->>'enabled')::boolean = true)
  AND (SELECT count(*) = 3 FROM public.audit_logs WHERE entity_type = 'student_services_switch'),
  'system_admin re-enabled; audited with actor and old/new state (3 audit rows in total)');

SELECT public.h_login(:'student');
SELECT public.h_ok((public.get_student_services_status() - 'updated_at')
    = '{"enabled": true, "message_ar": null}'::jsonb,
  'student reads: enabled again, notice withdrawn');
SELECT public.submit_student_request(:'legacy_draft') AS e1 \gset
SELECT public.submit_b1_student_request_atomic_core(:'b1_draft', 'excused_absence', '{}'::jsonb,
  (SELECT updated_at FROM public.student_requests WHERE id = :'b1_draft')) AS e2 \gset
SELECT public.create_student_request('enrollment_certificate', 'بعد إعادة التفعيل', '{}'::jsonb, NULL) AS e3 \gset
SELECT public.h_ok((SELECT bool_and(status = 'submitted') FROM public.student_requests
                    WHERE id IN (:'legacy_draft', :'b1_draft'))
  AND (SELECT status = 'draft' FROM public.student_requests WHERE id = :'e3'),
  'RE-ENABLED: the two earlier drafts submit and a new request can be started');

-- ---------------------------------------------------------------------------
-- 8. Missing row = fail closed, and an admin can always restore service
--    (the row guards are bypassed here as the cluster superuser on purpose)
-- ---------------------------------------------------------------------------
SELECT public.h_login(NULL);
ALTER TABLE public.student_services_switch DISABLE TRIGGER trg_student_services_switch_row_keep;
DELETE FROM public.student_services_switch;
ALTER TABLE public.student_services_switch ENABLE TRIGGER trg_student_services_switch_row_keep;

SELECT public.h_ok(NOT public.student_services_enabled(), 'row missing -> predicate answers disabled');
SELECT public.h_login(:'student');
SELECT public.h_ok((public.get_student_services_status() ->> 'enabled') = 'false',
  'row missing -> students are told the services are paused');
SELECT public.h_refused('row missing -> student start refused (fail closed)',
  $q$SELECT public.create_student_request('enrollment_certificate', 'بلا صف', '{}'::jsonb, NULL)$q$,
  'STUDENT_SERVICES_TEMPORARILY_DISABLED');
SELECT public.h_login(:'admin');
SELECT public.h_ok((public.admin_get_student_services_switch() ->> 'row_missing') = 'true',
  'row missing -> the admin view says so');
SELECT (public.admin_set_student_services_enabled(true, NULL) ->> 'changed') AS restored \gset
SELECT public.h_ok(:'restored' = 'true' AND public.student_services_enabled()
  AND (SELECT count(*) = 1 FROM public.student_services_switch),
  'row missing -> admin_set_student_services_enabled recreates it (no permanent outage)');

SELECT public.h_login(NULL);
SELECT 'STUDENT_SERVICES_GLOBAL_SWITCH_01_CASES_PASS' AS result;
