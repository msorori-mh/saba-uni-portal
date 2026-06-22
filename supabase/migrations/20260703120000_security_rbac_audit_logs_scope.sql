-- RBAC-06: Scope audit_logs SELECT by role (full read for super-admins only).
-- Migration Review compliant: ALTER POLICY + idempotent CREATE POLICY (no destructive DDL).

-- ---------------------------------------------------------------------------
-- Full read: admin + system_admin only (remove dean from unrestricted access)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'audit_logs'
      AND policyname = 'audit_logs_select_privileged'
  ) THEN
    EXECUTE $policy$
      ALTER POLICY audit_logs_select_privileged
      ON public.audit_logs
      USING (
        public.has_any_role(auth.uid(), ARRAY['admin','system_admin'])
      )
    $policy$;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Dean / vice_dean: academic & executive oversight (no account/security logs)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'audit_logs'
      AND policyname = 'audit_logs_select_dean_scoped'
  ) THEN
    CREATE POLICY audit_logs_select_dean_scoped
      ON public.audit_logs
      FOR SELECT TO authenticated
      USING (
        public.has_any_role(auth.uid(), ARRAY['dean','vice_dean'])
        AND entity_type = ANY (ARRAY[
          'student_request','student','enrollment','grade','document',
          'academic_status','report','executive_dashboard','academic_operation',
          'schedule','faculty','import','faculty_account','communication'
        ]::text[])
      );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Registrar / student affairs: student lifecycle & communications
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'audit_logs'
      AND policyname = 'audit_logs_select_registrar_scoped'
  ) THEN
    CREATE POLICY audit_logs_select_registrar_scoped
      ON public.audit_logs
      FOR SELECT TO authenticated
      USING (
        public.has_any_role(auth.uid(), ARRAY['registrar','student_affairs'])
        AND entity_type = ANY (ARRAY[
          'student_request','student','import','enrollment','document',
          'academic_operation','communication','schedule'
        ]::text[])
      );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- HR officer: people & account provisioning
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'audit_logs'
      AND policyname = 'audit_logs_select_hr_scoped'
  ) THEN
    CREATE POLICY audit_logs_select_hr_scoped
      ON public.audit_logs
      FOR SELECT TO authenticated
      USING (
        public.has_any_role(auth.uid(), ARRAY['hr_officer'])
        AND entity_type = ANY (ARRAY[
          'staff','faculty','user','faculty_account'
        ]::text[])
      );
  END IF;
END $$;
