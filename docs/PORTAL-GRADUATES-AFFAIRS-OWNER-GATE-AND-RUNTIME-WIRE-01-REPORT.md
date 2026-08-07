# PORTAL-GRADUATES-AFFAIRS-OWNER-GATE-AND-RUNTIME-WIRE-01-REPORT

Date: 2026-08-07  
Repository: `msorori-mh/saba-uni-portal`  
Branch (original wiring): `feat/graduates-affairs-owner-gate-runtime-wire-01`  
Integrated into: `feat/graduates-affairs-single-sha-integration-01` (with Alumni P0 reconciliation)

## Final decision

**PASS_PORTAL_GRADUATES_AFFAIRS_OWNER_GATE_MERGE_AND_RUNTIME_WIRE_READY_FOR_PROMOTION_PREFLIGHT**

---

### OWNER_D1

Canonical unit `graduate_affairs`; roles `graduate_affairs_manager` / `graduate_affairs_specialist`; requires functional role + unit + explicit scope/direct assignment; `student_affairs` appRoleFallback never grants; no admin/dean/registrar bypass. Recorded in DECISION-PACKAGE-04 owner section.

### OWNER_D2

Same auth identity after graduation; separate authentication / student / graduate capabilities; university email not permanent recovery; continuity policy surface remains fail-closed until approved rows exist.

### OFFICIAL_DECISION_INTAKE

Registrar/academic authority owns intake/approval/correction/revocation. Graduate Affairs consumes approved fact only; cannot approve graduation or mutate grades/GPA/snapshot/documents.

---

### PR273_INITIAL_STATE

OPEN draft, MERGEABLE, CI SUCCESS on head.

### PR273_HEAD

`eddad8d2c510b955f92f9f6fa08adeb31e0aef66` (exact match; no SHA drift)

### PR273_REVIEW_VERDICT

PASS — targeted D-1/D-2/intake re-review; REMEDIATION-06 intact; 113 GA tests + tsc + build PASS before merge.

### PR273_MERGE_VERDICT

MERGED (merge commit). Marked ready for review then merged.

### POST_MERGE_MAIN_SHA

`4a6e16b9fa66d6738a17b1399c553144b13a5101`  
Pre-merge main: `4b27ab47093c5736dc962ef72cac97c7b4c7e738`

Authorization package verified present on main after merge.

---

### RUNTIME_ADAPTERS

- `src/lib/graduates-affairs/runtime-gate.ts`
- `src/lib/graduates-affairs/rpc.ts` (AUTH-04 only)
- `src/lib/graduates-affairs/graduates-affairs.functions.ts` (`createServerFn` + `requireSupabaseAuth`)

### GRADUATE_ROUTES

- `src/routes/student.graduates-affairs.index.tsx` → `/student/graduates-affairs/`
- Nav card gated in `src/routes/student.index.tsx`

### STAFF_ROUTES

- `src/routes/staff.graduates-affairs.tsx` → `/staff/graduates-affairs`
- Nav card gated in `src/routes/staff.index.tsx`

### FEATURE_FLAG

`portalFeatures.studentGraduatesAffairs = false`  
`portalFeatures.staffGraduatesAffairs = false`  
Flag OFF: no nav, frozen page body, mutations blocked in adapters. Flag does not weaken SQL AUTH-04.

### AUTH04_ONLY_RUNTIME_PATH

`GraduatesAffairsRpcClient` rejects non-allowlisted RPC names; adapters call the client only.

### DIRECT_TABLE_MUTATION_PATHS

None. `assertNoDirectGraduateTableMutation` / `graduatesAffairsDirectTableWriteAttempt` fail closed; adapters contain no `.from('graduate_…')` writes.

---

### TEST_RESULTS

| Check | Result |
|---|---|
| Targeted AUTH-04 bun tests (G1) | PASS (69) |
| `bun test tests/graduates-affairs` | **135 pass / 0 fail** (incl. 22 runtime-wire) |
| `bunx tsc --noEmit` | PASS |
| `bun run build` | PASS (routeTree includes `/student/graduates-affairs/` + `/staff/graduates-affairs`) |
| `git diff --check` | PASS |

---

### PROMOTION_PACKAGE

PREPARED_NOT_EXECUTED — `docs/PORTAL-GRADUATES-AFFAIRS-PROMOTION-PACKAGE-01.md`

### OPERATIONAL_E2E

PREPARED_NOT_EXECUTED — `docs/PORTAL-GRADUATES-AFFAIRS-OPERATIONAL-E2E-PACKAGE-01.md`

### PRODUCTION_RPC_CALLS

0

### PRODUCTION_WRITES

0

### MIGRATION_APPLIED

NO

### ROLE_SEED_APPLIED

NO

### DEPLOY

NO

### PUBLISH

NO

### NEXT_STEP

`PORTAL-GRADUATES-AFFAIRS-PRODUCTION-PROMOTION-READONLY-PREFLIGHT-01`
