-- ============================================================================
-- PORTAL-B1-NEGATIVE-RPC-MATRIX-OPERATOR-PACKAGE — COMPLETE CONTENT FINGERPRINT
--
-- G7 contract: count + deterministic FULL ROW CONTENT hash for every relation
-- in the transitive mutation set of the two RPCs under test
-- (act_on_b1_student_request_step_atomic, record_external_university_payment_confirmation)
-- plus the protected/attested surfaces (service visibility, enrollment
-- certificate records, migration history).
--
-- READ-ONLY. No DDL, no writes, no role changes, no external calls.
--
-- The expression between the BEGIN/END markers below is the SINGLE canonical
-- fingerprint contract. render-negative-cases.ts inlines this exact text as the
-- in-transaction before/after fingerprint, so the in-transaction fingerprint and
-- the outside-transaction fingerprint are byte-identical contracts.
--
-- Non-semantic column exclusions: NONE. Every relation below hashes the full
-- row image (t::text), so any column change is detected.
-- Bounded relations: `notifications` and `audit_logs` are unbounded global logs;
-- they are covered by (a) an exact global count and (b) a full-row-content hash
-- of the newest 500 rows ordered deterministically by (created_at, id). Any
-- insert performed by the RPC chain changes the count AND enters the newest-500
-- window, so an append is always detected.
-- ============================================================================
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

