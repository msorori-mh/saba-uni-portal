select set_config('app.department_chairs_controlled_fix_ticket','DEPARTMENT-CHAIRS-CONTROLLED-FIX-PACKAGE-01',false);
\if :{?actor}
\else
\set actor 'aaaaaaaa-0000-4000-8000-000000000001'
\endif
select set_config('app.department_chairs_controlled_fix_actor',:'actor',false);
select set_config('app.department_chairs_controlled_fix_actor_role','system_admin',false);
\ir ../../docs/migration-drafts/DEPARTMENT-CHAIRS-CONTROLLED-FIX-PACKAGE-01.sql
