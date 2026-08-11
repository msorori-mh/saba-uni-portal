CREATE TABLE IF NOT EXISTS public.b1_workflow_runtime_contract_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.request_type_workflows(id),
  request_type_code text NOT NULL,
  workflow_version integer NOT NULL,
  step_key text NOT NULL,
  step_order integer NOT NULL,
  unit_code text NOT NULL,
  role_code text NOT NULL,
  action_type text NOT NULL,
  action_code text,
  pinned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, step_key)
);

GRANT SELECT ON public.b1_workflow_runtime_contract_snapshot TO authenticated;
GRANT ALL ON public.b1_workflow_runtime_contract_snapshot TO service_role;
ALTER TABLE public.b1_workflow_runtime_contract_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "runtime contract snapshot readable by staff"
  ON public.b1_workflow_runtime_contract_snapshot FOR SELECT TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.b1_runtime_contract_snapshot_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $fn$
BEGIN
  RAISE EXCEPTION 'B1_RUNTIME_CONTRACT_SNAPSHOT_IS_IMMUTABLE';
END;
$fn$;

DROP TRIGGER IF EXISTS trg_b1_runtime_contract_snapshot_immutable
  ON public.b1_workflow_runtime_contract_snapshot;
CREATE TRIGGER trg_b1_runtime_contract_snapshot_immutable
  BEFORE UPDATE OR DELETE ON public.b1_workflow_runtime_contract_snapshot
  FOR EACH ROW EXECUTE FUNCTION public.b1_runtime_contract_snapshot_immutable();

INSERT INTO public.b1_workflow_runtime_contract_snapshot
  (workflow_id, request_type_code, workflow_version, step_key, step_order,
   unit_code, role_code, action_type, action_code)
SELECT s.workflow_id, rt.code, w.version, s.step_key, s.step_order,
       u.code, r.code, s.action_type, s.action_code
FROM public.request_type_workflow_steps s
JOIN public.request_type_workflows w ON w.id = s.workflow_id
JOIN public.request_types rt ON rt.id = w.request_type_id
JOIN public.request_processing_units u ON u.id = s.processing_unit_id
JOIN public.request_processing_roles r ON r.id = s.processing_role_id
WHERE rt.code IN ('enrollment_suspension','excused_absence','file_withdrawal',
                  'department_transfer','final_chance')
ON CONFLICT (workflow_id, step_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.service_platform_runtime_flags (
  service_code text PRIMARY KEY,
  legacy_fallback_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.service_platform_runtime_flags TO authenticated;
GRANT ALL ON public.service_platform_runtime_flags TO service_role;
ALTER TABLE public.service_platform_runtime_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "runtime flags readable by staff"
  ON public.service_platform_runtime_flags FOR SELECT TO authenticated
  USING (true);

INSERT INTO public.service_platform_runtime_flags (service_code, legacy_fallback_enabled)
VALUES ('enrollment_suspension', true), ('excused_absence', true),
       ('file_withdrawal', true), ('department_transfer', true), ('final_chance', true)
ON CONFLICT (service_code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.b1_legacy_fallback_enabled(p_service_code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT COALESCE((SELECT f.legacy_fallback_enabled
                   FROM public.service_platform_runtime_flags f
                   WHERE f.service_code = p_service_code), true);
$fn$;

CREATE OR REPLACE FUNCTION public.is_b1_runtime_step_contract_configured(
  p_workflow_id uuid, p_step_key text, p_unit_code text, p_role_code text, p_action_type text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.b1_workflow_runtime_contract_snapshot c
    WHERE c.workflow_id = p_workflow_id
      AND c.step_key = p_step_key
      AND c.unit_code = p_unit_code
      AND c.role_code = p_role_code
      AND c.action_type = p_action_type
  );
$fn$;

REVOKE ALL ON FUNCTION public.b1_legacy_fallback_enabled(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_b1_runtime_step_contract_configured(uuid,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.b1_legacy_fallback_enabled(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_b1_runtime_step_contract_configured(uuid,text,text,text,text) TO authenticated, service_role;