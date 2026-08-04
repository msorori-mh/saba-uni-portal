# PORTAL_B1_FIXTURE15_LOVABLE_MANAGED_PRODUCTION_PREFLIGHT_81

Strict read-only preflight. No SQL executed, no migration applied, no source file modified, no deploy/publish, no visibility change.

## Decision

HOLD_B1_LOVABLE_MANAGED_EXACT_SINGLE_MIGRATION_PREFLIGHT

## Identity

- Lovable project ID: 4b291119-790f-4484-9285-c2b774e1ba6f
- Connected Supabase project ref: wpmicqriltrowwonknox
- Supabase identity proved: YES — native connection reports Project ID `wpmicqriltrowwonknox`, URL `https://wpmicqriltrowwonknox.supabase.co`, Managed by Lovable = true; `supabase/config.toml` `project_id` matches.
- Source commit: 2fd16584bdcb596ee49b43bb89d5391c83dbfd66 (`fix(b1): managed-channel trigger context for Fixture-15 restore (#280)`), equals current HEAD.

## Migration artifact

- Migration path: supabase/migrations/20260803030000_b1_44_restore_sr_20260801_13000015.sql
- Migration version: 20260803030000
- Migration file found: YES
- Byte count: 31,778
- SHA-256: adf8749631feb780fc6a3cfdaa61844be26753f8741990ab3f148bd9bc7328c3
- Read only; content unchanged.

## Migration history

- Local version: 20260803030000 present (271 local migration files; it is the local head).
- Remote version: NOT PRESENT. Remote head = 20260802225131 (202 recorded rows, oldest 20260531202903).
- Partial record: NONE — no row for 20260803030000 in `supabase_migrations.schema_migrations`.
- Repair required: NOT for this version. Pre-existing benign stamp divergence noted: local `20260728015540` / `20260729014518` are recorded remotely as `...41` / `...19` (name column preserves the local filename), and local `20260802070000_b1_34_...` was applied under managed version `20260802225131`.
- Other pending migrations: none that would ride along. Local `20260802070000` has no matching remote version row, but its content is already applied as `20260802225131`, and the managed channel does not sweep the migrations folder.

## Channel capability

- Exact single-migration apply capability: UNAVAILABLE.
  The Lovable managed channel does not execute an existing repo file at its own version. It takes submitted SQL and records a new Lovable-generated version (precedent: `20260802070000` → `20260802225131`). Byte-identical content can be submitted, but "apply exactly this existing migration version, with no replacement SQL" cannot be satisfied by this channel.
- Additional blocker: identical content already failed once on this channel (mission 55) with `P0001: Not authorized to modify this request` from `protect_student_request()`. The channel's trigger/GUC context is the open technical blocker, and commit 2fd16584's fix is unverified against production.
- Would Publish be required: NO
- Would unrelated migration apply: NO
- Storage / roles / RLS / visibility outside the file: not touched by this preflight.

## Execution attestation

- Production writes: ZERO
- Migration apply: NONE
- Deploy/Publish: NONE

## Final recommendation

CHANNEL_NOT_SAFE
