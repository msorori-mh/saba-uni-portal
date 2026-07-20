-- DRAFT verifier. Run only in an isolated disposable PostgreSQL database after
-- applying GRADUATION-PROJECTS-MVP-FOUNDATION-01.sql and approved synthetic fixtures.
begin;

do $$
declare missing text[];
begin
  select array_agg(required.name) into missing from (values
    ('assignment_project_department_fk'),
    ('graduation_project_events_append_only')
  ) required(name)
  where not exists (
    select 1 from pg_constraint c where c.conname=required.name
    union all select 1 from pg_trigger t where t.tgname=required.name and not t.tgisinternal
  );
  if missing is not null then raise exception 'missing integrity boundaries: %',missing; end if;
  if has_function_privilege('anon','public.archive_graduation_project(uuid,uuid,bigint,uuid)','EXECUTE') then
    raise exception 'anonymous archive execution must be denied';
  end if;
  if not has_function_privilege('authenticated','public.archive_graduation_project(uuid,uuid,bigint,uuid)','EXECUTE') then
    raise exception 'authenticated direct-assignee RPC entry must exist';
  end if;
end $$;

-- Synthetic matrix required from the fixture runner:
-- ALLOW: completed project + matching active department-head/dean assignment +
--        same-project clean file on accepted final milestone + accepted corrections.
-- DENY with zero side effects: anonymous; same role unassigned; wrong role/user/
-- department/project; inactive/ended assignment; non-completed/version mismatch;
-- cross-project file/submission/assignment/panel; dirty/quarantined file; non-final
-- or unaccepted submission; pending correction. Repeat the same correlation id and
-- prove exactly one archive/event/version increment (idempotent return).
-- UPDATE/DELETE graduation_project_events must raise append-only exception.

rollback;
