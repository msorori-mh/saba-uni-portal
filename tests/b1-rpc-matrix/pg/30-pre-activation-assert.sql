-- 30-pre-activation-assert.sql
-- Gate per recon harness design: before any LOCAL activation, every B1 stored
-- request type must resolve ZERO active workflows; the strict initializer must
-- fail closed with B1_ACTIVE_WORKFLOW_MUST_RESOLVE_ONCE:0.

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.request_type_workflows w
  JOIN public.request_types rt ON rt.id = w.request_type_id
  WHERE rt.code IN ('enrollment_suspension','absence_excuse','transfer','extra_chance','file_withdrawal')
    AND w.status = 'active' AND w.is_active = true;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'PRE_ACTIVATION_ACTIVE_WORKFLOW_LEAK:%', v_count;
  END IF;
END $$;

-- Probe request so the initializer reaches the workflow-resolution guard.
INSERT INTO public.student_requests(id, request_number, student_profile_id, request_type, status)
VALUES ('dddddddd-0000-4000-8000-00000000000a','H-PROBE-01',
        '33333333-3333-4333-8333-333333333301','enrollment_suspension','draft')
ON CONFLICT (id) DO NOTHING;

-- Evidence case H-01: initializer fails closed pre-activation.
SELECT e_rpcmatrix.exec_case(
  'H-01', 'pre-activation-init',
  'P0001',
  '11111111-1111-4111-8111-111111111101',
  $$SELECT public.initialize_b1_request_workflow_strict('dddddddd-0000-4000-8000-00000000000a'::uuid, 'enrollment_suspension')$$,
  'B1_ACTIVE_WORKFLOW_MUST_RESOLVE_ONCE:0'
);
