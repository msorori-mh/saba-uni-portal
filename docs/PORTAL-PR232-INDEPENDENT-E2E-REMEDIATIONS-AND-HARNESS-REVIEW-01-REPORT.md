# PORTAL-PR232-INDEPENDENT-E2E-REMEDIATIONS-AND-HARNESS-REVIEW-01

## Decision

`PASS_PR232_INDEPENDENT_RUNTIME_E2E_REVIEW`

The final PR #232 head was reviewed at
`9fba8b5b78bf9936a483aec690c27100261ed522` on final base
`b9d6acca7a36c1ca19365179740095cbedf0cd1e`. No CRITICAL, HIGH, or MEDIUM
security defect remains after the independent harness-strengthening changes in
this stacked review.

## Scope and baseline

| Item | SHA |
|---|---|
| PR #232 final reviewed head | `9fba8b5b78bf9936a483aec690c27100261ed522` |
| PR #232 final base | `b9d6acca7a36c1ca19365179740095cbedf0cd1e` |
| `origin/main` reference | `92d51faa9bcdc9fd99e89579f6a498b463264246` |
| Initial PR #232 head superseded during review | `a52ea121e2b0c43a9f93e439f3bc9f98566c6026` |

The review branch fetched and merged the final Cursor head before the final
decision. Results from the superseded head are not used as final evidence.

## Security review

### Position-assignment department-chair scope

- `current_user_matches_transfer_department_scope(uuid,text)` requires
  `auth.uid()`, exactly one active temporal `position_assignments` row for that
  user, and a matching active `request_processing_assignments` row.
- The processing assignment must match the runtime step's exact
  `processing_unit_id` and `processing_role_id`.
- Source approval matches only `current_department_id`; target approval matches
  only `requested_department_id`.
- Alternative direct-assignee columns must be NULL, so the position-assignment
  path cannot be combined with a broader user/staff/faculty path.
- No admin, registrar, dean, or generic department-chair role bypass was added.
- The integrated lifecycle now attempts the target chair on the source step and
  the source chair on the target step. Both return
  `B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED`, then the exact chair succeeds.

### Withdrawal acknowledgment and SQL NULL semantics

- The submit validator uses
  `impact_acknowledgment IS DISTINCT FROM 'true'::jsonb`.
- The unsafe three-valued comparison
  `impact_acknowledgment <> 'true'::jsonb` is absent from the executable
  function body.
- Missing key, explicit JSON `null`, and `false` each deny with
  `B1_WITHDRAWAL_INPUT_INVALID`.
- Each denial is wrapped by the expanded zero-mutation snapshot.
- A subsequent `true` acknowledgment completes the full withdrawal lifecycle.

### Sequence, manifest, and SHA consistency

The final production sequence is contiguous and unique:

| Sequence | Contract |
|---:|---|
| 21 | Secure Read Contracts |
| 22 | Secure Draft Mutations |
| 23 | Transfer Department Scope Position Assignment |
| 24 | File Withdrawal Impact Acknowledgment NULL Guard |
| 25 | Activation gate only; not a migration |

The manifest contains exactly sequences 1–24. Promotion map, migration names,
preflight/post-verifier pairs, and source SHA pins agree. The post-manifest F1/F2
actor/action hardening remains an explicitly labeled harness-only entry at 90;
it is not represented as activation gate 25. The independent test recomputes
every `git hash-object` pin.

### Harness accuracy and zero mutation

The final PostgreSQL 17 integrated run produced 50 PASS rows and zero FAIL rows:

| Counter | Result |
|---|---:|
| services_completed | 5 |
| draft_creates | 5 |
| draft_saves | 6 |
| read_allows | 18 |
| read_denials | 4 |
| action_allows | 24 |
| action_denials | 9 |
| attachment_assertions | 4 |
| idempotency | 3 |
| concurrency | 1 |
| zero_mutation | 18 |
| fail_rows | 0 |

The review expanded the denial snapshot beyond request status/form/timestamp
and workflow steps/events. It now also freezes request attachment count, total
processing-assignment count, and all five service-detail records. This prevents
a denial from being counted as zero-mutation while silently changing a detail
or attachment row.

### Five-service and enrollment-certificate regression

- All five services reached a terminal completed state through legal RPCs:
  enrollment suspension, excused absence, department transfer, final chance,
  and file withdrawal.
- Payment confirmation remained on its specialized RPC; the general action RPC
  rejected `confirm_payment`.
- `submit_student_request(uuid)` remained present and separate from the B1
  atomic submit RPC.
- No enrollment-certificate workflow was activated by the disposable harness.
- No anonymous enrollment-certificate execute grant was introduced.
- No product source writes `student_visible`. PR #232's existing disposable
  local fixture sets visibility only inside its isolated PostgreSQL container
  to exercise the activation gate.

## Independent changes

- `tests/b1-integrated-runtime/pg/10-e2e-helpers.sql`
  - expanded authoritative zero-mutation snapshots.
- `tests/b1-integrated-runtime/pg/40-lifecycle-five-services.sql`
  - added exact source/target department negative probes;
  - added missing/null/false withdrawal acknowledgment probes.
- `tests/student-requests/b1-integrated-runtime-independent-review-01.test.ts`
  - added source, sequence, SHA, scope, NULL-semantics, 5/5, and protected-path
    regression assertions.
- This report.

No RPC implementation, production configuration, migration behavior, or UI was
changed by the independent remediation.

## Verification

- `bun install --frozen-lockfile` — PASS, no changes.
- Focused independent/source tests — 12 pass, 0 fail.
- PostgreSQL 17 integrated runtime harness — PASS, 5/5, 50 PASS rows,
  `fail_rows=0`.
- PostgreSQL 17 Secure Read harness — PASS, 25/25.
- PostgreSQL 17 Secure Draft harness — PASS, 35/35 plus concurrent-create PASS.
- `bun test tests/student-requests` — 657 pass, 0 fail.
- `bun test tests/b1-rpc-matrix` — 22 pass, 0 fail.
- `bun test tests` — 1594 pass, 0 fail.
- `bunx tsc --noEmit` — PASS.
- ESLint on changed TypeScript — PASS after one local Prettier correction.
- `bun run build` — PASS (`BUILD_EXIT=0`).
- `git diff --check` — PASS.
- All disposable PostgreSQL containers were stopped.

## Findings

| Severity | Result |
|---|---|
| CRITICAL | None |
| HIGH | None |
| MEDIUM | None |
| LOW | Harness evidence was strengthened for detail/attachment zero mutation and explicit NULL variants; fixed in this stacked review. |

## Assumptions, risks, and production impact

- The PostgreSQL matrix uses disposable local fixtures and does not claim a
  production migration apply.
- Remaining risk is deployment/process risk: sequence 21–24 and gate 25 still
  require their separately approved release procedure.
- No Production or Staging access occurred.
- No migration was applied to a shared environment.
- No Deploy, Publish, workflow activation, PR merge, or external
  `student_visible` change occurred.
