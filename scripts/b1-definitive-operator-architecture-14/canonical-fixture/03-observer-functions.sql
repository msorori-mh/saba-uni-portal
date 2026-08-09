-- ============================================================================
-- PORTAL-B1-PR310 Definitive Operator Architecture — LONGRUN-14
-- canonical-fixture/03-observer-functions.sql
--
-- Ephemeral, read-only SECURITY DEFINER observer functions for test harnesses.
-- ============================================================================
\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION public.b1_observer_auth_uid()
RETURNS uuid
LANGUAGE sql STABLE
SET search_path TO public
SECURITY DEFINER
AS $$
  SELECT auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.b1_observer_auth_role()
RETURNS text
LANGUAGE sql STABLE
SET search_path TO public
SECURITY DEFINER
AS $$
  SELECT auth.role();
$$;

CREATE OR REPLACE FUNCTION public.b1_observer_allowed_request_numbers()
RETURNS text[]
LANGUAGE sql IMMUTABLE
SET search_path TO public
AS $$
  SELECT ARRAY[
    'SR-20260727-42393846','SR-20260727-50BEDCE2','SR-20260727-3C550070',
    'SR-20260727-88D885F0','SR-20260727-695EC35B',
    'SR-20260801-13000001','SR-20260801-13000002','SR-20260801-13000003',
    'SR-20260801-13000004','SR-20260801-13000005','SR-20260801-13000006',
    'SR-20260801-13000007','SR-20260801-13000008','SR-20260801-13000009',
    'SR-20260801-13000010','SR-20260801-13000011','SR-20260801-13000012',
    'SR-20260801-13000013','SR-20260801-13000014','SR-20260801-13000015',
    'SR-20260801-13000016','SR-20260801-13000017','SR-20260801-13000018',
    'SR-20260801-13000019',
    'SR-20260801-EC000001','SR-20260801-EC000002','SR-20260801-EC000003',
    'SR-20260801-EC000004'
  ];
$$;

CREATE OR REPLACE FUNCTION public.b1_observer_fixture_state()
RETURNS TABLE(
  total_requests bigint,
  fixture_requests bigint,
  sentinel_requests bigint,
  total_steps bigint,
  active_steps bigint
)
LANGUAGE sql STABLE
SET search_path TO public
SECURITY DEFINER
AS $$
  WITH allowed AS (
    SELECT id FROM public.student_requests
     WHERE request_number = ANY (public.b1_observer_allowed_request_numbers())
  )
  SELECT
    (SELECT count(*) FROM allowed),
    (SELECT count(*) FROM public.student_requests
      WHERE request_number LIKE 'SR-20260801-13%'
        AND request_number = ANY (public.b1_observer_allowed_request_numbers())),
    (SELECT count(*) FROM public.student_requests
      WHERE request_number LIKE 'SR-20260727-%'
        AND request_number = ANY (public.b1_observer_allowed_request_numbers())),
    (SELECT count(*) FROM public.student_request_workflow_steps
      WHERE student_request_id IN (SELECT id FROM allowed)),
    (SELECT count(*) FROM public.student_request_workflow_steps
      WHERE student_request_id IN (SELECT id FROM allowed) AND status = 'active');
$$;

CREATE OR REPLACE FUNCTION public.b1_observer_request_id_by_number(p_request_number text)
RETURNS uuid
LANGUAGE plpgsql STABLE
SET search_path TO public
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_request_number IS NULL OR NOT (p_request_number = ANY (public.b1_observer_allowed_request_numbers())) THEN
    RAISE EXCEPTION 'HOLD_OBSERVATION_SCOPE_VIOLATION: request number % not in observer allowlist', p_request_number;
  END IF;
  SELECT id INTO v_id FROM public.student_requests WHERE request_number = p_request_number;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.b1_observer_is_allowed_request(p_request_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path TO public
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_requests r
     WHERE r.id = p_request_id
       AND r.request_number = ANY (public.b1_observer_allowed_request_numbers())
  );
$$;

CREATE OR REPLACE FUNCTION public.b1_observer_is_allowed_step(p_step_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path TO public
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.student_request_workflow_steps s
      JOIN public.student_requests r ON r.id = s.student_request_id
     WHERE s.id = p_step_id
       AND r.request_number = ANY (public.b1_observer_allowed_request_numbers())
  );
