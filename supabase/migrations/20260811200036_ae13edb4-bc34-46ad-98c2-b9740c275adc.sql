CREATE TABLE IF NOT EXISTS public.graduation_project_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid REFERENCES public.departments(id) ON DELETE CASCADE,
  academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft',
  min_team_size integer NOT NULL DEFAULT 1,
  max_team_size integer NOT NULL DEFAULT 5,
  allow_co_supervisor boolean NOT NULL DEFAULT false,
  max_supervisors integer NOT NULL DEFAULT 1,
  required_progress_reports integer NOT NULL DEFAULT 1,
  min_committee_members integer NOT NULL DEFAULT 2,
  max_committee_members integer NOT NULL DEFAULT 5,
  passing_score numeric(5,2) NOT NULL DEFAULT 60.00,
  max_revision_rounds integer NOT NULL DEFAULT 2,
  proposal_window_start date,
  proposal_window_end date,
  defense_window_start date,
  defense_window_end date,
  notes text,
  created_by uuid,
  published_by uuid,
  published_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gp_policies_status_chk CHECK (status IN ('draft','published','superseded')),
  CONSTRAINT gp_policies_team_chk CHECK (min_team_size >= 1 AND max_team_size >= min_team_size AND max_team_size <= 12),
  CONSTRAINT gp_policies_committee_chk CHECK (min_committee_members >= 2 AND max_committee_members >= min_committee_members AND max_committee_members <= 9),
  CONSTRAINT gp_policies_supervisors_chk CHECK (max_supervisors BETWEEN 1 AND 3),
  CONSTRAINT gp_policies_progress_chk CHECK (required_progress_reports BETWEEN 0 AND 12),
  CONSTRAINT gp_policies_score_chk CHECK (passing_score >= 0 AND passing_score <= 100),
  CONSTRAINT gp_policies_rounds_chk CHECK (max_revision_rounds BETWEEN 0 AND 5)
);

CREATE UNIQUE INDEX IF NOT EXISTS gp_policies_scope_version_uq
  ON public.graduation_project_policies (
    coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(academic_year_id, '00000000-0000-0000-0000-000000000000'::uuid),
    version
  );

CREATE UNIQUE INDEX IF NOT EXISTS gp_policies_one_published_uq
  ON public.graduation_project_policies (
    coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(academic_year_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) WHERE status = 'published';

GRANT SELECT ON public.graduation_project_policies TO authenticated;
GRANT ALL ON public.graduation_project_policies TO service_role;

ALTER TABLE public.graduation_project_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gp_policies_read_authenticated"
  ON public.graduation_project_policies FOR SELECT TO authenticated
  USING (true);

CREATE TRIGGER trg_gp_policies_updated_at
  BEFORE UPDATE ON public.graduation_project_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.gp_can_manage_policies()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'system_admin')
    OR public.has_role(auth.uid(), 'dean')
  );
$$;

CREATE OR REPLACE FUNCTION public.gp_effective_policy(p_department_id uuid, p_academic_year_id uuid)
RETURNS public.graduation_project_policies
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.graduation_project_policies;
BEGIN
  SELECT * INTO r FROM public.graduation_project_policies
   WHERE status = 'published'
     AND department_id IS NOT DISTINCT FROM p_department_id
     AND academic_year_id IS NOT DISTINCT FROM p_academic_year_id
   LIMIT 1;
  IF r.id IS NOT NULL THEN RETURN r; END IF;

  SELECT * INTO r FROM public.graduation_project_policies
   WHERE status = 'published'
     AND department_id IS NOT DISTINCT FROM p_department_id
     AND academic_year_id IS NULL
   LIMIT 1;
  IF r.id IS NOT NULL THEN RETURN r; END IF;

  SELECT * INTO r FROM public.graduation_project_policies
   WHERE status = 'published'
     AND department_id IS NULL
     AND academic_year_id IS NOT DISTINCT FROM p_academic_year_id
   LIMIT 1;
  IF r.id IS NOT NULL THEN RETURN r; END IF;

  SELECT * INTO r FROM public.graduation_project_policies
   WHERE status = 'published' AND department_id IS NULL AND academic_year_id IS NULL
   LIMIT 1;
  IF r.id IS NOT NULL THEN RETURN r; END IF;

  -- Safe built-in defaults: identical to current hard-coded behaviour.
  r.min_team_size := 1;
  r.max_team_size := 5;
  r.allow_co_supervisor := false;
  r.max_supervisors := 1;
  r.required_progress_reports := 1;
  r.min_committee_members := 2;
  r.max_committee_members := 5;
  r.passing_score := 60.00;
  r.max_revision_rounds := 2;
  r.status := 'default';
  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION public.gp_effective_policy_for_project(p_project_id uuid)
