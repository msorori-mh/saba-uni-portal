# ACADEMIC-COUNCILS-LEGACY-PRODUCTION-TO-C0-C9-FORWARD-RECONCILIATION-LONGRUN-13

## Verdict

`PASS_ACADEMIC_COUNCILS_LEGACY_PRODUCTION_RECONCILIATION_PR_READY`

## Mission identity

| Field | Value |
|---|---|
| Mission | `ACADEMIC-COUNCILS-LEGACY-PRODUCTION-TO-C0-C9-FORWARD-RECONCILIATION-LONGRUN-13` |
| Base PR | #306 |
| Base SHA | `1f50e7dcc8042cf15780c7817ecefa579c49f431` |
| Branch | `fix/councils-legacy-production-reconciliation-longrun-13` |
| PR_NUMBER | #311 |
| PR_URL | https://github.com/msorori-mh/saba-uni-portal/pull/311 |
| REVIEWED_SOURCE_SHA | `1f50e7dcc8042cf15780c7817ecefa579c49f431` (PR #306 base) |
| MAIN_SHA_AT_FINALIZATION | `1b14201e5939cdbf17e7b5e5d79be7ad5b6b2149` |
| PACKAGE_SHA | `bd70fcc75ce6803c09a8f6c117ec2112645b2cd2` (functional reconciliation package) |
| WEB_CI | https://github.com/msorori-mh/saba-uni-portal/actions/runs/31283180391 — success (HEAD `50114fa2`) |
| MIGRATION_REVIEW | https://github.com/msorori-mh/saba-uni-portal/actions/runs/31283180385 — success (HEAD `50114fa2`) |

## Scope

Transform the C0-C9 package from a clean-install-oriented release into a forward-only production-safe upgrade from the **actual** legacy Academic Councils schema already present in production (`wpmicori-mh/saba-uni-portal` project `wpmicqriltrowwonknox`).

Authoritative production evidence: `docs/PORTAL-PRODUCTION-COUNCILS-B1-RECONCILIATION-EVIDENCE-LONGRUN-03.md` on main (`1b14201e5939cdbf17e7b5e5d79be7ad5b6b2149`).

This is **not** a partial patch. It closes the entire production prestate conflict by making the legacy schema a `LEGACY_SUPPORTED_EXACT` prestate, preserving all existing data, policies, functions, enums, RLS, ACL, and storage dependencies, then running the C0-C9 chain forward-only.

## Phase summary

### A — Legacy schema reconstruction

Source historical migrations (pre-2026-08-08):

- `20260703192337_3ef2f7b2-cf46-4407-9f1a-60c25b46c211.sql` — MVP create
- `20260703194033_cccf45a9-50ed-4a72-bb11-7e5d1627b5a2.sql` — MVP harden
- `20260704200326_b0736829-500e-456c-aa9b-6dc7ccd10012.sql` — faculty history / topic submit helpers
- `20260705012437_ce22d82a-51b3-4452-bde2-90f0b8d64fa8.sql` — topic attachments (without bucket)
- `20260705023313_9670638e-3742-4ace-824c-d58522b0a7cd.sql` — department councils seed
- `20260705232119_84b04a88-50be-4c5c-b9c3-11aeb54fa119.sql` — meeting schedule helpers
- `20260708120000_council_topic_attachments.sql` — attachments + bucket
- `20260709120000_department_councils_seed.sql` — department seed idempotent replay
- `20260710120000_council_meeting_schedule_helpers.sql` — schedule helpers idempotent replay

Reconstructed production-equivalent state (per authoritative evidence):

| Object class | Count |
|---|---|
| Tables (`academic_council*`) | 8 (all RLS enabled) |
| Constraints | 48 |
| Indexes | 35 |
| Triggers | 10 |
| Enums (`academic_council*`) | 5 |
| Functions (`public.%council%`) | 16 |
| Policies (public tables) | 23 |
| Policies (`storage.objects`) | 2 (`acta_storage_select`, `acta_storage_insert`) |
| Data | 4 councils (1 college + 3 department), 11 members, 2 topics |

Pre-migration ACL reproduced in replica: `authenticated` holds direct SELECT/INSERT/UPDATE (and TRUNCATE/REFERENCES/TRIGGER/MAINTAIN to mirror production `arwDxtm`) on all 8 council tables.  C0 re-scopes this to SELECT-only + RPC writes.

Canonical schema fingerprint is asserted by V2 preflight.  Production target: `3985ae87d59f5bb50b8088c8a620846fcb2203e9238d59d98db18e18210d44a9`.  Disposable replicas self-match so the fingerprint algorithm is exercised without requiring the undocumented production normalization.

### B — Structural diff matrix

| Object class | Legacy | C0-C9 final | Classification |
|---|---|---|---|
| 8 base tables | present | retained identical | IDENTICAL |
| base table columns | present | retained; C4 adds `opened_at/opened_by/closed_at/closed_by` to meetings, `session_status/resolution/resolved_at/resolved_by` to agenda_items; C5 adds `status/approved_at/approved_by/locked_at/locked_by/version/fingerprint` to minutes; C6 adds `canonical_decision_number/agenda_item_id/minutes_id/responsible_unit/completed_at/evidence_metadata` to decisions | COMPATIBLE_SUPERSET (ADD COLUMN IF NOT EXISTS) |
| authenticated table grants | direct DML (`arwDxtm`) on 8 tables | C0 revokes INSERT/UPDATE/DELETE on all 8 tables; keeps SELECT + RPC writes | REQUIRES_ALTER (no temporary bypass) |
| 5 legacy enums | exact labels | retained; C1 adds `minutes_review` to meeting_status; C6 adds `blocked` to decision_status | COMPATIBLE_SUPERSET (ADD VALUE) |
| 6 new C3-C5 enums | absent | created | new |
| base table constraints/indexes | retained | retained; new indexes on extension tables and added columns | COMPATIBLE_SUPERSET |
| `can_write_council_agenda`, `can_schedule_council_meeting`, `can_manage_council` | admin-bypass variants | CREATE OR REPLACE removes admin academic bypass | REQUIRES_ALTER (in-place replace) |
| other 12 council helpers | present | retained via `CREATE OR REPLACE` or no touch | IDENTICAL / retain |
| write policies on 7 lifecycle tables | permissive RLS | `ALTER POLICY` to `USING (false) / WITH CHECK (false)` | REQUIRES_ALTER (deny-all hardening) |
| SELECT policies | present | untouched | IDENTICAL |
| 11 extension tables | absent | created by C1/C3/C4/C5/C7/C9 | new |
| triggers | legacy lock/validation triggers retained | new lifecycle/audit/immutability triggers added | COMPATIBLE_SUPERSET |
| `council-topic-attachments` bucket | private, 10 MiB, MIME allowlist | untouched | IDENTICAL |
| storage policies | `acta_storage_select/insert` | untouched | IDENTICAL |

No `DROP TABLE`, no destructive reset, no data deletion, no enum recreation.

### C — Canonical forward strategy

**Strategy: C) hybrid — compatibility-aware C0-C9 chain + V2 preflight gate.**