$$;

CREATE OR REPLACE FUNCTION public.b1_observer_fingerprint()
RETURNS text
LANGUAGE sql STABLE
SET search_path TO public
SECURITY DEFINER
AS $$
  WITH allowed AS (
    SELECT id FROM public.student_requests
     WHERE request_number = ANY (public.b1_observer_allowed_request_numbers())
  ),
  profile_ids AS (
    SELECT DISTINCT student_profile_id AS id FROM public.student_requests
     WHERE id IN (SELECT id FROM allowed)
  )
  SELECT md5(string_agg(rel || '=' || h, '|' ORDER BY rel))
  FROM (
    SELECT 'student_requests' AS rel,
           count(*)::text || ':' || coalesce(md5(string_agg(id::text || ':' || request_type || ':' || status, '|' ORDER BY id)), '-') AS h
      FROM (SELECT id, request_type, status FROM public.student_requests WHERE id IN (SELECT id FROM allowed)) t
    UNION ALL
    SELECT 'student_request_workflow_steps',
           count(*)::text || ':' || coalesce(md5(string_agg(
             id::text || ':' || student_request_id::text || ':' || step_key || ':' || status || ':' ||
             coalesce(assigned_staff_profile_id::text,'-') || ':' ||
             coalesce(assigned_faculty_profile_id::text,'-') || ':' ||
             coalesce(assigned_position_assignment_id::text,'-') || ':' ||
             processing_unit_id::text || ':' || processing_role_id::text || ':' || workflow_step_id::text,
             '|' ORDER BY id)), '-') AS h
      FROM public.student_request_workflow_steps
     WHERE student_request_id IN (SELECT id FROM allowed)
    UNION ALL
    SELECT 'student_request_workflow_events',
           count(*)::text || ':' || coalesce(md5(string_agg(id::text || ':' || student_request_id::text || ':' || event_type, '|' ORDER BY id)), '-') AS h
      FROM public.student_request_workflow_events
     WHERE student_request_id IN (SELECT id FROM allowed)
    UNION ALL
    SELECT 'request_processing_assignments',
           count(*)::text || ':' || coalesce(md5(string_agg(
             id::text || ':' || is_active::text || ':' || assignment_type || ':' ||
             unit_id::text || ':' || role_id::text || ':' ||
             coalesce(user_id::text,'-') || ':' ||
             coalesce(staff_profile_id::text,'-') || ':' ||
             coalesce(faculty_profile_id::text,'-') || ':' ||
             coalesce(position_assignment_id::text,'-') || ':' ||
             coalesce(department_id::text,'-'),
             '|' ORDER BY id)), '-') AS h
      FROM public.request_processing_assignments
    UNION ALL
    SELECT 'student_request_attachment_uploads',
           count(*)::text || ':' || coalesce(md5(string_agg(id::text || ':' || student_request_id::text, '|' ORDER BY id)), '-') AS h
      FROM public.student_request_attachment_uploads
     WHERE student_request_id IN (SELECT id FROM allowed)
    UNION ALL
    SELECT 'student_request_attachments',
           count(*)::text || ':' || coalesce(md5(string_agg(id::text || ':' || request_id::text, '|' ORDER BY id)), '-') AS h
      FROM public.student_request_attachments
     WHERE request_id IN (SELECT id FROM allowed)
    UNION ALL
    SELECT 'student_request_fee_assessments',
           count(*)::text || ':' || coalesce(md5(string_agg(id::text || ':' || request_id::text || ':' || payment_status, '|' ORDER BY id)), '-') AS h
      FROM public.student_request_fee_assessments
     WHERE request_id IN (SELECT id FROM allowed)
    UNION ALL
    SELECT 'payment_receipts',
           count(*)::text || ':' || coalesce(md5(string_agg(id::text || ':' || student_profile_id::text, '|' ORDER BY id)), '-') AS h
      FROM public.payment_receipts
     WHERE student_profile_id IN (SELECT id FROM profile_ids)
    UNION ALL
    SELECT 'official_documents',
           count(*)::text || ':' || coalesce(md5(string_agg(id::text || ':' || student_request_id::text || ':' || status, '|' ORDER BY id)), '-') AS h
      FROM public.official_documents
     WHERE student_request_id IN (SELECT id FROM allowed)
    UNION ALL
    SELECT 'enrollment_certificate_document_details',
           count(*)::text || ':' || coalesce(md5(string_agg(id::text || ':' || student_request_id::text || ':' || enrollment_status, '|' ORDER BY id)), '-') AS h
      FROM public.enrollment_certificate_document_details
     WHERE student_request_id IN (SELECT id FROM allowed)
    UNION ALL
    SELECT 'transfer_request_details',
           count(*)::text || ':' || coalesce(md5(string_agg(
             id::text || ':' || request_id::text || ':' ||
             coalesce(current_department_id::text,'-') || ':' ||
             coalesce(requested_department_id::text,'-'),
             '|' ORDER BY id)), '-') AS h
      FROM public.transfer_request_details
     WHERE request_id IN (SELECT id FROM allowed)
    UNION ALL
    SELECT 'enrollment_suspension_details',
           count(*)::text || ':' || coalesce(md5(string_agg(id::text || ':' || request_id::text, '|' ORDER BY id)), '-') AS h
      FROM public.enrollment_suspension_details
     WHERE request_id IN (SELECT id FROM allowed)
    UNION ALL
    SELECT 'absence_excuse_details',
           count(*)::text || ':' || coalesce(md5(string_agg(id::text || ':' || request_id::text, '|' ORDER BY id)), '-') AS h
      FROM public.absence_excuse_details
     WHERE request_id IN (SELECT id FROM allowed)
    UNION ALL
    SELECT 'extra_chance_details',
           count(*)::text || ':' || coalesce(md5(string_agg(id::text || ':' || request_id::text, '|' ORDER BY id)), '-') AS h
      FROM public.extra_chance_details
     WHERE request_id IN (SELECT id FROM allowed)
    UNION ALL
    SELECT 'file_withdrawal_details',
           count(*)::text || ':' || coalesce(md5(string_agg(
             request_id::text || ':' ||
             coalesce(library_cleared_at::text,'-') || ':' ||
             coalesce(labs_cleared_at::text,'-') || ':' ||
             coalesce(activities_cleared_at::text,'-') || ':' ||
             coalesce(finance_cleared_at::text,'-') || ':' ||
             coalesce(records_transferred_at::text,'-'),
             '|' ORDER BY request_id)), '-') AS h
      FROM public.file_withdrawal_details
     WHERE request_id IN (SELECT id FROM allowed)
    UNION ALL
    SELECT 'student_excused_absences',
           count(*)::text || ':' || coalesce(md5(string_agg(id::text || ':' || absence_excuse_request_id::text, '|' ORDER BY id)), '-') AS h
      FROM public.student_excused_absences
     WHERE absence_excuse_request_id IN (SELECT id FROM allowed)
    UNION ALL
    SELECT 'student_extra_chances',
           count(*)::text || ':' || coalesce(md5(string_agg(id::text || ':' || request_id::text, '|' ORDER BY id)), '-') AS h
      FROM public.student_extra_chances
     WHERE request_id IN (SELECT id FROM allowed)
    UNION ALL
    SELECT 'student_profiles',
           count(*)::text || ':' || coalesce(md5(string_agg(
             id::text || ':' || status || ':' ||
             coalesce(department_id::text,'-') || ':' ||
             coalesce(program_id::text,'-'),
             '|' ORDER BY id)), '-') AS h
      FROM public.student_profiles
     WHERE id IN (SELECT id FROM profile_ids)
    UNION ALL
    SELECT 'student_academic_status',
           count(*)::text || ':' || coalesce(md5(string_agg(id::text || ':' || student_profile_id::text || ':' || enrollment_status, '|' ORDER BY id)), '-') AS h
      FROM public.student_academic_status
     WHERE student_profile_id IN (SELECT id FROM profile_ids)
    UNION ALL
    SELECT 'student_enrollments',
           count(*)::text || ':' || coalesce(md5(string_agg(id::text || ':' || student_profile_id::text || ':' || enrollment_status, '|' ORDER BY id)), '-') AS h
      FROM public.student_enrollments
     WHERE student_profile_id IN (SELECT id FROM profile_ids)
    UNION ALL
    SELECT 'notifications',
           count(*)::text || ':' || coalesce(md5(string_agg(id::text || ':' || reference_id::text || ':' || is_read::text, '|' ORDER BY id)), '-') AS h
      FROM public.notifications
     WHERE reference_type = 'student_request' AND reference_id::uuid IN (SELECT id FROM allowed)
    UNION ALL
    SELECT 'audit_logs',
           count(*)::text || ':' || coalesce(md5(string_agg(id::text || ':' || entity_id::text || ':' || action_type, '|' ORDER BY id)), '-') AS h
      FROM public.audit_logs
     WHERE entity_type = 'student_requests' AND entity_id::uuid IN (SELECT id FROM allowed)
    UNION ALL
    SELECT 'request_types',
           count(*)::text || ':' || coalesce(md5(string_agg(code || ':' || student_visible::text || ':' || is_active::text, '|' ORDER BY code)), '-') AS h
      FROM public.request_types
     WHERE code IN ('enrollment_suspension','excused_absence','department_transfer','final_chance','file_withdrawal','enrollment_certificate')
  ) s;
