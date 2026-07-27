# PORTAL-B1-SEQ07-B-PRODUCTION-READONLY-PREFLIGHT-PACKAGE-01

## Decision

**PASS_B1_SEQ07_B_PRODUCTION_READONLY_PREFLIGHT_PACKAGE**

```
NO_PRODUCTION_WRITE
NO_PRODUCTION_BUCKET_CREATED
NO_PRODUCTION_MIGRATION_APPLY
DOCUMENTATION_AND_LOCAL_PROOF_ONLY
```

## Pins

| Field | Value |
|---|---|
| Production ref | `wpmicqriltrowwonknox` |
| Original SEQ07 | `supabase/migrations/20260725110000_b1_07_secure_attachments_source_01.sql` |
| Original LF SHA | `66ba4c96c23c44bbcca62de28360d806ee6ff5dbd358a20f2e181b9a8fd6bca8` |
| SEQ07-B | `supabase/migrations/20260725110050_b1_07b_secure_attachments_sql_only_01.sql` |
| SEQ07-B LF SHA | `a49d615b11949f3c8594b282d2241e9dbd2d7be42d37bb5ac4b1d1952ddd4eec` |
| Lovable RO prompt | `docs/PORTAL-B1-SEQ07-B-PRODUCTION-READONLY-G4-01-LOVABLE-PROMPT.md` |
| Marker | `TEST_ONLY_FIRST_DELIVERY_5_SERVICES` |

## Protected records (must stay unchanged)

- SR-20260716-26BAD4C8
- SR-20260715-FEDCB3E1
- SR-20260713-2DE64041
- USR-2026-000001
- USR-2026-000002

## RO checklist covered by Lovable prompt

- Original SEQ07 not applied / not falsely APPLIED
- SEQ07-B not applied
- No partial attachment objects
- Bucket absent
- No conflicting functions/triggers/policies
- Prior dependencies present
- Five services hidden; requests=0
- Protected records stable
- SEQ08→24 not applied
- No divergent bytes for version `20260725110050`
- No anon privileges / no public bucket / no broad bypass

## B0 package (not executed here)

| Item | Contract |
|---|---|
| Name | `student-request-secure-attachments` |
| public | false |
| MIME | pdf/jpeg/png |
| Size | 5242880 |
| Pre-check | absent or exact private |
| Post-check | exact private; uploads absent |
| Conflict | STOP on public/wrong MIME |
| Idempotency | re-assert exact private |
| Stop | any SQL apply in same session |

## B1 package (not executed here)

| Item | Contract |
|---|---|
| Filename | `20260725110050_b1_07b_secure_attachments_sql_only_01.sql` |
| SHA | `a49d615b…` |
| Preflight | `07B-…-PREFLIGHT.sql` |
| Apply | one SQL migration only |
| Post-verifier | `07B-…-POST-VERIFIER.sql` |
| History | `20260725110050` once; `20260725110000` absent |
| Second-run | refuse |
| Protected | re-verify digests |

## Failure matrix (forward-only remediation)

| State | Action |
|---|---|
| B0 not started | Start B0 only after RO green |
| B0 complete / B1 not started | Allowed pending state; run B1 when approved |
| B1 rollback | Re-run B1 after fix; no history row |
| B1 outcome ambiguous | STOP; classify; no repair |
| Objects without history | STOP; forward package |
| History without complete objects | STOP; forward package |
| Conflicting bucket | STOP; Storage-tool correction only |
| Connection interruption | Re-probe RO; never assume success |

## Local equivalence already proven

Harness `tests/b1-seq07b-alternate/run-harness.ps1` → `PASS_B1_SEQ07B_LOCAL_EQUIVALENCE` on PR #258 tip.
