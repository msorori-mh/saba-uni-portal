# PORTAL-B1-CONFIRM-PAYMENT-PREDECESSOR-GUARD-01 — Report

**Track:** `PORTAL-B1-CONFIRM-PAYMENT-PREDECESSOR-GUARD-01`
**Branch:** `fix/b1-confirm-payment-predecessor-guard-01`
**Base:** `origin/main` @ `b63725e02d4199b46dee604be8f8c03f72c5d414` (PR #219 merge)
**PR:** https://github.com/msorori-mh/saba-uni-portal/pull/220
**HEAD:** `daf8047418cb65cd43d3ec09a150ee3260d36f13`
**Decision:** `PASS_PR220_MINIMAL_MANIFEST_DIFF_AND_FINAL_EVIDENCE_READY_FOR_MERGE`

## Root cause

`public.record_external_university_payment_confirmation(uuid,text)` authorized the exact finance assignee and binding, then mutated the payment step **without** checking incomplete prior runtime steps (`prior.step_order < current.step_order` and status not in `completed`/`skipped`).

The general RPC `act_on_b1_student_request_step_atomic` already raised `B1_PREDECESSOR_INCOMPLETE` for that case; the specialized payment RPC did not.

## Codex failing cell (pre-fix)

| Field | Value |
|---|---|
| Service | `final_chance` |
| Step | `payment_confirmation` |
| Case | `incomplete_predecessor` |
| Expected | DENY |
| Actual | ALLOW |
| Error | `B1_NEGATIVE_ALLOWED:final_chance:payment_confirmation:incomplete_predecessor` |
| Security hold | `HOLD_B1_FIVE_SERVICES_AUTHORIZATION_CONFIRM_PAYMENT_PREDECESSOR_BYPASS` |

Local PG17 reproduction (unguarded baseline) printed:

`BYPASS_REPRODUCED:final_chance:payment_confirmation:incomplete_predecessor:ALLOW`

## Old vs corrected function

- **Old:** historical / EXTERNAL payment confirmation body — assignee + finance binding → transition → UPDATE/INSERT. No predecessor scan.
- **Corrected:** same signature, success shape, grants, and simplified revenue contract; after assignee + `EXACT_FINANCE_PROCESSING_BINDING_REQUIRED`, before transition resolution / any UPDATE/INSERT:

```sql
IF EXISTS (
  SELECT 1
  FROM public.student_request_workflow_steps prior
  WHERE prior.student_request_id = v_step.student_request_id
    AND prior.step_order < v_step.step_order
    AND prior.status NOT IN ('completed','skipped')
) THEN
  RAISE EXCEPTION 'B1_PREDECESSOR_INCOMPLETE';
END IF;
```

Historical migration `supabase/migrations/20260725002135_13c05466-74a5-4a03-8c7d-8617be9e5353.sql` was **not** modified.

## Authorization check order (preserved)

1. Auth / note length / lock step
2. Service + active `payment_confirmation` + finance/revenue binding surface
3. `confirm_payment` action type
4. Exactly one direct assignee + actor match
5. Exact finance processing binding
6. **Predecessor guard** (`B1_PREDECESSOR_INCOMPLETE`) — authorized actor only
7. Transition resolution → UPDATE steps → INSERT events

Non-assignee → `DIRECT_PAYMENT_ASSIGNEE_REQUIRED`. Wrong binding → `EXACT_FINANCE_PROCESSING_BINDING_REQUIRED`. Incomplete predecessor is never leaked before authorization.

## Numbering namespaces (not the same counter)

| Namespace | Value | Meaning |
|---|---|---|
| Promotion-map / verifier file order | **19** | `19-B1_CONFIRM_PAYMENT_…` companions; PROMOTION-MAP `order: 19`; node suffix `-19` |
| Manifest `sequence_order` | **20** | Apply-set total order after ACL cutover (`sequence_order` 19) |
| Activation gate | **21** | Separate reviewed step **after** the guard; **not** a manifest migration entry |

## Artifacts

| Kind | Path |
|---|---|
| Draft | `docs/migration-drafts/B1-CONFIRM-PAYMENT-PREDECESSOR-GUARD-01.sql` |
| Promoted migration | `supabase/migrations/20260725120000_b1_confirm_payment_predecessor_guard_01.sql` |
| Preflight | `docs/migration-drafts/b1-backend-verifiers/19-B1_CONFIRM_PAYMENT_PREDECESSOR_GUARD_01-PREFLIGHT.sql` |
| Post-verifier | `docs/migration-drafts/b1-backend-verifiers/19-B1_CONFIRM_PAYMENT_PREDECESSOR_GUARD_01-POST-VERIFIER.sql` |
| PG17 harness | `scripts/b1-confirm-payment-predecessor-guard-pg17/` |
| Contract freeze | `docs/B1-FIVE-SERVICES-BACKEND-CONTRACT-FREEZE-01.md` (+ `B1_PREDECESSOR_INCOMPLETE`) |
| Manifest | `docs/b1/B1-SEQUENTIAL-APPLY-MANIFEST.json` — surgical patch from `origin/main` formatting |

**LF SHAs:** draft `98bcf77c…835` / migration `e4a9f7f3…335` (PROMOTION-MAP order 19).

## Manifest minimal-diff remediation (PR220)

Full `ConvertTo-Json` rewrite was rejected (2257/2052). Restored literal `origin/main` bytes, then applied semantic-only text patches (no serializer).

`git diff --numstat origin/main -- docs/b1/B1-SEQUENTIAL-APPLY-MANIFEST.json` → **95 additions / 6 deletions**.

## Zero-mutation evidence (PG17)

Harness `01-cases.sql` for both `final_chance` and `department_transfer`, prior statuses `pending`/`active`/`returned`/`rejected`:

- Raises `B1_PREDECESSOR_INCOMPLETE`
- Payment step stays `active`; predecessor unchanged; next stays `pending`
- `student_requests` unchanged; no new workflow events / audit / notifications
- Outer transaction ends `ROLLBACK`

ALLOW only when all priors are `completed` or `skipped`. Replay / unauthorized / wrong-binding remain DENY with zero further mutation.

**PG17 summary:** `{"total": 15, "failed": 0, "passed": 15}` → `PG17_CONFIRM_PAYMENT_PREDECESSOR_GUARD_PASS`

## Verification matrix

| Gate | Result |
|---|---|
| PG17 compile (promoted migration) | PASS |
| Bypass reproduction (pre-guard) | PASS (ALLOW proven) |
| Preflight / post-verifier | PASS |
| Behavioral cases (both paid services) | PASS 15/15 |
| `bun test tests/student-requests` | PASS 598/598 |
| Manifest structural + RPC-matrix cross-check | PASS |
| `bunx tsc --noEmit` | PASS |
| ESLint (changed guard test) | PASS |
| `bun run build` | PASS |
| Migration dangerous-pattern scan | PASS (0 hits) |
| Manifest numstat vs `origin/main` | **95 / 6** (< 150) |

## Migration Review / Web CI

Evidence for branch HEAD `daf8047418cb65cd43d3ec09a150ee3260d36f13`:

| Check | Run ID | URL | Result |
|---|---|---|---|
| Migration Review | `30141320412` | https://github.com/msorori-mh/saba-uni-portal/actions/runs/30141320412 | SUCCESS |
| Web CI | `30141320426` | https://github.com/msorori-mh/saba-uni-portal/actions/runs/30141320426 | SUCCESS |

Minimal-manifest fix commit `94d8c20` also green: Migration Review `30141022282`, Web CI `30141022309`.

## Production / deploy

- No Production or Staging write
- No migration apply
- No Deploy / Publish
- PR https://github.com/msorori-mh/saba-uni-portal/pull/220 opened for review; **not** merged by this agent

## Final decision

`PASS_PR220_MINIMAL_MANIFEST_DIFF_AND_FINAL_EVIDENCE_READY_FOR_MERGE`
