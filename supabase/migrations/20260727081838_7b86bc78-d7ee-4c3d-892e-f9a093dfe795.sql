UPDATE public.request_types
SET student_visible = false,
    updated_at = now()
WHERE code IN (
  'enrollment_suspension',
  'excused_absence',
  'file_withdrawal',
  'department_transfer',
  'final_chance'
);