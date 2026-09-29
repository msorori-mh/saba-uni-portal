-- The generic actor RPC already validates the exact active workflow step.
-- Retain that implementation under an internal name and mark only its
-- transaction as a workflow-authorized request transition.
ALTER FUNCTION public.act_on_student_request_step(uuid,text,text,jsonb)
  RENAME TO act_on_student_request_step_internal;
REVOKE ALL ON FUNCTION public.act_on_student_request_step_internal(uuid,text,text,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.act_on_student_request_step_internal(uuid,text,text,jsonb)
  TO service_role;

CREATE FUNCTION public.act_on_student_request_step(
  p_step_id uuid, p_action text, p_comment text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000';
  END IF;
  PERFORM set_config('student_request.actor_rpc', '1', true);
  RETURN public.act_on_student_request_step_internal(
    p_step_id, p_action, p_comment, p_payload
  );
END $$;
REVOKE ALL ON FUNCTION public.act_on_student_request_step(uuid,text,text,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.act_on_student_request_step(uuid,text,text,jsonb)
  TO authenticated, service_role;

-- This trigger is independent of the historical permissive staff branch in
-- protect_student_request(). A direct UPDATE cannot approve a request.
CREATE OR REPLACE FUNCTION public.guard_privileged_student_request_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_workflow_action boolean;
BEGIN
  IF v_uid IS NULL OR NOT public.has_any_role(
    v_uid, ARRAY['admin','system_admin','dean','registrar','student_affairs']
  ) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'REQUEST_WORKFLOW_SUBMISSION_REQUIRED' USING ERRCODE='42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.student_profile_id IS DISTINCT FROM OLD.student_profile_id
     OR NEW.request_type IS DISTINCT FROM OLD.request_type THEN
    RAISE EXCEPTION 'REQUEST_IDENTITY_IMMUTABLE' USING ERRCODE='42501';
  END IF;
  v_workflow_action := (
    current_setting('student_request.actor_rpc', true) = '1'
    OR current_setting('b1.atomic_action', true) = '1'
    OR current_setting('b1.specialized_action', true) = '1'
  ) AND EXISTS (
    SELECT 1 FROM public.student_request_workflow_steps s
    WHERE s.student_request_id = OLD.id
      AND s.completed_by = v_uid
      AND s.status IN ('completed','rejected','returned')
  );
  IF (NEW.status IS DISTINCT FROM OLD.status
      OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
      OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
      OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
      OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
      OR NEW.current_step_index IS DISTINCT FROM OLD.current_step_index
      OR NEW.current_role_key IS DISTINCT FROM OLD.current_role_key)
     AND NOT COALESCE(v_workflow_action, false)
     AND NOT (
       current_setting('student_request.submit_via_rpc', true) = '1'
       AND OLD.status IN ('draft','returned','returned_for_completion')
       AND NEW.status = 'submitted'
       AND EXISTS (SELECT 1 FROM public.student_profiles sp
         WHERE sp.id = OLD.student_profile_id AND sp.user_id = v_uid)
     ) THEN
    RAISE EXCEPTION 'REQUEST_WORKFLOW_ACTION_REQUIRED' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_privileged_student_request_write
  ON public.student_requests;
CREATE TRIGGER trg_guard_privileged_student_request_write
  BEFORE INSERT OR UPDATE ON public.student_requests FOR EACH ROW
  EXECUTE FUNCTION public.guard_privileged_student_request_write();

-- Privileged inserts cannot manufacture an already-approved request either.
ALTER POLICY sr_insert_priv ON public.student_requests
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs'])
    AND status = 'draft'
  );
