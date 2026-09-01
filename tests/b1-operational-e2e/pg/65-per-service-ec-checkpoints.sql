-- After lifecycle: assert enrollment_certificate regression for each completed service.
-- TEST_ONLY_B1_FIVE_SERVICES_OPERATIONAL_E2E

DO $$
DECLARE
  svc text;
  src text;
  ok boolean;
BEGIN
  FOREACH svc IN ARRAY ARRAY[
    'enrollment_suspension',
    'excused_absence',
    'department_transfer',
    'final_chance',
    'file_withdrawal'
  ]
  LOOP
    ok := EXISTS (
      SELECT 1 FROM b1_e2e.results
      WHERE case_id = svc || '/final' AND status = 'PASS'
    );

    PERFORM b1_e2e.note(
      'ec_after/' || svc || '/service_final_pass',
      'regression',
      ok,
      'service lifecycle final must PASS before EC gate'
    );

    -- no public payment/fee gateway surfaces introduced for the five services
    PERFORM b1_e2e.note(
      'ec_after/' || svc || '/no_payment_gateway_surface',
      'regression',
      to_regprocedure('public.charge_student_request(uuid)') IS NULL
        AND to_regprocedure('public.process_card_payment(uuid,numeric)') IS NULL,
      'no in-portal payment gateway RPCs'
    );

    -- no active enrollment_certificate workflow introduced
    PERFORM b1_e2e.note(
      'ec_after/' || svc || '/no_ec_workflow_activation',
      'regression',
      NOT EXISTS (
        SELECT 1 FROM public.request_type_workflows w
        WHERE w.code ILIKE '%enrollment_certificate%'
          AND w.status = 'active' AND w.is_active = true
      ),
      'enrollment_certificate workflow remains inactive in local harness'
    );

    -- draft RPCs still do not write student_visible
    src := pg_get_functiondef('public.create_b1_request_draft_for_student(text,text)'::regprocedure)
      || E'\n'
      || pg_get_functiondef('public.save_b1_request_draft_for_student(uuid,jsonb,timestamptz,text)'::regprocedure);
    PERFORM b1_e2e.note(
      'ec_after/' || svc || '/no_student_visible_write',
      'regression',
      src !~* 'update[[:space:]]+.*student_visible'
        AND src !~* 'set[[:space:]]+student_visible[[:space:]]*=' ,
      'create/save draft do not assign student_visible'
    );

    -- anon execute grants not expanded for certificate
    PERFORM b1_e2e.note(
      'ec_after/' || svc || '/anon_no_ec_execute',
      'regression',
      NOT EXISTS (
        SELECT 1 FROM information_schema.routine_privileges
        WHERE routine_name ILIKE '%enrollment_certificate%'
          AND grantee = 'anon'
          AND privilege_type = 'EXECUTE'
      ),
      'anon has no enrollment_certificate EXECUTE'
    );

    -- protected request/document markers untouched in this disposable DB
    PERFORM b1_e2e.note(
      'ec_after/' || svc || '/no_protected_live_numbers',
      'regression',
      NOT EXISTS (
        SELECT 1 FROM public.student_requests
        WHERE request_number IN (
          'SR-20260716-26BAD4C8',
          'SR-20260715-FEDCB3E1',
          'SR-20260713-2DE64041',
          'USR-2026-000001',
          'USR-2026-000002'
        )
      ),
      'protected live request numbers absent from disposable DB'
    );
  END LOOP;
END $$;
