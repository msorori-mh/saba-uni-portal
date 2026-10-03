ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS study_plan_id uuid NULL REFERENCES public.study_plans(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_student_profiles_study_plan_id ON public.student_profiles(study_plan_id);

CREATE OR REPLACE FUNCTION public.admin_assign_student_study_plan(p_student_ids uuid[], p_study_plan_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_plan_program uuid;
  v_bad int;
  v_count int;
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'registrar')) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF p_student_ids IS NULL OR cardinality(p_student_ids) = 0 THEN
    RETURN 0;
  END IF;
  IF cardinality(p_student_ids) > 2000 THEN
    RAISE EXCEPTION 'TOO_MANY_STUDENTS';
  END IF;
  IF p_study_plan_id IS NOT NULL THEN
    SELECT program_id INTO v_plan_program FROM public.study_plans WHERE id = p_study_plan_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_NOT_FOUND'; END IF;
    SELECT count(*) INTO v_bad FROM public.student_profiles
      WHERE id = ANY(p_student_ids) AND program_id IS DISTINCT FROM v_plan_program;
    IF v_bad > 0 THEN RAISE EXCEPTION 'PLAN_PROGRAM_MISMATCH'; END IF;
  END IF;

  INSERT INTO public.audit_logs(actor_user_id, actor_role, entity_type, entity_id, action_type, old_values, new_values, notes)
  SELECT v_uid, 'admin', 'student_profiles', sp.id, 'study_plan_assigned',
         jsonb_build_object('study_plan_id', sp.study_plan_id),
         jsonb_build_object('study_plan_id', p_study_plan_id),
         'cohort study plan assignment'
  FROM public.student_profiles sp
  WHERE sp.id = ANY(p_student_ids) AND sp.study_plan_id IS DISTINCT FROM p_study_plan_id;

  UPDATE public.student_profiles SET study_plan_id = p_study_plan_id
  WHERE id = ANY(p_student_ids) AND study_plan_id IS DISTINCT FROM p_study_plan_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_assign_student_study_plan(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_assign_student_study_plan(uuid[], uuid) TO authenticated;