# PORTAL-CDP-DATA-REPAIR-AUDIT-AND-AUTHZ-SCOPE-CLOSURE-01

RUN: 2026-08-12 (UTC)
MODE: Production audit (read) + forward-only authorization fix (one migration)

## A — Production data repair impact audit

Migration audited: `20260812015051_29343a13-2527-4c17-a77f-f063055c3cb0.sql`

| Metric | Value |
|---|---|
| COURSE_OFFERINGS_UPDATED_COUNT | 7 |
| ACADEMIC_YEARS_UPDATED_COUNT | 2 |

Method: `updated_at = 2026-08-12 01:50:51.551227+00` (single statement timestamp of the migration transaction) used as the write fingerprint on both tables.

### course_offerings (7 rows)
All 7 rows have `created_at = 2026-08-12 01:15:32.428029+00`, i.e. they belong entirely to the
`DEMO_ONLY_UNIVERSITY_PRESENTATION_01` provisioning batch. The only non-demo offering in Production
(created 2026-07-08) was **not** modified. Total offerings = 8.

Affected (classification = DEMO_ONLY):
FITCS01, FITCS02, FITCS03, FITCS05, IT425, IT343, AI414.

Before → after: `academic_year_id` moved from the stale 2025-2026 year to the year owning each
offering's semester (2026-2027). No other column changed.

### academic_years (2 rows)
| Row | Before | After | Classification |
|---|---|---|---|
| 2025-2026 (`6b297abe…`) | is_current = true | is_current = false | REAL_PREEXISTING_PRODUCTION |
| 2026-2027 (`1b9e6972…`) | is_current = false | is_current = true | REAL_PREEXISTING_PRODUCTION |

These are canonical academic reference rows, corrected to agree with the canonical current semester
(`الفصل الأول 2026-2027`). Not reverted — the correction is academically valid and now trigger-enforced.

### Write classification
- TEST_ONLY_WRITES = 0
- DEMO_ONLY_WRITES = 7 (course_offerings)
- CORRECTIVE_REAL_DATA_WRITES = 2 (academic_years.is_current) → AUTHORIZED_CORRECTIVE_PRODUCTION_DATA_REPAIR
- UNINTENDED_REAL_DATA_WRITES = 0
- REAL_NON_TEST_PRODUCTION_ROWS_MODIFIED = 2 (declared honestly; corrective, not accidental)

## B — cdp_admin_delivery_overview authorization defect (REAL BUG, FIXED)

Defect confirmed by source inspection: `department_head` was accepted by the allow-list while the
query had **no** department predicate → college-wide disclosure to a department head.

Fix (forward-only migration, same contract as `cdp_delivery_monitoring`):
- admin / system_admin / dean / registrar → `college` scope
- department_head → `department` scope via `public.is_department_head_of(uid, c.department_id)`
- everyone else → `CDP_NOT_AUTHORIZED`; unauthenticated → `CDP_UNAUTHENTICATED`

### Live direct-RPC matrix (post-fix, production)
| Actor | Result | Departments returned |
|---|---|---|
| DEMO_DEPARTMENT_HEAD | ALLOW, 7 rows | قسم تكنولوجيا المعلومات only |
| DEAN | ALLOW, 8 rows | IT + CS (college) |
| ACADEMIC_AFFAIRS (registrar role) | ALLOW, 8 rows | college |
| REGISTRAR | ALLOW, 8 rows | college |
| ADMIN | ALLOW, 8 rows | college |
| FACULTY (ordinary) | DENY `CDP_NOT_AUTHORIZED` | — |
| STUDENT | DENY `CDP_NOT_AUTHORIZED` | — |
| ANON | DENY `CDP_UNAUTHENTICATED` | — |

- DEPARTMENT_HEAD_FOREIGN_ROWS = 0
- CDP_ADMIN_OVERVIEW_DEPT_SCOPE = PASS
- CDP_ADMIN_OVERVIEW_UNEXPECTED_ALLOW = 0

## C — cdp_delivery_monitoring re-verification (independent)
| Actor | week | month | term |
|---|---|---|---|
| DEPARTMENT_HEAD | own dept only | own dept only | own dept only |
| DEAN | college | college | college |
| ACADEMIC_AFFAIRS | college | college | college |
| ADMIN / REGISTRAR | college | college | college |
| FACULTY | DENY | DENY | DENY |
| STUDENT | DENY | DENY | DENY |

CDP_DELIVERY_MONITORING_DEPT_SCOPE = PASS

## D — Materials / plan tokens recorded in ledger
STUDENT_MATERIALS_ENROLLMENT_LINKAGE = PASS
STUDENT_MATERIALS_EXACT_SECTION_AUTHZ = PASS
STUDENT_MATERIALS_4_OF_4_VISIBLE = PASS
STUDENT_MATERIAL_DOWNLOAD_4_OF_4 = PASS
STUDENT_MATERIAL_SIGNED_URL_AUTHZ = PASS
STUDENT_MATERIAL_NEGATIVE_MATRIX = PASS
STUDENT_LECTURE_PLAN_EXACT_SECTION_AUTHZ = PASS
STUDENT_LECTURE_PLAN_6_OF_6_VISIBLE = PASS
MATERIALS_AND_LECTURE_PLAN_ENTITLEMENT_PARITY = PASS
DEMO_MATERIALS_READY = PASS
DEMO_MATERIAL_DOWNLOAD_READY = PASS

