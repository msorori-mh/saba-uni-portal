
-- FACULTY-DATA-MERGE-01: Migrate academic references from FA001 (old, inactive) to F2025004 (new, active)
-- Old faculty.id: 901b517d-60af-4935-89af-cf425c4c48b7 (FA001)
-- Old faculty_profiles.id: 236aefc8-7097-4b0a-9d16-8fbc800dd7b0 (F0001, has Auth aa8fa197-...)
-- New faculty.id: a631d132-ddc0-49e3-bb1a-27fc5ecaccdd (F2025004)
-- New faculty_profiles.id: c1fe6084-e594-482e-a178-ac8eaffed376 (F2025004, no Auth)

BEGIN;

-- Audit: merge start
INSERT INTO public.audit_logs (action_type, entity_type, entity_id, notes, new_values)
VALUES ('faculty_merge_start','faculty','901b517d-60af-4935-89af-cf425c4c48b7',
  'FACULTY-DATA-MERGE-01: بدء دمج FA001 مع F2025004',
  jsonb_build_object('from_faculty','FA001','to_faculty','F2025004',
    'from_profile','236aefc8-7097-4b0a-9d16-8fbc800dd7b0',
    'to_profile','c1fe6084-e594-482e-a178-ac8eaffed376'));

-- Move class_schedule references
UPDATE public.class_schedule
   SET faculty_profile_id = 'c1fe6084-e594-482e-a178-ac8eaffed376'
 WHERE faculty_profile_id = '236aefc8-7097-4b0a-9d16-8fbc800dd7b0';

-- Move course_sections references
UPDATE public.course_sections
   SET faculty_profile_id = 'c1fe6084-e594-482e-a178-ac8eaffed376'
 WHERE faculty_profile_id = '236aefc8-7097-4b0a-9d16-8fbc800dd7b0';

-- Audit: references moved
INSERT INTO public.audit_logs (action_type, entity_type, entity_id, notes, new_values)
VALUES ('faculty_merge_references','faculty','a631d132-ddc0-49e3-bb1a-27fc5ecaccdd',
  'تم نقل المراجع الأكاديمية من FA001 إلى F2025004',
  jsonb_build_object('class_schedule_moved',1,'course_sections_moved',1,'research_papers_moved',0));

-- FA001 remains inactive; Auth F0001 stays linked to the old profile (not deleted, not reset).
-- F2025004 remains without Auth, ready for FACULTY-ACCOUNT-CREATION-01.

INSERT INTO public.audit_logs (action_type, entity_type, entity_id, notes, new_values)
VALUES ('faculty_merge_complete','faculty','a631d132-ddc0-49e3-bb1a-27fc5ecaccdd',
  'اكتمل الدمج: FA001 معطّل، Auth F0001 بقي مرتبطاً بالسجل القديم، F2025004 جاهز لإنشاء حساب رسمي',
  jsonb_build_object('fa001_status','inactive_kept','auth_f0001','left_linked_to_old_profile','f2025004_auth','none_ready_for_creation'));

COMMIT;
