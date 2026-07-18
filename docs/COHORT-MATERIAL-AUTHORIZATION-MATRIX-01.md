# COHORT-MATERIAL-AUTHORIZATION-MATRIX-01

## Decision

Student material access is bound only to the authenticated student's exact
`student_enrollments.course_section_id` for an `enrolled` row in the one
canonical current term. Program, level, or cohort similarity never grants
access.

## Authorization matrix

| Actor / condition | List | Detail | Download | Decision basis |
|---|---:|---:|---:|---|
| Exact student enrollment; current term; active offering and section; matching study system; published material | ALLOW | ALLOW | ALLOW | Exact section set plus published/system gate |
| Same program/level but sibling section | DENY | DENY | DENY | No cohort inference; section ID is absent from the exact set |
| Completed or dropped enrollment | DENY | DENY | DENY | Enrollment status must equal `enrolled` |
| Wrong academic year or semester | DENY | DENY | DENY | Both canonical term identifiers must match |
| Wrong study system | Hidden | DENY | DENY | Only `regular`, `parallel`, or `both` with an exact recognized student system |
| Wrong section or another student's section/file | DENY | DENY | DENY | Enrollment query is pinned to the authenticated student's profile ID |
| Anonymous | DENY | DENY | DENY | Every server function uses `requireSupabaseAuth` |
| Inactive offering or section | DENY | DENY | DENY | Both statuses must equal `active` |
| Draft, archived, or otherwise unpublished material (student) | Hidden | DENY | DENY | Student gate requires `published` |
| Exact faculty owner downloading own material file | N/A | N/A | ALLOW | Exact authenticated faculty profile ID equals `material.faculty_profile_id`; publication/current-term student rules do not apply |
| Different faculty member | N/A | N/A | DENY unless also an eligible student | No generic faculty-role bypass |
| Admin/staff role without exact faculty ownership or student enrollment | DENY | DENY | DENY | No admin, registrar, dean, or generic staff bypass |

## Trust boundaries

- The session-scoped client resolves the authenticated student/faculty identity.
- The service-role client reads rows and creates the short-lived signed URL only
  inside server functions protected by authentication.
- Service-role visibility is not authorization. Student section membership or
  exact faculty ownership is checked before signing a file URL.
- The signed URL lifetime remains 60 seconds and a successful download request
  records a `course_material_events` audit event.

## Scope

This is source/test/documentation evidence only. It applies no SQL or migration,
does not access production, and does not change `student_visible` or deployment.
