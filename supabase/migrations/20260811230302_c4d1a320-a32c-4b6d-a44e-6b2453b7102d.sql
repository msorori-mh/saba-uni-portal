CREATE OR REPLACE FUNCTION public.graduate_affairs_get_graduate_file(p_graduate_record_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED';
  END IF;
  IF NOT public.graduate_affairs_can_access_record(p_graduate_record_id) THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_ACCESS_DENIED';
  END IF;

  SELECT jsonb_build_object(
    'record', jsonb_build_object(
      'id', r.id,
      'record_state', r.record_state,
      'program_id', r.program_id,
      'department_id', r.department_id,
      'graduation_year', EXTRACT(YEAR FROM r.effective_graduation_date)::integer,
      'version', r.version),
    'profile', to_jsonb(p),
    'counts', jsonb_build_object(
      'employment_events', (SELECT count(*) FROM public.graduate_employment_events ee
                            WHERE ee.graduate_record_id = r.id),
      'consents', (SELECT count(*) FROM public.graduate_consents c
                   WHERE c.graduate_record_id = r.id),
      'followups', (SELECT count(*) FROM public.graduate_followups f
                    WHERE f.graduate_record_id = r.id)),
    'contact_points', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', cp.id,
        'channel_type', cp.channel_type,
        'purpose_code', cp.purpose_code,
        'is_verified', (cp.verified_at IS NOT NULL),
        'is_revoked', (cp.revoked_at IS NOT NULL))
        ORDER BY cp.created_at)
      FROM public.graduate_contact_points cp
      WHERE cp.graduate_record_id = r.id), '[]'::jsonb),
    'followups', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', f.id,
        'state', f.state,
        'assignee_user_id', f.assignee_user_id,
        'purpose_code', f.purpose_code,
        'next_action_at', f.next_action_at,
        'followup_type_id', f.followup_type_id,
        'type_label_ar', t.label_ar,
        'workflow_id', f.workflow_id,
        'workflow_version', w.version,
        'workflow_pinned_at', f.workflow_pinned_at,
        'workflow_pin_source', f.workflow_pin_source,
        'states', COALESCE(f.workflow_snapshot->'states', '[]'::jsonb),
        'transitions', COALESCE(f.workflow_snapshot->'transitions', '[]'::jsonb),
        'terminal_states', COALESCE(f.workflow_snapshot->'terminal_states', '[]'::jsonb),
        'require_outcome_on_complete',
          COALESCE((f.workflow_snapshot->>'require_outcome_on_complete')::boolean, true))
        ORDER BY f.created_at)
      FROM public.graduate_followups f
      LEFT JOIN public.graduate_followup_types t ON t.id = f.followup_type_id
      LEFT JOIN public.graduate_followup_workflows w ON w.id = f.workflow_id
      WHERE f.graduate_record_id = r.id), '[]'::jsonb)
  ) INTO v_result
  FROM public.graduate_records r
  LEFT JOIN public.graduate_profiles p ON p.graduate_record_id = r.id
  WHERE r.id = p_graduate_record_id;

  PERFORM public.graduate_affairs_audit(
    'graduate_file_staff_read', 'graduate_record', p_graduate_record_id,
    'staff_file_read', '{}'::jsonb);
  RETURN v_result;
END;
$function$;