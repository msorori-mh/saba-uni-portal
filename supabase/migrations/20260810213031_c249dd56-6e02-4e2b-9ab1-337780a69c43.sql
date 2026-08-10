UPDATE public.extra_chance_details
SET academic_year_id='a2a2a2a2-2222-4222-8222-222222222222',
    semester_id='2e583958-eaa1-440b-a8a0-8403dafd76c6',
    updated_at=now()
WHERE request_id='f1300000-0000-4000-8000-000000000018'
  AND chance_applied_at IS NULL
  AND notes LIKE 'TEST_ONLY%';