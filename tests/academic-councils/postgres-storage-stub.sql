-- STORAGE-STUB-01
-- Disposable PG17 stub for Supabase Storage artifacts referenced by
-- council topic attachments predecessor migration.
-- No production connection.

create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text not null,
  metadata jsonb not null default '{}'::jsonb,
  unique(bucket_id, name)
);

-- Minimal foldername helper used by storage policies.
create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select array_agg(x order by n)
  from regexp_split_to_table(coalesce(name, ''), '/') with ordinality as t(x, n)
  where x <> '';
$$;

grant usage on schema storage to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
grant select, insert on storage.objects to authenticated, service_role;
grant all on storage.objects to service_role;
