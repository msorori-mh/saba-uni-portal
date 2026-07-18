# STUDENT-TO-COHORT-BINDING-AUDIT-01

Status: `SOURCE_ONLY_AUDIT`

Pinned source: `origin/main@caa96fa3f04a3186bb9d65a07262e8fe7e98aa5f`

## Decision

The only authoritative student-to-teaching-group binding present in the schema is:

`student_profiles.id -> student_enrollments.student_profile_id -> student_enrollments.course_section_id -> course_sections.id -> course_sections.course_offering_id -> course_offerings.id`

That chain identifies an exact section. `student_academic_status` identifies an
academic period and level, but not a course, section, or teaching group. It must
not create material or timetable audience membership.

Artifact decision: `PASS_AUDIT_COMPLETE`.

Integrated runtime decision: `HOLD_INTEGRATED_RUNTIME` with the factual findings
below (`CRITICAL=0`, `HIGH=3`, `MEDIUM=2`, `LOW=0`). Passing this audit artifact
does not authorize or imply a runtime, schema, migration, deployment, or
production change.

## Findings

### HIGH-1 — materials cohort fallback grants every section in a broad cohort

`eligibleSectionIdsForStudent` starts with exact enrolled section IDs, but the
default setting is `cohort_fallback`. It then reads every `student_academic_status`
row marked `enrolled`, matches only year, semester, level and the student's
current profile program, and adds every section of every matching offering.

There is no section/group discriminator. A student enrolled in regular section A
can therefore become eligible for section B in the same program, level and term.
The same expanded set protects list, detail and signed-file download operations.

### HIGH-2 — fallback is not bound to one canonical current term

The fallback iterates zero, one, or many academic-status rows. It does not use the
canonical current-term resolver and does not reject duplicate current periods,
historical enrolled statuses, or a year/semester mismatch. Zero rows merely
falls back to exact enrollments; multiple rows union multiple cohorts.

The safe contract is fail-closed: exactly one canonical year and semester, and
the enrollment's offering must match both. A valid current term with zero exact
enrollments yields zero sections; it must never broaden to cohort membership.

### HIGH-3 — regular/parallel vocabulary is inconsistent

Materials use `regular | parallel | both`, while `student_profiles.study_system`
is constrained and used elsewhere as `regular | private`. Consequently a
`private` student never matches a `parallel` material and only receives `both`.
Renaming or mapping this value is an academic decision and must not be invented.
Until an approved canonical vocabulary exists, ambiguous values must deny access.

### MEDIUM-1 — transfer and suspension state can produce stale audience

Fallback combines the student's current `program_id` with every enrolled
academic-status period. After a transfer this can project an old period into the
new program. A suspended profile can retain an `enrolled` academic-status row and
receive broad cohort materials because profile/student status is not part of the
authorization predicate. Exact active enrollment avoids both inferences; any
policy for retained historical materials needs an explicit decision.

### MEDIUM-2 — service-role reads bypass the database authorization boundary

Student material server functions query enrollment, offering, section and
material tables through `supabaseAdmin`, then authorize in TypeScript. The
student-enrollment RLS owner policy is therefore not the effective materials
boundary. The current download safety depends entirely on recomputing the same
expanded section set before signing a URL.

Database RLS permits a student to read their own enrollment row, but timetable
tables still have broad authenticated SELECT policies and material access is not
proved by that RLS. A later runtime/RPC design should centralize the exact join
and be exercised directly under the caller session; hiding routes is not access
control.

## Required contract

For current student materials and teaching-group membership:

1. Resolve exactly one authenticated student profile; zero or multiple fails.
2. Resolve exactly one canonical current year and semester; read error, zero,
   multiple, or mismatched semester/year fails.
3. Select only enrollment rows whose status is exactly `enrolled` for that
   student and whose exact
   `course_section_id` joins to an offering in both canonical term IDs.
4. Treat each section ID as a distinct group. Never infer sibling sections from
   program, level, department, study system, or academic status.
5. A valid term with zero matching enrollments returns an empty audience.
6. Material list/detail/download must all reuse the same server-side predicate.
7. Material study-system tags require an approved vocabulary. `both` may include
   both approved systems; unknown or mismatched values deny.
8. Transfer and suspension do not synthesize group membership. Suspension must
   remain denied unless an explicit approved status rule says otherwise.
   Historical access requires a separately approved rule tied to an exact
   historical enrollment; `completed`, `dropped`, or a generic "non-dropped"
   predicate is never current-active enrollment.

## Safe-environment verification plan

Use synthetic identities in an isolated non-production database only:

- Create two years, two semesters, and force zero/multiple/mismatched current-term
  cases; every case must return no sections and no signed URL.
- Create regular sections A/B and a parallel/private section C in the same course
  offering. Enroll the student only in A; A is allowed and B/C are denied.
- Repeat with exact enrollment in C after the study-system vocabulary is approved;
  no implicit regular/parallel crossover is allowed.
- Create a second program and simulate transfer while retaining historical
  academic-status rows; neither old nor new sibling sections become eligible.
- Mark the profile suspended and test the explicitly approved enrollment rule;
  absence of such a rule remains deny.
- Test list, section detail, and file download independently with another
  student's section and file IDs.
- Exercise direct REST/RPC calls as the student, another student, faculty,
  anonymous, and service role. Confirm student RLS exposes only own enrollment
  rows and that no client-callable path can invoke service-role breadth.
- Verify audit events and signed URLs are created only after exact authorization;
  negative cases create neither.

## Boundaries and production impact

No runtime, schema, migration, RLS policy, setting, assignment, student record,
material, storage object, `student_visible`, production connection, deploy or
publish action was changed. Protected entities were not accessed or modified.
