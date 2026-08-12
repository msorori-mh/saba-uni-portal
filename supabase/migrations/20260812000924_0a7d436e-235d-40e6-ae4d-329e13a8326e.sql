create table if not exists public.ga_ops_lifecycle_matrix_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  actor text not null,
  domain text not null,
  step text not null,
  expected text not null,
  actual text not null,
  verdict text not null,
  detail text,
  created_at timestamptz not null default now()
);
grant all on public.ga_ops_lifecycle_matrix_results to service_role;
grant select on public.ga_ops_lifecycle_matrix_results to authenticated;
alter table public.ga_ops_lifecycle_matrix_results enable row level security;
do $pol$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ga_ops_lifecycle_matrix_results') then
    create policy "lifecycle matrix results readable by admins"
      on public.ga_ops_lifecycle_matrix_results for select to authenticated
      using (public.has_role(auth.uid(),'admin'::public.app_role)
             or public.has_role(auth.uid(),'system_admin'::public.app_role));
  end if;
end $pol$;

create or replace function public.ga_ops_lifecycle_matrix_run()
returns uuid
language plpgsql
volatile
security definer
set search_path to 'public','pg_temp'
as $fn$
declare
  v_run uuid := gen_random_uuid();
  v_actors jsonb := jsonb_build_array(
    jsonb_build_object('label','MANAGER','uid','640b6cce-781a-4831-8950-c4b889204908','scope','home','allow',true),
    jsonb_build_object('label','SPECIALIST_OWN_DEPT','uid','c870a7ee-d328-410d-b9e8-408c2fb033d5','scope','home','allow',true),
    jsonb_build_object('label','SPECIALIST_FOREIGN_DEPT','uid','c870a7ee-d328-410d-b9e8-408c2fb033d5','scope','foreign','allow',false),
    jsonb_build_object('label','ADMIN','uid','4dfc095d-cdb2-4053-8913-7cb5282adaa0','scope','home','allow',true),
    jsonb_build_object('label','SYSTEM_ADMIN','uid','323c4f8e-c248-42ac-82ed-92528a11ee55','scope','home','allow',true),
    jsonb_build_object('label','DEAN','uid','72e93a64-1fb1-457b-bcd2-ef7bcd90e769','scope','home','allow',false),
    jsonb_build_object('label','REGISTRAR','uid','4c261c1c-97fb-42da-a544-e8a59853ebe3','scope','home','allow',false)
  );
  v_home jsonb := jsonb_build_object('department_ids', jsonb_build_array('11111111-1111-4111-8111-111111111111'));
  v_foreign jsonb := jsonb_build_object('department_ids', jsonb_build_array('ce485c67-5f7c-498d-b120-4b1130a86ae8'));
  v_record uuid := '239e48b2-ab72-4e11-a343-3619268b6e7c';
  v_manager uuid := '640b6cce-781a-4831-8950-c4b889204908';
  v_specialist uuid := 'c870a7ee-d328-410d-b9e8-408c2fb033d5';
  v_type uuid := '8bde1525-f65c-4c18-9c28-0f339b0b20c4';
  v_cp_ok uuid; v_cp_revoked uuid;
  a jsonb; v_label text; v_allow boolean; v_scope jsonb; v_recordscope_allow boolean;
  v_actual text; v_expected text; v_err text;
  v_fu uuid; v_opp uuid; v_ev1 uuid; v_ev2 uuid; v_sv uuid; v_ver uuid; v_comm uuid;
  v_assignee uuid;
