-- Emit per-service operational report rows for the mission report generator.
-- TEST_ONLY_B1_FIVE_SERVICES_OPERATIONAL_E2E

CREATE TABLE IF NOT EXISTS b1_ops_e2e.service_report (
  service_code text PRIMARY KEY,
  request_lifecycle text NOT NULL,
  roles_assignments text NOT NULL,
  positive_rpc_actions integer NOT NULL DEFAULT 0,
  negative_rpc_actions integer NOT NULL DEFAULT 0,
  zero_mutation integer NOT NULL DEFAULT 0,
  final_state text NOT NULL,
  ui_smoke text NOT NULL DEFAULT 'PENDING',
  enrollment_certificate_regression text NOT NULL,
  result text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE
  svc text;
  final_ok boolean;
  final_detail text;
  ec_fails integer;
  life_fails integer;
  pos integer;
  neg integer;
  zm integer;
  result text;
BEGIN
  SELECT value INTO pos FROM b1_e2e.counters WHERE key = 'action_allows';
  SELECT value INTO neg FROM b1_e2e.counters WHERE key = 'action_denials';
  SELECT value INTO zm FROM b1_e2e.counters WHERE key = 'zero_mutation';

  FOREACH svc IN ARRAY ARRAY[
    'enrollment_suspension',
    'excused_absence',
    'department_transfer',
    'final_chance',
    'file_withdrawal'
  ]
  LOOP
    SELECT (status = 'PASS'), coalesce(detail, '')
      INTO final_ok, final_detail
    FROM b1_e2e.results
    WHERE case_id = svc || '/final'
    ORDER BY recorded_at DESC
    LIMIT 1;

    SELECT count(*) INTO ec_fails
    FROM b1_e2e.results
    WHERE case_id LIKE 'ec_after/' || svc || '/%'
      AND status = 'FAIL';

    SELECT count(*) INTO life_fails
    FROM b1_e2e.results
    WHERE case_id LIKE svc || '/%'
      AND status = 'FAIL';

    result := CASE
      WHEN coalesce(final_ok, false) AND ec_fails = 0 AND life_fails = 0 THEN 'PASS'
      ELSE 'FAIL'
    END;

    INSERT INTO b1_ops_e2e.service_report AS t (
      service_code,
      request_lifecycle,
      roles_assignments,
      positive_rpc_actions,
      negative_rpc_actions,
      zero_mutation,
      final_state,
      ui_smoke,
      enrollment_certificate_regression,
      result
    ) VALUES (
      svc,
      CASE WHEN coalesce(final_ok, false) THEN 'draft→save→submit→staff walk→terminal' ELSE 'INCOMPLETE' END,
      CASE svc
        WHEN 'enrollment_suspension' THEN 'sa_specialist→sa_manager→registrar (direct assignment only)'
        WHEN 'excused_absence' THEN 'sa_specialist→sa_manager→sa_specialist apply'
        WHEN 'department_transfer' THEN 'sa→source_chair→target_chair→finance→dean→registrar'
        WHEN 'final_chance' THEN 'sa→manager→finance→dean→registrar'
        WHEN 'file_withdrawal' THEN 'sa→library→labs→activities→finance→registrar→archive'
      END,
      coalesce(pos, 0),
      coalesce(neg, 0),
      coalesce(zm, 0),
      coalesce(final_detail, 'missing'),
      'PENDING',
      CASE WHEN ec_fails = 0 THEN 'NONE' ELSE 'REGRESSION_' || ec_fails END,
      result
    )
    ON CONFLICT (service_code) DO UPDATE SET
      request_lifecycle = EXCLUDED.request_lifecycle,
      roles_assignments = EXCLUDED.roles_assignments,
      positive_rpc_actions = EXCLUDED.positive_rpc_actions,
      negative_rpc_actions = EXCLUDED.negative_rpc_actions,
      zero_mutation = EXCLUDED.zero_mutation,
      final_state = EXCLUDED.final_state,
      enrollment_certificate_regression = EXCLUDED.enrollment_certificate_regression,
      result = EXCLUDED.result,
      recorded_at = now();
  END LOOP;
END $$;

SELECT service_code, result, final_state, enrollment_certificate_regression
FROM b1_ops_e2e.service_report
ORDER BY service_code;
