-- STUDENT-REQUEST-ADMIN-WORKFLOW-SCHEMA-01
-- Admin-configurable workflow schema for student request types.
--
-- Creates:
--   request_type_workflows
--   request_type_workflow_steps
--   request_type_workflow_transitions
--   student_request_workflow_steps
--   student_request_workflow_events
--
-- Requires: 20260710160000_student_request_processing_units_schema.sql
--           (request_processing_units, request_processing_roles)
--
-- Does NOT modify request_types.workflow_schema JSON or legacy
-- student_service_request_steps / student_service_request_events.
-- No seed, no data writes, no UI changes.

-- =============================================================================
-- 1. request_type_workflows
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.request_type_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type_id uuid NOT NULL REFERENCES public.request_types(id) ON DELETE CASCADE,
  code text NOT NULL,
  name_ar text NOT NULL,
  name_en text,
  description_ar text,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft',
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'request_type_workflows_request_type_id_code_version_key'
      AND conrelid = 'public.request_type_workflows'::regclass
  ) THEN
    ALTER TABLE public.request_type_workflows
      ADD CONSTRAINT request_type_workflows_request_type_id_code_version_key
      UNIQUE (request_type_id, code, version);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'request_type_workflows_status_chk'
      AND conrelid = 'public.request_type_workflows'::regclass
  ) THEN
    ALTER TABLE public.request_type_workflows
      ADD CONSTRAINT request_type_workflows_status_chk
      CHECK (status IN ('draft', 'active', 'retired'));
  END IF;
END $$;

COMMENT ON TABLE public.request_type_workflows IS
  'Versioned workflow definitions per request type. Foundation for admin workflow '
  'builder. Legacy request_types.workflow_schema JSON is not removed; migration '
  'to this model is a separate future phase.';

COMMENT ON COLUMN public.request_type_workflows.status IS
  'draft = editable; active = used for new submissions; retired = historical only.';

COMMENT ON COLUMN public.request_type_workflows.is_active IS
  'At most one active workflow per request type should be enforced in RPC later.';

-- =============================================================================
-- 2. request_type_workflow_steps
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.request_type_workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.request_type_workflows(id) ON DELETE CASCADE,
  step_key text NOT NULL,
  step_name_ar text NOT NULL,
  step_name_en text,
  description_ar text,
  step_order integer NOT NULL,
  processing_unit_id uuid REFERENCES public.request_processing_units(id) ON DELETE RESTRICT,
  processing_role_id uuid REFERENCES public.request_processing_roles(id) ON DELETE RESTRICT,
  assignment_strategy text NOT NULL DEFAULT 'role_pool',
  action_type text NOT NULL DEFAULT 'review',
  status_on_enter text,
  status_on_complete text,
  is_required boolean NOT NULL DEFAULT true,
  can_return_to_student boolean NOT NULL DEFAULT true,
  can_reject boolean NOT NULL DEFAULT true,
  can_skip boolean NOT NULL DEFAULT false,
  notify_on_enter boolean NOT NULL DEFAULT true,
  notify_on_complete boolean NOT NULL DEFAULT true,
  visible_to_student boolean NOT NULL DEFAULT true,
  requires_attachment boolean NOT NULL DEFAULT false,
  requires_payment boolean NOT NULL DEFAULT false,
  produces_document boolean NOT NULL DEFAULT false,
  form_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'request_type_workflow_steps_workflow_id_step_key_key'
      AND conrelid = 'public.request_type_workflow_steps'::regclass
  ) THEN
    ALTER TABLE public.request_type_workflow_steps
      ADD CONSTRAINT request_type_workflow_steps_workflow_id_step_key_key
      UNIQUE (workflow_id, step_key);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'request_type_workflow_steps_workflow_id_step_order_key'
      AND conrelid = 'public.request_type_workflow_steps'::regclass
  ) THEN
    ALTER TABLE public.request_type_workflow_steps
      ADD CONSTRAINT request_type_workflow_steps_workflow_id_step_order_key
      UNIQUE (workflow_id, step_order);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'request_type_workflow_steps_assignment_strategy_chk'
      AND conrelid = 'public.request_type_workflow_steps'::regclass
  ) THEN
    ALTER TABLE public.request_type_workflow_steps
      ADD CONSTRAINT request_type_workflow_steps_assignment_strategy_chk
      CHECK (assignment_strategy IN (
        'role_pool',
        'specific_user',
        'department_position',
        'college_position',
        'requester_department_head',
        'dean',
        'manual'
      ));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'request_type_workflow_steps_action_type_chk'
      AND conrelid = 'public.request_type_workflow_steps'::regclass
  ) THEN
    ALTER TABLE public.request_type_workflow_steps
      ADD CONSTRAINT request_type_workflow_steps_action_type_chk
      CHECK (action_type IN (
        'review',
        'approve',
        'reject',
        'comment',
        'return_to_student',
        'request_attachment',
        'request_payment',
        'archive',
        'issue_document',
        'complete'
      ));
  END IF;
