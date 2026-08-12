DO $$
DECLARE
  v_admin uuid; v_sup uuid; v_coord uuid; v_panel uuid; v_stu_user uuid; v_stu_profile uuid;
  v_sup_fp uuid; v_coord_fp uuid; v_panel_fp uuid;
  v_dept uuid := 'ce485c67-5f7c-498d-b120-4b1130a86ae8';
  v_prog uuid := '97638001-87cd-4df0-abe9-63c829504072';
  v_year uuid := '1b9e6972-0870-41d6-b849-bdcbc7b6c0d6';
  v_sem  uuid := 'dc917e4d-607d-43ce-9d78-020de14eccf0';
  v_council uuid := '663bc159-ab2d-4191-9d94-ce59c289f860';
  v_project uuid; v_survey uuid; v_meeting uuid; v_ga_mgr uuid;
BEGIN
  SELECT id INTO v_admin FROM auth.users WHERE email='demo.admin@testonly.invalid';
  SELECT id INTO v_ga_mgr FROM auth.users WHERE email='demo.ga.manager@testonly.invalid';
  SELECT id INTO v_sup   FROM auth.users WHERE email='demo.gp.supervisor@testonly.invalid';
  SELECT id INTO v_coord FROM auth.users WHERE email='demo.gp.coordinator@testonly.invalid';
  SELECT id INTO v_panel FROM auth.users WHERE email='demo.gp.committee@testonly.invalid';
  SELECT fp.id INTO v_sup_fp   FROM public.faculty_profiles fp WHERE fp.user_id=v_sup;
  SELECT fp.id INTO v_coord_fp FROM public.faculty_profiles fp WHERE fp.user_id=v_coord;
  SELECT fp.id INTO v_panel_fp FROM public.faculty_profiles fp WHERE fp.user_id=v_panel;
  SELECT sp.user_id, sp.id INTO v_stu_user, v_stu_profile
    FROM public.student_profiles sp JOIN auth.users u ON u.id=sp.user_id
    WHERE u.email='demo.student.l4@testonly.invalid';

  UPDATE public.news SET is_published = true, published_at = COALESCE(published_at, now())
   WHERE is_published IS DISTINCT FROM true;

  IF NOT EXISTS (SELECT 1 FROM public.graduation_projects WHERE title LIKE 'DEMO_ONLY%') THEN
    INSERT INTO public.graduation_projects (department_id, program_id, academic_year_id, semester_id,
      title, problem_statement, objectives, summary, lifecycle_state)
    VALUES (v_dept, v_prog, v_year, v_sem,
      'DEMO_ONLY — منصة ذكية لإدارة الحرم الجامعي',
      'صعوبة متابعة الخدمات الجامعية عبر أنظمة متفرقة.',
      'بناء منصة موحدة لإدارة الخدمات الأكاديمية والطلابية.',
      'مشروع عرض تقديمي دائم لأغراض العرض على مجلس الجامعة.',
      'active')
    RETURNING id INTO v_project;

    INSERT INTO public.graduation_project_assignments (project_id, role, user_id, department_id, assigned_by, active, supervision_status, faculty_profile_id, student_profile_id, is_leader)
    VALUES
      (v_project,'supervisor',   v_sup,   v_dept, v_admin, true, 'accepted', v_sup_fp,   NULL, false),
      (v_project,'coordinator',  v_coord, v_dept, v_admin, true, NULL,       v_coord_fp, NULL, false),
      (v_project,'panel_member', v_panel, v_dept, v_admin, true, NULL,       v_panel_fp, NULL, false),
      (v_project,'student',      v_stu_user, v_dept, v_admin, true, NULL,    NULL, v_stu_profile, true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.graduate_opportunities WHERE title LIKE 'DEMO_ONLY%') THEN
    INSERT INTO public.graduate_opportunities (opportunity_type, title, description, state, published_at, closes_at, moderated_by)
    VALUES ('job','DEMO_ONLY — مهندس برمجيات (خريجو تكنولوجيا المعلومات)',
      'فرصة عمل تجريبية دائمة لعرض وحدة شؤون الخريجين.', 'published', now(), now() + interval '180 days', COALESCE(v_ga_mgr, v_admin));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.graduate_events WHERE title LIKE 'DEMO_ONLY%') THEN
    INSERT INTO public.graduate_events (title, event_type, purpose_code, notice_version, starts_at, ends_at, state)
    VALUES ('DEMO_ONLY — ملتقى الخريجين السنوي','networking','alumni_engagement','v1',
      now() + interval '30 days', now() + interval '30 days 4 hours','published');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.graduate_surveys WHERE title LIKE 'DEMO_ONLY%') THEN
    INSERT INTO public.graduate_surveys (purpose_code, title, state)
    VALUES ('employment_tracking','DEMO_ONLY — استبيان أثر الخريجين','active')
    RETURNING id INTO v_survey;
    INSERT INTO public.graduate_survey_versions (survey_id, version, notice_version, questions, published_at)
    VALUES (v_survey, 1, 'v1',
      '[{"id":"q1","type":"single_choice","label":"هل تعمل حالياً؟","options":["نعم","لا"]},{"id":"q2","type":"text","label":"جهة العمل"}]'::jsonb,
      now());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.academic_council_meetings WHERE title LIKE 'DEMO_ONLY%') THEN
    INSERT INTO public.academic_council_meetings (council_id, academic_year_id, meeting_number, title, scheduled_at, location, status, created_by, opened_at, closed_at)
    VALUES (v_council, v_year,
      COALESCE((SELECT MAX(meeting_number)+1 FROM public.academic_council_meetings WHERE council_id=v_council),1),
      'DEMO_ONLY — اجتماع مجلس قسم تكنولوجيا المعلومات', now() - interval '20 days',
      'قاعة المجلس', 'minutes_locked', v_admin, now() - interval '20 days', now() - interval '19 days')
    RETURNING id INTO v_meeting;

    INSERT INTO public.academic_council_decisions (meeting_id, decision_number, title, body, created_by)
    VALUES (v_meeting, 1, 'اعتماد خطط تنفيذ المحاضرات للفصل الحالي',
      'وافق المجلس على اعتماد خطط تنفيذ المحاضرات المنشورة لمقررات القسم ومتابعة نسب التنفيذ دورياً.', v_admin);

    UPDATE public.academic_council_meetings SET status='archived' WHERE id = v_meeting;
  END IF;
END $$;