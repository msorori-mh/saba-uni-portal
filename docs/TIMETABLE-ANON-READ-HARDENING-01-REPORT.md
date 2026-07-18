# TIMETABLE-ANON-READ-HARDENING-01 — SOURCE-ONLY

## Finding

The applied timetable foundation grants `anon` table-level `SELECT` and creates
anonymous RLS policies on `class_schedule`, `course_sections`, and
`course_offerings`. In particular, `sch_select_anon` uses `USING (true)`, making
every schedule row eligible for anonymous reads when the table privilege exists.

The applied migration was not edited. The forward draft removes both independent
authorization gates: all anonymous table privileges and the three anonymous
SELECT policies.

## Files

- `docs/migration-drafts/TIMETABLE-ANON-READ-HARDENING-01.sql`
- `tests/security/timetable-anon-read-hardening-01.test.ts`
- `docs/TIMETABLE-ANON-READ-HARDENING-01-REPORT.md`

## Authenticated least privilege

This correction deliberately does not change authenticated behavior. Existing
authenticated SELECT policies use `USING (true)` and therefore do not prove:

- exact student enrollment in `student_enrollments.course_section_id`;
- direct faculty assignment to the section or schedule row; or
- an explicitly authorized administrative role.

Replacing those policies needs a separate compatibility review covering the
student, mobile, faculty, admin, reports, and import surfaces. The target contract
is exact enrollment for students, direct assignment for faculty, explicit scoped
roles for administrators, and anonymous denial. Anonymous access must never be
restored as a fallback.

## Apply and verification gates

This file is a draft only. Before any separately authorized application:

1. Verify the three tables and named policies exist and capture current ACLs.
2. Verify no public website feature intentionally depends on anonymous timetable
   metadata.
3. Record the reviewed draft hash and confirm independent security review PASS.
4. Apply as one transaction and stop on any partial or unexpected result.
5. Verify `anon` has no table privilege and no applicable SELECT policy on all
   three tables; direct REST/RPC reads with an anonymous JWT must be denied.
6. Regression-test authenticated student, faculty, and admin timetable reads.

## Assumptions and risks

- Supabase `anon` requests use the database role named `anon`.
- Revoking `ALL` is intentional so future non-SELECT grants cannot preserve an
  anonymous timetable surface.
- An undocumented public consumer may break after application; the preflight
  dependency check is mandatory.
- Broad authenticated reads remain a known, isolated follow-up risk.

## Production impact

None. No SQL was applied, no production or storage connection was made, and no
deploy, publish, data change, feature flag, or `student_visible` change occurred.

## Decision

`PASS_SOURCE_READY_FOR_INDEPENDENT_REVIEW` for anonymous-read closure.
Authenticated least-privilege cutover remains a separate `HOLD` until its full
consumer and authorization matrix is complete.
