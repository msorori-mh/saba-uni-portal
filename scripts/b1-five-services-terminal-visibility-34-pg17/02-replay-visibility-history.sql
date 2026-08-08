-- Ordered replay of historical migrations that mutate student_visible for the five.
-- Source files (verbatim UPDATE bodies):
--   20260727071910 → true
--   20260727081838 → false
--   20260727114316 → false WHERE true
--   20260727114619 → true WHERE false
--   20260727115111 → true   << TERMINAL TRUE before B1-34

UPDATE public.request_types
SET student_visible = true, updated_at = now()
WHERE code IN ('enrollment_suspension','excused_absence','department_transfer','final_chance','file_withdrawal');

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

UPDATE public.request_types
SET student_visible = false,
    updated_at = now()
WHERE code IN (
  'enrollment_suspension',
  'excused_absence',
  'department_transfer',
  'final_chance',
  'file_withdrawal'
)
AND student_visible = true;

UPDATE public.request_types
SET student_visible = true,
    updated_at = now()
WHERE code IN (
  'enrollment_suspension',
  'excused_absence',
  'department_transfer',
  'final_chance',
  'file_withdrawal'
)
AND student_visible = false;

UPDATE public.request_types
SET student_visible = true, updated_at = now()
WHERE code IN ('enrollment_suspension','excused_absence','department_transfer','final_chance','file_withdrawal');

DO $assert_terminal_true$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n
  FROM public.request_types
  WHERE code IN (
      'enrollment_suspension','excused_absence','department_transfer',
      'final_chance','file_withdrawal'
    )
    AND student_visible IS TRUE;
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'REPRO_FAIL: expected terminal true for five, got %', v_n;
  END IF;
END
$assert_terminal_true$;
