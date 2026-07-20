# Portal Parallel Activation and Expansion Cycle 01

Date: 2026-07-21 (Asia/Riyadh)

Repository: `msorori-mh/saba-uni-portal`

Requested baseline: `427b7eb48f8771f31bd08a46fc4590cf883ab7e2`

Current `origin/main` at reconciliation:
`99f1b48dabe3c475ee5ca04c7d16b3948d46662a`

## Final cycle decision

`HOLD_PORTAL_PARALLEL_CYCLE`

The three source foundations are complete and merged. B1 production activation
is independently HOLD, so it does not block or downgrade those source results.
No SQL or Migration was applied by this cycle, and Codex performed no Deploy,
Publish, Workflow activation, `student_visible` change, or production data write.

## Parallel workstream results

| Workstream | PR / merge | Verification and review | Independent decision |
|---|---|---|---|
| `B1-FIVE-SERVICES-PRODUCTION-ACTIVATION-PREFLIGHT-02` | [#173](https://github.com/msorori-mh/saba-uni-portal/pull/173), `047720685484dc46e3d23fa9306c55f2a1ec800a` | Web CI PASS; 18/18 canonical Git-blob hashes PASS; independent review 0/0/0 after order remediation | `HOLD_B1_PRODUCTION_ACTIVATION_PREFLIGHT` |
| `DEPARTMENT-TRANSFER-ACADEMIC-CLEARANCE-FOUNDATION-01` | [#175](https://github.com/msorori-mh/saba-uni-portal/pull/175), `b565200851b4988f0257133498af015b7ef2e053` | PG17 positive/negative verifier PASS; 11 tests / 63 assertions; student-request regression, typecheck, build, diff-check and Web/Android CI PASS; findings remediated to 0/0/0 | `PASS_ACADEMIC_CLEARANCE_FOUNDATION_SOURCE_READY` |
| `GRADUATION-PROJECTS-MVP-FOUNDATION-01` | [#174](https://github.com/msorori-mh/saba-uni-portal/pull/174), `f970b9c99b5dbd55f0a80d5d85a3ee20a4e80f69` | PG17 lifecycle/RPC matrix PASS; 15 tests / 87 assertions; typecheck, Web/Android CI PASS; review findings remediated to 0/0/0 | `PASS_GRADUATION_PROJECTS_MVP_FOUNDATION_SOURCE_READY` |
| `GRADUATES-AFFAIRS-MVP-FOUNDATION-01` | [#179](https://github.com/msorori-mh/saba-uni-portal/pull/179), `53c40148289c8457ed4577764e20f1db69161404` | PG17 verifier PASS; 6 tests / 45 assertions; typecheck and Web/Android CI PASS; final independent review 0/0/0 | `PASS_GRADUATES_AFFAIRS_MVP_FOUNDATION_SOURCE_READY` |

All four worktrees were isolated and their feature branches were pushed
independently. The graduates-affairs worker started after a slot became free.
No two workers shared an editable source file.

## B1 activation readiness

The original P0 preflight stopped before production database reads because the
live endpoint did not independently prove that it was built from the requested
`427b7eb...` SHA. A later separately recorded Lovable publication and fresh
read-only preflight did not authorize any write and still resulted in
`HOLD_B1_FRESH_READONLY_PREFLIGHT`.

The current blockers are:

1. deployed-artifact provenance is not independently exposed by the live HTTP
   surface;
2. the production role cannot enumerate `supabase_migrations.schema_migrations`;
3. the later read-only inventory sees 29 draft SQL files and needs the canonical
   18-file manifest bound explicitly to the apply package;
4. both six- and seven-argument `log_audit` overloads remain installed;
5. the department-chair state remains CS=0, IT=2, IS=1 and the controlled
   correction package remains unapplied;
6. `origin/main` has advanced beyond the separately published release SHA, so a
   new release candidate would need its own CI/build/provenance gate.

The five services remain `student_visible=false`, have zero active Workflows and
zero production requests. The protected request/document evidence remained
unchanged. The attachment bucket is private and its current owner/privileged-read
contract was classified `REUSE_SAFE`; no Bucket or policy mutation occurred.

`FIRST_MIGRATION_READY_FOR_APPLY_AUTHORIZATION = NONE`.

## Sequential plan retained

After the blockers above are independently closed, apply exactly one reviewed
Migration per authorization, immediately execute its verifier, compare all
before/after invariants, and stop on any unexpected delta or partial apply.

The first service remains `enrollment_suspension`. Its future gates are separate:

`single Migration apply -> verifier -> direct RPC authorization matrix ->
Workflow activation -> authenticated safe E2E -> student_visible=true -> smoke`

No gate in this report authorizes the next one.
`B1-PRODUCTION-MIGRATION-SEQUENCE = REQUIRES_USER_APPROVAL` remains binding.

## Expansion-system boundaries

- Academic clearance remains fail-closed until exact academic-affairs unit/role
  codes and the official passed-result vocabulary are approved and configured.
- Graduation projects remains a source-only SQL draft and tests package; Storage,
  runtime activation and production identities were not created.
- Graduates affairs creates no production graduate. Official graduation evidence,
  exact authorization policies, account-continuation policy and a separately
  approved Migration remain mandatory.

The three foundations are ready for their next separately authorized source or
Migration-promotion phases, but not for production application.
