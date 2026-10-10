-- ENROLLMENT-RESULT-MARK-01 (CYB-HISTORY-RESULT-MARKS-01)
--
-- Keeps the official result marks of the university's main system verbatim on
-- the enrollment, for courses where the official sheet records a mark instead
-- of a numeric grade:
--   غ ض   — غائب       (counted as failed; score 0 is also recorded)
--   م ح ض — محروم      (counted as failed; score 0 is also recorded)
--   غ ب ض — غائب بعذر  (not counted: no grade, no average)
--   ق ض   — رمز رسمي   (not counted: no grade, no average)
--
-- Additive and backward compatible: one nullable column + one CHECK.
-- Existing rows are untouched (NULL = no official mark).
-- Apply in the production SQL editor by the owner; re-runnable.

begin;

alter table public.student_enrollments
  add column if not exists result_mark text;

alter table public.student_enrollments
  drop constraint if exists student_enrollments_result_mark_chk;
alter table public.student_enrollments
  add constraint student_enrollments_result_mark_chk
  check (
    result_mark is null
    or (result_mark in ('غ ض', 'م ح ض', 'غ ب ض', 'ق ض') and enrollment_status = 'completed')
  );

comment on column public.student_enrollments.result_mark is
  'Official result mark from the university main system, kept verbatim (غ ض / م ح ض / غ ب ض / ق ض). NULL = numeric grade or none.';

notify pgrst, 'reload schema';

commit;

-- Post-check (read-only): expect one row, ok = true.
select 'result_mark' as item,
       exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'student_enrollments'
                 and column_name = 'result_mark') as ok;