$$;

CREATE OR REPLACE FUNCTION public.b1_observer_request_state(p_request_id uuid)
RETURNS TABLE(
  request_type text,
  status text,
  active_step_count bigint,
  total_step_count bigint,
  fee_assessment_count bigint
)
LANGUAGE sql STABLE
SET search_path TO public
SECURITY DEFINER
AS $$
  SELECT r.request_type, r.status,
         (SELECT count(*) FROM public.student_request_workflow_steps s
           WHERE s.student_request_id = p_request_id AND s.status = 'active'),
         (SELECT count(*) FROM public.student_request_workflow_steps s
           WHERE s.student_request_id = p_request_id),
         (SELECT count(*) FROM public.student_request_fee_assessments f
           WHERE f.request_id = p_request_id)
  FROM public.student_requests r
  WHERE r.id = p_request_id
    AND public.b1_observer_is_allowed_request(p_request_id);
$$;

CREATE OR REPLACE FUNCTION public.b1_observer_step_state(p_step_id uuid)
RETURNS TABLE(
  step_key text,
  step_order int,
  status text,
  assigned_user_id uuid,
  assigned_staff_profile_id uuid,
  assigned_faculty_profile_id uuid,
  assigned_position_assignment_id uuid
)
LANGUAGE sql STABLE
SET search_path TO public
SECURITY DEFINER
AS $$
  SELECT s.step_key, s.step_order, s.status,
         s.assigned_user_id, s.assigned_staff_profile_id,
         s.assigned_faculty_profile_id, s.assigned_position_assignment_id
  FROM public.student_request_workflow_steps s
  WHERE s.id = p_step_id
    AND public.b1_observer_is_allowed_step(p_step_id);
