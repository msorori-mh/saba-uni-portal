-- ============================================================================
-- PORTAL-B1-NEGATIVE-RPC-MATRIX-FINAL-EXECUTION-PACKAGE-REMEDIATION-05
-- G7 — COMPLETE CONTENT FINGERPRINT
--
-- Contract: count + deterministic FULL-ROW-CONTENT hash for every relation in
-- the transitive mutation set of the two RPCs under test
-- (act_on_b1_student_request_step_atomic,
--  record_external_university_payment_confirmation),
-- plus every protected / attested surface.
--
-- G7 hard rules:
--   * NO `LIMIT`, NO "newest N rows" window anywhere. notifications and
--     audit_logs are hashed in FULL.
--   * NO non-semantic column exclusion: every relation hashes t::text.
--   * Deterministic ordering: rows are aggregated ORDER BY t::text, which is a
--     total order over the full row image and therefore stable regardless of
--     physical order or primary-key type.
--   * public.student_profiles is included explicitly: the department-transfer
--     effect writes it.
--
-- READ-ONLY. No DDL, no writes, no role changes, no external calls.
--
-- The expression between BEGIN_FINGERPRINT_EXPR / END_FINGERPRINT_EXPR is the
-- SINGLE canonical contract. render-negative-cases.ts inlines this exact text
-- as the in-transaction before/after fingerprint, as the post-run outside
-- fingerprint and as the authoritative-baseline comparison, so all four are
-- byte-identical.
-- ============================================================================
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

SELECT
-- BEGIN_FINGERPRINT_EXPR
(
WITH b1_scope AS (
  SELECT r.id
  FROM public.student_requests r
  WHERE r.request_number IN (
    'SR-20260727-42393846','SR-20260727-50BEDCE2','SR-20260727-3C550070',
    'SR-20260727-88D885F0','SR-20260727-695EC35B',
    'SR-20260713-2DE64041','SR-20260715-FEDCB3E1','SR-20260716-26BAD4C8')
)
SELECT md5(string_agg(rel || '=' || h, '|' ORDER BY rel))
FROM (
  -- ---- request core (five TEST_ONLY + three protected certificates) -------
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
  -- ---- assignment / direct-assignment surface (global, small) -------------
  SELECT 'request_processing_assignments',
         count(*)::text || ':' || coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-')
    FROM (SELECT a.* FROM public.request_processing_assignments a) t
  UNION ALL
  -- ---- attachments --------------------------------------------------------
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
  -- ---- money surfaces (global; must never gain a row) ---------------------
  SELECT 'student_request_fee_assessments',
         count(*)::text || ':' || coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-')
    FROM (SELECT f.* FROM public.student_request_fee_assessments f) t
  UNION ALL
  SELECT 'payment_receipts',
         count(*)::text || ':' || coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-')
    FROM (SELECT p.* FROM public.payment_receipts p) t
  UNION ALL
  -- ---- documents ----------------------------------------------------------
  SELECT 'official_documents',
         count(*)::text || ':' || coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-')
    FROM (SELECT d.* FROM public.official_documents d) t
  UNION ALL
  SELECT 'enrollment_certificate_document_details',
         count(*)::text || ':' || coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-')
    FROM (SELECT c.* FROM public.enrollment_certificate_document_details c) t
  UNION ALL
  -- ---- per-service detail tables -----------------------------------------
  SELECT 'transfer_request_details',
         count(*)::text || ':' || coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-')
    FROM (SELECT x.* FROM public.transfer_request_details x) t
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
  -- ---- academic / clearance effect tables --------------------------------
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
  -- ---- department transfer effect target ---------------------------------
  SELECT 'student_profiles',
         count(*)::text || ':' || coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-')
    FROM (SELECT x.* FROM public.student_profiles x) t
  UNION ALL
  -- ---- notification / audit logs: FULL CONTENT, no LIMIT -----------------
  SELECT 'notifications',
         count(*)::text || ':' || coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-')
    FROM (SELECT n.* FROM public.notifications n) t
  UNION ALL
  SELECT 'audit_logs',
         count(*)::text || ':' || coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-')
    FROM (SELECT l.* FROM public.audit_logs l) t
  UNION ALL
  -- ---- service visibility (must stay student_visible = false) ------------
  SELECT 'b1_service_visibility',
         count(*)::text || ':' || coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-')
    FROM (SELECT rt.code, rt.student_visible, rt.is_active
          FROM public.request_types rt
          WHERE rt.code IN ('enrollment_suspension','excused_absence',
                            'department_transfer','final_chance','file_withdrawal')) t
  UNION ALL
  -- ---- production migration history --------------------------------------
  SELECT 'schema_migrations',
         count(*)::text || ':' || coalesce(md5(string_agg(t::text,'|' ORDER BY t::text)),'-')
    FROM (SELECT m.* FROM supabase_migrations.schema_migrations m) t
) s
)
-- END_FINGERPRINT_EXPR
AS b1_fingerprint;
