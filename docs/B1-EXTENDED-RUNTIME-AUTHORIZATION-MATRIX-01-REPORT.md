# B1 Extended Runtime Authorization Matrix 01

## Scope

The matrix covers every configured staff step in `enrollment_suspension`, `excused_absence`, `department_transfer`, `final_chance`, and `file_withdrawal`.

For each step it proves exact direct-assignee ALLOW and DENY for same-role unassigned users, wrong unit, wrong role, admin/registrar/dean bypass attempts, anonymous callers, pending/inactive/completed steps, another request, incomplete predecessor, and wrong action.

## Source hardening

- B1 runtime steps are active-only and require exactly one direct assignee.
- Role-pool fallback remains available only to non-B1 behavior; it cannot authorize B1.
- A closed SQL tuple contract validates request type, step key, processing unit, processing role, and action.
- Source/target department heads remain separately pinned to their department and direct assignment.
- Secure attachment staff download is direct-active-assignee only; request ownership is not a staff-download bypass.
- External payment confirmation remains specialized, finance-only, active-only, exactly-one-direct-assignee, and non-financial.
- `final_chance` remains the only accepted new academic chance value.

## Verification

- Focused matrix and related source contracts: 120 PASS, 0 fail.
- Full student-request suite: 414 PASS, 0 fail.
- TypeScript: PASS.
- Production build: PASS (existing non-blocking bundler/chunk warnings only).
- Repository lint: baseline FAIL on existing Prettier/CRLF violations; no lint success is claimed.
- `git diff --check`: PASS.
- Independent source/security review: PASS; CRITICAL 0, HIGH 0 after closing exact processing-binding and transfer department-scope findings.
- Full suite/build/lint and independent review are recorded before publication.

## Production impact

None. All database changes remain under `docs/migration-drafts`; no SQL/migration was applied, no bucket or policy was created, and no production data, protected request, `student_visible`, deploy, or publish operation was performed.

## Remaining runtime gate

The source matrix does not activate B1. A full compatible local schema and executable service workflow migrations are still required before direct RPC execution can be considered complete.
