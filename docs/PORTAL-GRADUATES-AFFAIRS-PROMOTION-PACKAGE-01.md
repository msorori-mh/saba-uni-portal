# PORTAL-GRADUATES-AFFAIRS-PROMOTION-PACKAGE-01

Date: 2026-08-07  
Mission: `PORTAL-GRADUATES-AFFAIRS-OWNER-GATE-AND-RUNTIME-WIRE-01` — promotion package (`PORTAL-GRADUATES-AFFAIRS-PROMOTION-PACKAGE-01`)

Integration baseline: `feat/graduates-affairs-single-sha-integration-01` (includes P0 Foundation domain-event gap closure — Foundation SHA256 refreshed below)  
Status: **PREPARED_NOT_EXECUTED**  
Production apply: **FORBIDDEN** without a separate explicit authorization.

## Exact ordered sequence

| Step | Artifact (source draft path) | SHA256 (this workspace) |
|---|---|---|
| 1 | `docs/migration-drafts/GRADUATES-AFFAIRS-MVP-FOUNDATION-01.sql` | `45d85d4775f65d876ac74bd917e10be97cd04662477f9302a9d82e0118bec17c` |
| 2 | `docs/migration-drafts/GRADUATES-AFFAIRS-MVP-COMPLETION-01.sql` | `b3c8521bf687842e5ef185b34f930117fe24b896ecbd5dc085de4580491e281c` |
| 3 | `docs/migration-drafts/GRADUATES-AFFAIRS-AUTHORIZATION-04.sql` | `b968dab5598a783819722d34bb24e00f62adae698b8f41791a2ee2fe46dbec51` |
| 4 | Canonical `graduate_affairs` assignment seed (governed ops; not authored here) | n/a — human-owned seed of active manager/specialist assignments under unit/role codes after OWNER_D1 |

Promotion filenames in `supabase/migrations/` must be chosen by the release operator at apply time (timestamped). Do **not** invent apply filenames in this package beyond the draft sources above.

## Dependencies

- Applied unit/role seed for codes `graduate_affairs` / `graduate_affairs_manager` / `graduate_affairs_specialist` (migration `20260716172804…`) must already exist.
- `student_profiles`, `staff_profiles`, `staff_profile_departments`, `request_processing_assignments` infrastructure must exist.
- Graduation Projects / B1 controls must remain untouched.
- OWNER_D1 / OWNER_D2 / OFFICIAL_DECISION_INTAKE recorded in DECISION-PACKAGE-04.
- PR #273 authorization package present on main.

## Preflight queries (read-only)

```sql
-- Drafts not yet applied as domain tables
SELECT to_regclass('public.graduate_official_decisions') AS foundation_table;
SELECT to_regclass('public.graduate_followups') AS completion_table;
SELECT proname FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN (
    'graduate_affairs_get_graduate_file',
    'graduate_is_current_self',
    'create_graduate_record_from_official_decision'
  );

-- Canonical unit/roles present
SELECT u.code, r.code
FROM request_processing_units u
JOIN request_processing_roles r ON r.unit_id = u.id
WHERE u.code = 'graduate_affairs'
ORDER BY r.code;

-- Partial-apply detection: any GA table without expected companions
SELECT relname FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND relname LIKE 'graduate_%'
ORDER BY 1;
```

Stop if foundation tables exist without completion/auth companions (partial apply).

## Post-apply verification (after authorized promote)

1. Re-run disposable PG17 chains against applied objects (or staging clone):  
   foundation → completion → authorization verifiers.
2. Confirm `graduate_is_current_self` exists and list RPCs raise `GRADUATE_RECORD_NOT_CURRENT` for corrected/revoked.
3. Confirm no `app_role` / `has_any_role` in graduates-affairs function bodies.
4. Confirm `protected_value` / `notes_protected` absent from RPC result columns.
5. Confirm feature flags still OFF in application source until a later enablement package.
6. Assignment seed: only intended staff hold active `graduate_affairs` assignments.

## Rollback / stop conditions

- Any preflight mismatch → **STOP** (do not continue to next draft).
- Apply error mid-chain → **STOP**; treat as partial-apply; do not “fix forward” without a new governed package.
- Unexpected `graduate_%` objects not in the draft inventory → **STOP**.
- CI / staging verifier failure after apply → freeze enablement; do not flip portal flags.

## Invariant checks

- `create_graduate_record_from_official_decision` remains revoked from `PUBLIC` / `anon` / `authenticated`.
- Client AUTH-04 RPCs remain revoked from `PUBLIC` / `anon` before `authenticated` GRANT.
- RLS default-deny except the seven intentional SELECT policies.
- Aggregate reports retain `GREATEST(minimum, 3)` suppression.
- Graduate Affairs cannot approve graduation or mutate academic facts/documents.

## Explicit non-actions

- No production connection for writes from agents.
- No migration apply in this mission.
- No role seed apply in this mission.
- No deploy / publish.
