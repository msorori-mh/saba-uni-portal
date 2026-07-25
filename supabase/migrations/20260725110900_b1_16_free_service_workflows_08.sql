-- PROMOTED SOURCE: B1-BACKEND-IMPLEMENTATION-01 order 16
-- Source draft: docs/migration-drafts/B1-FREE-SERVICE-WORKFLOWS-08.sql
-- Companion preflight/post-verifier: docs/migration-drafts/b1-backend-verifiers/
-- REQUIRES_USER_APPROVAL before any production apply. This PR does not Deploy.
-- DRAFT ONLY — DO NOT APPLY FROM THIS FILE.
-- Creates inactive workflow drafts for exactly the three FREE_NO_PAYMENT services.
-- No activation, student visibility, payment, financial ledger, document, or data backfill.
BEGIN;

DO $migration$
DECLARE
  v_service record; v_step record; v_transition record;
  v_request_type_id uuid; v_workflow_id uuid; v_unit_id uuid; v_role_id uuid;
  v_step_ids jsonb; v_from_id uuid; v_to_id uuid; v_count integer; v_matching_count integer; v_version integer;
  v_marker constant text := 'B1_FREE_NO_PAYMENT/workflow-v1';
BEGIN
  FOR v_service IN SELECT * FROM (VALUES
    ('enrollment_suspension'::text,ARRAY['enrollment_suspension']::text[],'وقف القيد'::text,
      jsonb_build_array(
        jsonb_build_object('key','initial_review','name','المراجعة الأولية','unit','student_affairs','role','student_affairs_specialist','action','review'),
        jsonb_build_object('key','manager_approval','name','اعتماد مدير شؤون الطلاب','unit','student_affairs','role','student_affairs_manager','action','approve'),
        jsonb_build_object('key','registrar_apply','name','تطبيق قرار وقف القيد','unit','registrar','role','registrar_general','action','apply_decision')),
      jsonb_build_array(
        jsonb_build_object('from',NULL,'to','initial_review','result','submit'),
        jsonb_build_object('from','initial_review','to','manager_approval','result','reviewed'),
        jsonb_build_object('from','manager_approval','to','registrar_apply','result','approved'),
        jsonb_build_object('from','registrar_apply','to',NULL,'result','applied'))),
    ('excused_absence'::text,ARRAY['excused_absence','absence_excuse']::text[],'غياب بعذر'::text,
      jsonb_build_array(
        jsonb_build_object('key','student_affairs_intake','name','استلام شؤون الطلاب','unit','student_affairs','role','student_affairs_specialist','action','review'),
        jsonb_build_object('key','manager_review','name','اعتماد مدير شؤون الطلاب','unit','student_affairs','role','student_affairs_manager','action','approve'),
        jsonb_build_object('key','record_apply','name','تطبيق العذر في السجل','unit','student_affairs','role','student_affairs_specialist','action','apply_decision')),
      jsonb_build_array(
        jsonb_build_object('from',NULL,'to','student_affairs_intake','result','submit'),
        jsonb_build_object('from','student_affairs_intake','to','manager_review','result','reviewed'),
        jsonb_build_object('from','manager_review','to','record_apply','result','approved'),
        jsonb_build_object('from','record_apply','to',NULL,'result','applied'))),
    ('file_withdrawal'::text,ARRAY['file_withdrawal']::text[],'سحب الملف'::text,
      jsonb_build_array(
        jsonb_build_object('key','student_affairs_intake','name','استلام شؤون الطلاب','unit','student_affairs','role','student_affairs_specialist','action','review'),
        jsonb_build_object('key','library_clearance','name','مخالصة المكتبة','unit','library','role','library_officer','action','clear'),
        jsonb_build_object('key','labs_clearance','name','مخالصة المعامل','unit','labs','role','labs_manager','action','clear'),
        jsonb_build_object('key','activities_clearance','name','مخالصة الأنشطة','unit','student_affairs','role','student_affairs_manager','action','clear'),
        jsonb_build_object('key','finance_clearance','name','المخالصة المالية','unit','finance','role','revenue_finance_officer','action','clear'),
        jsonb_build_object('key','registrar_apply','name','تطبيق قرار سحب الملف','unit','registrar','role','registrar_general','action','apply_decision'),
        jsonb_build_object('key','archive','name','الأرشفة','unit','archive','role','archive_officer','action','archive')),
      jsonb_build_array(
        jsonb_build_object('from',NULL,'to','student_affairs_intake','result','submit'),
        jsonb_build_object('from','student_affairs_intake','to','library_clearance','result','reviewed'),
        jsonb_build_object('from','library_clearance','to','labs_clearance','result','cleared'),
        jsonb_build_object('from','labs_clearance','to','activities_clearance','result','cleared'),
        jsonb_build_object('from','activities_clearance','to','finance_clearance','result','cleared'),
        jsonb_build_object('from','finance_clearance','to','registrar_apply','result','cleared'),
        jsonb_build_object('from','registrar_apply','to','archive','result','applied'),
        jsonb_build_object('from','archive','to',NULL,'result','archived')))
  ) AS services(canonical_code,stored_codes,name_ar,steps,transitions)
  LOOP
    SELECT count(*),(array_agg(id ORDER BY id))[1] INTO v_count,v_request_type_id
    FROM public.request_types WHERE code=ANY(v_service.stored_codes);
    IF v_count<>1 THEN RAISE EXCEPTION 'FREE_WORKFLOW_REQUEST_TYPE_MUST_RESOLVE_ONCE:%:%',v_service.canonical_code,v_count; END IF;

    SELECT count(*),
      count(*) FILTER (WHERE status='draft' AND is_active=false AND description_ar=v_marker),
      (array_agg(id ORDER BY id) FILTER (WHERE status='draft' AND is_active=false AND description_ar=v_marker))[1]
      INTO v_count,v_matching_count,v_workflow_id
    FROM public.request_type_workflows
    WHERE request_type_id=v_request_type_id AND code=v_service.canonical_code||'_free_workflow';
    IF v_count>1 OR (v_count=1 AND v_matching_count<>1) THEN
      RAISE EXCEPTION 'FREE_WORKFLOW_INVENTORY_MISMATCH:%:%:%',v_service.canonical_code,v_count,v_matching_count;
    END IF;
    IF v_count=0 THEN
      SELECT COALESCE(max(version),0)+1 INTO v_version FROM public.request_type_workflows
      WHERE request_type_id=v_request_type_id AND code=v_service.canonical_code||'_free_workflow';
      INSERT INTO public.request_type_workflows(request_type_id,code,name_ar,description_ar,version,status,is_active)
      VALUES(v_request_type_id,v_service.canonical_code||'_free_workflow',v_service.name_ar,v_marker,v_version,'draft',false)
      RETURNING id INTO v_workflow_id;
      v_step_ids:='{}'::jsonb;
      FOR v_step IN SELECT value,ordinality FROM jsonb_array_elements(v_service.steps) WITH ORDINALITY ORDER BY ordinality LOOP
        SELECT count(*),(array_agg(id ORDER BY id))[1] INTO v_count,v_unit_id
        FROM public.request_processing_units WHERE code=v_step.value->>'unit' AND is_active=true;
        IF v_count<>1 THEN RAISE EXCEPTION 'FREE_WORKFLOW_UNIT_MUST_RESOLVE_ONCE:%:%',v_step.value->>'unit',v_count; END IF;
        SELECT count(*),(array_agg(id ORDER BY id))[1] INTO v_count,v_role_id
        FROM public.request_processing_roles WHERE code=v_step.value->>'role' AND unit_id=v_unit_id AND is_active=true;
        IF v_count<>1 THEN RAISE EXCEPTION 'FREE_WORKFLOW_ROLE_MUST_RESOLVE_ONCE:%:%',v_step.value->>'role',v_count; END IF;
        INSERT INTO public.request_type_workflow_steps(workflow_id,step_key,step_name_ar,step_order,
          processing_unit_id,processing_role_id,assignment_strategy,action_type,status_on_enter,status_on_complete,
          is_required,can_skip,requires_payment,produces_document,config)
        VALUES(v_workflow_id,v_step.value->>'key',v_step.value->>'name',v_step.ordinality,v_unit_id,v_role_id,
          'specific_user',v_step.value->>'action','in_progress','completed',true,false,false,false,
          jsonb_build_object('authorization','exactly_one_direct_assignee','payment_policy','FREE_NO_PAYMENT'))
        RETURNING id INTO v_unit_id;
        v_step_ids:=v_step_ids||jsonb_build_object(v_step.value->>'key',v_unit_id);
      END LOOP;
      FOR v_transition IN SELECT value FROM jsonb_array_elements(v_service.transitions) LOOP
        v_from_id:=CASE WHEN v_transition.value->>'from' IS NULL THEN NULL ELSE (v_step_ids->>(v_transition.value->>'from'))::uuid END;
        v_to_id:=CASE WHEN v_transition.value->>'to' IS NULL THEN NULL ELSE (v_step_ids->>(v_transition.value->>'to'))::uuid END;
        INSERT INTO public.request_type_workflow_transitions(workflow_id,from_step_id,to_step_id,action_result,is_default)
        VALUES(v_workflow_id,v_from_id,v_to_id,v_transition.value->>'result',true);
      END LOOP;
    END IF;

    SELECT count(*) INTO v_count FROM public.request_type_workflow_steps WHERE workflow_id=v_workflow_id;
    IF v_count<>jsonb_array_length(v_service.steps) OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_service.steps) WITH ORDINALITY e(value,ordinality)
      LEFT JOIN public.request_type_workflow_steps s ON s.workflow_id=v_workflow_id AND s.step_key=e.value->>'key'
      LEFT JOIN public.request_processing_units u ON u.id=s.processing_unit_id
      LEFT JOIN public.request_processing_roles r ON r.id=s.processing_role_id
      WHERE s.id IS NULL OR s.step_order<>e.ordinality OR u.code IS DISTINCT FROM e.value->>'unit'
        OR r.code IS DISTINCT FROM e.value->>'role' OR s.action_type IS DISTINCT FROM e.value->>'action'
        OR s.assignment_strategy IS DISTINCT FROM 'specific_user' OR s.status_on_enter IS DISTINCT FROM 'in_progress'
        OR s.status_on_complete IS DISTINCT FROM 'completed' OR s.is_required IS DISTINCT FROM true
        OR s.can_skip IS DISTINCT FROM false OR s.requires_payment IS DISTINCT FROM false
        OR s.produces_document IS DISTINCT FROM false OR s.config->>'authorization' IS DISTINCT FROM 'exactly_one_direct_assignee'
        OR s.config->>'payment_policy' IS DISTINCT FROM 'FREE_NO_PAYMENT')
    THEN RAISE EXCEPTION 'FREE_WORKFLOW_STEP_STRUCTURE_MISMATCH:%',v_service.canonical_code; END IF;

    SELECT count(*) INTO v_count FROM public.request_type_workflow_transitions WHERE workflow_id=v_workflow_id;
    IF v_count<>jsonb_array_length(v_service.transitions) OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_service.transitions) e WHERE NOT EXISTS (
        SELECT 1 FROM public.request_type_workflow_transitions t
        LEFT JOIN public.request_type_workflow_steps fs ON fs.id=t.from_step_id
        LEFT JOIN public.request_type_workflow_steps ts ON ts.id=t.to_step_id
        WHERE t.workflow_id=v_workflow_id AND fs.step_key IS NOT DISTINCT FROM e.value->>'from'
          AND ts.step_key IS NOT DISTINCT FROM e.value->>'to' AND t.action_result=e.value->>'result' AND t.is_default=true))
    THEN RAISE EXCEPTION 'FREE_WORKFLOW_TRANSITION_STRUCTURE_MISMATCH:%',v_service.canonical_code; END IF;
  END LOOP;
END
$migration$;

COMMIT;
