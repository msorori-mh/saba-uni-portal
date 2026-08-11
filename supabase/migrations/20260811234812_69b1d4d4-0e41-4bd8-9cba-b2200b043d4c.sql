
create table if not exists public.ga_ops_authz_matrix_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  actor text not null,
  op text not null,
  expected text not null,
  actual text not null,
  verdict text not null,
  created_at timestamptz not null default now()
);
grant all on public.ga_ops_authz_matrix_results to service_role;
alter table public.ga_ops_authz_matrix_results enable row level security;
create policy "matrix results readable by admins"
  on public.ga_ops_authz_matrix_results for select to authenticated
  using (public.has_role(auth.uid(),'admin'::public.app_role)
         or public.has_role(auth.uid(),'system_admin'::public.app_role));

drop function if exists public.ga_ops_authz_matrix_run();

create or replace function public.ga_ops_authz_matrix_run()
returns uuid
language plpgsql
volatile
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_run uuid := gen_random_uuid();
  v_actors jsonb := jsonb_build_array(
    jsonb_build_object('label','MANAGER','uid','640b6cce-781a-4831-8950-c4b889204908'),
    jsonb_build_object('label','SPECIALIST','uid','c870a7ee-d328-410d-b9e8-408c2fb033d5'),
    jsonb_build_object('label','ADMIN','uid','4dfc095d-cdb2-4053-8913-7cb5282adaa0'),
    jsonb_build_object('label','SYSTEM_ADMIN','uid','323c4f8e-c248-42ac-82ed-92528a11ee55'),
    jsonb_build_object('label','DEAN','uid','72e93a64-1fb1-457b-bcd2-ef7bcd90e769'),
    jsonb_build_object('label','REGISTRAR','uid','4c261c1c-97fb-42da-a544-e8a59853ebe3'),
    jsonb_build_object('label','FACULTY','uid','0023ca37-e21d-4944-9853-194a904ecfae'),
    jsonb_build_object('label','STUDENT','uid','002c91b6-99da-4d84-bd0a-574d1ca166fe')
  );
  v_home jsonb := jsonb_build_object('department_ids', jsonb_build_array('11111111-1111-4111-8111-111111111111'));
  v_foreign jsonb := jsonb_build_object('department_ids', jsonb_build_array('ce485c67-5f7c-498d-b120-4b1130a86ae8'));
  v_college jsonb := jsonb_build_object('all_graduates', true);
  a jsonb; v_label text; v_priv boolean; v_spec boolean;
  v_actual text; v_expected text; v_ignore uuid; v_count int;
