# PORTAL-UNIVERSITY-PRESENTATION-DEMO-DATA-MANIFEST-01

Dataset tag: `DEMO_ONLY_UNIVERSITY_PRESENTATION_01` (retained — must NOT be cleaned).
Ephemeral tag: `TEST_ONLY_EPHEMERAL_<RUN>` (cleanable).
**No passwords are recorded in this repository.** Credentials were delivered only in the owner-facing chat response.

## 1. Demo accounts (created and login-verified)

| ACCOUNT_CODE | ROLE | DISPLAY_NAME | LOGIN_IDENTIFIER | PORTAL | DEPT/PROGRAM | STATUS |
|---|---|---|---|---|---|---|
| DEMO_STUDENT_ACTIVE | student | نورة عبدالله الشامي | demo.student.active@testonly.invalid | /portal-login → /student | تكنولوجيا المعلومات / IT | ACTIVE |
| DEMO_STUDENT_L4 | student (L4) | أحمد سالم المخلافي | demo.student.l4@testonly.invalid | /portal-login → /student | IT | ACTIVE |
| DEMO_GRADUATE | graduate | ريم ناصر الحداد | demo.graduate@testonly.invalid | /portal-login → /student | IT | ACTIVE |
| DEMO_FACULTY | faculty_member | د. خالد يحيى العزي | demo.faculty@testonly.invalid | /portal-login → /faculty-portal | IT | ACTIVE |
| DEMO_FACULTY_SECONDARY | faculty_member | د. سمية عبدالكريم الوصابي | demo.faculty2@testonly.invalid | /faculty-portal | IT | ACTIVE |
| DEMO_DEPARTMENT_HEAD | department_head | د. مراد حسن الشرعبي | demo.depthead@testonly.invalid | /faculty-portal | IT | ACTIVE |
| DEMO_DEAN | dean | أ.د. طارق عبدالله الرداعي | demo.dean@testonly.invalid | /faculty-portal | College | ACTIVE |
| DEMO_ACADEMIC_AFFAIRS | academic_affairs_director | أمين محمد القدسي | demo.academic.affairs@testonly.invalid | /staff | College | ACTIVE |
| DEMO_STAFF_STUDENT_AFFAIRS | student_affairs_officer | هدى فؤاد الأصبحي | demo.student.affairs@testonly.invalid | /staff | College | ACTIVE |
| DEMO_REGISTRAR | registrar_director | بلال عارف السلامي | demo.registrar@testonly.invalid | /staff | College | ACTIVE |
| DEMO_FINANCE | finance_officer | ماجد سعيد الحكيمي | demo.finance@testonly.invalid | /staff | College | ACTIVE |
| DEMO_GA_MANAGER | graduates_director | سلوى أنور الجنيد | demo.ga.manager@testonly.invalid | /staff/graduates-affairs | College | ACTIVE |
| DEMO_GA_SPECIALIST | graduates_officer | وائل غالب المروني | demo.ga.specialist@testonly.invalid | /staff/graduates-affairs | College | ACTIVE |
| DEMO_GP_COORDINATOR | faculty_member (GP) | د. إياد نبيل الحاشدي | demo.gp.coordinator@testonly.invalid | /faculty-portal/graduation-projects | IT | ACTIVE |
| DEMO_GP_SUPERVISOR | faculty_member (GP) | د. منى راشد العمري | demo.gp.supervisor@testonly.invalid | /faculty-portal/graduation-projects | IT | ACTIVE |
| DEMO_GP_COMMITTEE_MEMBER | faculty_member (GP) | د. عمار توفيق الصلوي | demo.gp.committee@testonly.invalid | /faculty-portal/graduation-projects | IT | ACTIVE |
| DEMO_COUNCIL_CHAIR | faculty_member (council) | أ.د. فهد عبدالرحمن الزُبيري | demo.council.chair@testonly.invalid | /faculty-portal/academic-councils | IT | ACTIVE |
| DEMO_COUNCIL_SECRETARY | faculty_member (council) | د. لينا صادق البعداني | demo.council.secretary@testonly.invalid | /faculty-portal/academic-councils | IT | ACTIVE |
| DEMO_COUNCIL_MEMBER | faculty_member (council) | د. صالح جميل المقطري | demo.council.member@testonly.invalid | /faculty-portal/academic-councils | IT | ACTIVE |
| DEMO_ADMIN | admin | إدارة العرض التقديمي | demo.admin@testonly.invalid | /admin | College | ACTIVE |

`SYSTEM_ADMIN` demo account: not created — no presentation capability required beyond `DEMO_ADMIN`.

## 2. Retained presentation data (counts)

| DOMAIN | RETAINED |
|---|---|
| STUDENTS (student_profiles DEMO-*) | 3 |
| ACADEMIC STATUS ROWS | 3 |
| FACULTY (faculty + faculty_profiles DEMO-F-*) | 10 + 10 |
| STAFF (staff_profiles DEMO-S-*) | 7 |
| APP ROLES (user_roles) | 22 |
| CATALOG ROLE ASSIGNMENTS | 18 |
| COURSE OFFERINGS (current semester, IT) | 7 |
| COURSE SECTIONS (`DEMO-*`) | 7 |
| TIMETABLE ROWS (class_schedule, published) | 7 |
| TIME SLOTS (Sat–Wed, 2 periods/day) | 10 |
| STUDENT ENROLLMENTS | 8 |
| LECTURE DELIVERY PLANS (published, 6 sessions each) | 2 |
| PLAN SESSIONS | 12 |
| LECTURE EXECUTIONS (executed/postponed/hindered/compensated) | 10 |

Semester: الفصل الأول 2026-2027 (current). Program: البكالوريوس في تكنولوجيا المعلومات.

## 3. Parity

`STUDENT_TIMETABLE = FACULTY_ASSIGNMENT_TIMETABLE = ACADEMIC_MONITORING_SOURCE` — all three read the same
`course_sections` / `class_schedule` / `course_delivery_plans` rows for the `DEMO-*` sections.

## 4. Environment note

Production currently contains presentation (`DEMO_ONLY_UNIVERSITY_PRESENTATION_01`) data.
Aggregate reports include these rows; no real production rows were modified
(`REAL_NON_TEST_PRODUCTION_ROWS_MODIFIED = 0`).

## 5. Open blockers (see final owner report)

1. `DEPLOYED_RUNTIME_PARITY` — lecture-execution / lecture-monitoring routes exist in source but not in the
   published deployment; a publish of the current SHA is required.
2. `COURSE_MATERIALS_SCHEMA_MISSING` — `course_materials` / `course_material_files` / `course_material_events`
   are referenced by source but do not exist in the production database; a schema migration is required before
   `DEMO_MATERIALS_READY` can pass.
