UPDATE public.request_types
SET student_visible = true, updated_at = now()
WHERE code IN ('enrollment_suspension','excused_absence','department_transfer','final_chance','file_withdrawal');