END $$;

COMMENT ON TABLE public.request_type_workflow_steps IS
  'Configurable workflow steps per request type workflow. Each step routes to a '
  'processing unit/role or academic position strategy (department chair, dean).';

COMMENT ON COLUMN public.request_type_workflow_steps.processing_unit_id IS
  'Nullable for system/terminal steps (e.g. complete) without a processing unit.';

COMMENT ON COLUMN public.request_type_workflow_steps.processing_role_id IS
  'Nullable when assignment_strategy resolves via academic position (dean, '
  'requester_department_head) without a fixed processing role.';

COMMENT ON COLUMN public.request_type_workflow_steps.assignment_strategy IS
  'How runtime resolves the actor: role_pool, specific_user, department_position, '
  'college_position, requester_department_head, dean, or manual.';

-- =============================================================================
-- 3. request_type_workflow_transitions
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.request_type_workflow_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.request_type_workflows(id) ON DELETE CASCADE,
  from_step_id uuid REFERENCES public.request_type_workflow_steps(id) ON DELETE CASCADE,
  to_step_id uuid REFERENCES public.request_type_workflow_steps(id) ON DELETE CASCADE,
  action_result text NOT NULL,
  label_ar text,
  condition_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'request_type_workflow_transitions_action_result_chk'
      AND conrelid = 'public.request_type_workflow_transitions'::regclass
  ) THEN
    ALTER TABLE public.request_type_workflow_transitions
      ADD CONSTRAINT request_type_workflow_transitions_action_result_chk
      CHECK (action_result IN (
        'submit',
        'approve',
        'reject',
        'return',
        'request_attachment',
        'request_payment',
        'skip',
        'complete',
        'cancel'
      ));
  END IF;
END $$;

COMMENT ON TABLE public.request_type_workflow_transitions IS
  'Directed edges between workflow steps keyed by action_result. '
  'from_step_id NULL = workflow entry on submit; to_step_id NULL = terminal state.';

COMMENT ON COLUMN public.request_type_workflow_transitions.from_step_id IS
  'NULL represents workflow start (e.g. submit transition to first step).';

COMMENT ON COLUMN public.request_type_workflow_transitions.to_step_id IS
  'NULL represents terminal outcome (complete, reject, cancel).';

