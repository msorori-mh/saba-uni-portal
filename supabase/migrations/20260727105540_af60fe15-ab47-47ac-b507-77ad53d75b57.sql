GRANT SELECT ON public.student_request_attachment_uploads TO authenticated;

CREATE OR REPLACE FUNCTION public.record_b1_file_withdrawal_clearance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_step_key text;
  v_canonical text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;
  IF NEW.decision IS DISTINCT FROM 'cleared' THEN
    RETURN NEW;
  END IF;

  SELECT public.b1_stored_to_canonical(r.request_type)
    INTO v_canonical
  FROM public.student_requests r
  WHERE r.id = NEW.student_request_id;

  IF v_canonical IS DISTINCT FROM 'file_withdrawal' THEN
    RETURN NEW;
  END IF;

  SELECT c.step_key INTO v_step_key
  FROM public.request_type_workflow_steps c
  WHERE c.id = NEW.workflow_step_id;

  UPDATE public.file_withdrawal_details d
     SET library_cleared_at    = CASE WHEN v_step_key = 'library_clearance'    THEN COALESCE(d.library_cleared_at, now())    ELSE d.library_cleared_at END,
         labs_cleared_at       = CASE WHEN v_step_key = 'labs_clearance'       THEN COALESCE(d.labs_cleared_at, now())       ELSE d.labs_cleared_at END,
         activities_cleared_at = CASE WHEN v_step_key = 'activities_clearance' THEN COALESCE(d.activities_cleared_at, now()) ELSE d.activities_cleared_at END,
         finance_cleared_at    = CASE WHEN v_step_key = 'finance_clearance'    THEN COALESCE(d.finance_cleared_at, now())    ELSE d.finance_cleared_at END,
         updated_at            = now()
   WHERE d.request_id = NEW.student_request_id
     AND v_step_key IN ('library_clearance','labs_clearance','activities_clearance','finance_clearance');

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.record_b1_file_withdrawal_clearance() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_record_b1_file_withdrawal_clearance ON public.student_request_workflow_steps;
CREATE TRIGGER trg_record_b1_file_withdrawal_clearance
AFTER UPDATE OF status ON public.student_request_workflow_steps
FOR EACH ROW
EXECUTE FUNCTION public.record_b1_file_withdrawal_clearance();