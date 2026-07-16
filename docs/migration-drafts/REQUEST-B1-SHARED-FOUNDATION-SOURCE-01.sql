-- REQUEST-B1-SHARED-FOUNDATION-SOURCE-01
-- DRAFT ONLY — DO NOT APPLY. SOURCE CONTRACT, NOT A MIGRATION.
-- No production IDs, fee_type.code, amount, currency, gateway, users, or assignments.

-- Proposed atomic boundary (signature intentionally documentary until schema review):
-- submit_student_request_with_details(request_id, canonical_code, form_data, expected_version)
--   1. require auth.uid() and resolve the caller's student profile;
--   2. lock an owned draft/returned request and resolve canonical to stored DB code;
--   3. validate eligibility, service window, trusted reference IDs and attachments;
--   4. call the service validator and persist detail rows in this transaction;
--   5. initialize workflow only after every validation and detail write succeeds;
--   6. rollback request, details and runtime rows on any exception;
--   7. support idempotent submit/resubmit without duplicate runtime rows.

-- Proposed actor vocabulary extension:
-- is_valid_actor_request_action additionally recognizes clear and apply_decision.
-- Runtime must require p_action = configured action_type and map only:
-- review->reviewed, approve->approved, clear->cleared,
-- apply_decision->applied, archive->archived.
-- No generic fallback and no admin/registrar/dean bypass.

-- Department transfer direct assignment:
-- derive source department from the trusted student profile and target department
-- from validated transfer details. Resolve exactly one active department_head
-- processing assignment with a non-null faculty profile for each department and
-- set assigned_faculty_profile_id on its matching runtime step. Missing/ambiguous/
-- cross-department heads abort initialization; never fall back to the role pool.

-- Paid external/manual services remain activation-blocked until reviewed
-- fee_type.code values exist. Do not store portal amount/currency/gateway data.
-- final_chance is canonical in source while extra_chance remains the stored alias.
-- chance_type needs NEEDS_USER_DECISION_FOR_ACADEMIC_MAPPING before any constraint
-- change; this draft performs no implicit conversion or data rewrite.
