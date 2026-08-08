# ACADEMIC-COUNCILS-C0-C9-SECURITY-AND-PRODUCTION-READINESS-LONGRUN-10

## Verdict
`PASS_ACADEMIC_COUNCILS_C0_C9_SECURITY_AND_PRODUCTION_READINESS_PR_READY` (pending final CI pins)

## Identity
- **Base PR / SHA:** #304 / `2cb8baf73db6a97c5d8bfcd123c642b15a51b9fb`
- **Branch:** `fix/councils-c9-security-production-readiness-longrun-01`
- **Stacked on:** `fix/councils-c0-c9-final-security-closure-01`

## Phase A — C9 HIGH reproduction (pre-fix, PG17)
Independent finding confirmed on disposable Postgres 17 with C0→C9 applied as shipped on #304 tip:

| Function | Signature | authenticated EXECUTE (pre-fix) |
|---|---|---|
| `create_council_notification` | `(uuid,text,uuid,uuid,text,uuid,text,text,jsonb)` | **true** |
| `get_council_notification_recipients` | `(uuid,text,jsonb)` | **true** |
| `dispatch_council_notification` | `(text,uuid,uuid,text,uuid,jsonb)` | **true** |
| `get_my_council_notifications` | `(integer)` | true (PUBLIC_ACTOR_SAFE) |
| `acknowledge_council_notification` | `(uuid)` | true (PUBLIC_ACTOR_SAFE) |

Forgery proof as `authenticated` chair:
- forged recipient UUID
- forged other-council UUID
- forged entity type/id
- forged title/body
- cross-council `dispatch_council_notification`

**Verdict:** `C9_HIGH_REPRODUCED`

## Phase B–C — INTERNAL_ONLY hardening
In unapplied C9 migration `20260808180000_councils_c9_notifications_reporting_01.sql`:

- Classify helpers as INTERNAL_ONLY / PUBLIC_ACTOR_SAFE / READ_ONLY_PUBLIC
- `REVOKE EXECUTE` from `PUBLIC`, `anon`, `authenticated` on create/dispatch/recipients (+ notify triggers / auth helper)
- Grant INTERNAL_ONLY only to `service_role` (trusted DEFINER owners retain execute)
- Server-side allowlisted event types; ignore client title/body; strip freeform payload keys
- Fail-closed catalog assertions: `C9_INTERNAL_RPC_ACL_UNEXPECTED`

Post-fix ACL probe: authenticated forgery → `insufficient_privilege`, `leftover_forged=0` → `C9_HIGH_CLOSED`

## Phase D–F — Matrices
- Expanded C9 verifier forgery matrix across chair/other-chair/secretary/member/viewer/student/admin/dean/system_admin/anon
- Cross-user / cross-council ack denials with before/after fingerprint equality
- Reports/dashboards/PII/IDOR retained
- Deterministic two-connection concurrency (`councils-c9-security-concurrency.test.ts`):
  - dispatch vs membership revocation
  - acknowledge race
  - follow-up vs archive
  - completion vs archive
  - vote vs close-vote
  - minutes lock vs mutation

## Phase G–P — Production readiness package
Integrated LONGRUN-09 package (manifest, hashes, preflight, apply-one, post-verifiers, partial HOLD, rollback-by-forward, TEST_ONLY E2E/cleanup/zero-residue, observability, flags-off). C9 hash refreshed after ACL hardening. POST-VERIFIER-C9 proves INTERNAL_ONLY ACL.

## Production boundaries
- PRODUCTION_WRITES: 0
- MIGRATION_APPLIED: NO
- FLAGS_ENABLED: NO
- DEPLOY: NO
- MERGE: NO
