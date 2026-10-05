-- B1-PAID-SERVICES-ZERO-FEE-CHECK-01 rehearsal preimages
-- (isolated throwaway cluster ONLY — never a real database).
--
-- Adds the production relations and catalog rows that «التحويل بين الأقسام»
-- (department_transfer) and «الفرصة الأخيرة» (final_chance) need on top of the
-- shared strict-runtime harness. The two academic-effect functions are NOT
-- copied here: run.sh extracts them verbatim from the applied migration
-- supabase/migrations/20260727120100_b1_26_academic_effect_functions_01.sql.

ALTER TABLE public.transfer_request_details
  ADD COLUMN IF NOT EXISTS requested_program_id uuid,
  ADD COLUMN IF NOT EXISTS previous_department_id uuid,
  ADD COLUMN IF NOT EXISTS previous_program_id uuid,
  ADD COLUMN IF NOT EXISTS effect_applied_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.extra_chance_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES public.student_requests(id) ON DELETE CASCADE,
  academic_year_id uuid,
  semester_id uuid,
  chance_type text,
  reason text,
  chance_applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.student_extra_chances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_profile_id uuid NOT NULL,
  request_id uuid,
  academic_year_id uuid,
  semester_id uuid,
  chance_type text,
  reason text,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Action catalog rows exactly as migration 20260811195233 seeded them.
INSERT INTO public.request_workflow_action_catalog
  (code, name_ar, description_ar, kind, effect_function, restricted_request_type_code, action_type, sort_order)
VALUES
  ('APPLY_DEPARTMENT_TRANSFER', 'تطبيق التحويل بين الأقسام', 'ينفذ تحويل الطالب إلى القسم والبرنامج الهدف.', 'effect',
     'apply_b1_department_transfer_effect', 'department_transfer', 'apply_decision', 130),
  ('APPLY_FINAL_CHANCE', 'منح الفرصة الأخيرة', 'يسجل الفرصة الأخيرة للطالب.', 'effect',
     'apply_b1_final_chance_effect', 'final_chance', 'apply_decision', 140)
ON CONFLICT (code) DO NOTHING;
