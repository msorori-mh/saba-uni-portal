-- PORTAL_STAFF_SELF_SERVICE_STORAGE_BINDING_02B
-- Source migration only. Requires 20260821220000_staff_self_service_backend_foundation_02a.sql.

begin;

do $$
begin
  if to_regclass('public.staff_service_attachments') is null
     or to_regprocedure('public.staff_service_can_access_request(uuid,uuid)') is null then
    raise exception 'STAFF_SERVICE_02B_REQUIRES_02A' using errcode = '55000';
  end if;

  if to_regclass('storage.buckets') is null
     or to_regclass('storage.objects') is null then
    raise exception 'STAFF_SERVICE_02B_STORAGE_SCHEMA_REQUIRED' using errcode = '55000';
  end if;
end;
$$;

alter table public.staff_service_attachments
  add column upload_status text not null default 'pending'
    check (upload_status in ('pending', 'uploaded', 'abandoned', 'rejected')),
  add column idempotency_key uuid,
  add column finalized_at timestamptz;

create unique index staff_service_attachment_idempotency_uq
  on public.staff_service_attachments (uploaded_by, idempotency_key)
  where idempotency_key is not null;

create index staff_service_attachment_upload_state_idx
  on public.staff_service_attachments (request_id, upload_status, scan_state);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'staff-service-private',
  'staff-service-private',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.staff_service_create_attachment_upload_intent(
  p_request_id uuid,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_sha256 text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  v_request public.staff_service_requests%rowtype;
  v_owner_user_id uuid;
  v_attachment public.staff_service_attachments%rowtype;
  v_attachment_id uuid := gen_random_uuid();
  v_extension text;
  v_object_path text;
begin
  if auth.uid() is null then
    raise exception 'STAFF_SERVICE_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_idempotency_key is null then
    raise exception 'STAFF_SERVICE_IDEMPOTENCY_REQUIRED' using errcode = '22023';
  end if;

  if nullif(btrim(p_original_name), '') is null
     or char_length(p_original_name) > 180 then
    raise exception 'STAFF_SERVICE_ATTACHMENT_NAME_INVALID' using errcode = '22023';
  end if;

  v_extension := case p_mime_type
    when 'application/pdf' then 'pdf'
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    else null
  end;

  if v_extension is null then
    raise exception 'STAFF_SERVICE_ATTACHMENT_MIME_INVALID' using errcode = '22023';
  end if;

  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 10485760 then
    raise exception 'STAFF_SERVICE_ATTACHMENT_SIZE_INVALID' using errcode = '22023';
  end if;

  if p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'STAFF_SERVICE_ATTACHMENT_SHA256_INVALID' using errcode = '22023';
  end if;

  select * into v_request
  from public.staff_service_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'STAFF_SERVICE_REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;

  select sp.user_id into v_owner_user_id
  from public.staff_profiles sp
  where sp.id = v_request.staff_profile_id;

  if v_owner_user_id is distinct from auth.uid() then
    raise exception 'STAFF_SERVICE_ATTACHMENT_OWNER_REQUIRED' using errcode = '42501';
  end if;

  if v_request.status <> 'submitted' or v_request.current_step <> 1 then
    raise exception 'STAFF_SERVICE_ATTACHMENT_WINDOW_CLOSED' using errcode = '55000';
  end if;

  select * into v_attachment
  from public.staff_service_attachments
  where uploaded_by = auth.uid()
    and idempotency_key = p_idempotency_key;

  if found then
    if v_attachment.request_id <> p_request_id
       or v_attachment.original_name <> btrim(p_original_name)
       or v_attachment.mime_type <> p_mime_type
       or v_attachment.size_bytes <> p_size_bytes
       or v_attachment.sha256 <> p_sha256 then
      raise exception 'STAFF_SERVICE_ATTACHMENT_REPLAY_MISMATCH' using errcode = '23505';
    end if;

    return jsonb_build_object(
      'attachment_id', v_attachment.id,
      'storage_bucket', v_attachment.storage_bucket,
      'object_path', v_attachment.object_path,
      'upload_status', v_attachment.upload_status
    );
  end if;

  v_object_path := auth.uid()::text || '/' || p_request_id::text || '/' ||
    v_attachment_id::text || '.' || v_extension;

  insert into public.staff_service_attachments (
    id,
    request_id,
    storage_bucket,
    object_path,
    original_name,
    mime_type,
    size_bytes,
    sha256,
    scan_state,
    uploaded_by,
    upload_status,
    idempotency_key
  ) values (
    v_attachment_id,
    p_request_id,
    'staff-service-private',
    v_object_path,
    btrim(p_original_name),
    p_mime_type,
    p_size_bytes,
    p_sha256,
    'pending',
    auth.uid(),
    'pending',
    p_idempotency_key
  ) returning * into v_attachment;

  insert into public.staff_service_events (
    request_id,
    event_type,
    actor_user_id,
    actor_role,
    from_status,
    to_status,
    metadata,
    correlation_id
  ) values (
    p_request_id,
    'attachment_upload_intent_created',
    auth.uid(),
    'employee',
    null,
    'pending',
    jsonb_build_object(
      'attachment_id', v_attachment.id,
      'mime_type', p_mime_type,
      'size_bytes', p_size_bytes
    ),
    p_idempotency_key
  );

  return jsonb_build_object(
    'attachment_id', v_attachment.id,
    'storage_bucket', v_attachment.storage_bucket,
    'object_path', v_attachment.object_path,
    'upload_status', v_attachment.upload_status
  );
end;
$$;

create or replace function public.staff_service_can_upload_object(
  p_object_path text
)
returns boolean
language sql
stable
security definer
set search_path = public, storage, pg_temp
as $$
  select auth.uid() is not null
    and p_object_path is not null
    and p_object_path not like '%..%'
    and p_object_path like auth.uid()::text || '/%'
    and exists (
      select 1
      from public.staff_service_attachments a
      join public.staff_service_requests r on r.id = a.request_id
      where a.object_path = p_object_path
        and a.storage_bucket = 'staff-service-private'
        and a.uploaded_by = auth.uid()
        and a.upload_status = 'pending'
        and a.scan_state = 'pending'
        and r.status = 'submitted'
        and r.current_step = 1
    );
$$;

create or replace function public.staff_service_finalize_attachment_upload(
  p_attachment_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  v_attachment public.staff_service_attachments%rowtype;
begin
  if auth.uid() is null then
    raise exception 'STAFF_SERVICE_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_idempotency_key is null then
    raise exception 'STAFF_SERVICE_IDEMPOTENCY_REQUIRED' using errcode = '22023';
  end if;

  select * into v_attachment
  from public.staff_service_attachments
  where id = p_attachment_id
  for update;

  if not found then
    raise exception 'STAFF_SERVICE_ATTACHMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_attachment.uploaded_by <> auth.uid() then
    raise exception 'STAFF_SERVICE_ATTACHMENT_OWNER_REQUIRED' using errcode = '42501';
  end if;

  if v_attachment.upload_status = 'uploaded' then
    return jsonb_build_object(
      'attachment_id', v_attachment.id,
      'upload_status', v_attachment.upload_status,
      'scan_state', v_attachment.scan_state
    );
  end if;

  if v_attachment.upload_status <> 'pending' then
    raise exception 'STAFF_SERVICE_ATTACHMENT_NOT_FINALIZABLE' using errcode = '55000';
  end if;

  if not exists (
    select 1
    from storage.objects o
    where o.bucket_id = v_attachment.storage_bucket
      and o.name = v_attachment.object_path
  ) then
    raise exception 'STAFF_SERVICE_STORAGE_OBJECT_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.staff_service_attachments
  set upload_status = 'uploaded',
      finalized_at = clock_timestamp()
  where id = p_attachment_id
  returning * into v_attachment;

  insert into public.staff_service_events (
    request_id,
    event_type,
    actor_user_id,
    actor_role,
    from_status,
    to_status,
    metadata,
    correlation_id
  ) values (
    v_attachment.request_id,
    'attachment_upload_finalized',
    auth.uid(),
    'employee',
    'pending',
    'uploaded',
    jsonb_build_object('attachment_id', v_attachment.id),
    p_idempotency_key
  )
  on conflict (request_id, event_type, correlation_id) do nothing;

  return jsonb_build_object(
    'attachment_id', v_attachment.id,
    'upload_status', v_attachment.upload_status,
    'scan_state', v_attachment.scan_state
  );
end;
$$;

create or replace function public.staff_service_mark_attachment_scan_state(
  p_attachment_id uuid,
  p_scan_state text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  v_attachment public.staff_service_attachments%rowtype;
begin
  if p_scan_state not in ('clean', 'infected', 'failed') then
    raise exception 'STAFF_SERVICE_SCAN_STATE_INVALID' using errcode = '22023';
  end if;

  select * into v_attachment
  from public.staff_service_attachments
  where id = p_attachment_id
  for update;

  if not found or v_attachment.upload_status <> 'uploaded' then
    raise exception 'STAFF_SERVICE_ATTACHMENT_NOT_SCANNABLE' using errcode = '55000';
  end if;

  update public.staff_service_attachments
  set scan_state = p_scan_state,
      upload_status = case when p_scan_state = 'clean'
        then upload_status else 'rejected' end
  where id = p_attachment_id;

  insert into public.staff_service_events (
    request_id,
    event_type,
    actor_user_id,
    actor_role,
    from_status,
    to_status,
    reason,
    metadata,
    correlation_id
  ) values (
    v_attachment.request_id,
    'attachment_scan_completed',
    null,
    'service_role',
    v_attachment.scan_state,
    p_scan_state,
    nullif(btrim(p_reason), ''),
    jsonb_build_object('attachment_id', v_attachment.id),
    gen_random_uuid()
  );
end;
$$;

create or replace function public.staff_service_can_download_object(
  p_object_path text
)
returns boolean
language sql
stable
security definer
set search_path = public, storage, pg_temp
as $$
  select auth.uid() is not null
    and p_object_path is not null
    and p_object_path not like '%..%'
    and exists (
      select 1
      from public.staff_service_attachments a
      where a.object_path = p_object_path
        and a.storage_bucket = 'staff-service-private'
        and a.upload_status = 'uploaded'
        and a.scan_state = 'clean'
        and public.staff_service_can_access_request(auth.uid(), a.request_id)
    );
$$;

create or replace function public.staff_service_authorize_attachment_download(
  p_attachment_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, storage, pg_temp
as $$
declare
  v_attachment public.staff_service_attachments%rowtype;
begin
  if auth.uid() is null then
    raise exception 'STAFF_SERVICE_AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_attachment
  from public.staff_service_attachments
  where id = p_attachment_id;

  if not found
     or v_attachment.upload_status <> 'uploaded'
     or v_attachment.scan_state <> 'clean'
     or not public.staff_service_can_access_request(auth.uid(), v_attachment.request_id) then
    raise exception 'STAFF_SERVICE_ATTACHMENT_ACCESS_DENIED' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'attachment_id', v_attachment.id,
    'storage_bucket', v_attachment.storage_bucket,
    'object_path', v_attachment.object_path,
    'expires_in_seconds', 300
  );
end;
$$;

drop policy if exists staff_service_private_insert on storage.objects;
create policy staff_service_private_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'staff-service-private'
    and name not like '%..%'
    and public.staff_service_can_upload_object(name)
  );

drop policy if exists staff_service_private_select on storage.objects;
create policy staff_service_private_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'staff-service-private'
    and name not like '%..%'
    and public.staff_service_can_download_object(name)
  );

drop policy if exists staff_service_private_update on storage.objects;
drop policy if exists staff_service_private_delete on storage.objects;

revoke all on function public.staff_service_create_attachment_upload_intent(
  uuid, text, text, bigint, text, uuid
) from public, anon;
revoke all on function public.staff_service_can_upload_object(text) from public, anon;
revoke all on function public.staff_service_finalize_attachment_upload(uuid, uuid)
  from public, anon;
revoke all on function public.staff_service_mark_attachment_scan_state(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.staff_service_can_download_object(text) from public, anon;
revoke all on function public.staff_service_authorize_attachment_download(uuid)
  from public, anon;

grant execute on function public.staff_service_create_attachment_upload_intent(
  uuid, text, text, bigint, text, uuid
) to authenticated;
grant execute on function public.staff_service_can_upload_object(text) to authenticated;
grant execute on function public.staff_service_finalize_attachment_upload(uuid, uuid)
  to authenticated;
grant execute on function public.staff_service_mark_attachment_scan_state(uuid, text, text)
  to service_role;
grant execute on function public.staff_service_can_download_object(text) to authenticated;
grant execute on function public.staff_service_authorize_attachment_download(uuid)
  to authenticated;

-- 02A RLS predicates are intentionally callable by authenticated clients;
-- each is SECURITY DEFINER, boolean-only, and exposes no row payload.
grant execute on function public.staff_service_is_admin(uuid) to authenticated;
grant execute on function public.staff_service_has_role(uuid, text, uuid) to authenticated;
grant execute on function public.staff_service_can_access_request(uuid, uuid)
  to authenticated;

comment on function public.staff_service_create_attachment_upload_intent(
  uuid, text, text, bigint, text, uuid
) is 'Creates an idempotent private upload contract; user filenames are never used in object paths.';
comment on function public.staff_service_authorize_attachment_download(uuid) is
  'Returns a 300-second private download contract only for clean files and authorized request actors.';

commit;
