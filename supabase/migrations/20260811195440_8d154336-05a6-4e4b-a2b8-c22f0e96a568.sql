CREATE OR REPLACE FUNCTION public.tg_pin_student_request_workflow_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_canonical text;
  v_workflow_id uuid;
  v_version integer;
BEGIN
  IF NEW.workflow_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_canonical := CASE NEW.request_type
    WHEN 'absence_excuse' THEN 'excused_absence'
    WHEN 'transfer' THEN 'department_transfer'
    WHEN 'extra_chance' THEN 'final_chance'
    ELSE NEW.request_type END;

  SELECT w.id, w.version
  INTO v_workflow_id, v_version
  FROM public.request_type_workflows w
  JOIN public.request_types rt ON rt.id = w.request_type_id
  WHERE w.is_active = true
    AND w.status = 'active'
    AND rt.code IN (NEW.request_type, v_canonical)
  ORDER BY w.version DESC
  LIMIT 1;

  IF v_workflow_id IS NOT NULL THEN
    NEW.workflow_id := v_workflow_id;
    NEW.workflow_version := v_version;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pin_student_request_workflow_version ON public.student_requests;
CREATE TRIGGER trg_pin_student_request_workflow_version
  BEFORE INSERT ON public.student_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_pin_student_request_workflow_version();