No separate bridge migration is required because the existing C0-C9 migrations already use forward-only, idempotent patterns:

- `ALTER POLICY ... WITH CHECK (false)` for write hardening (no policy drop)
- `CREATE OR REPLACE FUNCTION` for helper replacement
- `ADD COLUMN IF NOT EXISTS`
- `CREATE TABLE IF NOT EXISTS`
- `ADD VALUE IF NOT EXISTS` for enum extensions
- Conditional re-scope of `academic_council_topic_attachments` ACL when present

The new V2 preflight (`docs/migration-drafts/COUNCILS-C0-C9-PRODUCTION-READONLY-PREFLIGHT-01.sql`) classifies the database state before C0 and only permits `LEGACY_SUPPORTED_EXACT` or `FULL_NEW_CHAIN` to proceed. Any variant/partial/unknown state raises `HOLD:`.

Reconciliation is incorporated into C0: C0 now revokes direct authenticated DML on all 8 council tables (including the conditional attachments re-scope) and replaces the three operational helpers to remove admin academic bypass.

### D — Data preservation

Local legacy replica seeded with production-equivalent data:

- 4 councils (1 college + 3 department)
- 11 active memberships: 4 chairs, 2 secretaries, 5 members
- 2 topics (submitted + draft)

Before/after fingerprint: `md5` aggregate over council/member/topic IDs, roles, and FK relationships.

