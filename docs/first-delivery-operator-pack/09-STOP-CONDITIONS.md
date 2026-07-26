# 09 — Stop conditions

- Any preflight failure
- Any apply error / PARTIAL / AMBIGUOUS history vs objects
- Protected-record drift
- Unexpected service visibility
- Public bucket / anon privilege / broad bypass
- Attempt to apply superseded SEQ07 `20260725110000` after SEQ07-B
- Batch / next-migration in same session
- Gate 25 or Deploy bundled with migrations

On stop: halt sequence; forward-only remediation only.
