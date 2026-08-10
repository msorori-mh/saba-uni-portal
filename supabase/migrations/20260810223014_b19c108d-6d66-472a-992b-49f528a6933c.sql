DO $$
DECLARE
  v_dept uuid := gen_random_uuid();
  v_council uuid := gen_random_uuid();
  v_pos uuid := gen_random_uuid();
  v_a1 uuid := gen_random_uuid();
  v_a2 uuid := gen_random_uuid();
  v_college uuid;
  v_u1 uuid;
  v_u2 uuid;
  v_cnt int;
BEGIN
  SELECT id INTO v_college FROM public.academic_councils WHERE council_type='college' AND is_active;

  SELECT fp.user_id INTO v_u1
  FROM public.faculty_profiles fp
  WHERE fp.user_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.academic_council_members m WHERE m.user_id = fp.user_id)
    AND NOT EXISTS (SELECT 1 FROM public.position_assignments pa WHERE pa.user_id = fp.user_id)
  ORDER BY fp.created_at LIMIT 1;

  SELECT fp.user_id INTO v_u2
  FROM public.faculty_profiles fp
  WHERE fp.user_id IS NOT NULL AND fp.user_id <> v_u1
    AND NOT EXISTS (SELECT 1 FROM public.academic_council_members m WHERE m.user_id = fp.user_id)
    AND NOT EXISTS (SELECT 1 FROM public.position_assignments pa WHERE pa.user_id = fp.user_id)
  ORDER BY fp.created_at LIMIT 1;

  IF v_u1 IS NULL OR v_u2 IS NULL THEN
    RAISE NOTICE 'DH_SELFTEST_SKIPPED_NO_NEUTRAL_USERS';
    RETURN;
  END IF;

  INSERT INTO public.departments (id, name_ar, name_en, is_active)
  VALUES (v_dept, 'TEST_ONLY_DH_SYNC_DEPT', 'TEST_ONLY_DH_SYNC_DEPT', true);

  INSERT INTO public.academic_councils (id, name, council_type, department_id, is_active, created_by)
  VALUES (v_council, 'TEST_ONLY_DH_SYNC_COUNCIL', 'department', v_dept, true, v_u1);

  INSERT INTO public.organizational_positions (id, code, name_ar, name_en, unit_type, is_active, department_id, is_department_head_position)
  VALUES (v_pos, 'test_only_dh_sync_head', 'TEST_ONLY رئيس قسم', 'TEST_ONLY head', 'position', true, v_dept, true);

  -- G8: assigning a new head must create both memberships automatically
  INSERT INTO public.position_assignments (id, position_id, user_id, assigned_from, is_active, created_by)
  VALUES (v_a1, v_pos, v_u1, current_date, true, v_u1);

  SELECT count(*) INTO v_cnt FROM public.academic_council_members
  WHERE user_id=v_u1 AND council_id=v_council AND is_active AND member_role='chair';
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'DH_SELFTEST_FAIL_ASSIGN_DEPT_CHAIR=%', v_cnt; END IF;

  SELECT count(*) INTO v_cnt FROM public.academic_council_members
  WHERE user_id=v_u1 AND council_id=v_college AND is_active AND member_role='member';
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'DH_SELFTEST_FAIL_ASSIGN_COLLEGE_MEMBER=%', v_cnt; END IF;

  -- G9: replacement — end old assignment, start new one
  UPDATE public.position_assignments
  SET is_active=false, assigned_to=current_date - 1
  WHERE id=v_a1;

  INSERT INTO public.position_assignments (id, position_id, user_id, assigned_from, is_active, created_by)
  VALUES (v_a2, v_pos, v_u2, current_date, true, v_u2);

  SELECT count(*) INTO v_cnt FROM public.academic_council_members
  WHERE user_id=v_u1 AND is_active AND membership_source='administrative_position';
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'DH_SELFTEST_FAIL_OLD_HEAD_DERIVED_STILL_ACTIVE=%', v_cnt; END IF;

  SELECT count(*) INTO v_cnt FROM public.academic_council_members
  WHERE user_id=v_u2 AND council_id=v_council AND is_active AND member_role='chair';
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'DH_SELFTEST_FAIL_NEW_HEAD_DEPT_CHAIR=%', v_cnt; END IF;

  SELECT count(*) INTO v_cnt FROM public.academic_council_members
  WHERE user_id=v_u2 AND council_id=v_college AND is_active AND member_role='member';
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'DH_SELFTEST_FAIL_NEW_HEAD_COLLEGE_MEMBER=%', v_cnt; END IF;

  -- idempotency
  PERFORM public.reconcile_department_head_council_memberships(NULL);
  SELECT count(*) INTO v_cnt FROM public.academic_council_members
  WHERE user_id=v_u2 AND is_active;
  IF v_cnt <> 2 THEN RAISE EXCEPTION 'DH_SELFTEST_FAIL_IDEMPOTENCY=%', v_cnt; END IF;

  RAISE NOTICE 'DH_SELFTEST_PASS';

  -- full cleanup, no residue
  DELETE FROM public.academic_council_members WHERE council_id = v_council OR source_position_assignment_id IN (v_a1, v_a2);
  DELETE FROM public.position_assignments WHERE id IN (v_a1, v_a2);
  DELETE FROM public.organizational_positions WHERE id = v_pos;
  DELETE FROM public.academic_councils WHERE id = v_council;
  DELETE FROM public.departments WHERE id = v_dept;
END $$;