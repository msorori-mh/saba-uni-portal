# GRADUATION-PROJECTS — ARCHITECTURE AND LIFECYCLE

> SOURCE-ONLY RELOCATION (2026-08-01): the `supabase/migrations/2026073010000*.sql`
> files referenced below were ported to this branch as source-only drafts
> `docs/migration-drafts/GRADUATION-PROJECTS-M1-FOUNDATION.NOT_APPLIED.sql` …
> `GRADUATION-PROJECTS-M8-PANEL-COMPLETENESS.NOT_APPLIED.sql` (see
> `docs/migration-drafts/GRADUATION-PROJECTS-MIGRATION-PACKAGE-01.md`). They are
> NOT_APPLIED and must not be placed under `supabase/migrations/` from this branch.

## 1. Architecture summary

```
UI (RTL routes per role)                     src/routes/{student,faculty-portal,admin}/…graduation…
  └─ Presentational kit                      src/components/graduation-projects/*
  └─ View-model + privacy mirror             src/lib/graduation-projects/{domain,lifecycle,portal-privacy}.ts
Server functions (createServerFn)            src/lib/graduation-projects/portal.functions.ts
  - requireSupabaseAuth + strict zod on every function
  - no client-supplied actor ids; profile→user derivation server-side
  - server-built private object keys
RPC client (transport-agnostic)              src/lib/graduation-projects/rpc.ts
  - correlation id on every write; Arabic error mapping; 42883 → "قيد التحديث"
PostgreSQL (NOT_APPLIED package M1–M8)       supabase/migrations/2026073010000{0..7}_*.sql
  - 18 tables + 1 settings table, RLS deny-by-default, zero policies, table grants revoked
  - 25+ security-definer RPCs (pinned search_path), append-only event log,
    notification fan-out with dedupe, settings-driven enforcement
Verification                                 tests/graduation-projects/*
  - 13 bun suites (155 tests) + PG17 chain: preflight → apply → verifier per
    migration + regression re-runs + 68-row authorization matrix +
    53-step E2E + 12-check catalog audit
```

Design rules that hold everywhere: direct assignment is the only authority; UI
gating is never authorization; every write is idempotent by correlation id;
every denial is a guarded literal message; nothing touches Production.

## 2. Lifecycle map

```
draft ──submit(student)──▶ submitted ──start_review(coord/head)──▶ under_review
  ▲                           │                                      │
  │                           ├─reject──▶ rejected                   ├─approve──▶ approved ──activate──▶ active
  │                           └─require_revision──▶ revision_required │                            │
  └──────────────resubmit(student)────────────────────────────────────┘                            │
                                                                                                   ▼
                      milestones (Σweights=100) + deliverables + accepted final clean file      discussion_requested
                      readiness predicate gates ─────────────────────────────────────────────▶        │
                          schedule(coord/head) ✓ / reject ✗ (back to active)                          ▼
                                                                                          discussion_scheduled
                                                                                                   │ held (panel complete: ≥1 member + chair)
                                                                                                   ▼
                                                                                              evaluating
                                                                                     every panel member finalized (M7)
                                                                                                   │
                                              ┌──corrections_required (head/dean) ◀── conclude ────┤
                                              │    │ complete(student) → accept(head/dean)         └──completed (head/dean)
                                              └───▶ evaluating (auto-return when all accepted)        │
                                                                                    archive (head/dean + clean final file)
                                                                                                   ▼
                                                                                                archived (immutable)
```

Side exits: `rejected` (proposal), `postponed`/`cancelled` (discussion, back to
active on cancel). `cancelled` project state is reserved/unreachable today.

## 3. Role / permission matrix (UI mirrors; RPC is the authority)

| Action | student | supervisor | co_supervisor | coordinator | department_head | dean | panel_member |
|---|---|---|---|---|---|---|---|
| read own projects | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| submit/resubmit proposal | ✓ | – | – | – | – | – | – |
| review proposal (4 literals) | – | – | – | ✓ | ✓ | – | – |
| add team member | – | – | – | ✓ | ✓ | – | – |
| assign faculty (4 roles) | – | – | – | ✓ | ✓ | – | – |
| set milestone | – | ✓ | – | ✓ | – | – | – |
| submit deliverable | ✓ | – | – | – | – | – | – |
| review submission | – | ✓ | – | – | – | – | – |
| supervisor notes | – | ✓ | – | – | – | – | – |
| register file | ✓ | ✓ | – | – | – | – | – |
| request discussion | ✓ | ✓ | – | – | – | – | – |
| schedule/reject discussion | – | – | – | ✓ | ✓ | – | – |
| assign panel member | – | – | – | ✓ | ✓ | – | – |
| record outcome (3 literals) | – | – | – | ✓ | ✓ | – | – |
| save/finalize evaluation | – | – | – | – | – | – | ✓ (own seat) |
| conclude result (2 literals) | – | – | – | – | ✓ | ✓ | – |
| complete correction | ✓ | – | – | – | – | – | – |
| accept correction | – | – | – | – | ✓ | ✓ | – |
| archive | – | – | – | – | ✓ | ✓ | – |
| settings/rubrics | – | – | – | read | ✓ | ✓ | – |
| department reports | – | – | – | ✓ | ✓ | ✓ | – |

No system_admin/admin/registrar role holds any graduation-projects power; UI
nav gating (`NAV_ITEM_ROLES`) is presentation-only.
