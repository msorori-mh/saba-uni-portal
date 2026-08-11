# PORTAL-GP-ADMIN-READONLY-VIEWER-PRODUCTION-HOTFIX-01

## Decision

`PASS_PORTAL_GP_ADMIN_READONLY_VIEWER_PRODUCTION_HOTFIX_01_SOURCE_READY`

- `PRODUCTION_WRITE=0`
- `MIGRATION_APPLY=0`
- `DEPLOY=NO`
- `MAIN_MERGE=NO`

---

## G0 base

| Field | Value |
|---|---|
| Branch | `fix/gp-admin-readonly-viewer-hotfix-01` |
| `START_SHA` | `1b00c26446a32964f8a532ab3cb38877fa82bf65` |
| `MAIN_SHA` | `1b00c26446a32964f8a532ab3cb38877fa82bf65` |
| Worktree | clean at mission start relative to `origin/main`; HEAD == `origin/main` before hotfix commits |

---

## ROOT_CAUSE

`ROOT_CAUSE_CONFIRMED=YES`

`CURRENT_PRODUCTION_BEHAVIOR=`

Admin route `/admin/graduation-projects` → `useGraduationProjectAdministrationReport` → `listAdministrationOverview` → RPC `list_administration_graduation_projects_overview()` → authorization requires an **active row in `graduation_project_department_coordinators`** → raises:

`administration graduation-project viewer capability required`

Product/UI already treats this route as a **read-only administration overview** (`NAV_ITEM_ROLES` + `administration-read-only`), but the production function incorrectly used the coordinator gate as the “viewer capability”.

Exact current condition (production history migration `20260807001114_c22e6009-1472-43ef-9443-b002872bbba5.sql`):

```sql
if not exists (
  select 1 from public.graduation_project_department_coordinators c
  where c.user_id = auth.uid() and c.active and c.ended_at is null
) then raise exception 'administration graduation-project viewer capability required'; end if;
```

---

## VIEWER_CONTRACT

`ADMINISTRATION VIEWER = READ-ONLY OVERVIEW ONLY`

`ADMIN_VIEWER_ROLES=[system_admin, admin, dean, registrar]`

Source of truth: `src/lib/admin-nav.ts` → `NAV_ITEM_ROLES["/admin/graduation-projects"]`.

Dean/registrar are included because that route access policy already authorizes them for this read-only page. Department head / student_affairs / faculty / students are **not** included.

Union retained:

- approved administration viewers (`has_any_role` with the roles above) → college-wide narrow overview
- active department coordinators → department-scoped overview (original legitimate access)

Administration viewer MUST NOT gain:

- review proposal / assign supervisor / schedule defense / assign committee / conclude / archive
- team mutation / file scan authority / coordinator assignment creation

`ADMIN_OVERVIEW_PII_EXPANSION=NO`

Returned fields only:

`project_id`, `department_id`, `title`, `lifecycle_state`, `final_decision`, `archived_at`

---

## MIGRATION

| Field | Value |
|---|---|
| `MIGRATION_FILENAME` | `supabase/migrations/20260811041600_de9e9a8e-741e-4415-9741-fd8a2e53d22d.sql` |
| `MIGRATION_SHA256` | `7085df5b754103526287f510bf12983b916a6d15b446b68c77675cee68df769d` |
| Historical migration | **not edited**: `20260807001114_c22e6009-1472-43ef-9443-b002872bbba5.sql` |

Contract of the replace:

1. `auth.uid()` required
2. explicit administration-viewer auth via `public.has_any_role(...)`
3. read-only
4. no mutation
5. no coordinator role creation / user role mutation
6. no change to `require_graduation_project_assignment` or operational RPCs
7. `SECURITY DEFINER` + fixed `search_path`
8. `revoke` PUBLIC/anon; `grant execute` to `authenticated`

---

## PRECHECK_SQL

```sql
-- Prove current production function is still coordinator-gated before apply.
select pg_get_functiondef(
  'public.list_administration_graduation_projects_overview()'::regprocedure
);
```

`EXPECTED_PRESTATE=`

- function body contains `graduation_project_department_coordinators`
- function body does **not** contain `has_any_role`
- denial message remains `administration graduation-project viewer capability required`

Optional live probe (safe read-only exception path; no writes):

```sql
-- As an admin/system_admin session WITHOUT GP coordinator assignment:
select public.list_administration_graduation_projects_overview();
-- expect: ERROR ... administration graduation-project viewer capability required
```

---

## APPLY

Forward-only apply of:

`20260811041600_de9e9a8e-741e-4415-9741-fd8a2e53d22d.sql`

**Not performed in this mission.** Operator apply is out of band.

---

## POSTCHECK_SQL

```sql
select pg_get_functiondef(
  'public.list_administration_graduation_projects_overview()'::regprocedure
);

-- grants
select has_function_privilege('anon', 'public.list_administration_graduation_projects_overview()', 'execute') as anon_exec;
select has_function_privilege('authenticated', 'public.list_administration_graduation_projects_overview()', 'execute') as auth_exec;
```

`EXPECTED_POSTSTATE=`

