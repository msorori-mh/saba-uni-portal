-- ============================================================================
-- PORTAL-B1-PR310 Definitive Operator Architecture — LONGRUN-14
-- Canonical fixture: Fixture-13 active-step direct assignees
--
-- The 267 negative matrix includes illegal-action cases against the 17 ACTIVE
-- non-payment Fixture-13 runtime steps. The B1 authorization contract requires
-- exactly one direct assignee slot populated on each active atomic step before
-- it probes the configured action_type. This file binds those 17 steps to the
-- singular request_processing_assignment created in 08-assignment-prestate.sql.
--
-- The two active payment_confirmation steps intentionally remain WITHOUT a
-- direct assignee so that the specialized payment RPC exercises the
-- EXACTLY_ONE_DIRECT_PAYMENT_ASSIGNEE_REQUIRED denial path.
--
-- No production data is touched. These are TEST_ONLY fixture rows.
-- ============================================================================
\set ON_ERROR_STOP on

-- Runtime mutation boundary guard requires the fixture-init flag.
SELECT set_config('b1.atomic_init', '1', false);

WITH mapping(step_id, assignment_id) AS (
  VALUES
    ('f1300001-0000-4000-8000-000001000002'::uuid, 'cc000009-0000-4000-8000-000000000009'::uuid),
    ('f1300001-0000-4000-8000-000002000003'::uuid, 'cc000010-0000-4000-8000-000000000010'::uuid),
    ('f1300001-0000-4000-8000-000003000004'::uuid, 'cc000004-0000-4000-8000-000000000004'::uuid),
    ('f1300001-0000-4000-8000-000005000006'::uuid, 'cc000003-0000-4000-8000-000000000003'::uuid),
    ('f1300001-0000-4000-8000-000006000002'::uuid, 'cc000002-0000-4000-8000-000000000002'::uuid),
    ('f1300001-0000-4000-8000-000007000003'::uuid, 'cc000003-0000-4000-8000-000000000003'::uuid),
    ('f1300001-0000-4000-8000-000008000002'::uuid, 'cc000002-0000-4000-8000-000000000002'::uuid),
    ('f1300001-0000-4000-8000-000009000003'::uuid, 'cc000001-0000-4000-8000-000000000001'::uuid),
    ('f1300001-0000-4000-8000-000010000002'::uuid, 'cc000006-0000-4000-8000-000000000006'::uuid),
    ('f1300001-0000-4000-8000-000011000003'::uuid, 'cc000007-0000-4000-8000-000000000007'::uuid),
    ('f1300001-0000-4000-8000-000012000004'::uuid, 'cc000002-0000-4000-8000-000000000002'::uuid),
    ('f1300001-0000-4000-8000-000013000005'::uuid, 'cc000005-0000-4000-8000-000000000005'::uuid),
    ('f1300001-0000-4000-8000-000014000006'::uuid, 'cc000003-0000-4000-8000-000000000003'::uuid),
    ('f1300001-0000-4000-8000-000015000007'::uuid, 'cc000008-0000-4000-8000-000000000008'::uuid),
    ('f1300001-0000-4000-8000-000016000002'::uuid, 'cc000002-0000-4000-8000-000000000002'::uuid),
    ('f1300001-0000-4000-8000-000017000003'::uuid, 'cc000004-0000-4000-8000-000000000004'::uuid),
    ('f1300001-0000-4000-8000-000019000005'::uuid, 'cc000003-0000-4000-8000-000000000003'::uuid)
),
assignees AS (
  SELECT
    m.step_id,
    a.assignment_type,
    a.staff_profile_id,
    a.faculty_profile_id,
    a.position_assignment_id
  FROM mapping m
  JOIN public.request_processing_assignments a ON a.id = m.assignment_id
)
UPDATE public.student_request_workflow_steps s
   SET assigned_user_id = NULL,
       assigned_staff_profile_id = CASE WHEN a.assignment_type = 'staff_profile' THEN a.staff_profile_id END,
       assigned_faculty_profile_id = CASE WHEN a.assignment_type = 'faculty_profile' THEN a.faculty_profile_id END,
       assigned_position_assignment_id = CASE WHEN a.assignment_type = 'position_assignment' THEN a.position_assignment_id END
  FROM assignees a
 WHERE s.id = a.step_id
   AND s.status = 'active';

-- Payment steps deliberately have no direct assignee so the specialized payment
-- RPC denies with EXACTLY_ONE_DIRECT_PAYMENT_ASSIGNEE_REQUIRED.
UPDATE public.student_request_workflow_steps s
   SET assigned_user_id = NULL,
       assigned_staff_profile_id = NULL,
       assigned_faculty_profile_id = NULL,
       assigned_position_assignment_id = NULL
  FROM public.student_requests r
 WHERE s.student_request_id = r.id
   AND r.request_number LIKE 'SR-20260801-13%'
   AND s.step_key = 'payment_confirmation'
   AND s.status = 'active';

DO $$ BEGIN
  RAISE NOTICE 'FIXTURE13_DIRECT_ASSIGNEES_PASS: active steps bound to principals';
END $$;
