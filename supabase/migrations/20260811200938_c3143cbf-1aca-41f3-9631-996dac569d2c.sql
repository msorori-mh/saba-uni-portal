CREATE OR REPLACE FUNCTION public.create_b1_request_draft_for_student(p_canonical_code text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_sp public.student_profiles%rowtype;
  v_canonical text := nullif(btrim(p_canonical_code), '');
  v_stored text;
  v_type public.request_types%rowtype;
  v_existing uuid;
  v_request_id uuid;
  v_request_number text;
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_hash text;
  v_idemp public.b1_draft_mutation_idempotency%rowtype;
  v_lock_key integer;
begin
  v_sp := public.b1_require_active_student_profile();

  if v_canonical is null or public.b1_canonical_primary_stored_code(v_canonical) is null then
    raise exception 'B1_CANONICAL_CODE_REQUIRED' using errcode = '22023';
  end if;
  v_stored := public.b1_canonical_primary_stored_code(v_canonical);

  -- Creation remains fail-closed until this service is explicitly visible and
  -- has exactly one active workflow. RPC existence is not activation.
  select rt.* into v_type from public.request_types rt where rt.code = v_stored;
  if not found then
    raise exception 'B1_REQUEST_TYPE_UNKNOWN' using errcode = '22023';
  end if;
  if v_type.is_active is distinct from true
     or v_type.student_visible is distinct from true
     or (
       select count(*)
       from public.request_type_workflows w
       where w.request_type_id = v_type.id
         and w.status = 'active'
         and w.is_active is true
     ) <> 1 then
    raise exception 'B1_REQUEST_TYPE_INACTIVE' using errcode = '42501';
  end if;

  perform public.assert_student_request_eligibility_rules(v_sp.id, v_stored);

  v_hash := public.b1_draft_payload_hash(v_canonical, '{}'::jsonb, null);
  if v_key is not null then
    select i.* into v_idemp
    from public.b1_draft_mutation_idempotency i
    where i.student_profile_id = v_sp.id
      and i.operation = 'create_draft'
      and i.idempotency_key = v_key
    for update;
    if found then
      if v_idemp.payload_hash is distinct from v_hash then
        raise exception 'B1_IDEMPOTENCY_PAYLOAD_MISMATCH' using errcode = '23514';
      end if;
      return public.b1_build_student_draft_dto(v_idemp.request_id);
    end if;
  end if;

  v_lock_key := hashtext(v_sp.id::text || ':' || v_stored);
  perform pg_advisory_xact_lock(v_lock_key);

  select r.id into v_existing
  from public.student_requests r
  where r.student_profile_id = v_sp.id
    and r.request_type = v_stored
    and r.status = 'draft'
  order by r.created_at asc
  limit 1
  for update;

  if v_existing is not null then
    if v_key is not null then
      insert into public.b1_draft_mutation_idempotency(
        student_profile_id, operation, idempotency_key, request_id, payload_hash
      ) values (v_sp.id, 'create_draft', v_key, v_existing, v_hash)
      on conflict do nothing;
      if exists (
        select 1 from public.b1_draft_mutation_idempotency i
        where i.student_profile_id = v_sp.id
          and i.operation = 'create_draft'
          and i.idempotency_key = v_key
          and (i.payload_hash is distinct from v_hash or i.request_id is distinct from v_existing)
      ) then
        raise exception 'B1_IDEMPOTENCY_PAYLOAD_MISMATCH' using errcode = '23514';
      end if;
    end if;
    return public.b1_build_student_draft_dto(v_existing);
  end if;

  v_request_number := 'SR-' || to_char(now(), 'YYYYMMDD') || '-'
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  begin
    insert into public.student_requests (
      request_number, student_profile_id, request_type, title, description,
      status, form_data, student_notes
    ) values (
      v_request_number, v_sp.id, v_stored, coalesce(nullif(btrim(v_type.name_ar), ''), v_stored),
      null, 'draft', '{}'::jsonb, null
    )
    returning id into v_request_id;
  exception
    when unique_violation then
      select r.id into v_request_id
      from public.student_requests r
      where r.student_profile_id = v_sp.id
        and r.request_type = v_stored
        and r.status = 'draft'
      order by r.created_at asc
      limit 1;
      if v_request_id is null then
        raise;
      end if;
  end;

  -- No detail row, no workflow runtime, no notifications.
  if v_key is not null then
    insert into public.b1_draft_mutation_idempotency(
      student_profile_id, operation, idempotency_key, request_id, payload_hash
    ) values (v_sp.id, 'create_draft', v_key, v_request_id, v_hash)
    on conflict (student_profile_id, operation, idempotency_key) do update
      set request_id = excluded.request_id
      where public.b1_draft_mutation_idempotency.payload_hash = excluded.payload_hash;
    if exists (
      select 1 from public.b1_draft_mutation_idempotency i
      where i.student_profile_id = v_sp.id and i.operation = 'create_draft'
        and i.idempotency_key = v_key and i.payload_hash is distinct from v_hash
    ) then
      raise exception 'B1_IDEMPOTENCY_PAYLOAD_MISMATCH' using errcode = '23514';
    end if;
  end if;

  return public.b1_build_student_draft_dto(v_request_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_b1_student_request_atomic(p_request_id uuid, p_canonical_code text, p_form_data jsonb, p_expected_updated_at timestamp with time zone, p_attachment_ids uuid[] DEFAULT ARRAY[]::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_request public.student_requests%ROWTYPE;
  v_profile_id uuid;
  v_profile_status text;
  v_init jsonb;
  v_request_type public.request_types%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  SELECT c.profile_id,c.profile_status INTO v_profile_id,v_profile_status
  FROM public.current_student_profile_for_auth() c;
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'ACTIVE_STUDENT_PROFILE_REQUIRED' USING ERRCODE='42501'; END IF;

  SELECT r.* INTO v_request FROM public.student_requests r
  WHERE r.id=p_request_id AND r.student_profile_id=v_profile_id
    AND r.status IN ('draft','returned','returned_for_completion') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'B1_OWNED_SUBMITTABLE_REQUEST_REQUIRED' USING ERRCODE='42501'; END IF;
  IF p_expected_updated_at IS NULL OR v_request.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'B1_STALE_REQUEST_VERSION' USING ERRCODE='40001';
  END IF;
  SELECT rt.* INTO v_request_type FROM public.request_types rt
  WHERE rt.code=v_request.request_type AND rt.is_active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'B1_ACTIVE_REQUEST_TYPE_REQUIRED'; END IF;
  PERFORM public.assert_student_can_use_request_type(v_profile_status,v_request_type.request_audience);
  PERFORM public.assert_student_request_eligibility_rules(v_profile_id, v_request.request_type);

  -- This dispatcher validates trusted references, service rules, attachments,
  -- and writes details. Its default implementation above always fails closed.
  PERFORM public.persist_validated_b1_request_details(
    p_request_id,p_canonical_code,COALESCE(p_form_data,'{}'::jsonb),COALESCE(p_attachment_ids,ARRAY[]::uuid[])
  );
  v_init := public.initialize_b1_request_workflow_strict(p_request_id,p_canonical_code);

  PERFORM set_config('b1.atomic_submit','1',true);
  PERFORM set_config('student_request.submit_via_rpc','1',true);
  UPDATE public.student_requests SET status='submitted',submitted_at=COALESCE(submitted_at,now()),
    rejection_reason=NULL,updated_at=now() WHERE id=p_request_id;
  INSERT INTO public.student_request_workflow_events(student_request_id,event_type,actor_user_id,payload,visible_to_student)
  VALUES(p_request_id,'submitted',v_uid,jsonb_build_object('canonical_code',p_canonical_code),true);
  RETURN jsonb_build_object('success',true,'request_id',p_request_id,'workflow',v_init);
END;
$function$;