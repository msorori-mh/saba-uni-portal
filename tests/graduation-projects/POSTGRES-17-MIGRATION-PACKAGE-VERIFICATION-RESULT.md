# POSTGRES-17 MIGRATION PACKAGE VERIFICATION RESULT

- Date: 2026-07-30
- Branch: `k3/graduation-projects-completion`
- Environment: Docker `postgres:17` (server 17.x), disposable container, destroyed on exit.
- Runner: `tests/graduation-projects/run-pg17-migration-package.sh`
- Mode: `psql -v ON_ERROR_STOP=on`, one migration at a time, preflight → apply → verifier; every verifier transaction ends in `rollback;` — nothing persists.
- Fixture: `tests/graduation-projects/postgres-minimal-schema.sql` (synthetic ids only).

## Result: PASS

```
== minimal schema
== M1 20260730100000 foundation                preflight ✓ apply ✓ foundation-verifier ✓
== M2 20260730100001 lifecycle completion      preflight ✓ apply ✓ lifecycle-verifier ✓
== M3 20260730100002 co_supervisor enum        preflight ✓ apply ✓
== M4 20260730100003 completion hardening      preflight ✓ apply ✓
== post-hardening regression                   foundation-verifier ✓ lifecycle-verifier ✓
== hardening verifier                          postgres-hardening-verifier ✓
== M5 20260730100004 files & notifications     preflight ✓ apply ✓
== post-M5 regression                          foundation ✓ lifecycle ✓ hardening ✓
== files & notifications verifier              postgres-files-notifications-verifier ✓
== M6 20260730100005 admin settings & rubrics  preflight ✓ apply ✓
== post-M6 regression                          foundation ✓ lifecycle ✓ hardening ✓ files-notifications ✓
== admin settings verifier                     postgres-admin-settings-verifier ✓
== M7 20260730100006 evaluation completeness   preflight ✓ apply ✓
== post-M7 regression                          all five verifiers ✓
== GP-07 authorization matrix (final schema)   68 rows, fail_rows=0 ✓
MIGRATION PACKAGE PG17 VERIFICATION PASS
```

Coverage of the hardening verifier:

- Structure: `co_supervisor` enum label; 3 exactly-one partial unique indexes; 3 new tables with RLS enabled and zero policies; scan audit columns; scan RPC not executable by `anon`/`authenticated`.
- co-supervisor: assignment via RPC, duplicate slot denial (`project supervisor slot already filled`), student-subject rejection (23514), staff-level detail read, write denial (`exact direct processing assignment required`), unrelated-user read denial.
- Exactly-one pending discussion request: index 23505 on direct insert; RPC guard `discussion request already pending` on a discussion-ready project.
- Exactly-one panel chair: index 23505 on direct insert; RPC guard `panel chair already assigned`.
- Scan RPC: `authenticated` execute denied (42501); service path pending→clean persists `scan_decided_at`/`scan_correlation_id`; same-decision replay is an idempotent no-op; conflicting decision → `file scan state already decided`; unknown file → `file not found`; invalid state → `scan state invalid`.
- Rubric tables: insert + duplicate criterion code 23505; `authenticated` insert denied (42501).
- Notification log: dedupe unique key 23505 on exact duplicate; `authenticated` insert denied (42501).
- Attachment policy (M5): MIME allowlist denial, 50 MiB cap denial, invalid kind denial, stage-binding denial (milestone_submission without submission, final_manuscript off final milestone), `file_kind` persisted + in event payload, 8-arg legacy call form still resolves.
- Notifications (M5): unmapped events stay silent; `milestone_set` fan-out = student+supervisor minus actor; duplicate insert absorbed (23505 on direct duplicate, ON CONFLICT no-op in trigger); own-notifications read scoped (`auth.uid()`), outsider sees zero; orphan review flags 31-day pending-scan file and is not executable by `authenticated`.
- Authorization closure (M7 + matrix): 68-row matrix PASS (fail_rows=0) covering read/proposal/team/milestone/files/discussion/evaluation/result/cross-dept/settings/visibility areas, exact denial messages, idempotent replays, archived-project mutation denials, and 42501 grant walls executed as the `authenticated` role. GP-07 High finding fixed: result conclusion previously skipped panel members with no recorded evaluation; the guard now requires every panel member of the held discussion to be finalized (`evaluations not finalized`).
- Admin/settings (M6): settings write denied for non-authority, invalid values rejected, upsert idempotent on (department, null year); team_max reached → `team size limit reached`; team_min shortfall → `team below minimum size`; closed window → `proposal window closed` then reopens successfully; `co-supervisor not allowed by settings`; `supervisor capacity reached` on a second project; rubric create/read/update-criteria/replace + `rubric payload invalid` + `rubric not found`; defense report payload well-formed.

Migrations applied to any shared/persistent environment: **0**. Production operations: **0**.