$$;

CREATE OR REPLACE FUNCTION public.b1_observer_step_assignee_count(p_step_id uuid)
RETURNS int
LANGUAGE sql STABLE
SET search_path TO public
SECURITY DEFINER
AS $$
  SELECT (
    CASE WHEN s.assigned_staff_profile_id IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN s.assigned_faculty_profile_id IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN s.assigned_position_assignment_id IS NOT NULL THEN 1 ELSE 0 END
  )::int
  FROM public.student_request_workflow_steps s
  WHERE s.id = p_step_id
    AND public.b1_observer_is_allowed_step(p_step_id);
$$;

CREATE OR REPLACE FUNCTION public.b1_observer_step_processing(p_step_id uuid)
RETURNS TABLE(
  processing_unit_code text,
  processing_role_code text,
  action_type text
)
LANGUAGE sql STABLE
SET search_path TO public
SECURITY DEFINER
AS $$
  SELECT u.code, ro.code, c.action_type
  FROM public.student_request_workflow_steps s
  JOIN public.request_processing_units u ON u.id = s.processing_unit_id
  JOIN public.request_processing_roles ro ON ro.id = s.processing_role_id
  JOIN public.request_type_workflow_steps c ON c.id = s.workflow_step_id
  WHERE s.id = p_step_id
    AND public.b1_observer_is_allowed_step(p_step_id);
$$;

