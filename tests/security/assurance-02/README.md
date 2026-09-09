# TEST_ONLY_ASSURANCE_02

Isolated, test-only fixture provisioning + strict assurance runner for the
staging backend `ldjhuutywqhjxabdotmn` and the public target
`https://uniportaltest.com`. Nothing here touches production.

## Files
- `target-guard.ts` — canonical exact-origin matching (one trailing slash is the
  only tolerated variation). Rejects `:443`, `?`, `#`, dot/encoded traversal,
  userinfo, ports, alternate schemes and both production identities. No env
  override. `guardedFetch` refuses redirects and applies a bounded timeout.
- `fixtures.ts` — exactly 10 NEW identities: studentA, studentB, faculty_member,
  department_head, student_affairs, registrar, dean, hr_officer,
  finance_officer, admin. `student_affairs` is privileged and is never used as a
  generic unprivileged staff principal.
- `secret-vault.ts` — one CSPRNG password per account, per-run exclusive (`wx`)
  0600 file inside the git-ignored 0700 `.private/` directory, plus
  `redactError` for diagnostics.
- `durable-sink.ts` — JSONL checkpoints, exclusively created 0600, append +
  fsync per event. A sink failure is fatal and blocks all later writes.
- `provision.ts` — pure, port-injected core. Full preflight (vault, secrets,
  references, collisions) before the first Auth create; intent flushed before
  each action and each created ID flushed immediately after; stop on first
  partial failure preserving every created ID; no rollback deletion.
- `run-provision.ts` — real staging CLI. Verifies Auth Admin capability, uses
  the verified read-only RPC `find_auth_user_id_by_email` (bounded paginated
  fallback that fails closed), re-verifies marked reference labels/IDs and the
  program -> department FK live, and creates a NEW marked `faculty` row linked
  to each new `faculty_profiles` row.
- `assurance-fetch.ts` — the single HTTP chokepoint installed as every client's
  `global.fetch`: origin/HTTPS validation, `redirect: "error"`, bounded timeout,
  one count per real request (login, reads, retries, sign-out), >=1s spacing,
  concurrency 1, and a PERMANENT abort latch on 429/5xx/HTML/two transport
  failures.
- `tsconfig.json` — scoped typecheck (`noCheck:false`, `strict:true`) for the
  runtime scripts; the root tsconfig excludes tests and sets `noCheck:true`, so
  it proves nothing here. The `*.test.ts` suite needs Bun type declarations
  (not installed) and is covered by `bun test` instead.
- `strict-evidence.ts` — a 401/403 denial counts only with PostgREST `42501`; a
  200 denial counts only as a valid EMPTY JSON array. 405/404/429/5xx, HTML
  challenges, JWT/PGRST errors, unknown API errors and non-array bodies are
  ERROR or BLOCKED, never a successful denial. Every denial requires a paired
  owner control whose returned row id was validated.
- `run-existing-student-assurance.ts` — repeatable READ-ONLY RLS measurement for
  the two pinned synthetic students only. Auth is an **admin-generated
  synthetic-test session**: `auth.admin.generateLink({type:"magiclink"})`
  (generates, does not send) then `auth.verifyOtp({token_hash, type:"email"})`.
  It is not a password login and not a browser session test. Because
  `generateLink` may create an absent user, it runs only behind
  `gatedSessions`: a complete live preflight (exact pinned id, exact fixture
  email, confirmed email, all four fixture metadata fields, and a
  `student_profiles` row whose `user_id` matches) must pass for BOTH students
  first — otherwise zero generateLink calls happen. Both the generateLink user
  id and the verified session user id must equal the pinned id. Budget <=30
  requests, >=1s apart, concurrency 1, same abort latch; sessions are signed out
  with `scope:"local"` in `finally`, and any failed cleanup is a FAIL. Tokens,
  hashed tokens and action links stay in memory and are never printed.
- `run-assurance.ts` — sequential authenticated runner (run only on explicit
  instruction). One login per account, manifest ID match, paired own-profile,
  cross-student A->B / B->A and anonymous reads of the exact new student rows.
  Identity comes from `ASSURANCE_02_FIXTURES` only. Manifest preflight
  (namespace, mode, exactly ten keys, roleCreated, UUIDs, matching vault keys)
  runs before the first login; a login needs both an access token and a
  matching user id. Exit 0 clean, 1 on any FAIL/ERROR, 4 (HOLD) when BLOCKED.

## Timing semantics
Every probe reports two distinct figures and they must not be conflated:
- `durationMs` — measured inside the fetch adapter, from request dispatch to the
  end of bounded body reception. It is **network + API service time**. It is not
  SQL execution time and not a browser LCP measurement.
- `pacedElapsedMs` — total probe wall time, which also contains the harness's own
  deliberate >=1s pacing wait. Never attribute this delay to the backend.

## Manifest handling
- `PUBLIC_MANIFEST_FILE` = `.private/manifest.public.json`. Future runs write the
  IDs-only manifest inside the git-ignored 0700 private directory (mode 0600).
- The repo-tracked `manifest.public.json` at the directory root is the historical
  artifact of the first apply. It is intentionally left in place: no history
  rewrite and no deletion. It holds fixture UUIDs only — no credentials.
- Never stage or export `.private/` contents, checkpoints or runtime evidence.
  The CI allowlist is source files only.
- `.private/` is wiped by workspace resets. If the credential vault is lost the
  password runner cannot be re-executed. The existing-student runner can use the
  two exact synthetic fixtures under the owner's existing testing authorization.
  It does not reset passwords or provision accounts. Runtime manifests and
  credentials are deliberately omitted from this source export.

## Commands
```
bun test tests/security/assurance-02          # offline unit tests
bunx tsc -p tests/security/assurance-02/tsconfig.json     # scoped typecheck
bun tests/security/assurance-02/run-provision.ts          # DRY RUN (default)
bun tests/security/assurance-02/run-provision.ts --apply  # only on instruction
bun tests/security/assurance-02/run-assurance.ts <vault>  # only after apply
bun tests/security/assurance-02/run-existing-student-assurance.ts  # two pinned students
```


## Known BLOCKED coverage
- Generic unprivileged staff principal: a `staff_profile` with no privileged
  role grant (no new `app_role` value needed) — out of scope of this phase.
- No document/certificate/grade/request fixtures are created in this phase.
- Server-function ID probes are unavailable until IDs are supplied.

## Role writes
Only the canonical `user_roles` row is written per account, and its returned id
is checkpointed. `user_role_assignments.role_code` has an FK to
`roles_catalog(code)`, which currently holds only `department_head`; adding
catalog entries is out of scope, so no mapping row is written.

## Password-login path
The original password-based login run passed. The ephemeral vault was destroyed
by a workspace reset, so that exact path cannot be repeated without a password
reset, which has not been performed. Repeatable coverage is instead obtained
through the admin-generated synthetic-test session above, and the password path
stays listed under `coverageBlocked`.
