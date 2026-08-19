# USR University Organization Registry — Architecture 02

Status: DRAFT / NON-PRODUCTION  
Branch: `agent/university-expansion-foundation`  
Protected baseline: `8a7d3b35faadeef5fe139f4f85a538fffb554b37`  
Decision: HOLD for production; PASS for isolated design work.

## 1. Objective

Extend the portal from the College of Information Technology and Computer Science to a university-wide platform while preserving the current ITCS portal, Android package `ye.edu.usr.fitcs.portal`, production database, and `quboolye.com`.

This design is additive. It does not rename, delete, or re-scope existing production entities.

## 2. Evidence from the current baseline

The current schema contains `departments`, `programs`, `organizational_positions`, `position_assignments`, and academic council structures. The inspected code explicitly records:

- there is no trustworthy `college_id` on the current reporting scope;
- there is no authoritative college-to-department containment relationship;
- dean access cannot be considered multi-college safe without that relationship;
- department-head reconciliation currently requires exactly one active college council.

Therefore, simply adding more departments would create ambiguous authorization and council behavior.

## 3. Target hierarchy

```
institution
└── campus
    └── organizational_unit
        ├── presidency
        ├── vice_presidency
        ├── secretariat
        ├── college
        │   └── department
        ├── center
        ├── deanship
        └── general_administration
```

Academic hierarchy:

```
organizational_unit(department)
└── academic_program
    └── study_plan
        └── course
            └── offering
```

## 4. Additive data model

### institutions

University identity and official web source. One row can represent University of Saba Region; the model remains reusable for the Taiz tender demo.

### campuses

Physical/administrative campuses belonging to an institution. Campus data is not inferred when the official source is silent.

### organizational_units

A recursive hierarchy with explicit `institution_id`, optional `campus_id`, `parent_unit_id`, stable code, bilingual names, unit type, verification status, and source URL.

### organizational_unit_memberships

Explicit user-to-unit scope with role code and active interval. Authorization derives from active membership; it is never inferred from a broad legacy role alone.

### legacy_department_unit_links

A compatibility bridge from each existing `departments.id` to exactly one new department unit. It allows existing ITCS flows to continue while university-aware modules use the new scope.

## 5. Compatibility rules

1. Existing tables remain authoritative for current ITCS production until a separately approved migration.
2. New university modules query the registry and compatibility bridge.
3. A legacy department without a verified bridge is denied university-wide scoped access.
4. No existing row is automatically assigned to another college.
5. No current council function is changed in this stage.
6. A future council migration must replace the “exactly one college council” assumption with explicit `organizational_unit_id`.
7. Android package, application name, signing key, and Play release remain unchanged.

## 6. Source registry from the official university website

Official source: https://www.usr.edu.ye/

Verified visible colleges:

- كلية الطب
- كلية تكنولوجيا المعلومات وعلوم الحاسوب
- كلية العلوم الإدارية والمالية
- كلية التربية والعلوم
- كلية الشريعة والقانون
- كلية التربية والعلوم الإنسانية والتطبيقية - الجوف
- كلية الآداب والعلوم الإنسانية

Verified visible centers:

- مركز التطوير الأكاديمي وضمان الجودة
- مركز البحوث وخدمة المجتمع
- مركز اللغات والترجمة

Verified visible central units:

- رئاسة الجامعة
- مجلس الجامعة
- نيابة الشؤون الأكاديمية
- نيابة شؤون الطلاب
- نيابة الدراسات العليا والبحث العلمي
- الأمانة العامة
- الإدارة العامة للقبول والتسجيل

Data-quality rule: official-page count/list inconsistencies are stored as evidence notes; missing units are not invented. A unit is marked `verified` only when its name and type are visible on an official page.

## 7. Authorization contract

- Default: deny.
- Anonymous role: no registry or membership access.
- Authenticated users: read only their active memberships and units reachable through those memberships, unless an explicit university registry-reader privilege exists.
- Registry writes: service role or a narrowly scoped administrative RPC after approval.
- Unit scope is an explicit UUID, not a display name or inferred role.
- Parent hierarchy does not automatically grant child access; inherited access requires a separately reviewed rule.
- Every write must be auditable.

## 8. Seed strategy

The draft seed contains only organization records visible on official sources. It uses stable codes and `source_status = 'verified'`. Colleges/departments with incomplete official lists remain unseeded or `pending_verification`.

No real student, employee, credential, financial, or production data is copied. Demo data must be synthetic and carry `TEST_ONLY`.

## 9. Gates

### Stage 02 — isolation

- Branch isolation: PASS.
- Separate private repository: HOLD (repository-creation capability unavailable in the connected GitHub tool).
- Separate Supabase/Lovable/demo hostname: HOLD pending creation.
- Production unchanged: PASS.

### Stage 03 — registry foundation design

- Baseline inspected: PASS.
- Additive schema draft: PASS when committed beside this document.
- PostgreSQL compile test: HOLD.
- RLS negative tests: HOLD.
- Migration authorization: NOT REQUESTED.

## 10. Next safe execution

1. Create a new private repository `saba-university-portal`.
2. Copy the protected baseline into it without changing the original history.
3. Create a separate Supabase development project.
4. Compile the draft on PostgreSQL/Supabase locally.
5. Add negative RLS tests and compatibility contract tests.
6. Only after PASS, request explicit approval to promote the draft to a real migration in the isolated repository.
