# SEQ08 Production Read-Only G4 Prompt (Lovable)

**DOCUMENTATION ONLY — DO NOT EXECUTE FROM THIS TRACK.**

Production ref: `wpmicqriltrowwonknox`

## Mission

Read-only probe before SEQ08 apply. Zero writes.

## Must prove

1. SEQ07-B (`20260725110050`) applied exactly once **or** original SEQ07 objects present with private bucket (object predecessor).
2. Private bucket `student-request-secure-attachments` with `public=false`.
3. `public.student_request_attachment_uploads` present.
4. SEQ08 version `20260725110100` absent.
5. Trusted-reference validator functions for SEQ08 absent (not partially installed).
6. Five services still hidden; requests=0.
7. Protected records unchanged (SR-20260716-26BAD4C8, SR-20260715-FEDCB3E1, SR-20260713-2DE64041, USR-2026-000001, USR-2026-000002).
8. SEQ09→24 absent.

Then (separate approval): apply only `20260725110100_b1_08_trusted_reference_validators_05a.sql` (LF SHA `e04d7b0b2d3fa8cd9748796a2a9e59131894fdd726339ced594ba36d836df0a2`), run post-verifier, STOP.

Forbidden: batch, Gate 25, activation, `student_visible`, Deploy, repair.
