create or replace function public.graduate_affairs_moderate_opportunity(
  p_opportunity_id uuid, p_target_state text)
returns void
language plpgsql
volatile
security definer
set search_path to 'public'
as $fn$
declare v_current_state text; v_allowed boolean; v_mode text; v_scope jsonb;
begin
  if p_target_state is null or p_target_state not in ('draft','in_review','published','closed','archived') then
    raise exception 'GRADUATE_OPPORTUNITY_UNKNOWN_STATE';
  end if;
  select o.state::text, o.audience_scope into v_current_state, v_scope
  from public.graduate_opportunities o where o.id = p_opportunity_id for update;
  if not found then raise exception 'GRADUATE_AFFAIRS_TARGET_NOT_FOUND'; end if;
  v_mode := public.ga_lock_scope_actor_mode(v_scope);
  v_allowed := (v_current_state = 'draft' and p_target_state in ('in_review','archived'))
    or (v_current_state = 'in_review' and p_target_state in ('draft','published','archived'))
    or (v_current_state = 'published' and p_target_state = 'closed')
    or (v_current_state = 'closed' and p_target_state = 'archived');
  if not v_allowed then raise exception 'GRADUATE_OPPORTUNITY_INVALID_TRANSITION'; end if;
  update public.graduate_opportunities o
  set state = p_target_state::public.graduate_opportunity_state,
      published_at = case when p_target_state = 'published' then now() else o.published_at end,
      moderated_by = case when p_target_state = 'published' then auth.uid() else o.moderated_by end
  where o.id = p_opportunity_id;
  perform public.graduate_affairs_audit(
    'graduate_opportunity_moderated','graduate_opportunity', p_opportunity_id,'opportunity_moderation',
    jsonb_build_object('from_state', v_current_state, 'to_state', p_target_state, 'actor_mode', v_mode));
end
$fn$;

create or replace function public.ga_ops_opportunity_matrix_run()
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
  a jsonb; v_label text; v_allow boolean; v_scope jsonb;
  v_actual text; v_expected text; v_err text; v_opp uuid;
begin
  if auth.uid() is not null then
    raise exception 'GA_LIFECYCLE_HARNESS_REQUIRES_SERVICE_CONTEXT';
  end if;
  create temp table if not exists ga_opp_tmp(id uuid) on commit drop;

  for a in select * from jsonb_array_elements(v_actors) loop
    v_label := a->>'label';
    v_allow := (a->>'allow')::boolean;
    v_scope := case when a->>'scope' = 'home' then v_home else v_foreign end;
    v_expected := case when v_allow then 'ALLOW' else 'DENY' end;
    perform set_config('request.jwt.claims', json_build_object('sub', a->>'uid')::text, true);
    v_opp := null;

    begin
      v_opp := public.ga_op_save_opportunity(null,'job','TEST_ONLY_GA_LIFECYCLE opp2 '||v_label,'probe', v_scope, now() + interval '30 day', null);
      v_actual := 'ALLOW'; v_err := null;
    exception when others then v_actual := 'DENY'; v_err := SQLERRM; end;
    insert into public.ga_ops_lifecycle_matrix_results(run_id,actor,domain,step,expected,actual,verdict,detail)
    values (v_run,v_label,'OPPORTUNITY','create_draft',v_expected,v_actual,case when v_actual=v_expected then 'PASS' else 'FAIL' end,v_err);
    if v_opp is not null then insert into ga_opp_tmp values (v_opp); end if;

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

    begin
      perform public.graduate_affairs_moderate_opportunity(v_opp,'published'::text);
      v_actual := 'ALLOW'; v_err := null;
    exception when others then v_actual := 'DENY'; v_err := SQLERRM; end;
    insert into public.ga_ops_lifecycle_matrix_results(run_id,actor,domain,step,expected,actual,verdict,detail)
    values (v_run,v_label,'OPPORTUNITY','negative_reopen_after_closed','DENY',v_actual,case when v_actual='DENY' then 'PASS' else 'FAIL' end,v_err);
  end loop;

  perform set_config('request.jwt.claims', '', true);
  return v_run;
end
$fn$;

do $run$
declare v_run uuid; v_fail int; v_residual int;
begin
  v_run := public.ga_ops_opportunity_matrix_run();

  alter table public.graduate_domain_events disable trigger graduate_domain_events_append_only;
  delete from public.graduate_domain_events where aggregate_id in (select id from ga_opp_tmp);
  alter table public.graduate_domain_events enable trigger graduate_domain_events_append_only;
  delete from public.graduate_opportunities where id in (select id from ga_opp_tmp);

  select (select count(*) from public.graduate_opportunities where title like 'TEST_ONLY_GA_LIFECYCLE%')
       + (select count(*) from public.graduate_domain_events where aggregate_id in (select id from ga_opp_tmp))
  into v_residual;
  if v_residual <> 0 then raise exception 'GA_TEST_ONLY_CLEANUP_FAILED residual=%', v_residual; end if;

  delete from public.ga_ops_lifecycle_matrix_results
   where domain = 'OPPORTUNITY' and run_id <> v_run;

  select count(*) into v_fail from public.ga_ops_lifecycle_matrix_results where verdict <> 'PASS';
  if v_fail <> 0 then raise exception 'GA_LIFECYCLE_MATRIX_FAILURES=%', v_fail; end if;
  raise notice 'GA_OPPORTUNITY_RERUN=% ALL_PASS', v_run;
end
$run$;

drop function if exists public.ga_ops_opportunity_matrix_run();