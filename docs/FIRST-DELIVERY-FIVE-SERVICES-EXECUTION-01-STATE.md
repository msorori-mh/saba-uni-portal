# FIRST-DELIVERY-FIVE-SERVICES-EXECUTION-01

## Scope

The first delivery contains all five student services:

- `enrollment_suspension`
- `excused_absence`
- `department_transfer`
- `final_chance`
- `file_withdrawal`

## Current execution state

- Base source: `e2e3645f7bd33d0111d10c4c7f369974366e4a4d`.
- The production `log_audit` overload closure was applied through migration `20260724022428_91130036-f132-4935-b492-260d403dfa8c.sql`.
- Department administrative-position separation remains the next production apply after source/build verification.
- No service may become student-visible until all five complete authorization matrices and end-to-end verification.

## Execution contract

Proceed as one connected delivery path: source verification, production migrations sequentially, deployment, positive and negative RPC authorization matrices, hidden end-to-end tests for all five services, then simultaneous visibility activation and final smoke verification.

Stop only on an exact technical blocker. Preserve atomicity and do not continue after a failed or partial migration.
