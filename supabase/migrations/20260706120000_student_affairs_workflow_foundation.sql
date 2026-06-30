-- STUDENT-AFFAIRS-WORKFLOW-01
-- Extend the existing student_requests/request_types model into a workflow engine.
-- No student records, grades, enrollments, or academic decisions are modified here.

ALTER TABLE public.request_types
  ADD COLUMN IF NOT EXISTS title_en text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS article_ref text,
  ADD COLUMN IF NOT EXISTS required_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS form_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS workflow_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS student_visible boolean NOT NULL DEFAULT false;

ALTER TABLE public.student_requests
  ADD COLUMN IF NOT EXISTS request_number text,
  ADD COLUMN IF NOT EXISTS current_step_index integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_role_key text,
  ADD COLUMN IF NOT EXISTS current_assignee_id uuid,
  ADD COLUMN IF NOT EXISTS form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS student_notes text,
  ADD COLUMN IF NOT EXISTS internal_notes text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_requests_request_number
  ON public.student_requests(request_number)
  WHERE request_number IS NOT NULL;

ALTER TABLE public.student_requests DROP CONSTRAINT IF EXISTS sr_status_chk;
ALTER TABLE public.student_requests ADD CONSTRAINT sr_status_chk
  CHECK (status IN (
    'draft',
    'submitted',
    'in_review',
    'under_review',
    'returned_for_completion',
    'returned',
    'approved',
    'rejected',
    'cancelled',
    'completed'
  ));

CREATE TABLE IF NOT EXISTS public.student_service_request_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.student_requests(id) ON DELETE CASCADE,
  step_index integer NOT NULL,
  step_key text NOT NULL,
  step_title_ar text NOT NULL,
  role_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','approved','rejected','returned','forwarded','completed','skipped')),
  assigned_to uuid,
  acted_by uuid,
  action text,
  notes text,
  acted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ssrs_request ON public.student_service_request_steps(request_id);
CREATE INDEX IF NOT EXISTS idx_ssrs_role_status ON public.student_service_request_steps(role_key, status);

CREATE TABLE IF NOT EXISTS public.student_service_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.student_requests(id) ON DELETE CASCADE,
  actor_id uuid,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  from_step_index integer,
  to_step_index integer,
  notes text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ssre_request ON public.student_service_request_events(request_id);
CREATE INDEX IF NOT EXISTS idx_ssre_created_at ON public.student_service_request_events(created_at DESC);

ALTER TABLE public.student_service_request_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_service_request_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'student_service_request_steps'
      AND policyname = 'ssrs_select_participants'
  ) THEN
    CREATE POLICY ssrs_select_participants
    ON public.student_service_request_steps
    FOR SELECT TO authenticated
    USING (
      public.is_owner_of_request(auth.uid(), request_id)
      OR public.has_any_role(auth.uid(), ARRAY[
        'admin','system_admin','dean','registrar','student_affairs',
        'department_head','faculty_member','finance_officer'
      ])
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'student_service_request_steps'
      AND policyname = 'ssrs_insert_priv'
  ) THEN
    CREATE POLICY ssrs_insert_priv
    ON public.student_service_request_steps
    FOR INSERT TO authenticated
    WITH CHECK (
      public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs'])
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'student_service_request_steps'
      AND policyname = 'ssrs_update_priv'
  ) THEN
    CREATE POLICY ssrs_update_priv
    ON public.student_service_request_steps
    FOR UPDATE TO authenticated
    USING (
      public.has_any_role(auth.uid(), ARRAY[
        'admin','system_admin','dean','registrar','student_affairs',
        'department_head','faculty_member','finance_officer'
      ])
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'student_service_request_events'
      AND policyname = 'ssre_select_participants'
  ) THEN
    CREATE POLICY ssre_select_participants
    ON public.student_service_request_events
    FOR SELECT TO authenticated
    USING (
      public.is_owner_of_request(auth.uid(), request_id)
      OR public.has_any_role(auth.uid(), ARRAY[
        'admin','system_admin','dean','registrar','student_affairs',
        'department_head','faculty_member','finance_officer'
      ])
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'student_service_request_events'
      AND policyname = 'ssre_insert_priv'
  ) THEN
    CREATE POLICY ssre_insert_priv
    ON public.student_service_request_events
    FOR INSERT TO authenticated
    WITH CHECK (
      public.has_any_role(auth.uid(), ARRAY[
        'admin','system_admin','dean','registrar','student_affairs',
        'department_head','faculty_member','finance_officer'
      ])
    );
  END IF;
END $$;

