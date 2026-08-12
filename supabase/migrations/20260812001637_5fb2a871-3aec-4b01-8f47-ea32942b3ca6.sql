revoke all on table public.ga_ops_lifecycle_matrix_results from public;
revoke all on table public.ga_ops_lifecycle_matrix_results from anon;
revoke all on table public.ga_ops_lifecycle_matrix_results from authenticated;
grant select on table public.ga_ops_lifecycle_matrix_results to authenticated;
grant all on table public.ga_ops_lifecycle_matrix_results to service_role;
alter table public.ga_ops_lifecycle_matrix_results force row level security;
drop function if exists public.ga_ops_lifecycle_matrix_run();
drop function if exists public.ga_ops_authz_matrix_run();