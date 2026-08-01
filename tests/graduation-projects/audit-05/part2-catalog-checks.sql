-- AUDIT-05 PART 2 — independent catalog security re-derivation (disposable PG17).
-- Prerequisite: minimal schema + M1..M8 applied. Read-only; prints AUDIT05|id|result|detail rows.
\set ON_ERROR_STOP on
begin;
create temporary table a05cat(id text, description text, result text, detail text) on commit drop;
create function pg_temp.ck(p_id text, p_desc text, p_ok boolean, p_detail text) returns void language sql as $$
  insert into a05cat values(p_id,p_desc,case when p_ok then 'PASS' else 'FAIL' end,coalesce(p_detail,''))
$$;
create function pg_temp.info(p_id text, p_desc text, p_detail text) returns void language sql as $$
  insert into a05cat values(p_id,p_desc,'INFO',coalesce(p_detail,''))
$$;

-- C2.1 every public.graduation_project* table has RLS enabled
select pg_temp.ck('C2.1.rls-enabled','every graduation_project* table has relrowsecurity=true',
  not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname like 'graduation_project%' and c.relkind='r' and not c.relrowsecurity),
  (select 'tables='||count(*)||', rls_on='||count(*) filter(where c.relrowsecurity)
   from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname like 'graduation_project%' and c.relkind='r'));

-- C2.2 zero RLS policies on those tables (deny-by-default via RPCs only)
select pg_temp.ck('C2.2.zero-policies','pg_policies count on graduation tables = 0',
  (select count(*) from pg_policies where schemaname='public' and tablename like 'graduation_project%')=0,
  (select 'policies='||count(*) from pg_policies where schemaname='public' and tablename like 'graduation_project%'));

-- C2.3 zero table-level grants to anon/authenticated/PUBLIC on those tables
select pg_temp.ck('C2.3.no-table-grants','zero table grants to anon/authenticated/PUBLIC on graduation tables',
  not exists(select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name like 'graduation_project%'
      and lower(grantee) in ('anon','authenticated','public')),
  (select coalesce(string_agg(distinct grantee||':'||table_name||':'||privilege_type,', '),'none')
   from information_schema.role_table_grants
   where table_schema='public' and table_name like 'graduation_project%'
     and lower(grantee) in ('anon','authenticated','public')));

-- C2.4 every SECURITY DEFINER graduation function pins search_path to public,pg_temp
select pg_temp.ck('C2.4.definer-search-path','all SECURITY DEFINER graduation functions pin search_path=public,pg_temp',
  not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like '%graduation_project%' and p.prosecdef
      and not exists(select 1 from unnest(p.proconfig) c where c like 'search_path=%'
        and position('public' in substring(c from 12))>0 and position('pg_temp' in substring(c from 12))>0)),
  (select 'definers='||count(*)||', pinned='||count(*) filter(where exists(
      select 1 from unnest(p.proconfig) c where c like 'search_path=%'
        and position('public' in substring(c from 12))>0 and position('pg_temp' in substring(c from 12))>0))
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname like '%graduation_project%' and p.prosecdef));

-- C2.5 zero EXECUTE grants to PUBLIC/anon on graduation functions (effective ACL incl. defaults)
select pg_temp.ck('C2.5.no-public-execute','zero effective EXECUTE grants to PUBLIC/anon on graduation functions',
  not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace,
    lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) g
    where n.nspname='public' and p.proname like '%graduation_project%'
      and g.privilege_type='EXECUTE' and (g.grantee=0 or g.grantee='anon'::regrole)),
  (select coalesce(string_agg(p.proname||'->'||case when g.grantee=0 then 'PUBLIC' else g.grantee::regrole::text end,', '),'none')
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace,
    lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) g
   where n.nspname='public' and p.proname like '%graduation_project%'
     and g.privilege_type='EXECUTE' and (g.grantee=0 or g.grantee='anon'::regrole)));

-- C2.5b full grant inventory (informational, verbatim)
select pg_temp.info('C2.5b.function-grant-inventory','every effective EXECUTE grant on graduation functions (signature -> role)',
  (select string_agg(x.line, '; ' order by x.line) from (
    select p.oid::regprocedure::text||' -> '||case when g.grantee=0 then 'PUBLIC' else g.grantee::regrole::text end as line
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace,
      lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) g
    where n.nspname='public' and p.proname like '%graduation_project%' and g.privilege_type='EXECUTE') x));

-- C2.6 no storage.buckets referencing graduation (storage schema may be absent in the minimal harness)
do $$ declare v_has boolean; v_list text; begin
  select exists(select 1 from pg_namespace where nspname='storage') into v_has;
  if not v_has then
    perform pg_temp.ck('C2.6.no-storage-bucket','no storage.buckets rows referencing graduation',true,
      'storage schema absent in minimal harness (no bucket possible)');
  else
    execute $x$select coalesce(string_agg(id,', '),'') from storage.buckets where id ilike '%graduation%' or name ilike '%graduation%'$x$ into v_list;
    perform pg_temp.ck('C2.6.no-storage-bucket','no storage.buckets rows referencing graduation',v_list='',
      case when v_list='' then 'no graduation buckets' else 'buckets: '||v_list end);
  end if;
end $$;

-- C2.7 files table object_key check constraint exists and bans http keys / dot-dot
select pg_temp.ck('C2.7.files-key-constraint','graduation_project_files check constraint bans http keys and dot-dot segments',
  exists(select 1 from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace
    where n.nspname='public' and r.relname='graduation_project_files' and c.contype='c'
      and pg_get_constraintdef(c.oid) ilike '%http%' and pg_get_constraintdef(c.oid) like '%..%'),
  coalesce((select string_agg(pg_get_constraintdef(c.oid),' AND ') from pg_constraint c
    join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace
    where n.nspname='public' and r.relname='graduation_project_files' and c.contype='c'
      and pg_get_constraintdef(c.oid) ilike '%object_key%'),'NO object_key CHECK FOUND'));

-- C2.8 ownership: migration owner (postgres) owns all graduation tables and functions
select pg_temp.ck('C2.8.ownership','all graduation tables/functions owned by postgres (migration owner)',
  not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname like 'graduation_project%' and c.relkind in ('r','v') and c.relowner<>'postgres'::regrole)
  and not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like '%graduation_project%' and p.proowner<>'postgres'::regrole),
  (select 'non-postgres-owned: '||coalesce(string_agg(relname,', '),'none') from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname like 'graduation_project%' and c.relkind in ('r','v') and c.relowner<>'postgres'::regrole));

-- C2.9 graduation_project_reporting view actually carries security_invoker=true in reloptions
select pg_temp.ck('C2.9.reporting-security-invoker','graduation_project_reporting reloptions contains security_invoker=true',
  exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='graduation_project_reporting'
      and c.reloptions::text like '%security_invoker=true%'),
  coalesce((select 'reloptions='||coalesce(c.reloptions::text,'(empty)') from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='graduation_project_reporting'),'view missing'));

select 'AUDIT05|'||id||'|'||result||'|'||description||' :: '||detail from a05cat order by id;
rollback;
