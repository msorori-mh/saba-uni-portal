CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
CREATE TABLE public.test_roles(uid uuid, role text);
CREATE TABLE public.test_heads(uid uuid, department_id uuid);
CREATE FUNCTION public.has_any_role(uid uuid, names text[]) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM test_roles WHERE test_roles.uid=$1 AND role=ANY($2)) $$;
CREATE FUNCTION public.is_department_head_of(uid uuid, dept uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM test_heads WHERE test_heads.uid=$1 AND department_id=$2) $$;
CREATE TABLE public.student_profiles(id uuid PRIMARY KEY,user_id uuid);
CREATE TABLE public.student_requests(
 id uuid PRIMARY KEY, student_profile_id uuid, request_type text, status text,
 reviewed_by uuid, reviewed_at timestamptz, completed_at timestamptz, cancelled_at timestamptz,
 current_step_index integer, current_role_key text
);
CREATE TABLE public.student_request_workflow_steps(
 id uuid PRIMARY KEY,student_request_id uuid,completed_by uuid,status text
);
CREATE TABLE public.official_documents(id uuid PRIMARY KEY,status text);
CREATE TABLE public.courses(id uuid PRIMARY KEY,department_id uuid);
CREATE TABLE public.course_offerings(id uuid PRIMARY KEY,course_id uuid);
CREATE TABLE public.faculty_profiles(id uuid PRIMARY KEY,user_id uuid);
CREATE TABLE public.course_sections(id uuid PRIMARY KEY,course_offering_id uuid,faculty_profile_id uuid);
CREATE TABLE public.staff_profiles(id uuid PRIMARY KEY,user_id uuid,status text);
CREATE TABLE public.student_enrollments(id uuid PRIMARY KEY,course_section_id uuid);
CREATE TABLE public.grade_components(id uuid PRIMARY KEY,course_section_id uuid,max_score numeric);
CREATE TABLE public.student_grades(
 id uuid PRIMARY KEY,student_enrollment_id uuid,grade_component_id uuid,
 score numeric,status text,approved_at timestamptz,approved_by uuid
);
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
CREATE POLICY sr_insert_priv ON public.student_requests FOR INSERT TO authenticated WITH CHECK(true);
CREATE FUNCTION public.issue_official_document(uuid,text,jsonb) RETURNS jsonb
LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
GRANT EXECUTE ON FUNCTION public.issue_official_document(uuid,text,jsonb) TO authenticated;
CREATE FUNCTION public.act_on_student_request_step(
 p_step_id uuid,p_action text,p_comment text DEFAULT NULL,p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id uuid; BEGIN
 SELECT student_request_id INTO v_id FROM student_request_workflow_steps WHERE id=p_step_id;
 UPDATE student_request_workflow_steps SET completed_by=auth.uid(),status='completed' WHERE id=p_step_id;
 UPDATE student_requests SET status='approved' WHERE id=v_id;
 RETURN '{"success":true}'::jsonb;
END $$;
GRANT EXECUTE ON FUNCTION public.act_on_student_request_step(uuid,text,text,jsonb) TO authenticated;
