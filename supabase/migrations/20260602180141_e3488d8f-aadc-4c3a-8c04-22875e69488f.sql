-- Fix duplicate is_current=true semesters; keep the one that actually has course_offerings
DO $$
DECLARE
  v_keep uuid;
  v_demoted jsonb;
BEGIN
  -- Pick semester with most course_offerings, tiebreaker latest created
  SELECT s.id INTO v_keep
  FROM semesters s
  LEFT JOIN course_offerings co ON co.semester_id = s.id
  WHERE s.is_current = true
  GROUP BY s.id, s.created_at
  ORDER BY count(co.id) DESC, s.created_at DESC
  LIMIT 1;

  SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name))
    INTO v_demoted
  FROM semesters
  WHERE is_current = true AND id <> v_keep;

  UPDATE semesters SET is_current = false
  WHERE is_current = true AND id <> v_keep;

  INSERT INTO audit_logs (entity_type, entity_id, action_type, old_values, new_values, notes)
  VALUES (
    'academic_operation',
    v_keep,
    'semester_current_conflict_fixed',
    jsonb_build_object('demoted_semesters', COALESCE(v_demoted, '[]'::jsonb)),
    jsonb_build_object('kept_semester_id', v_keep),
    'QA-02.1: resolved duplicate is_current=true semesters'
  );
END $$;