begin
  if auth.uid() is not null then
    raise exception 'GA_LIFECYCLE_HARNESS_REQUIRES_SERVICE_CONTEXT';
  end if;

  create temp table if not exists ga_lc_tmp(kind text, id uuid) on commit drop;

  insert into public.graduate_contact_points(graduate_record_id, channel_type, protected_value, purpose_code, verified_at)
  values (v_record,'email','TEST_ONLY_GA_LIFECYCLE@testonly.invalid','communications', now())
  returning id into v_cp_ok;
  insert into public.graduate_contact_points(graduate_record_id, channel_type, protected_value, purpose_code, verified_at, revoked_at)
  values (v_record,'email','TEST_ONLY_GA_LIFECYCLE_REVOKED@testonly.invalid','communications', now(), now())
  returning id into v_cp_revoked;
  insert into ga_lc_tmp values ('contact_point', v_cp_ok), ('contact_point', v_cp_revoked);

  for a in select * from jsonb_array_elements(v_actors) loop
    v_label := a->>'label';
    v_allow := (a->>'allow')::boolean;
    v_scope := case when a->>'scope' = 'home' then v_home else v_foreign end;
    -- record-scoped domains (follow-up / communication) target a graduate in the
    -- specialist's own department, so the scope label does not restrict them.
    v_recordscope_allow := v_label not in ('DEAN','REGISTRAR');
    v_assignee := case when v_label like 'SPECIALIST%' then v_specialist else v_manager end;
    perform set_config('request.jwt.claims', json_build_object('sub', a->>'uid')::text, true);

    ---------------------------------------------------------------- FOLLOWUP
    v_fu := null;
    begin
      v_fu := public.graduate_affairs_create_followup(v_record, v_assignee, v_type, now() + interval '7 day');
      v_actual := 'ALLOW'; v_err := null;
    exception when others then v_actual := 'DENY'; v_err := SQLERRM; end;
    v_expected := case when v_recordscope_allow then 'ALLOW' else 'DENY' end;
    insert into public.ga_ops_lifecycle_matrix_results(run_id,actor,domain,step,expected,actual,verdict,detail)
    values (v_run,v_label,'FOLLOWUP','create',v_expected,v_actual,case when v_actual=v_expected then 'PASS' else 'FAIL' end,v_err);
    if v_fu is not null then insert into ga_lc_tmp values ('followup', v_fu); end if;

    begin
      perform public.graduate_affairs_transition_followup(v_fu,'in_progress',null, now() + interval '3 day');
      v_actual := 'ALLOW'; v_err := null;
    exception when others then v_actual := 'DENY'; v_err := SQLERRM; end;
    v_expected := case when v_recordscope_allow then 'ALLOW' else 'DENY' end;
    insert into public.ga_ops_lifecycle_matrix_results(run_id,actor,domain,step,expected,actual,verdict,detail)
    values (v_run,v_label,'FOLLOWUP','transition_open_to_in_progress',v_expected,v_actual,case when v_actual=v_expected then 'PASS' else 'FAIL' end,v_err);

    begin
      perform public.graduate_affairs_transition_followup(v_fu,'completed','TEST_ONLY_GA_LIFECYCLE outcome', null);
      v_actual := 'ALLOW'; v_err := null;
    exception when others then v_actual := 'DENY'; v_err := SQLERRM; end;
    v_expected := case when v_recordscope_allow then 'ALLOW' else 'DENY' end;
    insert into public.ga_ops_lifecycle_matrix_results(run_id,actor,domain,step,expected,actual,verdict,detail)
    values (v_run,v_label,'FOLLOWUP','terminal_completion',v_expected,v_actual,case when v_actual=v_expected then 'PASS' else 'FAIL' end,v_err);

    begin
      perform public.graduate_affairs_transition_followup(v_fu,'in_progress',null,null);
      v_actual := 'ALLOW'; v_err := null;
    exception when others then v_actual := 'DENY'; v_err := SQLERRM; end;
    insert into public.ga_ops_lifecycle_matrix_results(run_id,actor,domain,step,expected,actual,verdict,detail)
    values (v_run,v_label,'FOLLOWUP','negative_reopen_after_terminal','DENY',v_actual,case when v_actual='DENY' then 'PASS' else 'FAIL' end,v_err);

    ------------------------------------------------------------- OPPORTUNITY
    v_opp := null;
    begin
      v_opp := public.ga_op_save_opportunity(null,'job','TEST_ONLY_GA_LIFECYCLE opp '||v_label,'probe', v_scope, now() + interval '30 day', null);
      v_actual := 'ALLOW'; v_err := null;
    exception when others then v_actual := 'DENY'; v_err := SQLERRM; end;
    v_expected := case when v_allow then 'ALLOW' else 'DENY' end;
    insert into public.ga_ops_lifecycle_matrix_results(run_id,actor,domain,step,expected,actual,verdict,detail)
    values (v_run,v_label,'OPPORTUNITY','create_draft',v_expected,v_actual,case when v_actual=v_expected then 'PASS' else 'FAIL' end,v_err);
    if v_opp is not null then insert into ga_lc_tmp values ('opportunity', v_opp); end if;

    begin
      perform public.graduate_affairs_moderate_opportunity(v_opp,'in_review'::text);
      v_actual := 'ALLOW'; v_err := null;
    exception when others then v_actual := 'DENY'; v_err := SQLERRM; end;
    insert into public.ga_ops_lifecycle_matrix_results(run_id,actor,domain,step,expected,actual,verdict,detail)
    values (v_run,v_label,'OPPORTUNITY','draft_to_in_review',v_expected,v_actual,case when v_actual=v_expected then 'PASS' else 'FAIL' end,v_err);

    begin
      perform public.graduate_affairs_moderate_opportunity(v_opp,'published'::text);
      v_actual := 'ALLOW'; v_err := null;
    exception when others then v_actual := 'DENY'; v_err := SQLERRM; end;
    insert into public.ga_ops_lifecycle_matrix_results(run_id,actor,domain,step,expected,actual,verdict,detail)
    values (v_run,v_label,'OPPORTUNITY','in_review_to_published',v_expected,v_actual,case when v_actual=v_expected then 'PASS' else 'FAIL' end,v_err);

    begin
      perform public.graduate_affairs_moderate_opportunity(v_opp,'closed'::text);
      v_actual := 'ALLOW'; v_err := null;
    exception when others then v_actual := 'DENY'; v_err := SQLERRM; end;
    insert into public.ga_ops_lifecycle_matrix_results(run_id,actor,domain,step,expected,actual,verdict,detail)
    values (v_run,v_label,'OPPORTUNITY','published_to_closed',v_expected,v_actual,case when v_actual=v_expected then 'PASS' else 'FAIL' end,v_err);

    ------------------------------------------------------------------- EVENT
    v_ev1 := null; v_ev2 := null;
    begin
      v_ev1 := public.ga_op_save_event(null,'TEST_ONLY_GA_LIFECYCLE event A '||v_label,'career','events','v1',
        now() + interval '20 day', now() + interval '21 day', v_scope);
      v_actual := 'ALLOW'; v_err := null;
    exception when others then v_actual := 'DENY'; v_err := SQLERRM; end;
    insert into public.ga_ops_lifecycle_matrix_results(run_id,actor,domain,step,expected,actual,verdict,detail)
    values (v_run,v_label,'EVENT','create_draft',v_expected,v_actual,case when v_actual=v_expected then 'PASS' else 'FAIL' end,v_err);
    if v_ev1 is not null then insert into ga_lc_tmp values ('event', v_ev1); end if;

    begin
      perform public.ga_op_transition_event(v_ev1,'published');
      v_actual := 'ALLOW'; v_err := null;
    exception when others then v_actual := 'DENY'; v_err := SQLERRM; end;
    insert into public.ga_ops_lifecycle_matrix_results(run_id,actor,domain,step,expected,actual,verdict,detail)
    values (v_run,v_label,'EVENT','draft_to_published',v_expected,v_actual,case when v_actual=v_expected then 'PASS' else 'FAIL' end,v_err);

    begin
      perform public.ga_op_transition_event(v_ev1,'completed');
      v_actual := 'ALLOW'; v_err := null;
    exception when others then v_actual := 'DENY'; v_err := SQLERRM; end;
    insert into public.ga_ops_lifecycle_matrix_results(run_id,actor,domain,step,expected,actual,verdict,detail)
    values (v_run,v_label,'EVENT','published_to_completed',v_expected,v_actual,case when v_actual=v_expected then 'PASS' else 'FAIL' end,v_err);

    begin
      v_ev2 := public.ga_op_save_event(null,'TEST_ONLY_GA_LIFECYCLE event B '||v_label,'career','events','v1',
        now() + interval '20 day', now() + interval '21 day', v_scope);
      v_actual := 'ALLOW'; v_err := null;
    exception when others then v_actual := 'DENY'; v_err := SQLERRM; end;
    insert into public.ga_ops_lifecycle_matrix_results(run_id,actor,domain,step,expected,actual,verdict,detail)
    values (v_run,v_label,'EVENT','create_draft_cancel_path',v_expected,v_actual,case when v_actual=v_expected then 'PASS' else 'FAIL' end,v_err);
    if v_ev2 is not null then insert into ga_lc_tmp values ('event', v_ev2); end if;

    begin
      perform public.ga_op_transition_event(v_ev2,'cancelled');
      v_actual := 'ALLOW'; v_err := null;
    exception when others then v_actual := 'DENY'; v_err := SQLERRM; end;
    insert into public.ga_ops_lifecycle_matrix_results(run_id,actor,domain,step,expected,actual,verdict,detail)
    values (v_run,v_label,'EVENT','draft_to_cancelled',v_expected,v_actual,case when v_actual=v_expected then 'PASS' else 'FAIL' end,v_err);

    ------------------------------------------------------------------ SURVEY
    v_sv := null; v_ver := null;
    begin
      v_sv := public.ga_op_save_survey(null,'TEST_ONLY_GA_LIFECYCLE survey '||v_label,'surveys',5, v_scope);
      v_actual := 'ALLOW'; v_err := null;
    exception when others then v_actual := 'DENY'; v_err := SQLERRM; end;
    insert into public.ga_ops_lifecycle_matrix_results(run_id,actor,domain,step,expected,actual,verdict,detail)
    values (v_run,v_label,'SURVEY','create_survey',v_expected,v_actual,case when v_actual=v_expected then 'PASS' else 'FAIL' end,v_err);
    if v_sv is not null then insert into ga_lc_tmp values ('survey', v_sv); end if;

    begin
      v_ver := public.ga_op_save_survey_version_draft(v_sv, null, 'v1', jsonb_build_array(
        jsonb_build_object('key','q1','kind','single_choice','required',true,'options',jsonb_build_array('a','b')),
        jsonb_build_object('key','q2','kind','free_text','required',false)));
      v_actual := 'ALLOW'; v_err := null;
    exception when others then v_actual := 'DENY'; v_err := SQLERRM; end;
    insert into public.ga_ops_lifecycle_matrix_results(run_id,actor,domain,step,expected,actual,verdict,detail)
    values (v_run,v_label,'SURVEY','create_version_draft_multi_question',v_expected,v_actual,case when v_actual=v_expected then 'PASS' else 'FAIL' end,v_err);
    if v_ver is not null then insert into ga_lc_tmp values ('survey_version', v_ver); end if;

    begin
      perform public.ga_op_save_survey_version_draft(v_sv, v_ver, 'v1', jsonb_build_array(
        jsonb_build_object('key','q1','kind','single_choice','required',true,'options',jsonb_build_array('a','b','c')),
        jsonb_build_object('key','q2','kind','free_text','required',false),
        jsonb_build_object('key','q3','kind','free_text','required',false)));
      v_actual := 'ALLOW'; v_err := null;
    exception when others then v_actual := 'DENY'; v_err := SQLERRM; end;
    insert into public.ga_ops_lifecycle_matrix_results(run_id,actor,domain,step,expected,actual,verdict,detail)
    values (v_run,v_label,'SURVEY','edit_draft_version',v_expected,v_actual,case when v_actual=v_expected then 'PASS' else 'FAIL' end,v_err);

    begin
      perform public.ga_op_publish_survey_version(v_ver);
      v_actual := 'ALLOW'; v_err := null;
    exception when others then v_actual := 'DENY'; v_err := SQLERRM; end;
    insert into public.ga_ops_lifecycle_matrix_results(run_id,actor,domain,step,expected,actual,verdict,detail)
    values (v_run,v_label,'SURVEY','publish_version',v_expected,v_actual,case when v_actual=v_expected then 'PASS' else 'FAIL' end,v_err);

    begin
      perform public.ga_op_save_survey_version_draft(v_sv, v_ver, 'v1', jsonb_build_array(
        jsonb_build_object('key','tamper','kind','free_text','required',false)));
      v_actual := 'ALLOW'; v_err := null;
    exception when others then v_actual := 'DENY'; v_err := SQLERRM; end;
    insert into public.ga_ops_lifecycle_matrix_results(run_id,actor,domain,step,expected,actual,verdict,detail)
    values (v_run,v_label,'SURVEY','negative_edit_published_version','DENY',v_actual,case when v_actual='DENY' then 'PASS' else 'FAIL' end,v_err);

    begin
      perform public.ga_op_close_survey(v_sv);
      v_actual := 'ALLOW'; v_err := null;
    exception when others then v_actual := 'DENY'; v_err := SQLERRM; end;
    insert into public.ga_ops_lifecycle_matrix_results(run_id,actor,domain,step,expected,actual,verdict,detail)
    values (v_run,v_label,'SURVEY','close_survey',v_expected,v_actual,case when v_actual=v_expected then 'PASS' else 'FAIL' end,v_err);

    ----------------------------------------------------------- COMMUNICATION
    v_comm := null;
    begin
      v_comm := public.ga_op_log_communication(v_record, v_cp_ok, 'communications','email','TEST_ONLY_GA_LIFECYCLE_TPL',
        jsonb_build_object('marker','TEST_ONLY_GA_LIFECYCLE'));
      v_actual := 'ALLOW'; v_err := null;
    exception when others then v_actual := 'DENY'; v_err := SQLERRM; end;
    v_expected := case when v_recordscope_allow then 'ALLOW' else 'DENY' end;
    insert into public.ga_ops_lifecycle_matrix_results(run_id,actor,domain,step,expected,actual,verdict,detail)
    values (v_run,v_label,'COMMUNICATION','valid_consent_active_contact',v_expected,v_actual,case when v_actual=v_expected then 'PASS' else 'FAIL' end,v_err);
    if v_comm is not null then insert into ga_lc_tmp values ('communication', v_comm); end if;

    begin
      perform public.ga_op_log_communication(v_record, v_cp_ok, 'TEST_ONLY_no_consent_purpose','email','TEST_ONLY_GA_LIFECYCLE_TPL',
        jsonb_build_object('marker','TEST_ONLY_GA_LIFECYCLE'));
      v_actual := 'ALLOW'; v_err := null;
    exception when others then v_actual := 'DENY'; v_err := SQLERRM; end;
    insert into public.ga_ops_lifecycle_matrix_results(run_id,actor,domain,step,expected,actual,verdict,detail)
    values (v_run,v_label,'COMMUNICATION','missing_consent','DENY',v_actual,case when v_actual='DENY' then 'PASS' else 'FAIL' end,v_err);

    begin
      perform public.ga_op_log_communication(v_record, v_cp_revoked, 'communications','email','TEST_ONLY_GA_LIFECYCLE_TPL',
        jsonb_build_object('marker','TEST_ONLY_GA_LIFECYCLE'));
      v_actual := 'ALLOW'; v_err := null;
    exception when others then v_actual := 'DENY'; v_err := SQLERRM; end;
    insert into public.ga_ops_lifecycle_matrix_results(run_id,actor,domain,step,expected,actual,verdict,detail)
    values (v_run,v_label,'COMMUNICATION','revoked_contact','DENY',v_actual,case when v_actual='DENY' then 'PASS' else 'FAIL' end,v_err);
  end loop;

  perform set_config('request.jwt.claims', '', true);
  return v_run;