RETURNS public.graduation_project_policies
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.gp_effective_policy(p.department_id, p.academic_year_id)
  FROM public.graduation_projects p WHERE p.id = p_project_id;
$$;

CREATE OR REPLACE FUNCTION public.gp_admin_list_policies()
RETURNS SETOF public.graduation_project_policies
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.gp_can_manage_policies() THEN
    RAISE EXCEPTION 'graduation project policy access denied' USING ERRCODE='42501';
  END IF;
  RETURN QUERY SELECT * FROM public.graduation_project_policies
   ORDER BY department_id NULLS FIRST, academic_year_id NULLS FIRST, version DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.gp_admin_save_policy_draft(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dept uuid := nullif(p_payload->>'department_id','')::uuid;
  v_year uuid := nullif(p_payload->>'academic_year_id','')::uuid;
  v_id uuid := nullif(p_payload->>'id','')::uuid;
  v_version integer;
BEGIN
  IF NOT public.gp_can_manage_policies() THEN
    RAISE EXCEPTION 'graduation project policy access denied' USING ERRCODE='42501';
  END IF;

  IF v_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.graduation_project_policies WHERE id = v_id AND status = 'draft') THEN
      RAISE EXCEPTION 'only draft policies can be edited';
    END IF;
  ELSE
    SELECT coalesce(max(version), 0) + 1 INTO v_version
      FROM public.graduation_project_policies
     WHERE department_id IS NOT DISTINCT FROM v_dept
       AND academic_year_id IS NOT DISTINCT FROM v_year;
    INSERT INTO public.graduation_project_policies(department_id, academic_year_id, version, status, created_by)
      VALUES (v_dept, v_year, v_version, 'draft', auth.uid())
      RETURNING id INTO v_id;
  END IF;

  UPDATE public.graduation_project_policies SET
    min_team_size = coalesce((p_payload->>'min_team_size')::int, min_team_size),
    max_team_size = coalesce((p_payload->>'max_team_size')::int, max_team_size),
    allow_co_supervisor = coalesce((p_payload->>'allow_co_supervisor')::boolean, allow_co_supervisor),
    max_supervisors = coalesce((p_payload->>'max_supervisors')::int, max_supervisors),
    required_progress_reports = coalesce((p_payload->>'required_progress_reports')::int, required_progress_reports),
    min_committee_members = coalesce((p_payload->>'min_committee_members')::int, min_committee_members),
    max_committee_members = coalesce((p_payload->>'max_committee_members')::int, max_committee_members),
    passing_score = coalesce((p_payload->>'passing_score')::numeric, passing_score),
    max_revision_rounds = coalesce((p_payload->>'max_revision_rounds')::int, max_revision_rounds),
    proposal_window_start = nullif(p_payload->>'proposal_window_start','')::date,
    proposal_window_end = nullif(p_payload->>'proposal_window_end','')::date,
    defense_window_start = nullif(p_payload->>'defense_window_start','')::date,
    defense_window_end = nullif(p_payload->>'defense_window_end','')::date,
    notes = nullif(btrim(coalesce(p_payload->>'notes','')), ''),
    updated_at = now()
  WHERE id = v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.gp_admin_publish_policy(p_policy_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.graduation_project_policies;
BEGIN
  IF NOT public.gp_can_manage_policies() THEN
    RAISE EXCEPTION 'graduation project policy access denied' USING ERRCODE='42501';
  END IF;
  SELECT * INTO r FROM public.graduation_project_policies WHERE id = p_policy_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'policy not found'; END IF;
  IF r.status <> 'draft' THEN RAISE EXCEPTION 'only draft policies can be published'; END IF;

  UPDATE public.graduation_project_policies
     SET status = 'superseded', superseded_at = now()
   WHERE status = 'published'
     AND department_id IS NOT DISTINCT FROM r.department_id
     AND academic_year_id IS NOT DISTINCT FROM r.academic_year_id;

  UPDATE public.graduation_project_policies
     SET status = 'published', published_at = now(), published_by = auth.uid()
   WHERE id = p_policy_id;

  RETURN p_policy_id;
END;
$$;

REVOKE ALL ON FUNCTION public.gp_admin_list_policies() FROM public, anon;
REVOKE ALL ON FUNCTION public.gp_admin_save_policy_draft(jsonb) FROM public, anon;
REVOKE ALL ON FUNCTION public.gp_admin_publish_policy(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.gp_admin_list_policies() TO authenticated;
GRANT EXECUTE ON FUNCTION public.gp_admin_save_policy_draft(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gp_admin_publish_policy(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gp_effective_policy(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gp_effective_policy_for_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gp_can_manage_policies() TO authenticated;