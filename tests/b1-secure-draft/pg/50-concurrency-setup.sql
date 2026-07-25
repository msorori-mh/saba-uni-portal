-- Disposable committed fixture for two truly concurrent create calls.
insert into auth.users(id)
values ('90909090-9090-9090-9090-909090909090');

insert into public.student_profiles(
  id,user_id,full_name_ar,academic_number,status
) values (
  '91919191-9191-9191-9191-919191919191',
  '90909090-9090-9090-9090-909090909090',
  'concurrency student','CONC-1','active'
);

insert into public.request_types(code,name_ar,is_active,student_visible)
values ('enrollment_suspension','concurrency service',true,true);

insert into public.request_type_workflows(request_type_id,status,is_active)
select id,'active',true
from public.request_types
where code = 'enrollment_suspension';
