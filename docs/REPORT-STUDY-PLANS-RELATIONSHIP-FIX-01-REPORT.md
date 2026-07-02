# REPORT-STUDY-PLANS-RELATIONSHIP-FIX-01

## Summary

This fix resolves the ambiguous PostgREST relationship error in study plan reports.

## Problem

The UI showed the IT study plan as having:

- 0 courses
- 0 total hours
- 1 plan without courses

However, the database audit confirmed that the IT study plan has:

- 41 rows in study_plan_courses
- 115 total credit hours
- 0 orphan course links

The "Study Plan Coverage" tab also showed this error:

Could not embed because more than one relationship was found for 'study_plan_courses' and 'courses'

## Root Cause

The table study_plan_courses has more than one foreign key relationship to courses:

- course_id
- prerequisite_course_id

The report query used an implicit embed:

courses(credit_hours)

PostgREST could not determine which relationship to use.

## Fix

The query now uses the explicit foreign key relationship:

courses:courses!study_plan_courses_course_id_fkey(credit_hours)

This ensures that reports use the actual course_id relationship, not the prerequisite relationship.

## Files Changed

- src/lib/admin-reports.functions.ts
- docs/REPORT-STUDY-PLANS-RELATIONSHIP-FIX-01-REPORT.md

## Scope

- Code/report fix only.
- No import.
- No production data changes.
- No database insert/update/delete.
- No migrations.
- No schema changes.
- No cleanup/reset/delete.
- No change to study plans data.

## Expected Result After Deploy

For the IT study plan:

- Courses: 41
- Total hours: 115
- Without courses: 0

The "Study Plan Coverage" tab should no longer show the ambiguous relationship error.

## Final Decision

PASS
