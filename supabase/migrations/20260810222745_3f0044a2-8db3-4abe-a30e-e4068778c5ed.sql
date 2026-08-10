-- 1) Structural link: administrative position -> academic department
ALTER TABLE public.organizational_positions
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id),
  ADD COLUMN IF NOT EXISTS is_department_head_position boolean NOT NULL DEFAULT false;

UPDATE public.organizational_positions op
SET department_id = d.id,
    is_department_head_position = true,
    updated_at = now()
FROM public.departments d
WHERE op.unit_type = 'position'
  AND op.code LIKE '%department_head%'
  AND op.code NOT LIKE 'test_only%'
  AND d.is_active
  AND op.name_ar LIKE '%' || d.name_ar || '%'
  AND (op.department_id IS DISTINCT FROM d.id OR op.is_department_head_position = false);

-- 2) Membership provenance
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'council_membership_source') THEN
    CREATE TYPE public.council_membership_source AS ENUM ('official_assignment', 'administrative_position');
  END IF;
END $$;

ALTER TABLE public.academic_council_members
  ADD COLUMN IF NOT EXISTS membership_source public.council_membership_source NOT NULL DEFAULT 'official_assignment',
  ADD COLUMN IF NOT EXISTS source_position_assignment_id uuid REFERENCES public.position_assignments(id);

-- 3) Uniqueness protection (forward-only, active rows only)
CREATE UNIQUE INDEX IF NOT EXISTS academic_council_members_unique_active
  ON public.academic_council_members (council_id, user_id)
  WHERE is_active;

-- 4) Canonical reconciliation
CREATE OR REPLACE FUNCTION public.reconcile_department_head_council_memberships(p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_college_id uuid;
  v_cnt int;
  v_dept_council uuid;
  v_mutations jsonb := '[]'::jsonb;
  r record;
  m record;
  v_existing record;
BEGIN
  SELECT count(*) INTO v_cnt FROM public.academic_councils WHERE council_type = 'college' AND is_active;
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'DH_RECONCILE_AMBIGUOUS_COLLEGE_COUNCIL: found %', v_cnt;
  END IF;
  SELECT id INTO v_college_id FROM public.academic_councils WHERE council_type = 'college' AND is_active;

  FOR r IN
    SELECT pa.id AS assignment_id, pa.user_id, op.department_id, op.code
    FROM public.position_assignments pa
    JOIN public.organizational_positions op ON op.id = pa.position_id
    WHERE op.is_department_head_position
      AND op.is_active
      AND pa.is_active
      AND pa.assigned_from <= current_date
      AND (pa.assigned_to IS NULL OR pa.assigned_to >= current_date)
      AND (p_user_id IS NULL OR pa.user_id = p_user_id)
  LOOP
    IF r.department_id IS NULL THEN
      RAISE EXCEPTION 'DH_RECONCILE_POSITION_WITHOUT_DEPARTMENT: %', r.code;
    END IF;

    SELECT count(*) INTO v_cnt
    FROM public.academic_councils
    WHERE council_type = 'department' AND department_id = r.department_id AND is_active;
    IF v_cnt <> 1 THEN
      RAISE EXCEPTION 'DH_RECONCILE_AMBIGUOUS_DEPARTMENT_COUNCIL: department % has % active councils', r.department_id, v_cnt;
    END IF;
    SELECT id INTO v_dept_council
    FROM public.academic_councils
    WHERE council_type = 'department' AND department_id = r.department_id AND is_active;

    -- own department council -> chair ; college council -> member
    FOR m IN
      SELECT v_dept_council AS council_id, 'chair'::public.academic_council_member_role AS want_role
      UNION ALL
      SELECT v_college_id, 'member'::public.academic_council_member_role
    LOOP
      SELECT * INTO v_existing
      FROM public.academic_council_members
      WHERE council_id = m.council_id AND user_id = r.user_id AND is_active
      LIMIT 1;

      IF v_existing.id IS NULL THEN
        INSERT INTO public.academic_council_members
          (council_id, user_id, member_role, is_active, active_from, membership_source, source_position_assignment_id, notes)
        VALUES
          (m.council_id, r.user_id, m.want_role, true, current_date, 'administrative_position', r.assignment_id,
           'derived from administrative position: ' || r.code);
        v_mutations := v_mutations || jsonb_build_object(
          'user_id', r.user_id, 'council_id', m.council_id, 'before', 'none',
          'action', 'insert_active_membership', 'after', m.want_role::text,
          'reason', 'active department head must hold this membership');
      ELSIF v_existing.member_role <> m.want_role THEN
        UPDATE public.academic_council_members
        SET member_role = m.want_role, updated_at = now()
        WHERE id = v_existing.id;
        v_mutations := v_mutations || jsonb_build_object(
          'user_id', r.user_id, 'council_id', m.council_id, 'before', v_existing.member_role::text,
          'action', 'update_role', 'after', m.want_role::text,
          'reason', 'role must match department head contract');
      END IF;
    END LOOP;
  END LOOP;

  -- Retire ONLY derived memberships whose source assignment is no longer active.
  FOR v_existing IN
    SELECT acm.*
    FROM public.academic_council_members acm
    WHERE acm.is_active
      AND acm.membership_source = 'administrative_position'
      AND (p_user_id IS NULL OR acm.user_id = p_user_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.position_assignments pa
        JOIN public.organizational_positions op ON op.id = pa.position_id
        WHERE pa.id = acm.source_position_assignment_id
          AND op.is_department_head_position
          AND op.is_active
          AND pa.is_active
          AND pa.assigned_from <= current_date
          AND (pa.assigned_to IS NULL OR pa.assigned_to >= current_date)
      )
  LOOP
    UPDATE public.academic_council_members
    SET is_active = false, active_to = current_date, updated_at = now()
    WHERE id = v_existing.id;
    v_mutations := v_mutations || jsonb_build_object(
      'user_id', v_existing.user_id, 'council_id', v_existing.council_id,
      'before', v_existing.member_role::text, 'action', 'deactivate_derived_membership',
      'after', 'inactive', 'reason', 'department head assignment ended');
  END LOOP;

  IF jsonb_array_length(v_mutations) > 0 THEN
    INSERT INTO public.audit_logs (actor_user_id, entity_type, entity_id, action_type, new_values, notes)
    VALUES (auth.uid(), 'academic_council_members', NULL, 'reconcile_department_head_memberships',
            jsonb_build_object('mutations', v_mutations), 'canonical department-head council membership reconciliation');
  END IF;

  RETURN v_mutations;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_department_head_council_memberships(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_department_head_council_memberships(uuid) TO service_role;

-- 5) Write-boundary synchronization
CREATE OR REPLACE FUNCTION public.trg_sync_department_head_council_memberships()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_head boolean;
BEGIN
  SELECT op.is_department_head_position INTO v_is_head
  FROM public.organizational_positions op
  WHERE op.id = COALESCE(NEW.position_id, OLD.position_id);

  IF COALESCE(v_is_head, false) THEN
    PERFORM public.reconcile_department_head_council_memberships(COALESCE(NEW.user_id, OLD.user_id));
    IF TG_OP = 'UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      PERFORM public.reconcile_department_head_council_memberships(OLD.user_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS sync_department_head_council_memberships ON public.position_assignments;
CREATE TRIGGER sync_department_head_council_memberships
AFTER INSERT OR UPDATE OR DELETE ON public.position_assignments
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_department_head_council_memberships();