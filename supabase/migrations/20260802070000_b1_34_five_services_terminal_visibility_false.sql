-- ============================================================================
-- PORTAL-B1-FIVE-SERVICES-TERMINAL-VISIBILITY-MINIMAL-FIX-34
-- Forward-only, collision-free after source head 20260801021541.
--
-- Purpose: after ordered migration replay, force student_visible=false for
-- exactly the five B1 request types that existing migrations terminally leave
-- visible (last unconditional writer: 20260727115111).
--
-- Scope:
--   * UPDATE only student_visible and updated_at
--   * target exactly the five codes below
--   * require exactly five matching rows; fail closed on missing/duplicate
--   * idempotent (re-apply updates the same five rows to false)
--   * atomic (single DO block; no EXCEPTION handler; runner transaction)
--   * does NOT touch the certificate request type or unrelated request types
--   * does NOT activate service visibility / workflows / is_active
-- ============================================================================

DO $b1_34_terminal_visibility$
DECLARE
  k_codes constant text[] := ARRAY[
    'enrollment_suspension',
    'excused_absence',
    'department_transfer',
    'final_chance',
    'file_withdrawal'
  ];
  v_row_count integer;
  v_distinct_count integer;
  v_missing_count integer;
  v_updated_count integer;
BEGIN
  SELECT count(*), count(DISTINCT rt.code)
    INTO v_row_count, v_distinct_count
  FROM public.request_types AS rt
  WHERE rt.code IN (
    'enrollment_suspension',
    'excused_absence',
    'department_transfer',
    'final_chance',
    'file_withdrawal'
  );

  IF v_row_count IS DISTINCT FROM 5 OR v_distinct_count IS DISTINCT FROM 5 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'B1_34_TARGET_COUNT_MISMATCH',
      DETAIL = format('expected_rows=5 actual_rows=%s actual_distinct=%s',
                      v_row_count, v_distinct_count);
  END IF;

  SELECT count(*) INTO v_missing_count
  FROM unnest(k_codes) AS c(code)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.request_types AS rt WHERE rt.code = c.code
  );

  IF v_missing_count IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'B1_34_MISSING_TARGET_CODE',
      DETAIL = format('missing=%s', v_missing_count);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.request_types AS rt
    WHERE rt.code IN (
      'enrollment_suspension',
      'excused_absence',
      'department_transfer',
      'final_chance',
      'file_withdrawal'
    )
    GROUP BY rt.code
    HAVING count(*) <> 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'B1_34_DUPLICATE_TARGET_CODE';
  END IF;

  UPDATE public.request_types AS rt
     SET student_visible = false,
         updated_at = now()
   WHERE rt.code IN (
     'enrollment_suspension',
     'excused_absence',
     'department_transfer',
     'final_chance',
     'file_withdrawal'
   );

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count IS DISTINCT FROM 5 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'B1_34_UPDATE_COUNT_MISMATCH',
      DETAIL = format('expected=5 actual=%s', v_updated_count);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.request_types AS rt
    WHERE rt.code IN (
      'enrollment_suspension',
      'excused_absence',
      'department_transfer',
      'final_chance',
      'file_withdrawal'
    )
      AND rt.student_visible IS DISTINCT FROM false
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'B1_34_POSTCHECK_VISIBLE_REMAINS';
  END IF;
END
$b1_34_terminal_visibility$;
