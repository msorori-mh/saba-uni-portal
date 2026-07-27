DROP POLICY IF EXISTS "Admins or self can update staff profile" ON public.staff_profiles;

CREATE POLICY "Admins can update staff profiles"
ON public.staff_profiles
FOR UPDATE
TO authenticated
USING (has_any_role(auth.uid(), ARRAY['admin'::text, 'system_admin'::text]))
WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::text, 'system_admin'::text]));

CREATE POLICY "Staff can update own non privileged profile fields"
ON public.staff_profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND NOT EXISTS (
    SELECT 1 FROM public.staff_profiles old
    WHERE old.id = staff_profiles.id
      AND (
        old.user_id IS DISTINCT FROM staff_profiles.user_id
        OR old.role_type IS DISTINCT FROM staff_profiles.role_type
        OR old.department_id IS DISTINCT FROM staff_profiles.department_id
        OR old.department_scope IS DISTINCT FROM staff_profiles.department_scope
        OR old.status IS DISTINCT FROM staff_profiles.status
        OR old.employee_number IS DISTINCT FROM staff_profiles.employee_number
      )
  )
);