SELECT
-- BEGIN_FINGERPRINT_EXPR
(
WITH b1_scope AS (
  SELECT r.id, r.request_number
  FROM public.student_requests r
  WHERE r.request_number IN (
    'SR-20260727-42393846','SR-20260727-50BEDCE2','SR-20260727-3C550070',
    'SR-20260727-88D885F0','SR-20260727-695EC35B')
)
SELECT md5(string_agg(rel || '=' || h, '|' ORDER BY rel))
FROM (
  -- ---- request core ------------------------------------------------------
  SELECT 'student_requests' AS rel,
         count(*)::text || ':' || coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-') AS h
    FROM (SELECT r.* FROM public.student_requests r
          WHERE r.id IN (SELECT id FROM b1_scope)) t
  UNION ALL
  SELECT 'student_request_workflow_steps',
         count(*)::text || ':' || coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-')
    FROM (SELECT w.* FROM public.student_request_workflow_steps w
          WHERE w.student_request_id IN (SELECT id FROM b1_scope)) t
  UNION ALL
  SELECT 'student_request_workflow_events',
         count(*)::text || ':' || coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-')
    FROM (SELECT e.* FROM public.student_request_workflow_events e
          WHERE e.student_request_id IN (SELECT id FROM b1_scope)) t
  UNION ALL
  -- ---- assignment surface (config the guard reads; global, small) ---------
  SELECT 'request_processing_assignments',
         count(*)::text || ':' || coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-')
    FROM (SELECT a.* FROM public.request_processing_assignments a) t
  UNION ALL
  -- ---- attachments -------------------------------------------------------
  SELECT 'student_request_attachment_uploads',
         count(*)::text || ':' || coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-')
    FROM (SELECT u.* FROM public.student_request_attachment_uploads u
          WHERE u.student_request_id IN (SELECT id FROM b1_scope)) t
  UNION ALL
  SELECT 'student_request_attachments',
         count(*)::text || ':' || coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-')
    FROM (SELECT x.* FROM public.student_request_attachments x
          WHERE x.request_id IN (SELECT id FROM b1_scope)) t
  UNION ALL
  -- ---- money surfaces (global; must never gain a row) --------------------
  SELECT 'student_request_fee_assessments',
         count(*)::text || ':' || coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-')
    FROM (SELECT f.* FROM public.student_request_fee_assessments f) t
  UNION ALL
  SELECT 'payment_receipts',
         count(*)::text || ':' || coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-')
    FROM (SELECT p.* FROM public.payment_receipts p) t
  UNION ALL
  -- ---- documents ---------------------------------------------------------
  SELECT 'official_documents',
         count(*)::text || ':' || coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-')
    FROM (SELECT d.* FROM public.official_documents d) t
  UNION ALL
  SELECT 'enrollment_certificate_document_details',
         count(*)::text || ':' || coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-')
    FROM (SELECT c.* FROM public.enrollment_certificate_document_details c) t
  UNION ALL
  -- ---- per-service detail tables ----------------------------------------
  SELECT 'transfer_request_details',
         count(*)::text || ':' || coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-')
    FROM (SELECT x.* FROM public.transfer_request_details x
          WHERE x.request_id IN (SELECT id FROM b1_scope)) t
  UNION ALL
  SELECT 'enrollment_suspension_details',
         count(*)::text || ':' || coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-')
    FROM (SELECT x.* FROM public.enrollment_suspension_details x
          WHERE x.request_id IN (SELECT id FROM b1_scope)) t
  UNION ALL
  SELECT 'absence_excuse_details',
         count(*)::text || ':' || coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-')
    FROM (SELECT x.* FROM public.absence_excuse_details x
          WHERE x.request_id IN (SELECT id FROM b1_scope)) t
  UNION ALL
  SELECT 'extra_chance_details',
         count(*)::text || ':' || coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-')
    FROM (SELECT x.* FROM public.extra_chance_details x
          WHERE x.request_id IN (SELECT id FROM b1_scope)) t
  UNION ALL
  SELECT 'file_withdrawal_details',
         count(*)::text || ':' || coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-')
    FROM (SELECT x.* FROM public.file_withdrawal_details x
          WHERE x.request_id IN (SELECT id FROM b1_scope)) t
  UNION ALL
  -- ---- academic-effect tables the apply_* functions can write ------------
  SELECT 'student_excused_absences',
         count(*)::text || ':' || coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-')
    FROM (SELECT x.* FROM public.student_excused_absences x) t
  UNION ALL
  SELECT 'student_extra_chances',
         count(*)::text || ':' || coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-')
    FROM (SELECT x.* FROM public.student_extra_chances x) t
  UNION ALL
  SELECT 'student_academic_status',
         count(*)::text || ':' || coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-')
    FROM (SELECT x.* FROM public.student_academic_status x) t
  UNION ALL
  SELECT 'student_enrollments',
         count(*)::text || ':' || coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-')
    FROM (SELECT x.* FROM public.student_enrollments x) t
  UNION ALL
  -- ---- notification / audit logs (count + newest-500 full content) -------
  SELECT 'notifications_count',
         count(*)::text || ':-' FROM public.notifications
  UNION ALL
  SELECT 'notifications_recent',
         count(*)::text || ':' || coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-')
    FROM (SELECT n.* FROM public.notifications n
          ORDER BY n.created_at DESC, n.id DESC LIMIT 500) t
  UNION ALL
  SELECT 'audit_logs_count',
         count(*)::text || ':-' FROM public.audit_logs
  UNION ALL
  SELECT 'audit_logs_recent',
         count(*)::text || ':' || coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-')
    FROM (SELECT l.* FROM public.audit_logs l
          ORDER BY l.created_at DESC, l.id DESC LIMIT 500) t
  UNION ALL
  -- ---- service visibility (must stay student_visible = false) ------------
  SELECT 'b1_service_visibility',
         count(*)::text || ':' || coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-')
    FROM (SELECT rt.code, rt.student_visible, rt.is_active
          FROM public.request_types rt
          WHERE rt.code IN ('enrollment_suspension','excused_absence',
                            'department_transfer','final_chance','file_withdrawal')) t
  UNION ALL
  -- ---- protected records --------------------------------------------------
  SELECT 'protected_enrollment_certificate_requests',
         count(*)::text || ':' || coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-')
    FROM (SELECT r.* FROM public.student_requests r
          WHERE r.request_number IN ('SR-20260713-2DE64041','SR-20260715-FEDCB3E1',
                                     'SR-20260716-26BAD4C8')) t
  UNION ALL
  -- ---- production migration history --------------------------------------
  SELECT 'schema_migrations',
         count(*)::text || ':' || coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-')
    FROM (SELECT m.* FROM supabase_migrations.schema_migrations m) t
) s
)
-- END_FINGERPRINT_EXPR
AS b1_fingerprint;
