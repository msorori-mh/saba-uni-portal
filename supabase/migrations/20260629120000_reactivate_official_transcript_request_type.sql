-- Phase D-02 closeout: enable official_transcript submissions for students.
-- Readiness guard (approved grades) remains enforced at approval/issuance time.

UPDATE public.request_types
SET is_active = true
WHERE code = 'official_transcript';