-- Allow students to resubmit a returned workflow request without opening up
-- direct status mutation for other post-submission states.
CREATE OR REPLACE FUNCTION public.protect_student_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF public.has_any_role(v_uid, ARRAY['admin','system_admin','dean','registrar','student_affairs']) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.student_profiles sp
    WHERE sp.id = OLD.student_profile_id AND sp.user_id = v_uid
  ) THEN
    IF NEW.status = 'cancelled' AND OLD.status NOT IN ('approved','completed') THEN
      NEW.student_profile_id := OLD.student_profile_id;
      NEW.request_type       := OLD.request_type;
      NEW.submitted_at       := OLD.submitted_at;
      NEW.reviewed_by        := OLD.reviewed_by;
      NEW.reviewed_at        := OLD.reviewed_at;
      NEW.rejection_reason   := OLD.rejection_reason;
      NEW.completed_at       := OLD.completed_at;
      NEW.cancelled_at       := COALESCE(NEW.cancelled_at, now());
      RETURN NEW;
    END IF;

    IF OLD.status = 'draft' AND NEW.status = 'submitted' THEN
      NEW.submitted_at := COALESCE(NEW.submitted_at, now());
      NEW.student_profile_id := OLD.student_profile_id;
      NEW.request_type       := OLD.request_type;
      NEW.reviewed_by        := OLD.reviewed_by;
      NEW.reviewed_at        := OLD.reviewed_at;
      NEW.rejection_reason   := OLD.rejection_reason;
      RETURN NEW;
    END IF;

    IF OLD.status = 'draft' AND NEW.status = 'draft' THEN
      NEW.student_profile_id := OLD.student_profile_id;
      NEW.request_type       := OLD.request_type;
      NEW.submitted_at       := OLD.submitted_at;
      NEW.reviewed_by        := OLD.reviewed_by;
      NEW.reviewed_at        := OLD.reviewed_at;
      NEW.rejection_reason   := OLD.rejection_reason;
      RETURN NEW;
    END IF;

    IF OLD.status IN ('returned','returned_for_completion') AND NEW.status = 'submitted' THEN
      NEW.submitted_at := COALESCE(NEW.submitted_at, now());
      NEW.rejection_reason := NULL;
      NEW.reviewed_by := NULL;
      NEW.reviewed_at := NULL;
      NEW.student_profile_id := OLD.student_profile_id;
      NEW.request_type       := OLD.request_type;
      RETURN NEW;
    END IF;

    IF OLD.status IN ('returned','returned_for_completion')
       AND NEW.status IN ('returned','returned_for_completion') THEN
      NEW.student_profile_id := OLD.student_profile_id;
      NEW.request_type       := OLD.request_type;
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Students cannot modify a request after submission';
  END IF;

  RAISE EXCEPTION 'Not authorized to modify this request';
END;
$$;

