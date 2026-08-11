CREATE TABLE IF NOT EXISTS public.request_workflow_publish_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid,
  request_type_code text NOT NULL,
  is_valid boolean NOT NULL,
  message text,
  checked_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.request_workflow_publish_validations TO authenticated;
GRANT ALL ON public.request_workflow_publish_validations TO service_role;
ALTER TABLE public.request_workflow_publish_validations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "publish_validations_read_authenticated" ON public.request_workflow_publish_validations;
CREATE POLICY "publish_validations_read_authenticated"
  ON public.request_workflow_publish_validations FOR SELECT TO authenticated USING (true);

DO $$
DECLARE r record; v_msg text;
BEGIN
  FOR r IN
    SELECT w.id, rt.code FROM public.request_type_workflows w
    JOIN public.request_types rt ON rt.id = w.request_type_id
    WHERE w.status='active' AND rt.code IN
      ('enrollment_suspension','excused_absence','department_transfer','final_chance','file_withdrawal')
  LOOP
    BEGIN
      PERFORM public.validate_request_workflow_publish(r.id);
      INSERT INTO public.request_workflow_publish_validations(workflow_id,request_type_code,is_valid,message)
      VALUES(r.id,r.code,true,'OK');
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
      INSERT INTO public.request_workflow_publish_validations(workflow_id,request_type_code,is_valid,message)
      VALUES(r.id,r.code,false,v_msg);
    END;
  END LOOP;
END $$;