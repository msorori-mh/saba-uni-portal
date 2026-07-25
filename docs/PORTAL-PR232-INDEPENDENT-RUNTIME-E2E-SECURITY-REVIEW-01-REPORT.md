# PORTAL-PR232-INDEPENDENT-RUNTIME-E2E-SECURITY-REVIEW-01

## Decision

**PASS_PR232_INDEPENDENT_RUNTIME_E2E_REVIEW**

Independent security review of PR #232 at binding HEAD `9fba8b5b78bf9936a483aec690c27100261ed522` against base `b9d6acca7a36c1ca19365179740095cbedf0cd1e`, plus one forward-only control-plane fix on review branch `review/pr232-runtime-e2e-codex-01`.

No Production/Staging apply, Deploy/Publish, merge, activation, or `student_visible` mutation.

## Baseline verification

| Check | Result |
|---|---|
| PR #232 state | OPEN |
| HEAD | `9fba8b5b78bf9936a483aec690c27100261ed522` (exact) |
| Base | `b9d6acca7a36c1ca19365179740095cbedf0cd1e` (exact) |
| Review branch | `review/pr232-runtime-e2e-codex-01` (from HEAD; Cursor branch untouched) |
| PR mergeability at review start | MERGEABLE / CLEAN |

## Final sequence (verified on disk)

| # | Item | Evidence |
|---|---|---|
| **21** | Secure Read Contracts | manifest + PROMOTION-MAP + `20260725130000_b1_21_secure_read_contracts_01.sql` + apply-order line 21 |
| **22** | Secure Draft Mutations | manifest + PROMOTION-MAP + `20260725140000_b1_22_secure_draft_mutations_01.sql` + apply-order line 22 |
| **23** | Transfer Department Scope Position Assignment | manifest + PROMOTION-MAP + `20260725150000_b1_23_transfer_...sql` + apply-order line 23 |
| **24** | File Withdrawal Impact Acknowledgment NULL Guard | manifest + PROMOTION-MAP + `20260725160000_b1_24_file_withdrawal_...sql` + apply-order line 24 |
| **25** | Activation Gate — local only | `global_policies.activation_gate` + harness `35-activate-workflows-local-only.sql` (non-migration) |

Integrity:

- Contiguous `sequence_order` **1..24**; no duplicates/missing.
- PROMOTION-MAP orders **7..24**; SHA-256 LF pins for **21–24** match draft + promoted migration bytes.
- Apply-order blob pins for **21–24** match `git hash-object`.
- Activation gate is **25** (not 23/24). Post-manifest F1/F2 hardening remains apply-order `90`.

## Finding fixed on review branch (MEDIUM)

### Stale activation-gate text in sequential manifest

**Severity:** MEDIUM (control-plane / premature-activation risk)  
**Location:** `docs/b1/B1-SEQUENTIAL-APPLY-MANIFEST.json` (older `activation_dependency` entries)

**Issue:** Global policy correctly required gate **25**, but older entries still said activation gate **19** / **21**. An operator following per-entry text could activate before seq **23–24** remediations.

**Fix (forward-only, docs/control-plane):** Normalized every stale `activation_dependency` to require sequence_order **20–24** and **activation gate 25**. Added regression assert in `tests/student-requests/b1-integrated-runtime-e2e-01.test.ts` forbidding `activation gate 18/19/20–24` and `B1 gate 18/19` in migration dependency text.

**Not a runtime SQL bypass** once 21–24 are applied; risk was mis-ordered human activation.

### Apply-order gap (reported by subagent) — invalid at HEAD

`tests/b1-rpc-matrix/pg/20-draft-apply-order.txt` already lists seq **21–24** with correct blob pins. No code change required.

## Security focus results (runtime)

