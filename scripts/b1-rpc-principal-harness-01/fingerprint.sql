-- Read-only business-surface fingerprint for the five TEST_ONLY B1 requests.
-- Emits a single md5 value. Used as the outside-transaction equality proof
-- before the matrix, between cases, and after the matrix.
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

SELECT md5(string_agg(h, '|' ORDER BY rel))
FROM (
  SELECT 'student_requests' AS rel, coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-') AS h
    FROM (SELECT r.* FROM public.student_requests r
          WHERE r.request_number IN ('SR-20260727-42393846','SR-20260727-50BEDCE2',
            'SR-20260727-3C550070','SR-20260727-88D885F0','SR-20260727-695EC35B')) t
  UNION ALL
  SELECT 'workflow_steps', coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-')
    FROM (SELECT w.* FROM public.student_request_workflow_steps w
          JOIN public.student_requests r ON r.id = w.student_request_id
          WHERE r.request_number IN ('SR-20260727-42393846','SR-20260727-50BEDCE2',
            'SR-20260727-3C550070','SR-20260727-88D885F0','SR-20260727-695EC35B')) t
  UNION ALL
  SELECT 'workflow_events', coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-')
    FROM (SELECT e.* FROM public.student_request_workflow_events e
          JOIN public.student_requests r ON r.id = e.student_request_id
          WHERE r.request_number IN ('SR-20260727-42393846','SR-20260727-50BEDCE2',
            'SR-20260727-3C550070','SR-20260727-88D885F0','SR-20260727-695EC35B')) t
  UNION ALL
  SELECT 'attachment_uploads', coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-')
    FROM (SELECT a.* FROM public.student_request_attachment_uploads a
          JOIN public.student_requests r ON r.id = a.request_id
          WHERE r.request_number IN ('SR-20260727-42393846','SR-20260727-50BEDCE2',
            'SR-20260727-3C550070','SR-20260727-88D885F0','SR-20260727-695EC35B')) t
  UNION ALL
  SELECT 'fee_assessments', coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-')
    FROM (SELECT f.* FROM public.student_request_fee_assessments f) t
  UNION ALL SELECT 'audit_logs_count', md5(count(*)::text) FROM public.audit_logs
  UNION ALL SELECT 'notifications_count', md5(count(*)::text) FROM public.notifications
  UNION ALL SELECT 'official_documents_count', md5(count(*)::text) FROM public.official_documents
  UNION ALL SELECT 'protected_certs', coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-')
    FROM (SELECT r.* FROM public.student_requests r
          WHERE r.request_number IN ('SR-20260713-2DE64041','SR-20260715-FEDCB3E1',
            'SR-20260716-26BAD4C8')) t
  UNION ALL SELECT 'b1_visibility', coalesce(md5(string_agg(rt.code||'='||rt.student_visible::text, ',' ORDER BY rt.code)),'-')
    FROM public.request_types rt
    WHERE rt.code IN ('enrollment_suspension','excused_absence','department_transfer',
                      'final_chance','file_withdrawal')
) s;