-- =============================================================================
-- 4. student_request_workflow_steps (runtime)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.student_request_workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_request_id uuid NOT NULL REFERENCES public.student_requests(id) ON DELETE CASCADE,
  workflow_id uuid REFERENCES public.request_type_workflows(id) ON DELETE SET NULL,
  workflow_step_id uuid REFERENCES public.request_type_workflow_steps(id) ON DELETE SET NULL,
  step_key text NOT NULL,
  step_name_ar text NOT NULL,
  step_order integer NOT NULL,
  processing_unit_id uuid REFERENCES public.request_processing_units(id) ON DELETE RESTRICT,
  processing_role_id uuid REFERENCES public.request_processing_roles(id) ON DELETE RESTRICT,
  assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_staff_profile_id uuid,
  assigned_faculty_profile_id uuid,
  assigned_position_assignment_id uuid,
  status text NOT NULL DEFAULT 'pending',
  entered_at timestamptz,
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decision text,
  comment text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'student_request_workflow_steps_request_step_key_key'
      AND conrelid = 'public.student_request_workflow_steps'::regclass
  ) THEN
    ALTER TABLE public.student_request_workflow_steps
      ADD CONSTRAINT student_request_workflow_steps_request_step_key_key
      UNIQUE (student_request_id, step_key);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'student_request_workflow_steps_status_chk'
      AND conrelid = 'public.student_request_workflow_steps'::regclass
  ) THEN
    ALTER TABLE public.student_request_workflow_steps
      ADD CONSTRAINT student_request_workflow_steps_status_chk
      CHECK (status IN (
        'pending',
        'active',
        'completed',
        'returned',
        'rejected',
        'skipped',
        'cancelled'
      ));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'student_request_workflow_steps_decision_chk'
      AND conrelid = 'public.student_request_workflow_steps'::regclass
  ) THEN
    ALTER TABLE public.student_request_workflow_steps
      ADD CONSTRAINT student_request_workflow_steps_decision_chk
      CHECK (
        decision IS NULL
        OR decision IN ('approved', 'rejected', 'returned', 'skipped', 'completed')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'srw_steps_assigned_staff_profile_id_fk'
      AND conrelid = 'public.student_request_workflow_steps'::regclass
  ) THEN
    ALTER TABLE public.student_request_workflow_steps
      ADD CONSTRAINT srw_steps_assigned_staff_profile_id_fk
      FOREIGN KEY (assigned_staff_profile_id)
      REFERENCES public.staff_profiles(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'srw_steps_assigned_faculty_profile_id_fk'
      AND conrelid = 'public.student_request_workflow_steps'::regclass
  ) THEN
    ALTER TABLE public.student_request_workflow_steps
      ADD CONSTRAINT srw_steps_assigned_faculty_profile_id_fk
      FOREIGN KEY (assigned_faculty_profile_id)
      REFERENCES public.faculty_profiles(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'srw_steps_assigned_position_assignment_id_fk'
      AND conrelid = 'public.student_request_workflow_steps'::regclass
  ) THEN
    ALTER TABLE public.student_request_workflow_steps
      ADD CONSTRAINT srw_steps_assigned_position_assignment_id_fk
      FOREIGN KEY (assigned_position_assignment_id)
      REFERENCES public.position_assignments(id)
      ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON TABLE public.student_request_workflow_steps IS
  'Runtime workflow step instances per student request. Generated on submit from '
  'request_type_workflow_steps. Coexists with legacy student_service_request_steps; '
  'runtime phase will define compatibility or cutover.';

-- =============================================================================
-- 5. student_request_workflow_events (runtime audit)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.student_request_workflow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_request_id uuid NOT NULL REFERENCES public.student_requests(id) ON DELETE CASCADE,
  workflow_step_runtime_id uuid REFERENCES public.student_request_workflow_steps(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_unit_id uuid REFERENCES public.request_processing_units(id) ON DELETE SET NULL,
  actor_role_id uuid REFERENCES public.request_processing_roles(id) ON DELETE SET NULL,
  message_ar text,
  message_en text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  visible_to_student boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'student_request_workflow_events_event_type_chk'
      AND conrelid = 'public.student_request_workflow_events'::regclass
  ) THEN
    ALTER TABLE public.student_request_workflow_events
      ADD CONSTRAINT student_request_workflow_events_event_type_chk
      CHECK (event_type IN (
        'created',
        'submitted',
        'step_entered',
        'assigned',
        'commented',
        'approved',
        'rejected',
        'returned',
        'attachment_requested',
        'payment_requested',
        'archived',
        'document_issued',
        'completed',
        'cancelled'
      ));
  END IF;
END $$;

COMMENT ON TABLE public.student_request_workflow_events IS
  'Audit trail for admin-configurable workflow actions. All future actions must '
  'write events via RPC. Coexists with legacy student_service_request_events.';

-- =============================================================================
-- 6. updated_at triggers
-- =============================================================================

DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_request_type_workflows_updated_at'
      AND tgrelid = 'public.request_type_workflows'::regclass
  ) THEN
    CREATE TRIGGER trg_request_type_workflows_updated_at
      BEFORE UPDATE ON public.request_type_workflows
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_request_type_workflow_steps_updated_at'
      AND tgrelid = 'public.request_type_workflow_steps'::regclass
  ) THEN
    CREATE TRIGGER trg_request_type_workflow_steps_updated_at
      BEFORE UPDATE ON public.request_type_workflow_steps
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_student_request_workflow_steps_updated_at'
      AND tgrelid = 'public.student_request_workflow_steps'::regclass
  ) THEN
    CREATE TRIGGER trg_student_request_workflow_steps_updated_at
      BEFORE UPDATE ON public.student_request_workflow_steps
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $mig$;

-- =============================================================================
-- 7. Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_rtw_request_type_id
  ON public.request_type_workflows(request_type_id);

CREATE INDEX IF NOT EXISTS idx_rtw_status
  ON public.request_type_workflows(status);