| Area | Result | Notes |
|---|---|---|
| Transfer `position_assignment` scope | **PASS** | Seq 23: `assigned_position_assignment_id` + active non-expired `position_assignments` + scoped `request_processing_assignments`; exact unit/role; source/target dept match; null direct user/staff/faculty slots; `count(*)=1`; no faculty_profiles; anon EXECUTE revoked. Layered under existing `can_current_user_act_on_step` (no admin/registrar/dean bypass). |
| Withdrawal ack NULL guard | **PASS** | Seq 24: `impact_acknowledgment` / `terms_acknowledgment` use `IS DISTINCT FROM 'true'::jsonb` (NULL/false/missing deny). Integrated case `file_withdrawal/submit_without_ack` → `B1_WITHDRAWAL_INPUT_INVALID`; request remains draft. |
| Secure Draft | **PASS** | Required `p_expected_updated_at`; null/stale → `B1_STALE_REQUEST_VERSION`; idempotent retry; concurrent create → one draft; capability derived (no hardcoded `runtimeAvailable`); opaque draft deny; PG harness **35/35**. |
| Secure Read | **PASS** | Active student profile required; staff via authoritative action guard; attachment DTOs use opaque `storage_ref` (no bucket/path/object_key); PG harness PASS. |
| Runtime lifecycle 5/5 | **PASS** | Integrated: `services_completed=5`, `fail_rows=0`; payment via specialized RPC + note only; general `confirm_payment` denied; role-per-stage; `action_denials=7`, `zero_mutation=13`. |
| Attachments | **PASS** | Authorize-before-sign asserted; no public URL helpers; owner meta omits path. |
| enrollment_certificate / visibility | **PASS** | Regression suite PASS; no prod `student_visible` write in migrations; activation only in local harness; five services remain hidden outside local activation. |

## PostgreSQL 17 disposable reverify (this review)

| Harness | Result |
|---|---|
| Secure Read | `B1_SECURE_READ_PG17_PASS` |
| Secure Draft | `B1_SECURE_DRAFT_PG17_PASS` (**35 rows**) |
| Integrated Runtime E2E | `B1_INTEGRATED_RUNTIME_E2E_PASS` (**5/5**, `fail_rows=0`) |
| Containers | removed (`docker run --rm` + stop in harness `finally`) |

Integrated counters:

`services_completed=5 action_allows=24 action_denials=7 attachment_assertions=4 concurrency=1 draft_creates=5 draft_saves=6 idempotency=3 read_allows=18 read_denials=4 zero_mutation=13 fail_rows=0`

## Bun / toolchain

| Check | Result |
|---|---|
| `bun test tests/student-requests` | **652 pass / 0 fail** |
| `bun test tests/b1-rpc-matrix` | **22 pass / 0 fail** |
| `bun test tests` | **1589 pass** on re-run (one unrelated Arabic PDF Worker spike flake on first full run; re-ran green; out of PR #232 scope) |
| `bunx tsc --noEmit` | PASS |
| eslint on modified TS | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS |

## Production / Deploy confirmation

- No cloud migration apply.
- No Staging/Production data.
- No Deploy/Publish.
- No merge of PR #232 or this review PR.
- No activation outside disposable local harness.
- `student_visible` unchanged in real environments.

## Stacked review PR

- Branch: `review/pr232-runtime-e2e-codex-01`
- Base: `test/b1-five-services-integrated-runtime-e2e-01`
- Contents: manifest activation-gate normalization + regression test + this report.

## Assumptions

- Operators apply promoted migrations via the sequential manifest / apply-order, not ad-hoc subsets.
- Historical reports under older tracks may still mention pre-renumber gate numbers; live control plane is the sequential manifest + PROMOTION-MAP + apply-order.

## Risks

- Residual: human activation before applying 21–24 if someone ignores updated dependency text and global policy (mitigated by this review’s normalization + test).
- Remote CI may still show no job steps (`HOLD_REMOTE_CI_BILLING_NO_JOB_STEPS`); local PG17 + bun remain authoritative for this decision.

## Decision token

**PASS_PR232_INDEPENDENT_RUNTIME_E2E_REVIEW**
