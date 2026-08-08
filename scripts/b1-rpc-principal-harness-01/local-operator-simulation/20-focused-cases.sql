-- LONGRUN-08 G13 focused live cases under SELECT-only operator.
-- psql \gset survives ROLLBACK; one BEGIN + one ROLLBACK + zero COMMIT per case.
\set ON_ERROR_STOP on

BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT public.b1_case_unauthorized_atomic() AS r \gset
ROLLBACK;
SELECT public.b1_sim_record(
  'A_unauthorized_atomic',
  split_part(:'r', '|', 1),
  substr(:'r', length(split_part(:'r', '|', 1)) + 2)
);

BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT public.b1_case_illegal_action() AS r \gset
ROLLBACK;
SELECT public.b1_sim_record(
  'B_illegal_action',
  split_part(:'r', '|', 1),
  substr(:'r', length(split_part(:'r', '|', 1)) + 2)
);

BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT public.b1_case_payment_step() AS r \gset
ROLLBACK;
SELECT public.b1_sim_record(
  'C_payment_step_uuid',
  split_part(:'r', '|', 1),
  substr(:'r', length(split_part(:'r', '|', 1)) + 2)
);

BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT public.b1_case_payment_request_uuid() AS r \gset
ROLLBACK;
SELECT public.b1_sim_record(
  'D_payment_request_uuid',
  split_part(:'r', '|', 1),
  substr(:'r', length(split_part(:'r', '|', 1)) + 2)
);

BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT public.b1_case_unknown_42501() AS r \gset
ROLLBACK;
SELECT public.b1_sim_record(
  'E_unknown_42501',
  split_part(:'r', '|', 1),
  substr(:'r', length(split_part(:'r', '|', 1)) + 2)
);

DO $$
DECLARE
  v_fp text := public.b1_sim_fp();
BEGIN
  IF EXISTS (SELECT 1 FROM public.student_request_workflow_steps WHERE status = 'completed') THEN
    RAISE EXCEPTION 'MUTATION_LEAKED_AFTER_ROLLBACK';
  END IF;
  PERFORM public.b1_sim_record('Z_outside_fingerprint', 'PASS', v_fp);
END$$;

DO $$
DECLARE
  v_super boolean;
  v_bypass boolean;
BEGIN
  SELECT rolsuper, rolbypassrls INTO v_super, v_bypass FROM pg_roles WHERE rolname = current_user;
  IF v_super OR v_bypass THEN
    RAISE EXCEPTION 'OPERATOR_PRIVILEGE_VIOLATION';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants
    WHERE grantee = current_user
      AND table_schema = 'public'
      AND table_name NOT IN ('b1_sim_results')
      AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')
  ) THEN
    RAISE EXCEPTION 'OPERATOR_HAS_TABLE_WRITE_GRANT';
  END IF;
  PERFORM public.b1_sim_record('Z_operator_select_only', 'PASS', current_user);
END$$;

SELECT case_id, verdict, detail FROM public.b1_sim_results ORDER BY case_id;