- body contains `has_any_role`
- body contains roles `system_admin`, `admin`, `dean`, `registrar`
- body still allows active department coordinators
- `anon_exec = false`, `auth_exec = true`
- operational RPC definitions unchanged (`require_graduation_project_assignment` still fails closed)

---

## NEGATIVE_MUTATION_MATRIX

| Probe | Result |
|---|---|
| `ADMIN_VIEWER_CAN_REVIEW_PROPOSAL` | `NO` |
| `ADMIN_VIEWER_CAN_ASSIGN_SUPERVISOR` | `NO` |
| `ADMIN_VIEWER_CAN_SCHEDULE_DEFENSE` | `NO` |
| `ADMIN_VIEWER_CAN_ASSIGN_COMMITTEE` | `NO` |
| `ADMIN_VIEWER_CAN_CONCLUDE_RESULT` | `NO` |
| `ADMIN_VIEWER_CAN_ARCHIVE` | `NO` |
| `DIRECT_ASSIGNMENT_GUARDS` | `UNCHANGED` |
| `DEPARTMENT_SCOPE` | `UNCHANGED` (coordinator overview remains dept-scoped; admin viewer is college-wide read-only) |
| `L4_GUARD` | `UNCHANGED` (not touched) |
| `SIGNED_DOWNLOAD_GUARD` | `UNCHANGED` (not touched) |
| `EVALUATION_ROUND_GUARD` | `UNCHANGED` (not touched) |

Denied mutation RPCs raise `exact direct processing assignment required` (zero mutation).

---

## UI_ERROR_MAPPING

| Condition | User-facing |
|---|---|
| authorized viewer | report loads |
| unauthorized / viewer capability required | `عفواً، لا تملك الصلاحية الكافية لاستعراض النشرة الإدارية لمشاريع التخرج.` |
| RPC unavailable (`42883` / missing function) | `خدمة مشاريع التخرج قيد التجهيز حالياً. حاول مرة أخرى لاحقاً.` |
| unexpected English infrastructure error | generic operational Arabic failure (no raw SQL) |
| raw string `administration graduation-project viewer capability required` | never rendered |

Files:

- `src/lib/graduation-projects/errors.ts`
- `src/routes/-graduation-projects-adapter.ts`
- route remains `administration-read-only` + `readOnly` + retry via `query.refetch`

---

## PG17_BEFORE / PG17_AFTER

Disposable Docker `postgres:17` harness:

`tests/graduation-projects/gp-admin-readonly-viewer-hotfix.test.ts`

| Stage | Result |
|---|---|
| `PG17_BEFORE` | admin role **without** coordinator → exact denial reproduced (`PG17_BEFORE_ADMIN_VIEWER_DENIED`) |
| Apply hotfix migration | PASS |
| `PG17_AFTER` | admin/system_admin/dean overview PASS; coordinator overview PASS; student/faculty/supervisor/committee/anonymous DENY; mutation RPCs DENY; `ADMIN_OVERVIEW_PII_EXPANSION=NO`; `DIRECT_ASSIGNMENT_GUARDS=UNCHANGED` |

---

## Local gates

| Gate | Result |
|---|---|
| `GP_TESTS` | `PASS` — `bun test tests/graduation-projects` → **131 pass / 0 fail** |
| `STUDENT_REQUESTS` | **1065 pass / 1 fail** — pre-existing `tanstack-register-stable-augmentation-01` routeTree semantic hash pin drift (`Expected 09be61de…` / `Received 745ca582…`). Unrelated to this hotfix; reproduced on restored `routeTree.gen.ts` without our changes. |
| `TYPECHECK` | `PASS` — `bunx tsc --noEmit` |
| `BUILD` | `PASS` — `bun run build` |
| `DIFF_CHECK` | `PASS` — `git diff --check` |

---

## Files changed (source)

- `supabase/migrations/20260811041600_de9e9a8e-741e-4415-9741-fd8a2e53d22d.sql`
- `src/lib/graduation-projects/errors.ts`
- `src/routes/-graduation-projects-adapter.ts`
- `tests/graduation-projects/graduation-projects-package-d-contracts.test.ts`
- `tests/graduation-projects/gp-admin-readonly-viewer-hotfix.test.ts`
- `tests/graduation-projects/gp-admin-readonly-viewer-ui.test.ts`
- `tests/graduation-projects/postgres-admin-readonly-viewer-hotfix-verifier.sql`
- `docs/reviews/PORTAL-GP-ADMIN-READONLY-VIEWER-PRODUCTION-HOTFIX-01.md`

---

## Assumptions / risks / blockers

- Assumes production still has the coordinator-only overview body (precheck must prove this before apply).
- Assumes `public.has_any_role` remains the canonical portal authz helper (already used widely).
- Dean/registrar overview access follows existing admin-nav contract; not inferred beyond that.
- Student-requests hash pin failure is environmental/pre-existing and is not a GP authorization regression.

## Production impact

After operator apply (outside this mission): approved admin-portal viewers can load `/admin/graduation-projects` read-only overview without becoming GP coordinators. Operational GP mutations remain fail-closed on direct assignment.
