-- 35-activate-workflows-local-only.sql
-- LOCAL HARNESS ONLY. Activates the five B1 workflow drafts inside the
-- disposable cluster so runtime cases can execute. NEVER run on production.
DO $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.request_type_workflows w
     SET status = 'active', is_active = true
   WHERE w.code IN (
     'enrollment_suspension_free_workflow',
     'excused_absence_free_workflow',
     'file_withdrawal_free_workflow',
     'department_transfer_external_payment_workflow',
     'final_chance_external_payment_workflow'
   ) AND w.status = 'draft' AND w.is_active = false;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 5 THEN
    RAISE EXCEPTION 'LOCAL_ACTIVATION_COUNT_MISMATCH:%', v_updated;
  END IF;
END $$;
