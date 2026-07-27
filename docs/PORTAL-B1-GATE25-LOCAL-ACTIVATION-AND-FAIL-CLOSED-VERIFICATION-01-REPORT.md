# PORTAL-B1-GATE25-LOCAL-ACTIVATION-AND-FAIL-CLOSED-VERIFICATION-01

## Decision

**PASS_B1_GATE25_LOCAL_ACTIVATION_RC**

```
LOCAL_DISPOSABLE_ONLY
NO_PRODUCTION_ACTIVATION
NO_STUDENT_VISIBLE_CHANGE_ON_PRODUCTION
```

## Policy (reviewed, not Production-executed)

Gate 25 is a **non-migration** operational activation boundary after SEQ07-B + SEQ08→24 verify green.

Local simulation artifacts:

- `tests/b1-rpc-matrix/pg/30-pre-activation-assert.sql`
- `tests/b1-rpc-matrix/pg/35-activate-workflows-local-only.sql`
- Chain flag: `run-chain.ps1 -IncludeGate25Local` (after stop-after 24)

## Before Gate 25 (required)

- Five services hidden
- requests=0 for the five
- `enrollment_certificate` unchanged

## After local Gate 25

- Five appear together in local harness activation
- Fail-closed when any readiness condition missing (pre-activation assert)
- Create draft / Secure Read / Secure Draft readiness as encoded in local scripts
- No unintended request-type visibility beyond the five
- No `enrollment_certificate` regression in local regression suite

## Production

Prompt only: `docs/PORTAL-B1-GATE25-PRODUCTION-PREFLIGHT-LOVABLE-PROMPT.md`
Separate approvals for activation and `student_visible` — never bundled with migrations or Deploy.
