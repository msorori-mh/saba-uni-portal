-- READ ONLY
-- Post-verifier for B1-FIVE-SERVICES-SECURE-DRAFT-MUTATIONS-01

begin;

do $$
declare
  v_create regprocedure := 'public.create_b1_request_draft_for_student(text,text)'::regprocedure;
  v_save regprocedure := 'public.save_b1_request_draft_for_student(uuid,jsonb,timestamptz,text)'::regprocedure;
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
end $$;

select 'POST_OK_B1_SECURE_DRAFT_MUTATIONS_01' as status;

ROLLBACK;
