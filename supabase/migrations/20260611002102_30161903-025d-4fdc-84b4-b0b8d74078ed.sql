
ALTER TABLE public.roles_catalog
  ADD COLUMN IF NOT EXISTS app_role_mapping app_role;

UPDATE public.roles_catalog SET app_role_mapping = v.r::app_role
FROM (VALUES
  ('system_admin','system_admin'),
  ('admin','admin'),
  ('dean','dean'),
  ('vice_dean','dean'),
  ('department_head','department_head'),
  ('faculty_member','faculty_member'),
  ('registrar_director','registrar'),
  ('registrar_officer','registrar'),
  ('student_affairs_director','student_affairs'),
  ('student_affairs_officer','student_affairs'),
  ('finance_director','finance_officer'),
  ('finance_officer','finance_officer'),
  ('academic_affairs_director','dean'),
  ('academic_affairs_officer','registrar'),
  ('graduates_director','registrar'),
  ('graduates_officer','registrar'),
  ('quality_director','viewer'),
  ('quality_officer','viewer')
) AS v(code, r)
WHERE public.roles_catalog.code = v.code;
