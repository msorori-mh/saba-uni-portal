# Gate 25 Production Preflight Prompt (Lovable)

**DOCUMENTATION ONLY — DO NOT EXECUTE FROM THIS TRACK.**

Production ref: `wpmicqriltrowwonknox`

## Mission

Read-only readiness check before any activation / `student_visible` change. Zero writes in this prompt.

## Must prove

1. SEQ07-B (`20260725110050`) applied exactly once; original `20260725110000` absent (or explicitly never claimed).
2. SEQ08→SEQ24 each applied once with matching object proofs.
3. Authorization matrix evidence attached (24/528/0) from approved local/RPC campaign.
4. Five services still hidden; requests=0.
5. Protected records unchanged.
6. `enrollment_certificate` digests unchanged.
7. No PARTIAL/AMBIGUOUS migration state.
8. No public secure-attachment bucket; anon denied.

## Explicitly separate later approvals (NOT this prompt)

- Workflow activation (per service or coordinated five)
- `student_visible` (per service)
- Deploy/Publish + smoke

## Forbidden

Migration apply, repair, bucket create, Deploy, Publish, SMS/email, real-user testing.