After `legacy → C0 → C1 → C2 → C3 → C4 → C5 → C6 → C7 → C8 → C9`:

- 4 councils preserved
- 11 memberships preserved
- role semantics preserved
- 2 topics preserved
- zero orphan rows
- zero identity changes

Test: `tests/academic-councils/councils-legacy-production-to-c0-c9-reconciliation.test.ts`

### E — Enum reconciliation

Legacy enums and C0-C9 changes:

| Enum | Legacy values | C0-C9 action |
|---|---|---|
| `academic_council_type` | college, department | unchanged |
| `academic_council_member_role` | chair, vice_chair, secretary, member, viewer | unchanged; production data uses chair/secretary/member |
| `academic_council_meeting_status` | scheduled, intake_open, intake_closed, agenda_ready, in_session, minutes_draft, minutes_locked, archived, cancelled | C1 adds `minutes_review` AFTER `minutes_draft` |
| `academic_council_topic_status` | draft, submitted, under_review, needs_completion, accepted_for_agenda, deferred, rejected, decided, closed | unchanged |
| `academic_council_decision_status` | issued, assigned, in_progress, partially_completed, completed, delayed, cancelled | C6 adds `blocked` |

No enum drop/recreation. V2 preflight asserts exact legacy label inventory before C0.

### F — Function reconciliation

| Legacy function | C0-C9 disposition |
|---|---|
| `is_council_admin` | retain |
| `is_council_member` | retain |
| `has_council_role` | retain |
| `can_manage_council` | replace in-place (remove admin academic bypass) |
| `can_write_council_agenda` | replace in-place (remove admin academic bypass) |
| `can_schedule_council_meeting` | replace in-place (remove admin academic bypass) |
| `was_council_member_on` | retain |
| `can_submit_council_topic` | retain |
| attachment helpers | retain |
| trigger functions | retain |
| C0-C9 RPCs | new |

All replacements keep `SECURITY DEFINER`, `search_path = public[, pg_temp]`, and authenticated/service_role EXECUTE ACL.

### G — Policy / RLS reconciliation

- 8 base tables keep RLS enabled.
- 7 lifecycle write policies are `ALTER`ed to deny-all (`USING (false) / WITH CHECK (false)`).
- SELECT policies are untouched.
- 2 attachment policies on `public.academic_council_topic_attachments` are untouched.
- 2 storage policies on `storage.objects` are untouched.
- New SELECT policies are added only for new extension tables.

After upgrade:

- no duplicate policies
- no stale permissive write policies on lifecycle tables
- no admin/system_admin/dean academic bypass in operational helpers
- direct authenticated writes remain denied where required

### H — Storage

- Private bucket `council-topic-attachments` preserved.
- Bucket config (`public=false`, 10 MiB, MIME allowlist) untouched.
- Storage policies `acta_storage_select` and `acta_storage_insert` preserved.
- No bucket recreation; no object mutation.

### I — Production preflight V2

File: `docs/migration-drafts/COUNCILS-C0-C9-PRODUCTION-READONLY-PREFLIGHT-01.sql`

Classifications:

- `LEGACY_SUPPORTED_EXACT` → 8 tables + 5 enums + 16 functions + 23 public policies + 2 storage policies + fingerprint match; proceed to C0
- `LEGACY_VARIANT_HOLD` → legacy-like but fingerprint or inventory drift
- `PARTIAL_NEW_CHAIN` → some C0+ functions or C1+ tables exist
- `FULL_NEW_CHAIN` → promoted C0-C9 chain already recorded in ledger; nothing to do
- `UNKNOWN_UNSAFE` → HOLD

V2 adds over the previous preflight:

