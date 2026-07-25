-- Aggregate counters and require 5/5 services completed.

do $$
declare
  v_completed integer;
  v_fail integer;
  v_line text;
  r record;
begin
  select value into v_completed from b1_e2e.counters where key = 'services_completed';
  select count(*) into v_fail from b1_e2e.results where status = 'FAIL';

  v_line := 'services_completed=' || coalesce(v_completed,0);
  for r in select key, value from b1_e2e.counters order by key loop
    v_line := v_line || ' ' || r.key || '=' || r.value;
  end loop;
  v_line := v_line || ' fail_rows=' || v_fail;

  delete from b1_e2e.summary;
  insert into b1_e2e.summary(services_completed, summary_line)
  values (coalesce(v_completed,0), v_line);

  raise notice '%', v_line;
end $$;

select case_id, category, status, left(detail, 160) as detail
from b1_e2e.results
order by status desc, case_id;

select * from b1_e2e.summary;
select * from b1_e2e.counters order by key;
