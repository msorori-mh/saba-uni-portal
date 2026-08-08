# GA Production Apply-One Qualification Runbook

**Package:** PORTAL-GA-CANONICAL-RELEASE-CONTRACT-AND-OWNER-GATE-LONGRUN-15
**Hash manifest:** `docs/migration-evidence/graduates-affairs/GA_RELEASE_HASH_MANIFEST.txt`
**Status:** QUALIFIED — owner approval still required before any production apply.

## Exact production order (NO batch apply)

```
1. Foundation   supabase/migrations/20260808210000_ga_mvp_foundation_01.sql
   STOP
2. Completion   supabase/migrations/20260808210100_ga_mvp_completion_01.sql
   STOP
3. AUTH04       supabase/migrations/20260808210200_ga_authorization_04.sql
   STOP
4. Operational config (DRY RUN default; separate controlled script)
   STOP
5. Feature flags (SEPARATE owner gate; remain OFF until explicitly enabled)
```

## Per-migration gate checklist

For **each** of Foundation, Completion, AUTH04:

1. **Readonly preflight** — run `docs/migration-drafts/GA-PRODUCTION-PROMOTION-PREFLIGHT-01.sql` against production (read-only). Confirm the stage-appropriate READY token.
2. **Hash pin** — verify `FULL_FILE_SHA256_LF` and `BODY_SHA256_LF` for the exact file about to be applied match the frozen manifest.
3. **Owner approval** — explicit single-migration approval for that timestamp only.
4. **Apply one** — apply exactly one migration file. Never chain Foundation→Completion→AUTH04 in one operator action.
5. **Post-verifier** — run the matching verifier and require the PASS token:
   - Foundation → `tests/graduates-affairs/ga-production-promotion-post-verifier-foundation.sql` → `FOUNDATION_POST_VERIFIER_PASS`
   - Completion → `tests/graduates-affairs/ga-production-promotion-post-verifier-completion.sql` → `COMPLETION_POST_VERIFIER_PASS`
   - AUTH04 → `tests/graduates-affairs/ga-production-promotion-post-verifier-auth04.sql` → `AUTH04_POST_VERIFIER_PASS`
6. **STOP** — do not proceed to the next migration until the verifier PASS is recorded.

## Hash pins (promoted)

| Stage | FULL_FILE_SHA256_LF | BODY_SHA256_LF |
|---|---|---|
| Foundation | `3248cf641add2dde7f249eb366f5b7b9668ef028130d6f0caffb0936969e2f43` | `43bf602fa223122b9a1c5bf6e1387a2aa7255a79483c75e796664b636e1cc819` |
| Completion | `3e37afbadd9b4c2ca4ec593ad47fae77b4333e62770f926598fcbf51336806fa` | `834e454fe79af90318c51492c37a0f15cdfc8341fb9020611412a72f4e9158fc` |
| AUTH04 | `212865fb7c4077ce313a9b4707700520be275360b54470fd62fc08edd539060c` | `3a85f54dbe5bcf249349d16cdcef5a921e4d8be28a5099965691e65ce4c3dffd` |

Do **not** compare FULL to BODY. Both are required pins for different dimensions.

## Forbidden

- Batch apply of two or more GA migrations
- Enabling feature flags as part of a migration apply
- Production writes outside the single approved migration
- Skipping post-verifier
- Re-applying after `*_PREFLIGHT_ALREADY_APPLIED`
