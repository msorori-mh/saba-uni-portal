DROP POLICY IF EXISTS official_documents_deny_client_select ON storage.objects;

CREATE POLICY official_documents_deny_client_select
ON storage.objects
AS RESTRICTIVE
FOR SELECT
TO anon, authenticated
USING (bucket_id <> 'official-documents');

REVOKE EXECUTE ON FUNCTION public._ec_new_verification_token() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._ec_sha256_hex(text) FROM PUBLIC, anon, authenticated;