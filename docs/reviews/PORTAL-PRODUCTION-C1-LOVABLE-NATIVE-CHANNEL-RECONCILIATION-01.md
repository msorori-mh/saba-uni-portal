# PORTAL-PRODUCTION-C1-LOVABLE-NATIVE-CHANNEL-RECONCILIATION-01

MODE: PRODUCTION CHANNEL DISCOVERY + READ-ONLY QUALIFICATION ONLY
DATE: 2026-08-10 UTC
TARGET: wpmicqriltrowwonknox (Lovable-managed Supabase)

LOVABLE_MANAGED_SUPABASE=YES
EXTERNAL_PSQL_CHANNEL_REQUIRED=NO
PRODUCTION_WRITES=0
MIGRATION_APPLIED=NO
C2_APPLIED=NO

---

## 0. Read-only prestate re-verification (no writes)

| Check | Result |
|---|---|
| Server version | PostgreSQL 17.6 (primary, not in recovery) |
| `academic_council_meeting_status` labels | scheduled, intake_open, intake_closed, agenda_ready, in_session, minutes_draft, minutes_locked, archived, cancelled |
| `minutes_review` | **ABSENT** |
| `academic_council_meeting_transition_events` | **ABSENT** (C1 objects absent) |
| 20260808121000 | NOT_APPLIED |
| C2+ | NOT_APPLIED |

Sandbox DB principal: `sandbox_exec` — `rolsuper=f`, `rolcreaterole=f`, `rolcreatedb=f`, `rolbypassrls=t`,
`has_schema_privilege(public,CREATE)=false`, `has_database_privilege(CREATE)=false`,
`supabase_migrations` schema = **permission denied** (no ledger read, no ledger write).

---

## A — CHANNEL_INVENTORY

### CHANNEL_NAME=supabase--migration (Lovable managed migration runner)
- WHO_MANAGES_IT=Lovable (managed apply + canonical ledger)
- IMPLICIT_OUTER_TRANSACTION=YES (empirically proven: exact C1 file returned PG **55P04** `unsafe use of new value of enum type`, which can only occur when `ALTER TYPE ... ADD VALUE` and its later use share one transaction)
- MULTI_STATEMENT_TRANSACTION_BEHAVIOR=whole script executed as one implicit transaction; inner `BEGIN;` is absorbed, not a real second transaction
- CAN_PRESERVE_ENUM_COMMIT_BOUNDARY=NO
- CAN_EXECUTE_EXACT_UNEDITED_FILE=NO (fails clean at enum boundary)
- CAN_UPDATE_MIGRATION_LEDGER_CANONICALLY=YES
- PRODUCTION_WRITE_PERFORMED=NO

### CHANNEL_NAME=supabase--read_query
- WHO_MANAGES_IT=Lovable
- IMPLICIT_OUTER_TRANSACTION=YES (single read statement scope)
- MULTI_STATEMENT_TRANSACTION_BEHAVIOR=read-only; DDL not permitted
- CAN_PRESERVE_ENUM_COMMIT_BOUNDARY=NO
- CAN_EXECUTE_EXACT_UNEDITED_FILE=NO
- CAN_UPDATE_MIGRATION_LEDGER_CANONICALLY=NO
- PRODUCTION_WRITE_PERFORMED=NO

### CHANNEL_NAME=exec sandbox `psql` (PG client 17.9, Lovable-provisioned PG* env)
- WHO_MANAGES_IT=Lovable sandbox (managed, not an external/BYO channel)
- IMPLICIT_OUTER_TRANSACTION=NO (autocommit; one implicit transaction **per statement** — this is the only channel whose transaction model would honour the authored enum commit boundary)
- MULTI_STATEMENT_TRANSACTION_BEHAVIOR=statement-by-statement autocommit; explicit `BEGIN;` blocks honoured
- CAN_PRESERVE_ENUM_COMMIT_BOUNDARY=YES (model) — but **role cannot execute DDL**: no CREATE on schema/database, `sandbox_exec` is SELECT/INSERT-scoped
- CAN_EXECUTE_EXACT_UNEDITED_FILE=NO (permission denied at first DDL statement; would produce a partially-attempted, ledger-less state)
- CAN_UPDATE_MIGRATION_LEDGER_CANONICALLY=NO (`supabase_migrations` permission denied)
- PRODUCTION_WRITE_PERFORMED=NO

