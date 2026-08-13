# COURSE-SECTION-STUDY-SYSTEM-RECONCILIATION-01

Read-only production preflight. **Decision document only — no writes were performed and none are authorized here.**
The authoritative value MUST come from the approved group import / registry decision.
**Do NOT auto-derive the section value from enrolled students.**

Production gate requirement: `ACTIVE_SECTIONS_WITH_NULL_STUDY_SYSTEM = 0`
before `COURSE-MATERIALS-STUDY-SYSTEM-CANONICALIZATION-01.sql` is applied.

Canonical vocabulary: `general` (عام) | `private` (نفقة خاصة) | `both` (كلا النظامين).

## Sections with `study_system IS NULL` (8/8, all `status = active`)

| # | section id | code | course | academic year | semester | program | enrolled | materials |
|---|---|---|---|---|---|---|---|---|
| 1 | `92a920b4-5e7d-401c-aae3-aa2f22c8b1b9` | A | USR02 — مهارات اللغة العربية (2) | 2025-2026 | الفصل الثاني | البكالوريوس في تكنولوجيا المعلومات | 2 | 0 |
| 2 | `352280c8-2214-46e2-aaf9-de424d0cc58b` | DEMO-FITCS01 | FITCS01 — مقدمة في تكنولوجيا المعلومات | 2026-2027 | الفصل الأول | البكالوريوس في تكنولوجيا المعلومات | 1 | 4 |
| 3 | `ae8ffd5c-8b72-476c-bf80-61c3d8fba363` | DEMO-FITCS02 | FITCS02 — تفاضل وتكامل | 2026-2027 | الفصل الأول | البكالوريوس في تكنولوجيا المعلومات | 1 | 0 |
| 4 | `b4f00f2e-aec2-404a-8ac6-a3aae3737791` | DEMO-FITCS03 | FITCS03 — برمجة الحاسوب (1) | 2026-2027 | الفصل الأول | البكالوريوس في تكنولوجيا المعلومات | 1 | 0 |
| 5 | `df14b32c-5282-427e-b9f1-a8a76c6f254e` | DEMO-FITCS05 | FITCS05 — الرياضيات المتقطعة | 2026-2027 | الفصل الأول | البكالوريوس في تكنولوجيا المعلومات | 1 | 0 |
| 6 | `b600135e-55e9-45a8-a005-d0e5088c527e` | DEMO-IT343 | IT343 — التجارة الالكترونية | 2026-2027 | الفصل الأول | البكالوريوس في تكنولوجيا المعلومات | 1 | 0 |
| 7 | `9cb4c780-ed17-4691-b5f0-c4d845fd978f` | DEMO-IT425 | IT425 — إدارة النظم وصيانتها | 2026-2027 | الفصل الأول | البكالوريوس في تكنولوجيا المعلومات | 2 | 0 |
| 8 | `fa1ba625-269a-498e-bb01-40119c67ed0c` | DEMO-AI414 | AI414 — تنقيب البيانات | 2026-2027 | الفصل الأول | البكالوريوس في تكنولوجيا المعلومات | 1 | 0 |

The `enrolled` column is informational context only, not a derivation source.

## Effect of the source change (already committed, production untouched)

- Existing 4 materials on `DEMO-FITCS01` remain readable and are not rewritten.
- Any NEW material creation on any of the 8 sections is denied with
  `UNKNOWN_SECTION_STUDY_SYSTEM` / «نظام الدراسة للمجموعة غير محدد» until the
  authoritative value is set.
- `material.study_system` is never silently mutated.

## Mandatory production order (later gate, not this task)

1. Resolve / reimport authoritative `study_system` for the 8 active sections.
2. Verify `ACTIVE_SECTIONS_WITH_NULL_STUDY_SYSTEM = 0`.
3. Apply `COURSE-MATERIALS-STUDY-SYSTEM-CANONICALIZATION-01.sql`.
4. Apply `CDP-INSTANTIATE-AUTHORIZATION-HARDENING-01.sql`.
5. Run authorization matrix + syllabus → plan → material → student E2E.
