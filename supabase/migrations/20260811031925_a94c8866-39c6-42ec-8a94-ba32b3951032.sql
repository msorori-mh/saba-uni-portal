-- PORTAL-GP-ADMIN-READONLY-VIEWER-PRODUCTION-HOTFIX-01
-- Forward-only replace of list_administration_graduation_projects_overview.
-- Administration viewer = read-only overview via canonical has_any_role roles
-- that already gate /admin/graduation-projects (NAV_ITEM_ROLES).
-- Active department coordinators retain department-scoped overview access.
-- No operational RPC / require_graduation_project_assignment changes.

create or replace function public.list_administration_graduation_projects_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb;
  v_is_admin_viewer boolean;
  v_is_active_coordinator boolean;
begin
  if auth.uid() is null then
    raise exception 'graduation project access denied';
  end if;

  -- Canonical admin-portal route contract for /admin/graduation-projects:
  -- system_admin, admin, dean, registrar (see src/lib/admin-nav.ts NAV_ITEM_ROLES).
  v_is_admin_viewer := public.has_any_role(
    auth.uid(),
    array['system_admin', 'admin', 'dean', 'registrar']::text[]
  );

  v_is_active_coordinator := exists (
    select 1
    from public.graduation_project_department_coordinators c
    where c.user_id = auth.uid()
      and c.active
      and c.ended_at is null
  );

  if not (v_is_admin_viewer or v_is_active_coordinator) then
    raise exception 'administration graduation-project viewer capability required';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'project_id', p.id,
        'department_id', p.department_id,
        'title', p.title,
        'lifecycle_state', p.lifecycle_state::text,
        'final_decision', p.final_decision::text,
        'archived_at', p.archived_at
      )
      order by p.created_at desc
    ),
    '[]'::jsonb
  )
  into v
  from public.graduation_projects p
  where
    v_is_admin_viewer
    or exists (
      select 1
      from public.graduation_project_department_coordinators c
      where c.user_id = auth.uid()
        and c.active
        and c.department_id = p.department_id
    );

  return v;
end
$$;

revoke all on function public.list_administration_graduation_projects_overview() from public, anon;
grant execute on function public.list_administration_graduation_projects_overview() to authenticated;

comment on function public.list_administration_graduation_projects_overview() is
  'Read-only GP administration overview. Authorized for has_any_role(system_admin|admin|dean|registrar) or an active department coordinator. Returns only narrow overview fields. Grants no mutation authority.';