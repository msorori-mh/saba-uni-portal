-- CYB-LEGACY-COURSE-HOURS-01 (data fix, owner-approved value: 3 hours each)
--
-- The 11 legacy cybersecurity courses (CYL101..CYL206) were imported with
-- theory_hours empty, and the courses importer always derives
-- credit_hours = theory_hours + ceil(practical_hours / 2), so they landed with
-- 0 credit hours. The owner confirmed 3 hours each (to be reviewed later).
-- Only rows still at 0 are touched; re-runnable.

begin;

update public.courses
   set theory_hours = 3,
       credit_hours = 3
 where code in ('CYL101','CYL102','CYL103','CYL104','CYL105',
                'CYL201','CYL202','CYL203','CYL204','CYL205','CYL206')
   and credit_hours = 0
   and coalesce(theory_hours, 0) = 0
   and coalesce(practical_hours, 0) = 0;

commit;

-- Post-check (read-only): expect 11 rows, credit_hours = 3.
select code, theory_hours, practical_hours, credit_hours
  from public.courses where code like 'CYL%' order by code;
