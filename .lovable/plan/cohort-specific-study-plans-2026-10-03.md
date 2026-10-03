# Cohort-specific study plans

Each student can be linked to one specific study plan. A student with no plan keeps the current behaviour: the latest active plan of their program.

## Current state (checked)
- `student_profiles` has no `study_plan_id` column. There are 16 plans, 6 active, and no program has more than one active plan today.
- No unique index or check blocks several active plans per program. The only uniqueness rule is `(program_id, version)`. The "one active plan" rule exists only in the import validator (G-13).
- `study_plan_courses` already contains `summer` rows and has no check constraint on semester.
- Each place that needs a student's plan looks it up separately:
  - `student-study-plan.ts` and `computeStudentProgress` use the latest active plan of the program.
  - `getPlanCoursesForOffering` combines the courses of every active plan of the program.

## Steps
1. **Migration (additive only, needs your approval when it runs):**
   - `ALTER TABLE student_profiles ADD COLUMN study_plan_id uuid NULL REFERENCES study_plans(id) ON DELETE SET NULL` plus an index.
   - Plan assignment goes through a narrow admin-only RPC (`admin_assign_student_study_plan`). It checks the caller is admin or registrar with `has_role`, checks the plan belongs to the student's program, and writes an `audit_logs` row.
   - No RLS, grant or role changes. No data updates.
2. **Shared resolver** in `src/lib/study-plan-resolution.ts`:
   - `resolveStudentPlanId(student)` returns the assigned plan if there is one, otherwise the latest active plan of the program.
   - A batched variant serves list reports.
   - Used by `student-study-plan.ts` (web and mobile) and `computeStudentProgress`, so the plan page, progress, at-risk and graduation-candidates all read the same plan.
3. **`getPlanCoursesForOffering`:**
   - Collects the distinct `study_plan_id` of students who have a `student_academic_status` row at that level in that term, limited to the selected program.
   - If none are assigned, it falls back to the current active-plan behaviour.
   - The response reports which plans were used.
4. **Admin UI:**
   - In `/admin/students`: a «الخطة الدراسية» field on the student form, listing the plans of the selected program, with «تلقائي (الخطة الفعّالة)» as the default.
   - A bulk action «تعيين خطة» filtered by program, level and academic year. It shows the number of affected students before confirming.
   - In `/admin/study-plans`: a count of assigned students for each plan.
5. **Several active plans per program:**
   - `validateStudyPlans` reports a second active plan as a warning instead of an error.
   - Add `summer` («الفصل الصيفي») to `SEMESTER_LABELS`, to the plan grid in `study-plans.lazy.tsx`, and to the semester filter on the student plan page.
6. **Tests:**
   - Resolver behaviour: assigned, fallback, plan from another program rejected.
   - Offering behaviour: falls back when no students are assigned.
   - Validator now gives a warning.
   - Summer label.
   - Then run tsc, `bun test tests/student-requests` and `git diff --check`.

## Out of scope
- No changes to existing plans, plan courses, courses or student rows.
- No backfill.
- No changes to sign-in or roles.

## Technical notes
- Server reads use `supabaseAdmin`, keeping the existing pattern in these files. The student self-read goes through the user's own client; `study_plan_id` is readable under the current `student_profiles` policies.
- Fallback order: latest `version` of the active plan, as today.
- Risk: a student whose plan is later deactivated keeps reading it. This is intended for transitional cohorts.
- Git workflow: per project rules these changes must go through a branch, a PR and CI before merging. Publishing is not part of this task.
