# PORTAL-B1-SEQ08-PRODUCTION-PREFLIGHT-PACKAGE-01

## Decision

**PASS_B1_SEQ08_SOURCE_AND_PRODUCTION_PREFLIGHT_PACKAGE**

```
NO_PRODUCTION_WRITE
NO_PRODUCTION_MIGRATION_APPLY
LOCAL_HARNESS_VIA_CHAIN_STOP_AFTER_8
```

## Identity

| Field | Value |
|---|---|
| File | `supabase/migrations/20260725110100_b1_08_trusted_reference_validators_05a.sql` |
| Version | `20260725110100` |
| LF SHA (PROMOTION-MAP) | `e04d7b0b2d3fa8cd9748796a2a9e59131894fdd726339ced594ba36d836df0a2` |
| Preflight | `docs/migration-drafts/b1-backend-verifiers/08-B1_08_TRUSTED_REFERENCE_VALIDATORS_05A-PREFLIGHT.sql` |
| Post-verifier | `docs/migration-drafts/b1-backend-verifiers/08-B1_08_TRUSTED_REFERENCE_VALIDATORS_05A-POST-VERIFIER.sql` |
| Predecessor rule | Object proof: uploads table + private bucket (SEQ07 **or** SEQ07-B) |
| Local harness | `tests/b1-seq08-preflight/run-harness.ps1` |
| RO prompt | `docs/PORTAL-B1-SEQ08-PRODUCTION-READONLY-G4-01-LOVABLE-PROMPT.md` |

## Local harness scope

1. Baseline before B0
2. B0 private bucket simulation
3. SEQ07-B B1 apply + second-apply refuse
4. SEQ08 preflight → apply → post-verifier
5. SEQ09 not applied in session
6. No protected-record mutation (synthetic marker only)

Trusted-reference validators are exercised by SEQ08 post-verifier + later chain positive/negative cases.

## Production

Package + RO prompt only. Separate human approval required before any Production apply.
