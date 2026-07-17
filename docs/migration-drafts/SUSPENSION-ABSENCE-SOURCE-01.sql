-- SUSPENSION-ABSENCE-SOURCE-01 (DRAFT ONLY; DO NOT APPLY)
-- Source contract only. It performs no production write and invents no assignment.

-- validate_enrollment_suspension_request must run before workflow creation and:
-- 1) bind auth.uid() to the request owner and require an active student profile;
-- 2) verify the requested year and semester relationship server-side;
-- 3) reject past periods and overlapping approved suspensions;
-- 4) require duration in (one_semester, full_year) and terms acknowledgment;
-- 5) defer the maximum-prior-suspensions policy until its explicit decision.

-- validate_excused_absence_request must run before workflow creation and:
-- 1) bind auth.uid() to the request owner and require an active student profile;
-- 2) require an open excused_absence service window covering absence_date;
-- 3) verify course_section_id belongs to the caller's active-term enrollment;
-- 4) require reason_type in (medical, family_emergency, official, other);
-- 5) require at least one immutable secure attachment bound to this owner/request;
-- 6) reject another accepted request for (course_section_id, absence_date).

-- Workflow creation must resolve one existing direct assignee for every exact
-- processing_unit/processing_role pair. Missing or ambiguous assignments abort.
-- can_current_user_act_on_step and the action RPC must require auth.uid() to map
-- to that direct assignee; admin, registrar, dean, and same-role users get no bypass.

-- Completion is conditional: suspension requires the academic status operation;
-- absence requires record_applied_at for every detail row. Neither service creates
-- fee/payment rows, amounts, currencies, documents, PDFs, signatures, or archives.

-- Executable RPC/workflow SQL is intentionally deferred because migration apply,
-- service-window activation, and maximum-prior-suspension policy are not authorized.
