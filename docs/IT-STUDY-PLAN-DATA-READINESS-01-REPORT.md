# IT-STUDY-PLAN-DATA-READINESS-01 Report

## Summary

This report documents the readiness review for importing the Information Technology (IT) study plan.

The purpose of this phase was to verify the IT study plan data, identify missing course references, prepare local Excel files for later review/import, and determine whether the plan is ready for import.

## Scope

This phase was investigation and preparation only.

- No import was executed.
- No production data was modified.
- No database insert/update/delete was performed.
- No migrations were created.
- No schema changes were made.
- No cleanup, reset, or deletion was performed.
- No changes were made to `/admin/imports`.
- No changes were made to `/admin/study-plans`.

## Git Changes

Only this report is intended to be tracked in git.

Excel files prepared during the phase are local-only and must not be committed.

## Local Excel Files

The following Excel files were prepared locally only and are not included in git:

- `it_missing_courses_import_template.xlsx`
- `it_study_plan_corrected_for_import.xlsx`

## Source Used

No new authoritative source was found on disk for confirming missing IT course names.

The currently available source remains:

- `Downloads/study_plan_import_IT_program.xlsx`

## Confirmed Missing Courses Requiring Import Before IT Study Plan

The following course codes were identified as missing and are required before importing the IT study plan:

- `IT223`
- `IT343`
- `IT324`
- `IT332`
- `AI313`
- `IT425`
- `IT463`

These must be confirmed academically before import, including official Arabic names, English names if available, credit hours, and any theory/practical hour structure required by the current courses import template.

## Items Requiring Academic Confirmation

The following items block final IT study plan import:

### IT323

`IT323` appears as a prerequisite in the IT study plan, but its official course name was not confirmed from the available source.

Decision: Needs academic confirmation.

### IT333

`IT333` appears as a prerequisite in the IT study plan, but its official course name was not confirmed from the available source.

Decision: Needs academic confirmation.

### IT4XX(E)

`IT4XX(E)` appears to be an elective placeholder, not a valid real course code.

It must not be imported as a real course unless the academic department confirms that it is an approved course code.

Recommended handling:

- Replace it with actual approved elective course codes, or
- Keep it out of the import until electives are formally defined.

Decision: Needs academic confirmation.

### AI414

`AI414` requires confirmation of its existence/status in the courses reference before the corrected IT study plan can be considered ready for import.

Decision: Needs academic confirmation.

## Handling of `All`

The value `All` must not be used in `prerequisite_course_code`.

It is not a course code.

It should be treated as an academic note such as:

> Requires completion of all previous study plan courses.

Because the current `study_plan_courses` structure does not support storing this as a prerequisite code, it must be removed from `prerequisite_course_code` before import.

## Corrected IT Study Plan File

A local corrected study plan file was prepared for later review/import:

- `it_study_plan_corrected_for_import.xlsx`

However, the plan is not ready for final import until the blocking items are resolved.

## Missing Courses Import File

A local missing courses import file was prepared:

- `it_missing_courses_import_template.xlsx`

This file should be reviewed academically before any import.

## Build Result

Build completed successfully.

## Final Decision

`BLOCKED — NEEDS ACADEMIC CONFIRMATION`

## Blocking Requirements Before Import

Before importing the IT study plan:

1. Confirm official course details for the missing courses.
2. Confirm `IT323`.
3. Confirm `IT333`.
4. Resolve `IT4XX(E)` elective placeholders.
5. Confirm `AI414`.
6. Import confirmed missing courses first.
7. Then import the corrected IT study plan using the scoped study plan import flow introduced in PR #73.

## Safety Confirmation

- Import executed: No.
- Production data modified: No.
- Migration created: No.
- Schema changed: No.
- Excel files committed: No.
