# PORTAL-B1-E2E-88-PRODUCTION-READONLY-PREFLIGHT-97-REPORT

## PORTAL_B1_E2E_88_PRODUCTION_READONLY_PREFLIGHT_PACKAGE_97

**Decision:** `PASS_B1_E2E_88_READONLY_PREFLIGHT_PACKAGE_SOURCE_READY`

| field | value |
|---|---|
| Base HEAD | `e0cf9d48acb562109aaf310dbd5e534b900c6d90` |
| Final HEAD | `bdc9d8b9b552dc35478db56e7757b481a8dbb594` |
| Draft PR | _(filled after open)_ |
| Working tree | clean after commit |
| Branch | `ops/b1-e2e-88-production-readonly-preflight-97` |
| Merged PR | #281 |
| Reviewed source HEAD | `630bb9d1eac55b97e0723381d8d859a463dfaacc` |
| Production access | **NONE** |
| Production writes | **ZERO** |
| Migration apply | **NONE** |
| Auth writes | **NONE** |
| Deploy/Publish | **NONE** |

## Migration 88

| field | value |
|---|---|
| Filename | `supabase/migrations/20260804120000_b1_88_request_scoped_e2e_support.sql` |
| Raw SHA-256 | `b1b8ea2a7c6f7a08910046658e6876c2667d28d5ca879f296c142bf905de587c` |
| LF SHA-256 | `fb4e1e507b0bc109a225cb33e1a95e740253c3c85f508ed673abd4f273726f2a` |
| Bytes | raw `58236` / LF `56666` |
| Lines | `1571` (LF) |
| Transaction | single `BEGIN;` … `COMMIT;` |
| Created tables | `b1_e2e_88_executions`, `b1_e2e_88_actor_bindings`, `b1_e2e_88_audit_events` |
| Created functions | 18 new E2E helpers/management/trigger functions |
| Replaced production functions | 4 (see below) |
| Triggers | `trg_b1_e2e_88_audit_no_update`, `trg_guard_b1_e2e_88_immutable_marker` |
| RLS | enabled on all three E2E tables; **no** policies (deny-by-default) |
| Grants/revokes | REVOKE ALL from PUBLIC/anon/authenticated on E2E tables; GRANT SELECT to `service_role`; operational RPCs `service_role` only |
| Expected object delta | +3 tables, +2 triggers, +18 functions, RLS×3, policies 0, data DML 0 |
| Expected function replacements | `create_student_request(text,text,jsonb,text)`, `user_matches_workflow_runtime_step(uuid)`, `current_user_matches_transfer_department_scope(uuid,text)`, `can_current_user_act_on_step(uuid,text)` |
| Cleanup/decommission companion | `docs/migration-drafts/B1-E2E-88-REQUEST-SCOPED-SUPPORT-CLEANUP.NOT_APPLIED.sql` (raw SHA `61254e3f3e6cc66802b5aa16d6b40f0fa9019d1a3d88a50c334424bcbad0335d`) |
| Migration 88 rewrite | **NONE** (bytes pinned only) |

## Preflight package

| field | value |
|---|---|
| SQL path | `docs/production-preflight/B1-E2E-88-PRODUCTION-READONLY-PREFLIGHT-97.sql` |
| SQL raw SHA-256 | `42d7b23ce9c62f4d864f00423d017b9dbecda29f6462585b6adc4d3d554df6ac` |
| SQL LF SHA-256 | `e8a03afdee01d8776ab8e292f26817addb05a0ed7609a45a9bcb65d49e302e05` |
| Lovable package | `docs/production-preflight/B1-E2E-88-LOVABLE-READONLY-EXECUTION-PACKAGE-97.md` |
| Lovable project id | `4b291119-790f-4484-9285-c2b774e1ba6f` |
| Production ref | `wpmicqriltrowwonknox` |
| Read-only | **YES** (`SERIALIZABLE READ ONLY` → `ROLLBACK`) |
| Gates | **G01–G14** (14) |
| Project identity | fail-closed via session attestation GUC; unproven ⇒ HOLD |
| Migration ledger | version/token search + object-identity alias; already-applied / ambiguous ⇒ HOLD |
| Partial-apply detection | **YES** → `HOLD_B1_E2E_88_PARTIAL_APPLY_DETECTED` |
| Function preimages | base fingerprints pinned; drift ⇒ `HOLD_B1_E2E_88_FUNCTION_PREIMAGE_DRIFT` |
| Five-service visibility | exact five; `is_active=true`, `student_visible=false` |
| Enrollment certificate | protected visibility + protected request/document identities |
| Fixtures | exact 19; one active step; Fixture 15 restored approved (`in_review` + active archive) |
| RPA fingerprint | five-service-scoped active assignments; duplicate active ⇒ HOLD |
| Protected fingerprints | request_types / fixtures / runtime / RPA / workflows / enrollment protected surfaces |
| TEST_ONLY identities | inventory only |
| Password/session readiness | **UNKNOWN / UNPROVEN** (cannot PASS G11) |
| Faculty-only negative | inventoried; missing ⇒ NOT_READY |
| Admin-role negative | inventoried; `hr_officer` stand-in is NOT sufficient |
| Decommission readiness | draft path + hashes + base restore fingerprints pinned; no auto TEST_ONLY deletion |

## Local verification (source)

| check | result |
|---|---|
| Focused Package 97 | **17/17 PASS** |
| `tests/b1-e2e-request-scoped-support-88` | **18/18 PASS** |
| `tests/b1-authoritative-positive-fixture-matrix-19` | **14/14 PASS** |
| `tests/student-requests` | **1065/1065 PASS** |
| PG17 smoke | **PASS** (local `postgres:17` probe) |
| `bunx tsc --noEmit` | **PASS** |
| `bun run build` | **PASS** |
| `git diff --check` | **PASS** |
| routeTree | **UNCHANGED** |

## Assumptions

1. Production Fixture 15 restored approved state means dual-reviewed restore predecessor: `status=in_review`, `completed_at IS NULL`, six completed steps, one active archive step `f1300001-0000-4000-8000-000015000007`. If production is still consumed, live G07 HOLDs (fail-closed).
2. Project ref cannot be proven from catalog alone; operator attestation GUC is required for G01 PASS.
3. Password usability remains UNKNOWN without an authorized session proof mission.
4. Lovable may rewrite migration filenames; post-apply proof must use object identity.

## Risks

- Live G07 may HOLD if Fixture 15 restore (#44 family) was never successfully applied.
- G11 remains HOLD while passwords/session ability are UNPROVEN and faculty-only/admin-negative identities are unresolved.
- `supabase_migrations.schema_migrations` may be unreadable on some operator roles → G02 HOLD.

## Blockers for live production PASS (not source blockers)

- Project attestation must be performed in the Lovable session.
- Fixture 15 may still be consumed in production.
- Faculty-only and true admin-role TEST_ONLY negatives remain unresolved per IDENTITIES.md.
- Password/session ability unproven.

## Production impact of this package

**None.** Source docs + tests only. No production connection. No SQL apply. No Auth writes. No deploy/publish.

## Final recommendation

`READY_FOR_INDEPENDENT_REVIEW_AND_LOVABLE_READONLY_EXECUTION`