DO $$
DECLARE
  active_types jsonb := '[
    {"code":"absence_excuse","name_ar":"الغياب بعذر","category":"academic","article_ref":"شؤون الطلاب","requires_attachment":true,
     "workflow":[
       {"key":"college_dean","title_ar":"عميد الكلية","role_key":"dean"},
       {"key":"academic_vice_dean","title_ar":"نائب العميد للشؤون الأكاديمية","role_key":"registrar"},
       {"key":"college_registrar","title_ar":"مسجل الكلية","role_key":"registrar"},
       {"key":"control","title_ar":"الكنترول","role_key":"student_affairs"}
     ]},
    {"code":"enrollment_suspension","name_ar":"وقف القيد","category":"enrollment","article_ref":"شؤون الطلاب","requires_attachment":true,
     "workflow":[
       {"key":"academic_vice_dean","title_ar":"نائب العميد للشؤون الأكاديمية","role_key":"registrar"},
       {"key":"college_registrar","title_ar":"مسجل الكلية","role_key":"registrar"},
       {"key":"department_head","title_ar":"رئيس القسم","role_key":"department_head"},
       {"key":"college_dean","title_ar":"عميد الكلية","role_key":"dean"},
       {"key":"admission_director","title_ar":"مدير القبول والتسجيل","role_key":"registrar"},
       {"key":"admission_specialist","title_ar":"مختص القبول والتسجيل","role_key":"student_affairs"}
     ]},
    {"code":"reenrollment","name_ar":"إعادة القيد","category":"enrollment","article_ref":"شؤون الطلاب","requires_attachment":true,
     "workflow":[
       {"key":"college_dean","title_ar":"عميد الكلية","role_key":"dean"},
       {"key":"admission_director","title_ar":"مدير القبول والتسجيل","role_key":"registrar"},
       {"key":"admission_dean","title_ar":"عميد القبول والتسجيل","role_key":"registrar"},
       {"key":"college_registrar","title_ar":"مسجل الكلية","role_key":"registrar"},
       {"key":"admission_specialist","title_ar":"مختص القبول والتسجيل","role_key":"student_affairs"}
     ]},
    {"code":"department_transfer","name_ar":"التحويل بين الأقسام","category":"enrollment","article_ref":"شؤون الطلاب","requires_attachment":true,
     "workflow":[
       {"key":"admission_specialist","title_ar":"مختص القبول والتسجيل","role_key":"student_affairs"},
       {"key":"admission_director","title_ar":"مدير القبول والتسجيل","role_key":"registrar"},
       {"key":"current_department_head","title_ar":"رئيس القسم الحالي","role_key":"department_head"},
       {"key":"new_department_head","title_ar":"رئيس القسم الجديد","role_key":"department_head"},
       {"key":"college_dean","title_ar":"عميد الكلية","role_key":"dean"},
       {"key":"admission_specialist_final","title_ar":"مختص القبول والتسجيل","role_key":"student_affairs"},
       {"key":"college_registrar","title_ar":"مسجل الكلية","role_key":"registrar"}
     ]},
    {"code":"grade_appeal","name_ar":"التظلم من النتيجة","category":"grades","article_ref":"شؤون الطلاب","requires_attachment":false,
     "workflow":[
       {"key":"department_head","title_ar":"رئيس القسم","role_key":"department_head"},
       {"key":"marker","title_ar":"عضو هيئة التدريس/المصحح","role_key":"faculty_member"},
       {"key":"appeal_committee","title_ar":"لجنة التظلم","role_key":"dean"},
       {"key":"college_dean","title_ar":"عميد الكلية","role_key":"dean"},
       {"key":"college_registrar","title_ar":"مسجل الكلية","role_key":"registrar"}
     ]},
    {"code":"official_transcript","name_ar":"طلب كشف درجات رسمي","category":"documents","article_ref":"الوثائق","requires_attachment":false,
     "workflow":[
       {"key":"college_registrar","title_ar":"مسجل الكلية","role_key":"registrar"},
       {"key":"documents_officer","title_ar":"مختص الوثائق","role_key":"student_affairs"}
     ]},
    {"code":"enrollment_certificate","name_ar":"طلب شهادة قيد","category":"documents","article_ref":"الوثائق","requires_attachment":false,
     "workflow":[
       {"key":"college_registrar","title_ar":"مسجل الكلية","role_key":"registrar"},
       {"key":"documents_officer","title_ar":"مختص الوثائق","role_key":"student_affairs"}
     ]}
  ]'::jsonb;
  inactive_types jsonb := '[
    ["university_withdrawal","الانسحاب من الجامعة"],
    ["course_add_drop","سحب وإضافة مقررات"],
    ["alternative_exam","الامتحان البديل"],
    ["exam_postponement","تأجيل الامتحان"],
    ["academic_dismissal","الفصل الأكاديمي"],
    ["disciplinary_dismissal","الفصل التأديبي"],
    ["exam_cheating","الغش في الامتحان"],
    ["record_removal","الشطب من السجل"],
    ["temporary_graduation_certificate","شهادة تخرج مؤقتة"],
    ["final_graduation_certificate","شهادة تخرج نهائية"]
  ]'::jsonb;
  item jsonb;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(active_types)
  LOOP
    INSERT INTO public.request_types (
      code, name_ar, title_en, category, article_ref, description_ar,
      required_documents, form_schema, workflow_schema,
      is_active, student_visible, requires_attachment, sort_order
    )
    VALUES (
      item->>'code',
      item->>'name_ar',
      item->>'code',
      item->>'category',
      item->>'article_ref',
      item->>'name_ar',
      '[]'::jsonb,
      jsonb_build_object(
        'fields', jsonb_build_array(
          jsonb_build_object('key','subject','label_ar','موضوع الطلب','type','text','required',true),
          jsonb_build_object('key','details','label_ar','تفاصيل الطلب','type','textarea','required',true)
        )
      ),
      jsonb_build_object('steps', item->'workflow'),
      true,
      true,
      COALESCE((item->>'requires_attachment')::boolean, false),
      100
    )
    ON CONFLICT (code) DO UPDATE SET
      name_ar = EXCLUDED.name_ar,
      title_en = EXCLUDED.title_en,
      category = EXCLUDED.category,
      article_ref = EXCLUDED.article_ref,
      description_ar = EXCLUDED.description_ar,
      form_schema = EXCLUDED.form_schema,
      workflow_schema = EXCLUDED.workflow_schema,
      is_active = true,
      student_visible = true,
      requires_attachment = EXCLUDED.requires_attachment,
      updated_at = now();
  END LOOP;

  FOR item IN SELECT * FROM jsonb_array_elements(inactive_types)
  LOOP
    INSERT INTO public.request_types (
      code, name_ar, title_en, category, description_ar,
      required_documents, form_schema, workflow_schema,
      is_active, student_visible, requires_attachment, sort_order
    )
    VALUES (
      item->>0,
      item->>1,
      item->>0,
      'catalog',
      item->>1,
      '[]'::jsonb,
      '{}'::jsonb,
      '{}'::jsonb,
      false,
      false,
      false,
      500
    )
    ON CONFLICT (code) DO UPDATE SET
      name_ar = EXCLUDED.name_ar,
      category = EXCLUDED.category,
      is_active = false,
      student_visible = false,
      updated_at = now();
  END LOOP;
END $$;
