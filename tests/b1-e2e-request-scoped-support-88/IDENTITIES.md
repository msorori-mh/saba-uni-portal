# B1 E2E 88 — TEST_ONLY identity notes (source mission; no Auth user creation)

This source package does **not** create Auth users, reset passwords, or invent real-person staff accounts.

## Reusable Auth shells (lookup by user_id/email in a later provisioning mission)

Existing `@testonly.quboolye.com` / TEST_ONLY shells documented in plan 87:

| Role shape | Shell hint | Source-mission status |
|---|---|---|
| Student owner | `student` / `e2e02` / `test-only.b1.e2e03@usr.edu.ye` | Reusable for create-path |
| SA specialist | `sa_spec` | Shell only (no staff_profile/role yet) |
| SA manager | `sa_mgr` | Shell only |
| Registrar | `registrar` | Shell only |
| Library / labs / finance / archive / dean | matching shells | Shell only |
| Dept head source / target | `dh_src` / `dh_tgt` | Shell only |
| Same-role unbound negative | `unassigned` | Reusable negative |

Preflight of any future provisioning mission **must fail** if required shells are absent.

## Unresolved negative identities (owner decision required)

1. **faculty-only TEST_ONLY** — no existing TEST_ONLY Auth shell with a `faculty_profiles` row. Cannot prove faculty-negative denial until a dedicated shell (or explicit reuse decision) exists.
2. **admin-role TEST_ONLY** — `unrelated.admin.test.01d@quboolye.test` holds `hr_officer`, **not** admin. It is not a valid admin-negative actor. Need a true admin-role TEST_ONLY identity or an owner decision to reuse a non-production admin shell.

Password creation/reset is outside this source mission.
