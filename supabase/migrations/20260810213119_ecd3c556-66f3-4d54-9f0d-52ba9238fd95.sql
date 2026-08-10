UPDATE public.extra_chance_details
SET academic_year_id='6b297abe-b4d5-47f0-a24e-ea25c7c691f6',
    semester_id='d4dc2d92-00ce-4ea0-a7ed-da06d546512f',
    updated_at=now()
WHERE request_id='f1300000-0000-4000-8000-000000000018'
  AND chance_applied_at IS NULL
  AND notes LIKE 'TEST_ONLY%';