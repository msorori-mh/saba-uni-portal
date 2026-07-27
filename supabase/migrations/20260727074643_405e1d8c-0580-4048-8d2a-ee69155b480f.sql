GRANT SELECT ON public.student_request_attachment_uploads TO authenticated;
CREATE POLICY "own_attachment_upload_rows_select"
ON public.student_request_attachment_uploads
FOR SELECT
TO authenticated
USING (created_by = auth.uid());