-- Forward-only security fix: column-level UPDATE privileges on public.student_requests.
-- RLS cannot restrict columns; GRANTs can. SECURITY DEFINER workflow functions run as
-- table owner and are unaffected.
REVOKE UPDATE ON public.student_requests FROM authenticated;
REVOKE UPDATE ON public.student_requests FROM anon;

GRANT UPDATE (
  title,
  description,
  request_type,
  status,
  form_data,
  student_notes,
  submitted_at,
  cancelled_at,
  rejection_reason,
  updated_at
) ON public.student_requests TO authenticated;

GRANT ALL ON public.student_requests TO service_role;