ALTER TYPE public.academic_council_meeting_status
  ADD VALUE IF NOT EXISTS 'minutes_review' AFTER 'minutes_draft';