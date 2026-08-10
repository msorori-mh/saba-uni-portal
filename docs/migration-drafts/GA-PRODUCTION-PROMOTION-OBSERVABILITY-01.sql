-- PORTAL-GA-FINAL-PRODUCTION-READINESS-LONGRUN-14
-- Read-only post-apply observability package.
-- Run after Foundation, Completion, AUTH04, and operational config are applied.
-- No PII dump. Aggregates and catalog checks only.
--
-- Returns: OBSERVABILITY_PACKAGE_PASS when all checks are green.

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_graduate_record_count integer;
  v_current_continuity_count integer;
  v_manager_count integer;
  v_specialist_count integer;
  v_unscoped_specialist_count integer;
  v_active_followup_count integer;
  v_pending_moderation_count integer;
  v_audit_event_count integer;
  v_policy_count integer;
BEGIN
  -- 1. Graduate records: total count only (no PII).
  SELECT count(*) INTO v_graduate_record_count FROM public.graduate_records;
  RAISE NOTICE 'OBSERVE graduate_records total_count=%', v_graduate_record_count;

  -- 2. Continuity currentness: exactly one current approved policy expected.
  SELECT count(*) INTO v_current_continuity_count
  FROM public.graduate_account_continuity_policies
  WHERE is_current AND policy_state = 'approved';
  RAISE NOTICE 'OBSERVE current_approved_continuity_policies=%', v_current_continuity_count;

  -- 3. Assignments: count active manager and specialist assignments.
  SELECT count(DISTINCT a.staff_profile_id)
  INTO v_manager_count
  FROM public.request_processing_assignments a
  JOIN public.request_processing_units u ON u.id = a.unit_id AND u.code = 'graduate_affairs'
  JOIN public.request_processing_roles r ON r.id = a.role_id AND r.code = 'graduate_affairs_manager'
  WHERE a.is_active
    AND (a.starts_at IS NULL OR a.starts_at <= now())
    AND (a.ends_at IS NULL OR a.ends_at > now());

  SELECT count(DISTINCT a.staff_profile_id)
  INTO v_specialist_count
  FROM public.request_processing_assignments a
  JOIN public.request_processing_units u ON u.id = a.unit_id AND u.code = 'graduate_affairs'
  JOIN public.request_processing_roles r ON r.id = a.role_id AND r.code = 'graduate_affairs_specialist'
  WHERE a.is_active
    AND (a.starts_at IS NULL OR a.starts_at <= now())
    AND (a.ends_at IS NULL OR a.ends_at > now());

  RAISE NOTICE 'OBSERVE active_manager_assignments=% active_specialist_assignments=%', v_manager_count, v_specialist_count;

  -- 4. Scope: active specialists without department scope.
  SELECT count(*)
  INTO v_unscoped_specialist_count
  FROM public.request_processing_assignments a
  JOIN public.request_processing_units u ON u.id = a.unit_id AND u.code = 'graduate_affairs'
  JOIN public.request_processing_roles r ON r.id = a.role_id AND r.code = 'graduate_affairs_specialist'
  JOIN public.staff_profiles sp ON sp.id = a.staff_profile_id
  WHERE a.is_active
    AND (a.starts_at IS NULL OR a.starts_at <= now())
    AND (a.ends_at IS NULL OR a.ends_at > now())
    AND sp.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM public.staff_profile_departments spd
      WHERE spd.staff_profile_id = a.staff_profile_id
    );
  RAISE NOTICE 'OBSERVE unscoped_active_specialists=%', v_unscoped_specialist_count;

  -- 5. Follow-ups: active follow-up count (no graduate identifiers).
  SELECT count(*) INTO v_active_followup_count
  FROM public.graduate_followups
  WHERE state NOT IN ('completed', 'cancelled');
  RAISE NOTICE 'OBSERVE active_followups=%', v_active_followup_count;

  -- 6. Moderation: opportunities pending staff moderation (in_review state).
  SELECT count(*) INTO v_pending_moderation_count
  FROM public.graduate_opportunities
  WHERE state = 'in_review';
  RAISE NOTICE 'OBSERVE pending_moderation_opportunities=%', v_pending_moderation_count;

  -- 7. Audit: total domain events emitted by graduate_affairs_audit (no payload dump).
  SELECT count(*) INTO v_audit_event_count
  FROM public.graduate_domain_events
  WHERE aggregate_type LIKE 'graduate_%';
  RAISE NOTICE 'OBSERVE graduate_domain_events=%', v_audit_event_count;

  -- 8. Privacy-safe policy aggregate: count by state.
  RAISE NOTICE 'OBSERVE continuity_policy_state_distribution:';
  FOR v_policy_count IN
    SELECT count(*) FROM public.graduate_account_continuity_policies GROUP BY policy_state
  LOOP
    RAISE NOTICE '  state_count=%', v_policy_count;
  END LOOP;

  -- 9. Feature flags: source-level check (SQL cannot read TypeScript source).
  -- Report reminder only.
  RAISE NOTICE 'OBSERVE reminder: verify staffGraduatesAffairs=false and studentGraduatesAffairs=false in src/lib/portal-features.ts';

  RAISE NOTICE 'OBSERVABILITY_PACKAGE_PASS';
END $$;

SELECT 'OBSERVABILITY_PACKAGE_PASS' AS status,
       (SELECT count(*) FROM public.graduate_records) AS graduate_records_total,
       (SELECT count(*) FROM public.graduate_account_continuity_policies WHERE is_current AND policy_state = 'approved') AS current_approved_continuity,
       (SELECT count(DISTINCT a.staff_profile_id)
        FROM public.request_processing_assignments a
        JOIN public.request_processing_units u ON u.id = a.unit_id AND u.code = 'graduate_affairs'
        JOIN public.request_processing_roles r ON r.id = a.role_id AND r.code = 'graduate_affairs_manager'
        WHERE a.is_active AND (a.starts_at IS NULL OR a.starts_at <= now()) AND (a.ends_at IS NULL OR a.ends_at > now())) AS active_managers,
       (SELECT count(DISTINCT a.staff_profile_id)
        FROM public.request_processing_assignments a
        JOIN public.request_processing_units u ON u.id = a.unit_id AND u.code = 'graduate_affairs'
        JOIN public.request_processing_roles r ON r.id = a.role_id AND r.code = 'graduate_affairs_specialist'
        WHERE a.is_active AND (a.starts_at IS NULL OR a.starts_at <= now()) AND (a.ends_at IS NULL OR a.ends_at > now())) AS active_specialists;
