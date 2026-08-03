# PORTAL-GRADUATES-AFFAIRS-AUTHORIZATION-PR273-INDEPENDENT-FINAL-REVIEW-05

Mode: LONG INDEPENDENT SOURCE-ONLY SECURITY REVIEW
Repository: msorori-mh/saba-uni-portal
PR: #273

## 1. Source / base SHA

| Item | Expected | Observed in review workspace |
|---|---|---|
| Reviewed PR SHA | `23bb9c8e2e1e1e1a73c235e4f422420a581166e2` | **NOT PRESENT** — `git cat-file -t` → `could not get object info` |
| Base main SHA | `8729f6d5d61d5a55052fe9f7cda2bd360d9bb421` | `8729f6d5` = current `HEAD` (exact match) |

Remote reachability:

- `origin` is the Lovable managed mirror (`git.private.lovable-gcp.code.storage/90f4dcde-…`), not GitHub. It does not contain the PR #273 head.
- `git ls-remote https://github.com/msorori-mh/saba-uni-portal` → `could not read Username for 'https://github.com'` (no credentials in this environment).
- `GET https://api.github.com/repos/msorori-mh/saba-uni-portal/pulls/273` → HTTP `404` (private / unauthenticated).

**Consequence:** the reviewed diff, its file inventory, and `docs/migration-drafts/GRADUATES-AFFAIRS-AUTHORIZATION-04.sql` cannot be read. No PR-specific verdict can be issued without fabricating it. This review stops at the source gate.

## 2. Changed-file inventory

Not obtainable. The workspace tree is byte-identical to base main; `git status --porcelain` is clean and `git diff --check` is empty. `docs/migration-drafts/` contains only:

- `GRADUATES-AFFAIRS-MVP-FOUNDATION-01.sql`
- `GRADUATES-AFFAIRS-MVP-COMPLETION-01.sql`
- `GRADUATION-PROJECTS-MVP-FOUNDATION-01.sql`
- `GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql`

No `GRADUATES-AFFAIRS-AUTHORIZATION-04*.sql` exists at base.

## 3. Verdicts requiring the PR diff — all UNDETERMINED

| Area | Verdict |
|---|---|
| 13 graduate self-service RPCs inventory | UNDETERMINED (source absent) |
| 7 staff RPCs inventory | UNDETERMINED |
| `auth.uid()` as only authoritative actor | UNDETERMINED |
| Ownership via `student_profiles.user_id` | UNDETERMINED |
| Manager college / specialist department / follow-up assignee scope | UNDETERMINED |
| No admin/registrar/dean general bypass | UNDETERMINED |
| Profile mutable-field allowlist | UNDETERMINED |
| `row_version` concurrency | UNDETERMINED |
| Employment / survey / event lifecycles | UNDETERMINED |
| Opportunity audience match; empty `{}` matches nothing | UNDETERMINED |
| `protected_value` / `notes_protected` non-disclosure (PII verdict) | UNDETERMINED |
| Minimum-cell aggregate suppression | UNDETERMINED |
| PUBLIC/anon/authenticated EXECUTE grants | UNDETERMINED |
| SECURITY DEFINER ownership + `search_path` | UNDETERMINED |
| RLS default-deny | UNDETERMINED |
| Zero-mutation on rejected calls | UNDETERMINED |
| Import batch-fails-whole + duplicate source reference (import verdict) | UNDETERMINED |
| CI workflow safety | UNDETERMINED |
| Cross-module B1 / Graduation Projects isolation | UNDETERMINED |

## 4. PostgreSQL 17 chain and negative matrix

Not executed. The chain `setup → foundation → completion → authorization-04 → verifier` requires
`docs/migration-drafts/GRADUATES-AFFAIRS-AUTHORIZATION-04*.sql` and its verifier, neither of which
exists at base. Running only the base foundation/completion stages would produce results that say
nothing about PR #273, so the expanded 23-principal negative matrix (anonymous, graduate self,
other graduate, unlinked graduate, manager, in-/out-of-department specialist, follow-up assignee,
unrelated staff, registrar, dean, admin, malformed/empty audience, stale `row_version`, duplicate
correlation, illegal transition, direct RPC misuse, protected PII read, cross-department search,
invalid import row, duplicate import reference, zero-mutation proof) is **NOT RUN**.

## 5. Naming governance

Required: `docs/migration-drafts/GRADUATES-AFFAIRS-AUTHORIZATION-04.NOT_APPLIED.sql`.
The project convention (`*.NOT_APPLIED.sql`, as used by `B1-FIVE-SERVICES-SAFE-RPC-FIXTURES-13.NOT_APPLIED.sql`)
marks unapplied drafts explicitly.

Verdict: **UNVERIFIED — actionable finding pre-registered.** If PR #273 introduces
`GRADUATES-AFFAIRS-AUTHORIZATION-04.sql` without the `.NOT_APPLIED` suffix, it is a naming-governance
blocker and must be renamed by the PR author, not by this review. Note that the two existing
graduates-affairs drafts at base also omit the suffix, so the convention is currently inconsistent
in this directory and should be settled repo-wide.

## 6. PR #271 overlap analysis

Not obtainable: PR #271 is equally unreachable (same 404 / no GitHub credentials), and its
graduates-affairs portions are not merged into base main. Duplicates, conflicting UI fixes,
conflicting authorization models, file-integration recommendations, and merge order are therefore
**UNDETERMINED**. No branches were merged, compared, or modified.

## 7. Tests actually executed (base main, environment sanity only)

| Command | Result |
|---|---|
| `bun test tests/graduates-affairs` | **29 pass / 0 fail** (2 files) |
| `bunx tsgo --noEmit` | clean, no diagnostics |
| `git diff --check` | clean |

`bun test` (full), `tests/student-requests`, `tests/b1-five-services-rpc-authorization-preflight-01`
and `bun run build` were not used as PR evidence: on base main they measure the pre-PR tree and
would be misleading if quoted as PR #273 results.

## 8. CI

No CI run could be inspected — the GitHub API is not reachable from this environment, so no workflow
final state or failure log is available for PR #273.

## 9. Exact blockers

1. **B1 — REVIEWED_SHA_UNREACHABLE**: commit `23bb9c8e2e1e1e1a73c235e4f422420a581166e2` is absent from
   the workspace and from the only reachable remote; GitHub is unauthenticated (`404` / no credentials).
2. **B2 — PR_DIFF_UNAVAILABLE**: no changed-file inventory, no RPC inventory, no grants/RLS/search_path
   evidence can be produced.
3. **B3 — PG17_CHAIN_INPUT_MISSING**: `GRADUATES-AFFAIRS-AUTHORIZATION-04` SQL and verifier do not exist
   at base, so the disposable PostgreSQL chain and the negative matrix cannot run.
4. **B4 — PR271_UNREACHABLE**: cross-branch overlap and merge-order analysis impossible.

Unblocking requires one of: pushing branch `23bb9c8e…` to the Lovable mirror remote, providing a
read-scoped GitHub token for `msorori-mh/saba-uni-portal`, or attaching the PR #273 patch/bundle
plus the `AUTHORIZATION-04` SQL and verifier files to the workspace.

## 10. Constraint compliance

No production connection, no migration applied, no deploy/publish, no merge, none of the 12 owner
decisions implemented, no fail-closed behavior weakened, no PR #273 source modified. The only file
added is this report.

## Final decision

**HOLD_PORTAL_GRADUATES_AFFAIRS_AUTHORIZATION_PR273_REVIEWED_SHA_UNREACHABLE_PR_DIFF_UNAVAILABLE**
