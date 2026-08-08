# GP Level-4 post-apply operator runbook

Mission marker: `TEST_ONLY_GP_LEVEL4_RECLOSURE_01`. This is a SOURCE-ONLY operator flow. It does not authorize migration apply, production fixture execution, deploy, publish, or writes outside the explicitly gated TEST_ONLY window. Every STOP ends the run; do not skip forward.

## Authoritative touch inventory

Derived from `GP-LEVEL4-PRODUCTION-TESTONLY-FIXTURES-01.sql`, not prior documentation.

| Surface | Classification | Constraint/evidence |
|---|---|---|
| `auth.users` | CREATED_TEST_ONLY | 15 exact `a4e40100…a100` UUIDs |
| `faculty`, `faculty_profiles` | CREATED_TEST_ONLY | 8 exact parent/profile UUIDs when production-shaped faculty exists |
| `student_profiles`, `student_academic_status` | CREATED_TEST_ONLY | 8 profiles; 8 status rows; unknown intentionally has none |
| departments, programs, academic years, semesters | CREATED_TEST_ONLY | four exact UUIDs; academic levels are REFERENCE_ONLY |
| `graduation_projects` | CREATED_TEST_ONLY | P1–P4 exact UUIDs; P4 is updated only after its creation |
| teams/team members | NOT_TOUCHED | topology is represented by assignments |
| assignments | CREATED_TEST_ONLY | 11 exact rows; processing unit/role are generated from department/role |
| proposals/progress/final submissions/defense/evaluations | NOT_TOUCHED | no provisioning INSERT/UPDATE; cleanup/verifier still check project-scoped residue |
| events/audit/history | CREATED_TEST_ONLY | four seed events; E2E may add allowlisted project events |
| files/upload intents | CREATED_TEST_ONLY | three exact file rows, including pending-demotion intent |
| storage metadata | NOT_TOUCHED by provision | no fake bytes/object row; cleanup/verifier inspect marker-bearing metadata |
| final archive | CREATED_TEST_ONLY | one exact archive row |
| manifest/fixture ledger | CREATED_TEST_ONLY | exact marker row plus registry inventory |
| all other production rows | REFERENCE_ONLY or NOT_TOUCHED | sentinels/fingerprints must remain identical |

## Deterministic 18-step flow

1. **Frozen SHA confirmation.** Evidence: record `git rev-parse HEAD`, approved L4 file hashes, and operator identity. PASS: SHA equals the frozen release SHA. STOP: any drift or dirty source tree.

2. **L4 migration ledger post-apply.** Read the migration ledger only after the independently authorized apply. Evidence: SET U and L4 versions present once; quarantined duplicate predecessor absent. PASS: exact ledger. STOP: missing, duplicate, or unexpected version. This runbook never applies migrations.

3. **Structural post-verifier.** Run the approved read-only structural verifier. Evidence: function predicates, SECURITY DEFINER/search_path, ACLs, private bucket. PASS: every required structural assertion passes. STOP: any mismatch.

4. **Observability pack.** Run the read-only `PORTAL-GP-GA-POSTAPPLY-OBSERVABILITY-READONLY-PACK-01.sql`. Preserve rows GP-001…GP-012. PASS: all mandatory checks PASS. WARN: record owner/rationale and proceed only when the check itself documents WARN as non-blocking. FAIL: STOP. Specifically: GP-001 ledger; GP-002 quarantine; GP-003 predicate; GP-004 function security; GP-005 ACL; GP-006 storage INSERT policy; GP-007 bucket privacy; GP-008 non-L4 assignments; GP-009 ambiguity; GP-010 archive anomalies; GP-011 duplicate teams; GP-012 signed-download replay anomalies.

5. **Production fingerprint.** Capture read-only per-surface counts/hashes for all ordinary rows and non-test sentinels. PASS: evidence is complete and immutable. STOP: fingerprint query fails or marker already exists.

6. **Fixture provisioning DRY RUN.** Run fixture SQL without a GUC. Evidence: `GP_L4_FIXTURE_DRY_RUN` plus zero fixture projects afterward. PASS: rollback confirmed. STOP: commit or residue.