### CHANNEL_NAME=supabase--insert
- WHO_MANAGES_IT=Lovable
- IMPLICIT_OUTER_TRANSACTION=YES
- MULTI_STATEMENT_TRANSACTION_BEHAVIOR=data rows only, no DDL
- CAN_PRESERVE_ENUM_COMMIT_BOUNDARY=NO / CAN_EXECUTE_EXACT_UNEDITED_FILE=NO / LEDGER=NO
- PRODUCTION_WRITE_PERFORMED=NO

### CHANNEL_NAME=server functions / RPC surface (createServerFn, `/api/*`)
- WHO_MANAGES_IT=Project source (Cloudflare Worker runtime)
- IMPLICIT_OUTER_TRANSACTION=UNKNOWN (PostgREST RPC = one transaction per call)
- CAN_PRESERVE_ENUM_COMMIT_BOUNDARY=NO (single-transaction per RPC) / EXACT FILE=NO / LEDGER=NO
- Also forbidden by this mission (no RPC business call, no source edit)
- PRODUCTION_WRITE_PERFORMED=NO

### Absent channels (searched, not available)
- No raw multi-statement autocommit SQL action.
- No sequential SQL statement runner.
- No `db push` / "apply all pending migrations" action.
- No Supabase CLI, no Dashboard SQL editor, no direct superuser/owner psql channel.
- No Lovable internal migration executor other than `supabase--migration`.

---

## B — UNSAFE CHANNEL REJECTION

| Channel | Rejection reason |
|---|---|
| supabase--migration | wraps entire C1 file in one implicit transaction → destroys enum commit boundary (55P04) |
| supabase--read_query | read-only, no DDL, no ledger |
| exec psql (`sandbox_exec`) | correct transaction model but no DDL privilege and cannot prove/maintain ledger consistency |
| supabase--insert | data-only |
| server fn / RPC | single-transaction, no ledger, out of mission scope |

UNSAFE_CHANNEL_COUNT=5
SAFE_C1_CHANNEL_COUNT=0

---

## C — LOVABLE NATIVE MIGRATION SEMANTICS

LOVABLE_NATIVE_MIGRATION_RUNNER_AVAILABLE=YES (`supabase--migration`)
LOVABLE_NATIVE_MIGRATION_TRANSACTION_MODEL=WHOLE_FILE_SINGLE_IMPLICIT_TRANSACTION (not autocommit-aware; embedded `BEGIN;`/`COMMIT;` are absorbed into the outer transaction)
LOVABLE_NATIVE_LEDGER_HANDLING=CANONICAL_AUTOMATIC — the runner records one ledger version per successful apply (`supabase_migrations.schema_migrations`), assigning its own apply-time version; a failed apply is FAILED_CLEAN with no ledger row. No other channel can write the ledger.

Evidence basis: the observed 55P04 on the exact unmodified file (only reachable inside a shared transaction) plus the absence of any autocommit/multi-statement execution action. Metadata-only; no C1 execution performed.

---

## D — EXACT SOURCE REQUIREMENT

`supabase/migrations/20260808121000_councils_c1_meeting_state_machine_01.sql` is unchanged on disk (no edit, no split, no temporary patch performed in this mission).

The file requires `ALTER TYPE ... ADD VALUE 'minutes_review'` to **commit** before the subsequent `BEGIN;` block that references the label.

EXACT_SOURCE_CAN_BE_PRESERVED=YES (as a file) — but **no available Lovable-native channel can execute it unedited while honouring that commit boundary**.

---

## E — DECISION

**HOLD_NO_LOVABLE_CHANNEL_CAN_PRESERVE_C1_ENUM_BOUNDARY**

The only channel with the correct autocommit transaction model (sandbox `psql`) lacks DDL and ledger privileges; the only channel with DDL and canonical ledger authority (`supabase--migration`) is whole-file transactional.

### Non-executed options for a future, separately authorized mission
1. Owner authorizes a **two-part forward-only split** (enum-only migration, then the remaining C1 body unchanged) — currently forbidden by the exact-source rule; needs an explicit new owner token.
2. Owner authorizes Lovable platform-side enablement of an autocommit/multi-statement production execution action, then re-run this reconciliation.

No C1 apply, no schema write, no ledger write, no RPC business call, no C2, no repair, no source edit, no deploy/publish/merge occurred.

CRITICAL_COUNT=1 (no safe channel for the approved exact C1 source)
HIGH_COUNT=1 (migration runner transaction model incompatible with enum boundary)
MEDIUM_COUNT=1 (sandbox psql cannot read/write the migration ledger — no independent ledger verification path)
