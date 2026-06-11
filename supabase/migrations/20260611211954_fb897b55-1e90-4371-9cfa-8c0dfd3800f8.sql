
-- HIGH risk — revoke from anon, public, authenticated (internal/trigger/server-only)
REVOKE EXECUTE ON FUNCTION public.get_auth_user_id_by_email(p_email text) FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_notification(_target_user_id uuid, _title text, _message text, _type text, _reference_type text, _reference_id uuid) FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_audit(_entity_type text, _entity_id uuid, _action_type text, _old jsonb, _new jsonb, _notes text) FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_student_fee_status(_fee_id uuid) FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_document_number() FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_verification_code() FROM anon, public, authenticated;

-- MEDIUM — trigger-only helpers
REVOKE EXECUTE ON FUNCTION public.apply_student_discount(_discount_id uuid) FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.revert_student_discount(_discount_id uuid) FROM anon, public, authenticated;

-- MEDIUM — called as RPC from admin/portal UIs, keep authenticated, drop anon/public
REVOKE EXECUTE ON FUNCTION public.issue_official_document(_student_profile_id uuid, _document_type text, _metadata jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.cancel_official_document(_document_id uuid, _reason text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.process_payment_receipt_approval() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.link_faculty_profile_account(p_profile_id uuid, p_auth_user_id uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.complete_student_password_change() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.complete_faculty_password_change() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.complete_staff_password_change() FROM anon, public;