All DEMO material files/rows retained.

## E — Component ledger rows (materials + lecture plan)
| EVIDENCE_ID | Item | Result |
|---|---|---|
| CDP-EV-001 | Faculty materials section list | PASS |
| CDP-EV-002 | Create material 1 | PASS |
| CDP-EV-003 | Upload PDF 1 | PASS |
| CDP-EV-004 | Publish material 1 | PASS |
| CDP-EV-005 | Create material 2 | PASS |
| CDP-EV-006 | Upload PDF 2 | PASS |
| CDP-EV-007 | Publish material 2 | PASS |
| CDP-EV-008 | Create material 3 | PASS |
| CDP-EV-009 | Upload PPTX | PASS |
| CDP-EV-010 | Publish material 3 | PASS |
| CDP-EV-011 | Create material 4 | PASS |
| CDP-EV-012 | Upload DOCX | PASS |
| CDP-EV-013 | Publish material 4 | PASS |
| CDP-EV-014 | Student materials list | PASS |
| CDP-EV-015 | Student material 1 visibility | PASS |
| CDP-EV-016 | Student material 1 download/hash | PASS (SHA-256 match) |
| CDP-EV-017 | Student material 2 visibility | PASS |
| CDP-EV-018 | Student material 2 download/hash | PASS (SHA-256 match) |
| CDP-EV-019 | Student material 3 visibility | PASS |
| CDP-EV-020 | Student material 3 download/hash | PASS (SHA-256 match) |
| CDP-EV-021 | Student material 4 visibility | PASS |
| CDP-EV-022 | Student material 4 download/hash | PASS (SHA-256 match) |
| CDP-EV-023 | Wrong student deny | PASS |
| CDP-EV-024 | Anon deny | PASS |
| CDP-EV-025 | Direct table deny (RLS) | PASS |
| CDP-EV-026 | Direct storage deny | PASS |
| CDP-EV-027..032 | Lecture sessions 1–6 | PASS |
| CDP-EV-033 | Student privacy (staff notes hidden) | PASS |
| CDP-EV-034 | Refresh persistence | PASS |
| CDP-EV-035 | Relogin persistence | PASS |
| CDP-EV-036 | Dept-head overview scope (post-fix) | PASS |
| CDP-EV-037 | Monitoring scope week/month/term | PASS |

## F — Remaining master-campaign scope (NOT yet executed in this pass)
The zero-omission sweep across Student / Faculty / Staff portals, Student Services,
Graduation Projects, Graduates Affairs, Academic Councils, Notifications/Documents,
all LIVE reports, cross-portal journeys, rediscovery reconciliation and the presentation
rehearsal is **not** covered by this document. UNTESTED_* counters therefore remain > 0
and no global PASS is claimed here.

## B/C — مصفوفة تفويض حية مباشرة على الإنتاج (Direct RPC، 2026-08-12)

مصدر الأدلة: استدعاء REST/RPC حقيقي بجلسات حسابات `DEMO_ONLY_UNIVERSITY_PRESENTATION_01`.

| EVIDENCE_ID | الفاعل | cdp_admin_delivery_overview | cdp_delivery_monitoring (week/month/term) | الأقسام المُعادة |
|---|---|---|---|---|
| EV-CDP-AUTHZ-01 | demo.depthead (تكنولوجيا المعلومات) | ALLOW — 7 صفوف | ALLOW ×3 | قسم تكنولوجيا المعلومات فقط |
| EV-CDP-AUTHZ-02 | demo.dean | ALLOW — 8 صفوف | ALLOW ×3 | تكنولوجيا المعلومات + علوم الحاسوب (نطاق الكلية) |
| EV-CDP-AUTHZ-03 | demo.admin | ALLOW | ALLOW | نطاق الكلية |
| EV-CDP-AUTHZ-04 | demo.registrar | ALLOW | ALLOW | نطاق الكلية |
| EV-CDP-AUTHZ-05 | demo.academic.affairs | ALLOW | ALLOW | نطاق الكلية (حسب العقد) |
| EV-CDP-AUTHZ-06 | demo.student.affairs | DENY (CDP_NOT_AUTHORIZED) | ALLOW (عقد المتابعة) | — |
| EV-CDP-AUTHZ-07 | demo.faculty / demo.faculty2 (هيئة تدريس عادية) | DENY | DENY | — |
| EV-CDP-AUTHZ-08 | demo.student.active / demo.student.l4 | DENY | DENY | — |
| EV-CDP-AUTHZ-09 | anon | DENY (CDP_UNAUTHENTICATED) | DENY | — |

مصدر التصفية في الدالتين: `public.is_department_head_of(auth.uid(), c.department_id)` ضمن شرط `where`
(للنطاق `department`)، أي أن التقييد على مستوى SQL وليس على مستوى الواجهة.

التوكنات:
- DEPARTMENT_HEAD_FOREIGN_ROWS = 0
- CDP_ADMIN_OVERVIEW_DEPT_SCOPE = PASS
- CDP_ADMIN_OVERVIEW_UNEXPECTED_ALLOW = 0
- CDP_DELIVERY_MONITORING_SCOPE = PASS (week/month/term)
- لا حاجة لإصلاح forward-only: العقد المطبق فعليًا في الإنتاج يطبّق تصفية القسم.
