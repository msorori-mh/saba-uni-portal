-- READ ONLY
-- Post-verifier for B1-FIVE-SERVICES-SECURE-DRAFT-MUTATIONS-01

begin;

do $$
declare
  v_create regprocedure := 'public.create_b1_request_draft_for_student(text,text)'::regprocedure;
  v_save regprocedure := 'public.save_b1_request_draft_for_student(uuid,jsonb,timestamptz,text)'::regprocedure;
  v_capability regprocedure := 'public.get_b1_secure_read_runtime_capability()'::regprocedure;
  v_create_def text;
  v_save_def text;
  v_capability_def text;
begin
  if to_regprocedure('public.create_b1_request_draft_for_student(text,text)') is null then
    raise exception 'POST_FAIL: create_b1_request_draft_for_student missing';
  end if;
  if to_regprocedure('public.save_b1_request_draft_for_student(uuid,jsonb,timestamptz,text)') is null then
    raise exception 'POST_FAIL: save_b1_request_draft_for_student missing';
  end if;
  if to_regclass('public.b1_draft_mutation_idempotency') is null then
    raise exception 'POST_FAIL: b1_draft_mutation_idempotency missing';
  end if;
  if not has_function_privilege('authenticated', v_create, 'execute') then
    raise exception 'POST_FAIL: authenticated lacks execute on create';
  end if;
  if not has_function_privilege('authenticated', v_save, 'execute') then
    raise exception 'POST_FAIL: authenticated lacks execute on save';
  end if;
  if has_function_privilege('anon', v_create, 'execute') then
    raise exception 'POST_FAIL: anon can execute create';
  end if;
  if has_function_privilege('anon', v_save, 'execute') then
    raise exception 'POST_FAIL: anon can execute save';
  end if;
  if has_table_privilege('authenticated', 'public.b1_draft_mutation_idempotency', 'select')
     or has_table_privilege('authenticated', 'public.b1_draft_mutation_idempotency', 'insert') then
    raise exception 'POST_FAIL: authenticated has direct idempotency table access';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname='public' and indexname='uq_b1_one_open_draft_per_student_type'
  ) then
    raise exception 'POST_FAIL: unique open-draft index missing';
  end if;
  select pg_get_functiondef(v_create), pg_get_functiondef(v_save),
         pg_get_functiondef(v_capability)
  into v_create_def, v_save_def, v_capability_def;
  if v_create_def not ilike '%student_visible is distinct from true%'
     or v_create_def not ilike '%request_type_workflows%'
     or v_create_def not ilike '%count(*)%<> 1%' then
    raise exception 'POST_FAIL: create readiness guard missing';
  end if;
  if v_save_def not ilike '%p_expected_updated_at is null%'
     or v_save_def not ilike '%B1_STALE_REQUEST_VERSION%' then
    raise exception 'POST_FAIL: mandatory optimistic concurrency guard missing';
  end if;
  if position('return public.b1_build_student_draft_dto(p_request_id)' in v_save_def)
       > position('v_r.updated_at is distinct from p_expected_updated_at' in v_save_def) then
    raise exception 'POST_FAIL: idempotent retry is checked after stale guard';
  end if;
  if v_capability_def ilike '%' || quote_literal('available') || ', true%'
     or v_capability_def ilike '%' || quote_literal('viewer') || '%'
     or v_capability_def not ilike '%v_ready_count = 5%' then
    raise exception 'POST_FAIL: secure-read fail-closed capability regressed';
  end if;
end $$;

select 'POST_OK_B1_SECURE_DRAFT_MUTATIONS_01' as status;

ROLLBACK;