CREATE INDEX IF NOT EXISTS idx_rtw_is_active
  ON public.request_type_workflows(is_active);

CREATE INDEX IF NOT EXISTS idx_rtws_workflow_id
  ON public.request_type_workflow_steps(workflow_id);

CREATE INDEX IF NOT EXISTS idx_rtws_processing_unit_id
  ON public.request_type_workflow_steps(processing_unit_id);

CREATE INDEX IF NOT EXISTS idx_rtws_processing_role_id
  ON public.request_type_workflow_steps(processing_role_id);

CREATE INDEX IF NOT EXISTS idx_rtws_assignment_strategy
  ON public.request_type_workflow_steps(assignment_strategy);

CREATE INDEX IF NOT EXISTS idx_rtws_action_type
  ON public.request_type_workflow_steps(action_type);

CREATE INDEX IF NOT EXISTS idx_rtwt_workflow_id
  ON public.request_type_workflow_transitions(workflow_id);

CREATE INDEX IF NOT EXISTS idx_rtwt_from_step_id
  ON public.request_type_workflow_transitions(from_step_id);

CREATE INDEX IF NOT EXISTS idx_rtwt_to_step_id
  ON public.request_type_workflow_transitions(to_step_id);

CREATE INDEX IF NOT EXISTS idx_rtwt_action_result
  ON public.request_type_workflow_transitions(action_result);

CREATE INDEX IF NOT EXISTS idx_srw_steps_student_request_id
  ON public.student_request_workflow_steps(student_request_id);

CREATE INDEX IF NOT EXISTS idx_srw_steps_workflow_id
  ON public.student_request_workflow_steps(workflow_id);

CREATE INDEX IF NOT EXISTS idx_srw_steps_workflow_step_id
  ON public.student_request_workflow_steps(workflow_step_id);

CREATE INDEX IF NOT EXISTS idx_srw_steps_processing_unit_id
  ON public.student_request_workflow_steps(processing_unit_id);

CREATE INDEX IF NOT EXISTS idx_srw_steps_processing_role_id
  ON public.student_request_workflow_steps(processing_role_id);

CREATE INDEX IF NOT EXISTS idx_srw_steps_assigned_user_id
  ON public.student_request_workflow_steps(assigned_user_id);

CREATE INDEX IF NOT EXISTS idx_srw_steps_assigned_staff_profile_id
  ON public.student_request_workflow_steps(assigned_staff_profile_id);

CREATE INDEX IF NOT EXISTS idx_srw_steps_assigned_faculty_profile_id
  ON public.student_request_workflow_steps(assigned_faculty_profile_id);

CREATE INDEX IF NOT EXISTS idx_srw_steps_assigned_position_assignment_id
  ON public.student_request_workflow_steps(assigned_position_assignment_id);

CREATE INDEX IF NOT EXISTS idx_srw_steps_status
  ON public.student_request_workflow_steps(status);

CREATE INDEX IF NOT EXISTS idx_srwe_student_request_id
  ON public.student_request_workflow_events(student_request_id);

CREATE INDEX IF NOT EXISTS idx_srwe_workflow_step_runtime_id
  ON public.student_request_workflow_events(workflow_step_runtime_id);

CREATE INDEX IF NOT EXISTS idx_srwe_event_type
  ON public.student_request_workflow_events(event_type);

CREATE INDEX IF NOT EXISTS idx_srwe_actor_user_id
  ON public.student_request_workflow_events(actor_user_id);

CREATE INDEX IF NOT EXISTS idx_srwe_created_at
  ON public.student_request_workflow_events(created_at DESC);

-- =============================================================================
-- 8. Grants (no anon; RLS closed until ACTOR-RPC-RLS phase)
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.request_type_workflows TO authenticated;
GRANT ALL ON public.request_type_workflows TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.request_type_workflow_steps TO authenticated;
GRANT ALL ON public.request_type_workflow_steps TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.request_type_workflow_transitions TO authenticated;
GRANT ALL ON public.request_type_workflow_transitions TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_request_workflow_steps TO authenticated;
GRANT ALL ON public.student_request_workflow_steps TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_request_workflow_events TO authenticated;
GRANT ALL ON public.student_request_workflow_events TO service_role;

-- =============================================================================
-- 9. RLS (enabled, no policies — closed by default)
-- =============================================================================

ALTER TABLE public.request_type_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_type_workflow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_type_workflow_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_request_workflow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_request_workflow_events ENABLE ROW LEVEL SECURITY;