- state classification before detailed assertions
- canonical schema fingerprint assertion (production target pinned; disposable replicas self-match)
- exact legacy enum label inventory check
- exact 16-function allowlist (includes `tg_minutes_block_locked_edits`)
- conditional storage bucket + storage.objects policy check when attachments table is present
- verification of authenticated direct DML grants before C0 re-scope

### J — Apply-one plan

File: `docs/production-preflight/COUNCILS-C0-C9-APPLY-ONE-OPERATOR-PLAN-01.md`

Sequence:

```
PREFLIGHT V2 (LEGACY_SUPPORTED) → STOP
C0 apply → C0 post-verifier → STOP
C1 apply → C1 post-verifier → STOP
C2 apply → C2 post-verifier → STOP
C3 apply → C3 post-verifier → STOP
C4 apply → C4 post-verifier → STOP
C5 apply → C5 post-verifier → STOP
C6 apply → C6 post-verifier → STOP
C7 apply → C7 post-verifier → STOP
C8 apply → C8 post-verifier → STOP
C9 apply → C9 post-verifier → STOP
```

Reconciliation is incorporated into C0 because C0 already uses `ALTER POLICY` and `CREATE OR REPLACE FUNCTION` against the legacy policies/helpers. No separate reconciliation migration is required.

### K — PG17 legacy → C9 rehearsal

Test: `tests/academic-councils/councils-legacy-production-to-c0-c9-reconciliation.test.ts`

Path:

```
PG17 disposable container
→ minimal schema
→ all 9 legacy predecessor migrations
→ storage/departments stubs
→ legacy production-equivalent grants (authenticated direct DML on 8 tables)
→ legacy production-equivalent data seed (4 councils, 11 members, 2 topics)
→ capture before fingerprint
→ V2 preflight (LEGACY_SUPPORTED_EXACT)
→ C0 → C1 → C2 → C3 → C4 → C5 → C6 → C7 → C8 → C9
→ post-verifiers C0-C9
→ capture after fingerprint
→ preservation assertions
→ legacy behavior regression checks
→ storage bucket preserved check
→ authenticated direct DML rescoped check (no temporary bypass)
```

Result: `2 pass, 0 fail`.

### L — Legacy behavior regression

After reconciliation:

- existing councils readable by chair/member
- existing members retain correct access
- existing 2 topics visible only to authorized users
- no historical data disappears
- student/unrelated users cannot read councils/topics via direct SELECT

### M — Release package updates

Updated:

- `docs/migration-evidence/academic-councils/MIGRATION_MANIFEST.json` — LONGRUN-13 identity, preflight hash, legacy reconciliation section, C0 hash after attachments re-scope
- `docs/migration-evidence/academic-councils/HASHES.txt` — added V2 preflight hash, corrected C0/C9 hash references
- `docs/production-preflight/COUNCILS-C0-C9-APPLY-ONE-OPERATOR-PLAN-01.md` — LONGRUN-13 identity, supported prestates, corrected C0 hash
- `docs/migration-drafts/COUNCILS-C0-C9-PARTIAL-SAFE-HOLD-STATES-01.md` — added `LEGACY_SUPPORTED_EXACT` starting-state table
- `docs/migration-drafts/COUNCILS-C0-C9-PRODUCTION-READONLY-PREFLIGHT-01.sql` — V2 with state classification, fingerprint assertion, enum inventory, 16-function allowlist, authenticated-grants check
- `supabase/migrations/20260808120000_councils_c0_write_surface_hardening_01.sql` — re-scope direct authenticated DML on all 8 council tables (conditional attachments)
- `.github/workflows/ci.yml` and `.github/workflows/migration-review.yml` — run on stacked PRs targeting non-main bases

New test/fixture files:

- `tests/academic-councils/councils-legacy-production-to-c0-c9-reconciliation.test.ts`
- `tests/academic-councils/postgres-legacy-production-data-seed.sql`
- `tests/academic-councils/postgres-legacy-production-grants.sql`
- `tests/academic-councils/postgres-storage-stub.sql`
- `tests/academic-councils/postgres-departments-stub.sql`

