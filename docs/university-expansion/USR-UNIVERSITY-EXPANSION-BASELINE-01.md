# USR University Expansion Baseline 01

## Decision

`PASS_WITH_NOTES` for read-only baseline and official-website inventory.

No source, database, Lovable project, production deployment, Android package, or Google Play release was changed.

## Protected current system

- Repository: `msorori-mh/saba-uni-portal` (private)
- Default branch: `main`
- Protected baseline SHA: `8a7d3b35faadeef5fe139f4f85a538fffb554b37`
- Current portal: `https://quboolye.com`
- Current Android application: `ITCS Portal`
- Android package: `ye.edu.usr.fitcs.portal`
- Rule: the existing college portal, production data, Android package, signing keys, and Google Play closed-test release remain unchanged.

## Official university inventory

Source of truth for this stage: `https://usr.edu.ye/` and its official college/center pages, reviewed on 2026-08-19.

### Colleges displayed by the official site

1. College of Medicine / كلية الطب
2. Faculty of Information Technology and Computer Science / كلية تكنولوجيا المعلومات وعلوم الحاسوب
3. Faculty of Administrative and Financial Sciences / كلية العلوم الإدارية والمالية
4. Faculty of Education and Sciences / كلية التربية والعلوم
5. Faculty of Sharia and Law / كلية الشريعة والقانون
6. Faculty of Education, Humanities and Applied Sciences - Al Jawf / كلية التربية والعلوم الإنسانية والتطبيقية - الجوف
7. Faculty of Arts and Humanities / كلية الآداب والعلوم الإنسانية

### Academic centers displayed by the official site

1. Academic Development and Quality Assurance Center / مركز التطوير الأكاديمي وضمان الجودة
2. Research and Community Service Center / مركز البحوث وخدمة المجتمع
3. Language and Translation Center / مركز اللغات والترجمة

### University-level leadership and administration visible in official sources

- University Presidency / رئاسة الجامعة
- University Council / مجلس الجامعة
- Vice Presidency for Academic Affairs / نيابة الشؤون الأكاديمية
- Vice Presidency for Student Affairs / نيابة شؤون الطلاب
- Vice Presidency for Graduate Studies and Scientific Research / نيابة الدراسات العليا والبحث العلمي
- General Secretariat / الأمانة العامة
- General Administration of Admission and Registration / الإدارة العامة للقبول والتسجيل

### Published counts and data-quality notes

- Official homepage headline: 9,000+ students, 85+ colleges and departments, 120+ bachelor programs.
- College cards currently expose 7 colleges.
- Center section currently exposes 3 academic centers.
- Some official pages have inconsistent department counts or omit one item from a displayed total. These gaps must be resolved through an approved university organization register before production seeding.
- No unpublished department, program, administration, or person will be invented from news articles.

## Recommended isolated target architecture

Create a new private university-wide repository and isolated non-production stack from the protected baseline, instead of changing the current portal in place.

### Isolation boundaries

1. New private repository: proposed `msorori-mh/saba-university-portal`.
2. New Lovable development project; no link to the current production project.
3. New Supabase development project with synthetic `TEST_ONLY` data.
4. New web hostname for the demo only; `quboolye.com` remains unchanged.
5. No new Android package during the architecture phase. The existing ITCS Portal remains the released college app.
6. No migration or data copy from current production until a separate approved migration stage.

### Core organization model

```text
institution
  -> campus
    -> organizational_unit
       types: presidency, vice_presidency, secretariat, college,
              center, deanship, general_administration, department
    -> academic_program
       -> study_plan
          -> course
             -> offering
```

All operational records must carry an explicit organizational scope, such as `institution_id`, `campus_id`, `college_id`, `department_id`, and `program_id` where applicable. Authorization must be scoped to assigned units, not inferred from UI routes.

## Functional expansion streams

1. University identity and organization registry.
2. Multi-college admission, registration, student records, plans, courses, grades, schedules, and documents.
3. College and department administration with delegated RBAC/RLS.
4. Presidency, vice-presidencies, secretariat, deanships, general administrations, and centers.
5. Graduate studies, research, quality assurance, community service, and language-center services.
6. University-wide reporting and audit trails.
7. Configurable branding and organization profiles suitable for demonstrating portability to Taiz University.

## Tender-evidence package

The demo should prove, without using real student data:

- One institution with multiple campuses, colleges, departments, programs, and central administrations.
- End-to-end student and academic workflows across at least three structurally different colleges.
- Positive and negative authorization evidence per role and organizational scope.
- Arabic RTL, responsive web, Android compatibility, accessibility, audit logs, and data isolation.
- A configuration export showing how the same platform can model another university without cloning business logic.
- Architecture diagrams, requirements traceability, test reports, screenshots, and a controlled demo script.

## Numbered delivery gates

### Stage 02 - Repository and environment isolation

- Create the new private repository from baseline SHA.
- Create development-only environment configuration.
- Prove zero writes to current production and zero changes to the Android package.
- Exit: `PASS_REPOSITORY_ENVIRONMENT_ISOLATION`.

### Stage 03 - Organization registry foundation

- Implement institution, campus, organizational unit, college, department, center, administration, and program hierarchy.
- Seed only verified official units; mark unresolved entries as `SOURCE_PENDING`.
- Exit: schema tests, hierarchy tests, and RLS matrix pass.

### Stage 04 - Multi-college academic core

- Generalize the current ITCS academic model without breaking its contracts.
- Validate Medicine, Administrative and Financial Sciences, and ITCS as three different pilot structures.
- Exit: isolated E2E and negative authorization matrix pass.

### Stage 05 - Central university services

- Add central administrations, vice-presidencies, centers, cross-college workflows, and consolidated reporting.
- Exit: workflow/RBAC/RLS and audit evidence pass.

### Stage 06 - Taiz tender evidence demo

- Produce a synthetic, rebrandable university demo and evidence pack.
- No claim that Taiz University production data or systems are integrated.
- Exit: reproducible demo, traceability matrix, screenshots, and technical evidence package pass.

## Current authority boundary

- Completed: official-source research and read-only GitHub baseline.
- Not performed: repository creation, branch creation, commits, pushes, Lovable changes, Supabase changes, deployment, migration, or production writes.
- Next authorization gate: create the new private repository and isolated development environment for Stage 02.