CREATE OR REPLACE FUNCTION public.b1_observer_step_direct_assignee_user_id(p_step_id uuid)
RETURNS uuid
LANGUAGE sql STABLE
SET search_path TO public
SECURITY DEFINER
AS $$
  SELECT coalesce(
    (SELECT sp.user_id FROM public.student_request_workflow_steps s
      JOIN public.staff_profiles sp ON sp.id = s.assigned_staff_profile_id
     WHERE s.id = p_step_id AND public.b1_observer_is_allowed_step(p_step_id)),
    (SELECT fp.user_id FROM public.student_request_workflow_steps s
      JOIN public.faculty_profiles fp ON fp.id = s.assigned_faculty_profile_id
     WHERE s.id = p_step_id AND public.b1_observer_is_allowed_step(p_step_id)),
    (SELECT pa.user_id FROM public.student_request_workflow_steps s
      JOIN public.position_assignments pa ON pa.id = s.assigned_position_assignment_id
     WHERE s.id = p_step_id AND public.b1_observer_is_allowed_step(p_step_id)
       AND pa.is_active = true
       AND (pa.assigned_to IS NULL OR pa.assigned_to >= CURRENT_DATE))
  );
$$;

CREATE OR REPLACE FUNCTION public.b1_observer_step_active_binding_count(p_step_id uuid)
RETURNS int
LANGUAGE sql STABLE
SET search_path TO public
SECURITY DEFINER
AS $$
  SELECT count(*)::int
    FROM public.student_request_workflow_steps s
    JOIN public.request_processing_assignments a
      ON a.unit_id = s.processing_unit_id
     AND a.role_id = s.processing_role_id
   WHERE s.id = p_step_id
     AND public.b1_observer_is_allowed_step(p_step_id)
     AND a.is_active = true
     AND (a.starts_at IS NULL OR a.starts_at <= now())
     AND (a.ends_at IS NULL OR a.ends_at > now());
$$;

CREATE OR REPLACE FUNCTION public.b1_observer_transfer_scope(p_request_id uuid)
RETURNS TABLE(
  scope_count bigint,
  current_department_id uuid,
  requested_department_id uuid
)
LANGUAGE sql STABLE
SET search_path TO public
SECURITY DEFINER
AS $$
  SELECT count(*)::bigint,
         (SELECT d2.current_department_id FROM public.transfer_request_details d2
           WHERE d2.request_id = p_request_id ORDER BY d2.id LIMIT 1),
         (SELECT d2.requested_department_id FROM public.transfer_request_details d2
           WHERE d2.request_id = p_request_id ORDER BY d2.id LIMIT 1)
  FROM public.transfer_request_details d
  WHERE d.request_id = p_request_id
    AND public.b1_observer_is_allowed_request(p_request_id);
$$;

CREATE OR REPLACE FUNCTION public.b1_observer_predecessors(p_step_id uuid)
RETURNS TABLE(
  total_predecessors bigint,
  incomplete_predecessors bigint,
  predecessor_statuses text
)
LANGUAGE sql STABLE
SET search_path TO public
SECURITY DEFINER
AS $$
  WITH step AS (
    SELECT student_request_id, step_order
      FROM public.student_request_workflow_steps
     WHERE id = p_step_id AND public.b1_observer_is_allowed_step(p_step_id)
  ),
  preds AS (
    SELECT status FROM public.student_request_workflow_steps
     WHERE student_request_id = (SELECT student_request_id FROM step)
       AND step_order < (SELECT step_order FROM step)
  )
  SELECT count(*)::bigint,
         count(*) FILTER (WHERE status NOT IN ('completed','skipped'))::bigint,
         coalesce(string_agg(status, ',' ORDER BY status), '')
  FROM preds;
$$;

REVOKE ALL ON FUNCTION public.b1_observer_auth_uid() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.b1_observer_auth_role() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.b1_observer_fixture_state() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.b1_observer_allowed_request_numbers() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.b1_observer_request_id_by_number(text) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.b1_observer_is_allowed_request(uuid) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.b1_observer_is_allowed_step(uuid) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.b1_observer_fingerprint() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.b1_observer_request_state(uuid) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.b1_observer_step_state(uuid) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.b1_observer_step_assignee_count(uuid) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.b1_observer_step_processing(uuid) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.b1_observer_step_direct_assignee_user_id(uuid) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.b1_observer_step_active_binding_count(uuid) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.b1_observer_transfer_scope(uuid) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.b1_observer_predecessors(uuid) FROM PUBLIC, anon, authenticated, service_role;