## CI / PR status

- Stacked PR #311 targets `fix/councils-c9-security-production-readiness-longrun-01` (PR #306).
- `.github/workflows/ci.yml` and `.github/workflows/migration-review.yml` were updated to run on pull requests targeting any base branch, so Web CI now fires for stacked PRs.
- Web CI run on `50114fa2a3ecdc34ad5605706b3e1bf08874244d`: https://github.com/msorori-mh/saba-uni-portal/actions/runs/31283180391 — success.
- Migration Review run on `50114fa2a3ecdc34ad5605706b3e1bf08874244d`: https://github.com/msorori-mh/saba-uni-portal/actions/runs/31283180385 — success (no dangerous patterns).

## Local verification

| Gate | Command | Result |
|---|---|---|
| Academic councils tests | `bun test tests/academic-councils` | 52 pass, 0 fail |
| Student requests tests | `bun test tests/student-requests` | pass |
| TypeScript | `bunx tsc --noEmit` | PASS |
| Build | `bun run build` | PASS |
| Git diff check | `git diff --check` | PASS (CRLF warnings only) |
| PG17 legacy → C9 | `bun test tests/academic-councils/councils-legacy-production-to-c0-c9-reconciliation.test.ts` | PASS |
| PostgREST auth matrix | included in `bun test tests/academic-councils` | PASS (53 deny labels, zero mutation) |

## Production boundaries

- `PRODUCTION_READS: 0`
- `PRODUCTION_WRITES: 0`
- `MIGRATION_APPLIED: NO`
- `FLAGS_ENABLED: NO`
- `DEPLOY: NO`
- `MERGE: NO`

## Assumptions

1. Production schema matches the authoritative evidence: 8 tables, 48 constraints, 35 indexes, 10 triggers, 5 enums, 16 functions, 23 public policies, 2 storage policies.
2. Production data topology is equivalent to the fixture: 4 councils (1 college + 3 department), 11 active memberships, 2 topics.
3. The `supabase_migrations.schema_migrations` ledger is absent in disposable PG17 and present in production.
4. Production authenticated direct table grants match the evidence (`arwDxtm` on council tables); C0 re-scopes them to SELECT + RPC writes.
5. No production code calls the old 4-arg `council_submit_topic` or `council_review_topic` signatures; C2 replaces them.
6. Legacy decision statuses (`assigned`, `partially_completed`, `delayed`, `cancelled`) remain valid at the DB level; the new FSM only governs transitions initiated through C6 RPCs.

## Risks

1. **Policy identity drift in production.** If any legacy write policy was renamed or dropped, C0 will `RAISE EXCEPTION`. Mitigation: V2 preflight asserts exact policy inventory before any apply.
2. **Legacy enum/function drift.** If production enums or functions gained/lost labels or identities outside the source migrations, V2 preflight will HOLD.
3. **Schema fingerprint normalization mismatch.** The evidence file's fingerprint algorithm is not documented. The preflight uses a canonical catalog-based algorithm and self-matches in disposable replicas; production operators must verify the pinned fingerprint value against the actual production digest if the normalization differs.
4. **Client dependency on direct authenticated writes.** C0 revokes direct DML on all 8 council tables; applications must use RPCs. This is an intended breaking change already documented in PR #306.
5. **Mixed partial state.** If some C0-C9 objects exist without matching ledger entries, V2 classifies as `PARTIAL_NEW_CHAIN` and HOLDs.

## Obstacles

None. All phases completed against disposable PG17.

## Production impact

- Zero destructive DDL/DML in the source package.
- Existing councils, members, topics, and attachments preserved.
- Existing RLS SELECT semantics preserved.
- Operational authority narrowed to council membership roles (chair/secretary/member) with no admin/dean academic bypass.

## Decision

`PASS_ACADEMIC_COUNCILS_LEGACY_PRODUCTION_RECONCILIATION_PR_READY`

The actual production legacy Academic Councils schema is now a supported prestate for the C0-C9 forward-only chain. Data preservation is proven locally on PG17. No production writes, migration apply, deploy, or merge were performed.
