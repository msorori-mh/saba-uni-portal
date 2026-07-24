# Academic affiliation and administrative positions

`faculty_profiles.department_id` is the faculty member's academic home. It is
not evidence of administrative office and must not change with an appointment.

Administrative authority is represented by `organizational_positions` and the
currently effective `position_assignments` row. Workflow scope is represented
separately by `request_processing_assignments.department_id`.

- A dean may remain academically affiliated with Computer Science.
- A Computer Science head may remain academically affiliated with Information Technology.
- Changing an office never changes academic affiliation.
- Ending an appointment closes only its assignment; history is retained.

Department-transfer chair runtime must contain exactly one direct
`assigned_position_assignment_id`. Faculty-profile assignment and broad
admin/registrar/dean bypasses are forbidden.
