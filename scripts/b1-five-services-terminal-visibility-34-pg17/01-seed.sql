-- Seed five B1 services + enrollment_certificate + unrelated controls.
INSERT INTO public.request_types (code, name_ar, is_active, student_visible, marker) VALUES
  ('enrollment_suspension', 'وقف قيد', true, false, 'five'),
  ('excused_absence', 'غياب بعذر', true, false, 'five'),
  ('department_transfer', 'تحويل', true, false, 'five'),
  ('final_chance', 'فرصة أخيرة', true, false, 'five'),
  ('file_withdrawal', 'سحب ملف', true, false, 'five'),
  ('enrollment_certificate', 'شهادة قيد', true, true, 'ec'),
  ('grade_appeal', 'تظلم', true, true, 'unrelated'),
  ('official_transcript', 'سجل رسمي', false, false, 'unrelated');
