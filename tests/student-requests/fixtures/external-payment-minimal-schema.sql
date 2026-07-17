CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

CREATE TABLE public.request_processing_units (id uuid PRIMARY KEY, code text);
CREATE TABLE public.request_processing_roles (id uuid PRIMARY KEY, code text);
CREATE TABLE public.request_type_workflow_steps (
  id uuid PRIMARY KEY, action_type text,
  CONSTRAINT request_type_workflow_steps_action_type_chk CHECK (action_type IN ('review'))
);
CREATE TABLE public.request_type_workflow_transitions (
  id uuid PRIMARY KEY, workflow_id uuid, from_step_id uuid, to_step_id uuid,
  action_result text, is_default boolean DEFAULT false, created_at timestamptz DEFAULT now(),
  CONSTRAINT request_type_workflow_transitions_action_result_chk CHECK (action_result IN ('submit'))
);
CREATE TABLE public.student_requests (id uuid PRIMARY KEY, request_type text);
CREATE TABLE public.staff_profiles (id uuid PRIMARY KEY, user_id uuid);
CREATE TABLE public.faculty_profiles (id uuid PRIMARY KEY, user_id uuid);
CREATE TABLE public.position_assignments (
  id uuid PRIMARY KEY, user_id uuid, is_active boolean, assigned_to date
);
CREATE TABLE public.student_request_workflow_steps (
  id uuid PRIMARY KEY, student_request_id uuid, workflow_id uuid, workflow_step_id uuid,
  processing_unit_id uuid, processing_role_id uuid, step_key text, status text,
  decision text, comment text, updated_at timestamptz, completed_by uuid,
  completed_at timestamptz, entered_at timestamptz, assigned_user_id uuid,
  assigned_staff_profile_id uuid, assigned_faculty_profile_id uuid,
  assigned_position_assignment_id uuid,
  CONSTRAINT student_request_workflow_steps_decision_chk CHECK (decision IS NULL OR decision IN ('approved'))
);
CREATE TABLE public.student_request_workflow_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, student_request_id uuid,
  workflow_step_runtime_id uuid, event_type text, actor_user_id uuid,
  actor_unit_id uuid, actor_role_id uuid, message_ar text, payload jsonb,
  visible_to_student boolean,
  CONSTRAINT student_request_workflow_events_event_type_chk CHECK (event_type IN ('created'))
);
