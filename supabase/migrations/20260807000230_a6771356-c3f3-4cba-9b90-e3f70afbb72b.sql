do $$ begin
  if to_regclass('public.graduation_projects') is null then
    raise exception 'graduation projects foundation missing; apply A1 first';
  end if;
  if to_regprocedure('public.create_graduation_project_file_upload_intent(uuid,text,text,bigint,uuid,text)') is not null then
    raise exception 'graduation project storage RPCs already exist; refuse ambiguous retry';
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from storage.buckets
    where id = 'graduation-projects'
      and name = 'graduation-projects'
      and public = false
  ) then
    raise exception
      'graduation-projects private bucket missing or public; create via Lovable storage_create_bucket only';
  end if;
end $$;

create policy graduation_projects_storage_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'graduation-projects'
  and exists (
    select 1 from public.graduation_project_files f
    where f.object_key = name and f.upload_status = 'pending'
      and exists (
        select 1 from public.graduation_project_assignments a
        where a.id = f.uploaded_by_assignment_id and a.project_id = f.project_id
          and a.user_id = auth.uid() and a.active
      )
  )
  and name like 'graduation-projects/%'
  and name not like '%..%'
);

create function public.create_graduation_project_file_upload_intent(
  p_project_id uuid,
  p_category text,
  p_original_name text,
  p_byte_size bigint,
  p_correlation_id uuid,
  p_sha256 text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a public.graduation_project_assignments;
  p public.graduation_projects;
  v_replay uuid;
  v_payload jsonb;
  v_req jsonb;
  v_cat public.graduation_project_file_category;
  v_safe text;
  v_key text;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select * into p from public.graduation_projects where id = p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a := public.require_graduation_project_leader(p_project_id);
  v_req := jsonb_build_object(
    'category', p_category, 'original_name', p_original_name, 'byte_size', p_byte_size, 'sha256', p_sha256
  );
  select e.entity_id, e.payload into v_replay, v_payload
  from public.graduation_project_events e
  where e.project_id = p_project_id and e.correlation_id = p_correlation_id and e.event_type = 'file_upload_intent_created';
  if v_replay is not null then
    if v_payload ? 'request' and v_payload->'request' is distinct from v_req then
      raise exception 'idempotent replay payload mismatch';
    end if;
    return jsonb_build_object(
      'file_id', v_replay, 'storage_bucket', 'graduation-projects',
      'storage_object_path', coalesce(v_payload->>'storage_object_path', (
        select f.object_key from public.graduation_project_files f where f.id = v_replay
      )),
      'category', coalesce(v_payload->>'category', p_category)
    );
  end if;
  begin
    v_cat := p_category::public.graduation_project_file_category;
  exception when invalid_text_representation then
    raise exception 'file category invalid';
  end;
  if v_cat = 'proposal' and p.lifecycle_state not in ('draft','revision_required') then
    raise exception 'proposal upload state denied';
  elsif v_cat = 'progress' and p.lifecycle_state <> 'active' then
    raise exception 'progress upload state denied';
  elsif v_cat = 'final' and p.lifecycle_state <> 'active' and p.final_decision is distinct from 'revisions_required' then
    raise exception 'final upload state denied';
  end if;
  v_safe := regexp_replace(btrim(coalesce(p_original_name,'')), '^.*[/\\]', '');
  v_safe := regexp_replace(v_safe, '[^a-zA-Z0-9._-]', '_', 'g');
  if length(v_safe) < 1 or length(v_safe) > 255 then raise exception 'original file name invalid'; end if;
  if v_safe !~ '\.pdf$' then v_safe := v_safe || '.pdf'; end if;
  if length(v_safe) > 255 then v_safe := left(v_safe, 251) || '.pdf'; end if;
  if p_byte_size is null or p_byte_size < 1 or p_byte_size > 20971520 then raise exception 'file size invalid'; end if;
  if p_sha256 is not null and p_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'sha256 invalid'; end if;
  v_key := 'graduation-projects/' || p_project_id::text || '/' || v_cat::text || '/'
    || gen_random_uuid()::text || '-' || v_safe;
  if not public.is_safe_graduation_project_object_key(p_project_id, v_key) then
    raise exception 'object key unsafe';
  end if;
  insert into public.graduation_project_files(
    project_id, category, object_key, original_name, media_type, byte_size, sha256,
    upload_status, scan_state, is_current, uploaded_by_assignment_id
  ) values (
    p_project_id, v_cat, v_key, v_safe, 'application/pdf', p_byte_size, p_sha256,
    'pending', 'pending', false, a.id
  ) returning id into v_id;
  v_payload := jsonb_build_object(
    'file_id', v_id, 'storage_bucket', 'graduation-projects',
    'storage_object_path', v_key, 'category', v_cat::text, 'request', v_req
  );
  insert into public.graduation_project_events(
    project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id, correlation_id, payload
  ) values (
    p_project_id, auth.uid(), a.id, 'file_upload_intent_created', 'graduation_project_files', v_id, p_correlation_id, v_payload
  );
  return v_payload;
end $$;

create function public.register_graduation_project_file(
  p_project_id uuid,
  p_category text,
  p_original_name text,
  p_byte_size bigint,
  p_correlation_id uuid,
  p_sha256 text default null
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  v := public.create_graduation_project_file_upload_intent(
    p_project_id, p_category, p_original_name, p_byte_size, p_correlation_id, p_sha256);
  return (v->>'file_id')::uuid;
end $$;

create function public.finalize_graduation_project_file(
  p_file_id uuid,
  p_correlation_id uuid,
  p_sha256 text default null
) returns jsonb language plpgsql security definer set search_path = public, storage, pg_temp as $$
declare
  a public.graduation_project_assignments;
  f public.graduation_project_files;
  p public.graduation_projects;
  o storage.objects%rowtype;
  v_replay uuid;
  v_payload jsonb;
  v_skip boolean;
  v_req jsonb;
  v_sha text;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select * into f from public.graduation_project_files where id = p_file_id for update;
  if f.id is null then raise exception 'file not found'; end if;
  select * into p from public.graduation_projects where id = f.project_id for update;
  a := public.require_graduation_project_leader(f.project_id);
  if f.uploaded_by_assignment_id <> a.id then raise exception 'uploader assignment mismatch'; end if;
  v_sha := coalesce(p_sha256, f.sha256);
  v_req := jsonb_build_object('file_id', p_file_id, 'sha256', v_sha);
  select e.entity_id, e.payload into v_replay, v_payload
  from public.graduation_project_events e
  where e.project_id = f.project_id and e.correlation_id = p_correlation_id and e.event_type = 'file_finalized';
  if v_replay is not null then
    if v_payload ? 'request' and v_payload->'request' is distinct from v_req then
      raise exception 'idempotent replay payload mismatch';
    end if;
    if v_replay <> f.id then raise exception 'idempotent replay entity mismatch'; end if;
    return jsonb_build_object(
      'file_id', f.id, 'category', f.category::text,
      'upload_status', f.upload_status::text, 'scan_state', f.scan_state::text, 'is_current', f.is_current,
      'sha256', f.sha256
    );
  end if;
  if f.upload_status <> 'pending' then raise exception 'file finalize precondition failed'; end if;
  if v_sha is null or v_sha !~ '^[0-9a-f]{64}$' then raise exception 'sha256 required at finalize'; end if;
  if f.sha256 is not null and f.sha256 is distinct from v_sha then raise exception 'sha256 mismatch at finalize'; end if;
  v_skip := to_regclass('storage.objects') is null
    or coalesce(current_setting('gp.verify.skip_storage_object_check', true), '') = 'on';
  if not v_skip then
    select * into o from storage.objects where bucket_id = 'graduation-projects' and name = f.object_key;
    if not found
      or coalesce((o.metadata->>'size')::bigint, -1) <> f.byte_size
      or coalesce(o.metadata->>'mimetype', '') <> f.media_type
    then raise exception 'storage object mismatch'; end if;
  end if;
  update public.graduation_project_files set upload_status = 'uploaded', sha256 = v_sha where id = f.id;
  if f.category in ('proposal','final') then
    update public.graduation_project_files
    set upload_status = 'superseded', is_current = false, superseded_at = now()
    where project_id = f.project_id and category = f.category and is_current and id <> f.id;
  end if;
  update public.graduation_project_files
  set upload_status = 'active', finalized_at = now(), sha256 = v_sha,
      is_current = (f.category in ('proposal','final'))
  where id = f.id returning * into f;
  v_payload := jsonb_build_object(
    'file_id', f.id, 'category', f.category::text,
    'upload_status', f.upload_status::text, 'scan_state', f.scan_state::text, 'is_current', f.is_current,
    'sha256', f.sha256, 'request', v_req
  );
  insert into public.graduation_project_events(
    project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id, correlation_id, payload
  ) values (
    f.project_id, auth.uid(), a.id, 'file_finalized', 'graduation_project_files', f.id, p_correlation_id, v_payload
  );
  return v_payload;
end $$;

create function public.mark_graduation_project_file_scan_state(
  p_file_id uuid,
  p_scan_state text,
  p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a public.graduation_project_assignments;
  f public.graduation_project_files;
  v_new public.graduation_project_scan_state;
  v_replay uuid;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select * into f from public.graduation_project_files where id = p_file_id for update;
  if f.id is null then raise exception 'file not found'; end if;
  a := public.require_graduation_project_assignment(f.project_id, array['coordinator']::public.graduation_project_assignment_role[]);
  v_replay := public.gp_replay_entity(f.project_id, p_correlation_id, 'file_scan_state_marked');
  if v_replay is not null then
    if v_replay <> f.id then raise exception 'idempotent replay entity mismatch'; end if;
    return f.id;
  end if;
  begin
    v_new := p_scan_state::public.graduation_project_scan_state;
  exception when invalid_text_representation then
    raise exception 'scan state invalid';
  end;
  if v_new not in ('clean','quarantined','rejected') then raise exception 'scan state invalid'; end if;
  if f.scan_state <> 'pending' then raise exception 'scan state transition denied'; end if;
  update public.graduation_project_files set scan_state = v_new where id = f.id;
  insert into public.graduation_project_events(
    project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id, correlation_id,
    payload
  ) values (
    f.project_id, auth.uid(), a.id, 'file_scan_state_marked', 'graduation_project_files', f.id, p_correlation_id,
    jsonb_build_object('scan_state', v_new::text)
  );
  return f.id;
end $$;

create function public.create_graduation_project_signed_download(
  p_file_id uuid,
  p_correlation_id uuid
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  f public.graduation_project_files;
  v_ok boolean;
  v_replay uuid;
  v_payload jsonb;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select * into f from public.graduation_project_files where id = p_file_id;
  if f.id is null then raise exception 'file not found'; end if;
  v_replay := public.gp_replay_entity(f.project_id, p_correlation_id, 'file_download_authorized');
  if v_replay is not null then
    if v_replay <> f.id then raise exception 'idempotent replay entity mismatch'; end if;
    select e.payload into v_payload from public.graduation_project_events e
    where e.project_id = f.project_id and e.correlation_id = p_correlation_id and e.event_type = 'file_download_authorized';
    if v_payload is not null then return v_payload; end if;
    return jsonb_build_object(
      'storage_bucket', 'graduation-projects', 'storage_object_path', f.object_key, 'expires_in_seconds', 300
    );
  end if;
  if f.upload_status not in ('active','superseded') or f.scan_state <> 'clean' then
    raise exception 'file download not authorized';
  end if;
  select exists (
    select 1 from public.graduation_project_assignments a
    where a.project_id = f.project_id and a.user_id = auth.uid() and a.active and a.ended_at is null
      and (
        a.role in ('student','coordinator','panel_member')
        or (a.role = 'supervisor' and a.supervision_status in ('pending','accepted'))
      )
  ) into v_ok;
  if not v_ok then raise exception 'exact project assignment required'; end if;
  v_payload := jsonb_build_object(
    'storage_bucket', 'graduation-projects',
    'storage_object_path', f.object_key,
    'expires_in_seconds', 300
  );
  insert into public.graduation_project_events(
    project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id, correlation_id, payload
  ) values (
    f.project_id, auth.uid(), null, 'file_download_authorized', 'graduation_project_files', f.id, p_correlation_id, v_payload
  );
  return v_payload;
end $$;

create function public.cleanup_graduation_project_orphan_storage_contract(
  p_project_id uuid,
  p_correlation_id uuid
) returns jsonb language plpgsql security definer set search_path = public, storage, pg_temp as $$
declare
  a public.graduation_project_assignments;
  v_replay uuid;
  v_payload jsonb;
  v_candidates jsonb;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  if not exists (select 1 from public.graduation_projects where id = p_project_id) then
    raise exception 'project not found';
  end if;
  a := public.require_graduation_project_assignment(p_project_id, array['coordinator']::public.graduation_project_assignment_role[]);
  v_replay := public.gp_replay_entity(p_project_id, p_correlation_id, 'orphan_storage_contract_queried');
  if v_replay is not null then
    select e.payload into v_payload from public.graduation_project_events e
    where e.project_id = p_project_id and e.correlation_id = p_correlation_id and e.event_type = 'orphan_storage_contract_queried';
    if v_payload is not null then return v_payload; end if;
  end if;
  if to_regclass('storage.objects') is not null then
    select coalesce(jsonb_agg(o.name order by o.name), '[]'::jsonb) into v_candidates
    from storage.objects o
    where o.bucket_id = 'graduation-projects'
      and o.name like 'graduation-projects/' || p_project_id::text || '/%'
      and (
        not exists (select 1 from public.graduation_project_files f where f.object_key = o.name)
        or exists (
          select 1 from public.graduation_project_files f
          where f.object_key = o.name and f.upload_status = 'pending'
            and f.created_at < now() - interval '24 hours'
        )
      );
  else
    select coalesce(jsonb_agg(f.object_key order by f.object_key), '[]'::jsonb) into v_candidates
    from public.graduation_project_files f
    where f.project_id = p_project_id and f.upload_status = 'pending'
      and f.created_at < now() - interval '24 hours';
  end if;
  v_payload := jsonb_build_object(
    'project_id', p_project_id,
    'candidate_object_keys', v_candidates,
    'note', 'contract inventory only; no storage.objects delete in MVP source'
  );
  insert into public.graduation_project_events(
    project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id, correlation_id, payload
  ) values (
    p_project_id, auth.uid(), a.id, 'orphan_storage_contract_queried', 'graduation_projects', p_project_id, p_correlation_id, v_payload
  );
  return v_payload;
end $$;

revoke all on function public.create_graduation_project_file_upload_intent(uuid,text,text,bigint,uuid,text) from public, anon;
revoke all on function public.register_graduation_project_file(uuid,text,text,bigint,uuid,text) from public, anon;
revoke all on function public.finalize_graduation_project_file(uuid,uuid,text) from public, anon;
revoke all on function public.mark_graduation_project_file_scan_state(uuid,text,uuid) from public, anon;
revoke all on function public.create_graduation_project_signed_download(uuid,uuid) from public, anon;
revoke all on function public.cleanup_graduation_project_orphan_storage_contract(uuid,uuid) from public, anon;

grant execute on function public.create_graduation_project_file_upload_intent(uuid,text,text,bigint,uuid,text) to authenticated;
grant execute on function public.register_graduation_project_file(uuid,text,text,bigint,uuid,text) to authenticated;
grant execute on function public.finalize_graduation_project_file(uuid,uuid,text) to authenticated;
grant execute on function public.mark_graduation_project_file_scan_state(uuid,text,uuid) to authenticated;
grant execute on function public.create_graduation_project_signed_download(uuid,uuid) to authenticated;
grant execute on function public.cleanup_graduation_project_orphan_storage_contract(uuid,uuid) to authenticated;