-- LEGACY-PRODUCTION-DATA-SEED-01
-- Production-equivalent legacy data for Academic Councils reconciliation testing.
-- 4 councils, 11 active memberships (chair/secretary/member), 2 topics.
-- Deterministic UUIDs so preservation tests can assert exact identity.
-- Applied AFTER the full pre-C0 predecessor chain (including attachments/bucket).

BEGIN;

INSERT INTO public.academic_councils (
  id, name, name_en, council_type, department_id, description, settings, is_active, created_by, updated_by
) VALUES
  (
    'c1000000-0000-4000-8000-000000000001',
    'مجلس الكلية',
    'College Academic Council',
    'college'::public.academic_council_type,
    NULL,
    'المجلس الأكاديمي للكلية — بيانات إنتاجية محاكاة',
    '{"legacy":true,"source":"reconciliation-test"}'::jsonb,
    true,
    'a1000000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000002'
  ),
  (
    'c1000000-0000-4000-8000-000000000002',
    'مجلس قسم علوم الحاسب',
    'Computer Science Department Council',
    'department'::public.academic_council_type,
    'd1000000-0000-0000-0000-000000000001',
    'المجلس الأكاديمي لقسم علوم الحاسب',
    '{"legacy":true,"source":"reconciliation-test"}'::jsonb,
    true,
    'a1000000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000002'
  ),
  (
    'c1000000-0000-4000-8000-000000000003',
    'مجلس قسم الرياضيات',
    'Mathematics Department Council',
    'department'::public.academic_council_type,
    'd1000000-0000-0000-0000-000000000001',
    'المجلس الأكاديمي لقسم الرياضيات',
    '{"legacy":true,"source":"reconciliation-test"}'::jsonb,
    true,
    'a1000000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000002'
  ),
  (
    'c1000000-0000-4000-8000-000000000004',
    'مجلس قسم الفيزياء',
    'Physics Department Council',
    'department'::public.academic_council_type,
    'd1000000-0000-0000-0000-000000000001',
    'المجلس الأكاديمي لقسم الفيزياء',
    '{"legacy":true,"source":"reconciliation-test"}'::jsonb,
    true,
    'a1000000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000002'
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  name_en = EXCLUDED.name_en,
  council_type = EXCLUDED.council_type,
  department_id = EXCLUDED.department_id,
  description = EXCLUDED.description,
  settings = EXCLUDED.settings,
  is_active = EXCLUDED.is_active,
  updated_by = EXCLUDED.updated_by,
  updated_at = now();

INSERT INTO public.academic_council_members (
  id, council_id, user_id, member_role, is_active, active_from, active_to, notes, created_by, updated_by
) VALUES
  -- Council 1 (college): chair, secretary, 2 members
  ('b1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'a1000000-0000-0000-0000-000000000011', 'chair'::public.academic_council_member_role, true, '2024-01-01', NULL, 'College chair', 'a1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002'),
  ('b1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001', 'a1000000-0000-0000-0000-000000000013', 'secretary'::public.academic_council_member_role, true, '2024-01-01', NULL, 'College secretary', 'a1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002'),
  ('b1000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000001', 'a1000000-0000-0000-0000-000000000014', 'member'::public.academic_council_member_role, true, '2024-01-01', NULL, 'College member A', 'a1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002'),
  ('b1000000-0000-4000-8000-000000000004', 'c1000000-0000-4000-8000-000000000001', 'a1000000-0000-0000-0000-000000000018', 'member'::public.academic_council_member_role, true, '2024-01-01', NULL, 'College member B', 'a1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002'),
  -- Council 2 (CS dept): chair, secretary, 1 member
  ('b1000000-0000-4000-8000-000000000005', 'c1000000-0000-4000-8000-000000000002', 'a1000000-0000-0000-0000-000000000012', 'chair'::public.academic_council_member_role, true, '2024-01-01', NULL, 'CS chair', 'a1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002'),
  ('b1000000-0000-4000-8000-000000000006', 'c1000000-0000-4000-8000-000000000002', 'a1000000-0000-0000-0000-000000000013', 'secretary'::public.academic_council_member_role, true, '2024-01-01', NULL, 'CS secretary', 'a1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002'),
  ('b1000000-0000-4000-8000-000000000007', 'c1000000-0000-4000-8000-000000000002', 'a1000000-0000-0000-0000-000000000014', 'member'::public.academic_council_member_role, true, '2024-01-01', NULL, 'CS member', 'a1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002'),
  -- Council 3 (Math dept): chair, 1 member
  ('b1000000-0000-4000-8000-000000000008', 'c1000000-0000-4000-8000-000000000003', 'a1000000-0000-0000-0000-000000000011', 'chair'::public.academic_council_member_role, true, '2024-01-01', NULL, 'Math chair', 'a1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002'),
  ('b1000000-0000-4000-8000-000000000009', 'c1000000-0000-4000-8000-000000000003', 'a1000000-0000-0000-0000-000000000015', 'member'::public.academic_council_member_role, true, '2024-01-01', NULL, 'Math member', 'a1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002'),
  -- Council 4 (Physics dept): chair, 1 member
  ('b1000000-0000-4000-8000-00000000000a', 'c1000000-0000-4000-8000-000000000004', 'a1000000-0000-0000-0000-000000000012', 'chair'::public.academic_council_member_role, true, '2024-01-01', NULL, 'Physics chair', 'a1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002'),
  ('b1000000-0000-4000-8000-00000000000b', 'c1000000-0000-4000-8000-000000000004', 'a1000000-0000-0000-0000-000000000016', 'member'::public.academic_council_member_role, true, '2024-01-01', NULL, 'Physics member', 'a1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO UPDATE SET
  council_id = EXCLUDED.council_id,
  user_id = EXCLUDED.user_id,
  member_role = EXCLUDED.member_role,
  is_active = EXCLUDED.is_active,
  active_from = EXCLUDED.active_from,
  active_to = EXCLUDED.active_to,
  notes = EXCLUDED.notes,
  updated_by = EXCLUDED.updated_by,
  updated_at = now();

INSERT INTO public.academic_council_topics (
  id, council_id, meeting_id, title, body, category, status, submitted_by, reviewed_by, review_note, submitted_at, decided_at, created_at, updated_at
) VALUES
  (
    'd1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001',
    NULL,
    'موضوع قديم 1 — مناقشة الخطة الأكاديمية',
    'نص الموضوع الأول المقدم من عضو المجلس',
    'academic_planning',
    'submitted'::public.academic_council_topic_status,
    'a1000000-0000-0000-0000-000000000014',
    NULL,
    NULL,
    now() - interval '7 days',
    NULL,
    now() - interval '7 days',
    now() - interval '7 days'
  ),
  (
    'd1000000-0000-4000-8000-000000000002',
    'c1000000-0000-4000-8000-000000000002',
    NULL,
    'موضوع قديم 2 — مقترح تطوير المناهج',
    'نص الموضوع الثاني في حالة مسودة',
    'curriculum',
    'draft'::public.academic_council_topic_status,
    'a1000000-0000-0000-0000-000000000014',
    NULL,
    NULL,
    NULL,
    NULL,
    now() - interval '3 days',
    now() - interval '3 days'
  )
ON CONFLICT (id) DO UPDATE SET
  council_id = EXCLUDED.council_id,
  meeting_id = EXCLUDED.meeting_id,
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  category = EXCLUDED.category,
  status = EXCLUDED.status,
  submitted_by = EXCLUDED.submitted_by,
  reviewed_by = EXCLUDED.reviewed_by,
  review_note = EXCLUDED.review_note,
  submitted_at = EXCLUDED.submitted_at,
  decided_at = EXCLUDED.decided_at,
  updated_at = now();

COMMIT;

SELECT 'LEGACY_PRODUCTION_DATA_SEED_COMPLETE' AS status,
       (SELECT count(*) FROM public.academic_councils) AS councils,
       (SELECT count(*) FROM public.academic_council_members WHERE is_active = true AND (active_to IS NULL OR active_to > CURRENT_DATE)) AS active_members,
       (SELECT count(*) FROM public.academic_council_topics) AS topics;