begin
  if auth.uid() is not null then
    raise exception 'GA_MATRIX_HARNESS_REQUIRES_SERVICE_CONTEXT';
  end if;

  for a in select * from jsonb_array_elements(v_actors) loop
    v_label := a->>'label';
    v_priv := v_label in ('MANAGER','ADMIN','SYSTEM_ADMIN');
    v_spec := v_label = 'SPECIALIST';
    perform set_config('request.jwt.claims', json_build_object('sub', a->>'uid')::text, true);

    begin
      v_ignore := public.ga_op_save_opportunity(null,'job','TEST_ONLY_GA_OPS_MATRIX '||v_label,'probe', v_college, null, null);
      v_actual := 'ALLOW';
    exception when others then v_actual := 'DENY'; end;
    v_expected := case when v_priv then 'ALLOW' else 'DENY' end;
    insert into public.ga_ops_authz_matrix_results(run_id,actor,op,expected,actual,verdict)
    values (v_run, v_label, 'save_opportunity(college_wide)', v_expected, v_actual,
            case when v_actual = v_expected then 'PASS' else 'FAIL' end);

    begin
      v_ignore := public.ga_op_save_opportunity(null,'job','TEST_ONLY_GA_OPS_MATRIX '||v_label,'probe', v_home, null, null);
      v_actual := 'ALLOW';
    exception when others then v_actual := 'DENY'; end;
    v_expected := case when v_priv or v_spec then 'ALLOW' else 'DENY' end;
    insert into public.ga_ops_authz_matrix_results(run_id,actor,op,expected,actual,verdict)
    values (v_run, v_label, 'save_opportunity(home_department)', v_expected, v_actual,
            case when v_actual = v_expected then 'PASS' else 'FAIL' end);

    begin
      v_ignore := public.ga_op_save_opportunity(null,'job','TEST_ONLY_GA_OPS_MATRIX '||v_label,'probe', v_foreign, null, null);
      v_actual := 'ALLOW';
    exception when others then v_actual := 'DENY'; end;
    v_expected := case when v_priv then 'ALLOW' else 'DENY' end;
    insert into public.ga_ops_authz_matrix_results(run_id,actor,op,expected,actual,verdict)
    values (v_run, v_label, 'save_opportunity(foreign_department)', v_expected, v_actual,
            case when v_actual = v_expected then 'PASS' else 'FAIL' end);

    begin
      v_ignore := public.ga_op_save_event(null,'TEST_ONLY_GA_OPS_MATRIX '||v_label,'career','events','v1',
        now() + interval '10 day', now() + interval '11 day', v_home);
      v_actual := 'ALLOW';
    exception when others then v_actual := 'DENY'; end;
    v_expected := case when v_priv or v_spec then 'ALLOW' else 'DENY' end;
    insert into public.ga_ops_authz_matrix_results(run_id,actor,op,expected,actual,verdict)
    values (v_run, v_label, 'save_event(home_department)', v_expected, v_actual,
            case when v_actual = v_expected then 'PASS' else 'FAIL' end);

    begin
      v_ignore := public.ga_op_save_event(null,'TEST_ONLY_GA_OPS_MATRIX '||v_label,'career','events','v1',
        now() + interval '10 day', now() + interval '11 day', v_foreign);
      v_actual := 'ALLOW';
    exception when others then v_actual := 'DENY'; end;
    v_expected := case when v_priv then 'ALLOW' else 'DENY' end;
    insert into public.ga_ops_authz_matrix_results(run_id,actor,op,expected,actual,verdict)
    values (v_run, v_label, 'save_event(foreign_department)', v_expected, v_actual,
            case when v_actual = v_expected then 'PASS' else 'FAIL' end);

    begin
      v_ignore := public.ga_op_save_survey(null,'TEST_ONLY_GA_OPS_MATRIX '||v_label,'surveys',5, v_home);
      v_actual := 'ALLOW';
    exception when others then v_actual := 'DENY'; end;
    v_expected := case when v_priv or v_spec then 'ALLOW' else 'DENY' end;
    insert into public.ga_ops_authz_matrix_results(run_id,actor,op,expected,actual,verdict)
    values (v_run, v_label, 'save_survey(home_department)', v_expected, v_actual,
            case when v_actual = v_expected then 'PASS' else 'FAIL' end);

    begin
      v_ignore := public.ga_op_save_survey(null,'TEST_ONLY_GA_OPS_MATRIX '||v_label,'surveys',5, v_foreign);
      v_actual := 'ALLOW';
    exception when others then v_actual := 'DENY'; end;
    v_expected := case when v_priv then 'ALLOW' else 'DENY' end;
    insert into public.ga_ops_authz_matrix_results(run_id,actor,op,expected,actual,verdict)
    values (v_run, v_label, 'save_survey(foreign_department)', v_expected, v_actual,
            case when v_actual = v_expected then 'PASS' else 'FAIL' end);

    begin
      perform public.graduate_affairs_set_employer_verification(
        '00000000-0000-4000-8000-000000000000'::uuid, 'in_review');
      v_actual := 'ALLOW';
    exception
      when others then
        v_actual := case when SQLERRM like '%TARGET_NOT_FOUND%' then 'ALLOW' else 'DENY' end;
    end;
    v_expected := case when v_priv then 'ALLOW' else 'DENY' end;
    insert into public.ga_ops_authz_matrix_results(run_id,actor,op,expected,actual,verdict)
    values (v_run, v_label, 'employer_verification', v_expected, v_actual,
            case when v_actual = v_expected then 'PASS' else 'FAIL' end);

    begin
      select count(*) into v_count from public.ga_op_list_opportunities();
      v_actual := 'ALLOW';
    exception when others then v_actual := 'DENY'; end;
    v_expected := case when v_priv or v_spec then 'ALLOW' else 'DENY' end;
    insert into public.ga_ops_authz_matrix_results(run_id,actor,op,expected,actual,verdict)
    values (v_run, v_label, 'list_opportunities', v_expected, v_actual,
            case when v_actual = v_expected then 'PASS' else 'FAIL' end);
  end loop;

  perform set_config('request.jwt.claims', '', true);

  delete from public.graduate_survey_versions sv
   using public.graduate_surveys s
   where sv.survey_id = s.id and s.title like 'TEST_ONLY_GA_OPS_MATRIX%';
  delete from public.graduate_surveys where title like 'TEST_ONLY_GA_OPS_MATRIX%';
  delete from public.graduate_events where title like 'TEST_ONLY_GA_OPS_MATRIX%';
  delete from public.graduate_opportunities where title like 'TEST_ONLY_GA_OPS_MATRIX%';
  return v_run;
end $$;

grant execute on function public.ga_ops_authz_matrix_run() to public;
