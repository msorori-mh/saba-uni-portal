# External University Payment Workflows 02

## Result

PASS — source-only migration draft 2/3 is complete for `department_transfer` and `final_chance`.

The draft creates inactive workflow versions only. It does not activate a workflow, apply SQL, change request visibility, mutate requests, or store a fee type, amount, currency, invoice, gateway transaction, or internal balance.

## Contract

- Resolves exactly one request-type row from each approved canonical/stored alias pair; ambiguity fails closed.
- Resolves exactly one active processing unit and matching active role for every step.
- Uses `specific_user` assignment and preserves distinct source/target department scopes.
- Routes the preceding approval directly to `payment_confirmation` with `awaiting_payment_confirmation` entry status.
- Allows exactly one onward transition: `payment_confirmed` to `registrar_apply`.
- Uses the closed B1 action/outcome vocabulary, including `apply_decision` to `applied`.
- Reuses a marker-matching draft only after complete step and transition structural verification.
- Keeps final chance limited to a final exam chance.

## Verification

- Focused source-contract tests: 9 PASS.
- Student-request suite: 423 PASS.
- TypeScript: PASS.
- Production build: PASS.
- `git diff --check`: PASS.
- Repository lint: baseline HOLD (119,824 existing repository-wide findings, dominated by CRLF/Prettier); the added TypeScript test was formatted independently.
- Independent review: PASS; CRITICAL 0, HIGH 0, MEDIUM 0, LOW 0 after closing two HIGH and one MEDIUM findings.

## Production impact

None. The SQL remains under `docs/migration-drafts` and was not executed. No production connection, deploy, publish, or data write occurred.

## Remaining gates

Migration 3/3 for canonical `final_chance` writes, the shared executable submit/action migration, executable service workflow migrations, processing identity verification, exact apply commands, and per-migration production preflight remain incomplete or unapproved.