7. **Explicit TEST_ONLY execution gate.** In a fresh bounded session set `gp.l4_fixture.execute=true`, then run provision SQL. Evidence: `GP_L4_FIXTURE_PROVISION_COMMIT`, exact registry inventory, actor count 15, projects 4. PASS: PRE_E2E fingerprint passes. STOP: collision, missing auth, broad scope, or fingerprint drift.

8. **Negative L1/L2/L3/unknown/ambiguous.** For every RPC case capture the full before fingerprint, execute, assert the exact denial, capture after, and assert equality. Evidence: `NEGATIVE_ZERO_MUTATION_PASS` for each named case. PASS: all five actor classes deny. STOP: success, wrong error, or mutation.

9. **Dual-role.** P2 student path must deny for non-L4; P3 coordinator path must allow. Evidence: P2 zero-mutation denial and P3 detail/list result. PASS: no role bleed. STOP: P2 visibility/mutation or missing P3 staff access.

10. **L4 positive leader/member.** Exercise the approved positive matrix only. Evidence: expected project detail/list and authorized lifecycle responses. PASS: leader/member semantics match the frozen contract. STOP: any unexpected authorization or state.

11. **Upload intent/storage.** Verify private bucket, safe object key, pending intent, storage INSERT predicate, and no public URL. Evidence: file/event fingerprint and storage-policy result. PASS: exact-project authorization only. STOP: public exposure, unsafe path, or unrelated object mutation.

12. **Pending-demotion denial.** Demote the member in the disposable/test-only scenario, evaluate `can_upload_graduation_project_object`, and restore only fixture state. Evidence: false result with before/after full fingerprint equality around the denied operation. PASS: no object/file/event created. STOP: upload allowed or mutation.

13. **Signed download/replay.** Run positive owner download, cross-actor replay, cross-project replay, and unauthorized actor path. Evidence: exact bucket/path only for positive; each denial has zero-mutation proof. PASS: actor/entity/project binding holds. STOP: coordinates leak or replay succeeds.

14. **Archive immutability.** Attempt the documented mutation against P4. Evidence: exact `archived project is immutable` denial and equal full fingerprints. PASS: no project/event/file/archive drift. STOP: any mutation.

15. **Cleanup DRY RUN.** In a new session run cleanup without a GUC. Evidence: `GP_L4_CLEANUP_INVENTORY` then `GP_L4_CLEANUP_DRY_RUN`; fixture remains present. PASS: no deletes. STOP: any row disappears or candidate is outside exact UUID/marker constraints.

16. **Cleanup execute.** In a separate cleanup session set `gp.l4_fixture.execute=true` and run cleanup. Evidence: per-surface deleted counts and `GP_L4_CLEANUP_SUCCESS`. PASS: FK-safe deletion completes, including exact synthetic Auth UUIDs. STOP: allowlist drift, marker mismatch, or ordinary row selected.

17. **Comprehensive zero residue.** Set phase `POST_CLEANUP` and run fingerprint SQL. Evidence: every `per_surface_residue` count and `TEST_ONLY_RESIDUE_TOTAL: 0`. PASS: total zero. STOP: any nonzero surface. The disposable PG17 qualification must also prove the verifier fails when one exact TEST_ONLY auth/profile/status cluster is deliberately left, then passes after it is removed.

18. **Non-test production post-state verification.** Re-run the step-5 ordinary fingerprint and observability GP-001…GP-012. PASS: ordinary rows are byte-identical, no new FAIL, and all approved WARN dispositions unchanged. STOP: any ordinary sentinel/data/storage drift.

## Replay qualification

On disposable PostgreSQL 17 run the complete sequence at least twice: clean → provision dry-run → provision execute → topology fingerprint → negative matrix → positive matrix → cleanup dry-run → cleanup execute → zero residue → re-provision → identical topology fingerprint → cleanup → zero residue. The CI harness is the executable evidence; a new `NEGATIVE_CASE` without a matching `expect_fail_zs`/`expect_false_zs` fails the static contract.

Terminal operator verdict is PASS only when steps 1–18 and CI are green. Otherwise HOLD with the first STOP condition and preserved evidence.
