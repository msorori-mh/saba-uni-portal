-- STUDENT-AFFAIRS-WORKFLOW-01C
-- Security hardening for student affairs workflow RLS and access helpers.
-- This migration does not modify student data, grades, enrollments, documents, or request statuses.

CREATE OR REPLACE FUNCTION public.can_access_student_service_request(
  _user_id uuid,
  _request_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.student_requests sr
    LEFT JOIN public.student_profiles sp ON sp.id = sr.student_profile_id
    WHERE sr.id = _request_id
      AND (
        sp.user_id = _user_id
        OR public.has_any_role(_user_id, ARRAY['admin','system_admin'])
        OR (
          sr.current_role_key IS NOT NULL
          AND public.has_any_role(_user_id, ARRAY[sr.current_role_key])
        )
        OR EXISTS (
          SELECT 1
          FROM public.student_service_request_steps s
          WHERE s.request_id = sr.id
            AND s.status = 'active'
            AND (
              s.assigned_to = _user_id
              OR public.has_any_role(_user_id, ARRAY[s.role_key])
            )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_act_on_student_service_request(
  _user_id uuid,
  _request_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.student_requests sr
    WHERE sr.id = _request_id
      AND sr.status IN ('submitted','in_review','under_review')
      AND (
        public.has_any_role(_user_id, ARRAY['admin','system_admin'])
        OR (
          sr.current_role_key IS NOT NULL
          AND public.has_any_role(_user_id, ARRAY[sr.current_role_key])
        )
        OR EXISTS (
          SELECT 1
          FROM public.student_service_request_steps s
          WHERE s.request_id = sr.id
            AND s.step_index = sr.current_step_index
            AND s.status = 'active'
            AND (
              s.assigned_to = _user_id
              OR public.has_any_role(_user_id, ARRAY[s.role_key])
            )
        )
      )
  );
$$;

DROP POLICY IF EXISTS ssrs_select_participants ON public.student_service_request_steps;
DROP POLICY IF EXISTS ssrs_insert_priv ON public.student_service_request_steps;
DROP POLICY IF EXISTS ssrs_update_priv ON public.student_service_request_steps;
DROP POLICY IF EXISTS ssre_select_participants ON public.student_service_request_events;
DROP POLICY IF EXISTS ssre_insert_priv ON public.student_service_request_events;

CREATE POLICY ssrs_select_scoped
ON public.student_service_request_steps
FOR SELECT TO authenticated
USING (public.can_access_student_service_request(auth.uid(), request_id));

-- No INSERT/UPDATE policies are intentionally recreated for authenticated
-- users. Workflow mutations must go through server functions/RPC only.

CREATE POLICY ssre_select_scoped
ON public.student_service_request_events
FOR SELECT TO authenticated
USING (public.can_access_student_service_request(auth.uid(), request_id));

-- No INSERT policy is intentionally recreated for authenticated users.
-- Event creation must go through server functions/RPC only.

DROP POLICY IF EXISTS sra_storage_select_priv ON storage.objects;

CREATE POLICY sra_storage_select_priv ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'student-request-attachments'
  AND EXISTS (
    SELECT 1
    FROM public.student_request_attachments att
    WHERE att.file_url = storage.objects.name
      AND public.can_access_student_service_request(auth.uid(), att.request_id)
  )
);