end
$fn$;

do $run$
declare
  v_run uuid;
  v_residual int;
  v_fail int;
begin
  v_run := public.ga_ops_lifecycle_matrix_run();

  -- cleanup of TEST_ONLY artifacts (append-only guards temporarily bypassed inside this transaction)
  alter table public.graduate_communication_events disable trigger graduate_communication_events_append_only;
  alter table public.graduate_followups disable trigger graduate_followups_append_only;
  alter table public.graduate_survey_versions disable trigger graduate_survey_versions_immutable_after_publish;
  alter table public.graduate_domain_events disable trigger graduate_domain_events_append_only;

  delete from public.graduate_communication_events where id in (select id from ga_lc_tmp where kind='communication');
  delete from public.graduate_followups where id in (select id from ga_lc_tmp where kind='followup');
  delete from public.graduate_survey_versions where id in (select id from ga_lc_tmp where kind='survey_version');
  delete from public.graduate_surveys where id in (select id from ga_lc_tmp where kind='survey');
  delete from public.graduate_events where id in (select id from ga_lc_tmp where kind='event');
  delete from public.graduate_opportunities where id in (select id from ga_lc_tmp where kind='opportunity');
  delete from public.graduate_contact_points where id in (select id from ga_lc_tmp where kind='contact_point');
  delete from public.graduate_domain_events where aggregate_id in (select id from ga_lc_tmp);

  alter table public.graduate_communication_events enable trigger graduate_communication_events_append_only;
  alter table public.graduate_followups enable trigger graduate_followups_append_only;
  alter table public.graduate_survey_versions enable trigger graduate_survey_versions_immutable_after_publish;
  alter table public.graduate_domain_events enable trigger graduate_domain_events_append_only;

  select
    (select count(*) from public.graduate_opportunities where title like 'TEST_ONLY_GA_LIFECYCLE%')
    + (select count(*) from public.graduate_events where title like 'TEST_ONLY_GA_LIFECYCLE%')
    + (select count(*) from public.graduate_surveys where title like 'TEST_ONLY_GA_LIFECYCLE%')
    + (select count(*) from public.graduate_contact_points where protected_value like 'TEST_ONLY_GA_LIFECYCLE%')
    + (select count(*) from public.graduate_communication_events where template_code = 'TEST_ONLY_GA_LIFECYCLE_TPL')
    + (select count(*) from public.graduate_followups where outcome like 'TEST_ONLY_GA_LIFECYCLE%')
    + (select count(*) from public.graduate_domain_events where aggregate_id in (select id from ga_lc_tmp))
  into v_residual;
  if v_residual <> 0 then
    raise exception 'GA_TEST_ONLY_CLEANUP_FAILED residual=%', v_residual;
  end if;

  select count(*) into v_fail from public.ga_ops_lifecycle_matrix_results
   where run_id = v_run and verdict <> 'PASS';
  raise notice 'GA_LIFECYCLE_RUN=% FAILURES=%', v_run, v_fail;
end
$run$;

drop function if exists public.ga_ops_lifecycle_matrix_run();