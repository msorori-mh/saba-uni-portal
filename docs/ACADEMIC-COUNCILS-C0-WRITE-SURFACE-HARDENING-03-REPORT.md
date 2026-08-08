# ACADEMIC-COUNCILS-C0-DIRECT-WRITE-SURFACE-HARDENING-03

## Verdict
**PASS_ACADEMIC_COUNCILS_C0_WRITE_SURFACE_HARDENING_PR_READY** (source + disposable PG17)

## Phase A — Inventory (pre-edit)
- Authenticated retained `SELECT, INSERT, UPDATE` on all 7 lifecycle tables; anon revoked.
- RLS write policies allowed `is_council_admin` (system_admin/admin) academic bypass on agenda/schedule/review paths.
- Boolean helpers existed; **no mutation RPCs**.
- App mutations were direct PostgREST `.insert/.update` in `admin-councils.functions.ts` / `faculty-councils.functions.ts`.
- No council edge-function writers.

## Phase B — Revoke direct mutation
Migration: `supabase/migrations/20260808120000_councils_c0_write_surface_hardening_01.sql`
- `REVOKE INSERT, UPDATE, DELETE` from `PUBLIC/anon/authenticated` on all 7 target tables.
- `GRANT SELECT` retained for authenticated + service_role.
- Write RLS policies kept and converted to explicit deny-all (`WITH CHECK (false)` / `USING (false)`); SELECT policies retained.
- No anon grants.
- Remediation-04: no policy-object removal (Migration Review compliant).

## Phase C — Minimal action RPCs
Auth via `auth.uid()` only; pinned `search_path = public, pg_temp`; action-specific params:
- membership: `council_link_membership`, `council_deactivate_membership`
- meetings: `council_schedule_meeting`, `council_update_meeting_metadata`
- topics: `council_submit_topic`, `council_update_own_topic_draft`, `council_review_topic`
- agenda: `council_add_topic_to_agenda`, `council_add_manual_agenda_item`, `council_update_agenda_item`, `council_reorder_agenda_items`, `council_finalize_meeting_agenda`
- Minutes/decisions/attendance/voting: **not** implemented (writes revoked only).

## Phase D — Topic owner fix
`council_update_own_topic_draft` allowlists `title/body/category` only for owner + `draft|needs_completion`.
Immutable: `council_id`, `meeting_id`, `status`, `review_note`, `reviewed_by`, `submitted_by`, decision metadata.

## Phase E — Admin bypass removal
- `can_write_council_agenda` / `can_schedule_council_meeting`: membership roles only (no `is_council_admin`).
- `can_manage_council` retains admin for institutional membership provisioning.
- App fallbacks no longer treat system_admin/admin as academic authority.

## Phase F — Negative matrix (disposable PG17)
Actors: system_admin, admin, dean, chair same, chair other, secretary, member, viewer, unrelated faculty, student, anonymous.
- Direct table INSERT/UPDATE denied with **zero mutation**.
- Academic RPCs denied for adminish roles without membership.
- Positive path: member submit, owner draft, secretary review/agenda, chair schedule/finalize, admin membership provision.

## Files
- `supabase/migrations/20260808120000_councils_c0_write_surface_hardening_01.sql`
- `src/lib/admin-councils.functions.ts`
- `src/lib/faculty-councils.functions.ts`
- `tests/academic-councils/*`
- this report

## Assumptions
- Institutional council **create** remains service_role/seed (no client create RPC in this C0).
- Meeting metadata RPC blocks academic advancement statuses; finalize owns `agenda_ready`.

## Risks
- Existing clients relying on direct table writes will break until they call RPCs (app rewired in this PR).
- Dean app-layer membership manager still depends on SQL `can_manage_council` (admin/chair only) — unchanged intentional gap.

## Production impact
- **PRODUCTION_WRITES: 0**
- **MIGRATION_APPLIED: NO**

## Decision
**PASS_ACADEMIC_COUNCILS_C0_WRITE_SURFACE_HARDENING_PR_READY**

| Field | Value |
|---|---|
| BRANCH | `fix/councils-c0-write-surface-hardening-01` |
| SHA | `c875dbf9264705036f3e04d0e03c5672426adc8d` |
| PR_NUMBER | 294 |
| PR_URL | https://github.com/msorori-mh/saba-uni-portal/pull/294 |
| DIRECT_WRITE_VERDICT | DENIED (authenticated/anon INSERT/UPDATE/DELETE revoked; zero mutation) |
| ADMIN_BYPASS_VERDICT | REMOVED for academic ops; provisioning retained via `can_manage_council` |
| TOPIC_OWNER_VERDICT | ALLOWLIST title/body/category only on draft/needs_completion |
| NEGATIVE_MATRIX | PASS (PG17 disposable) |
| PG17 | PASS |
| TSC | PASS |
| BUILD | PASS |
| PRODUCTION_WRITES | 0 |
| MIGRATION_APPLIED | NO |
