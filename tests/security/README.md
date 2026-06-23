# Staging Security Test Harness (SECURITY-FULL-ASSURANCE-02)

Automated / semi-automated **read-only** security probes derived from
[SECURITY-FULL-ASSURANCE-01](../../docs/security/SECURITY-FULL-ASSURANCE-01.md).

## Safety rules

- **Never** run against production (`quboolye.com`) unless you explicitly set
  `SEC_TEST_ALLOW_PRODUCTION_READONLY=1` (not recommended).
- Use **staging** URLs and **synthetic test accounts** only.
- Do **not** commit real passwords, IDs, or verification codes.
- Tests do **not** execute imports, cleanup, or database writes.

## Quick start (staging)

### A. One-time setup (writes to staging)

```bash
cp tests/security/staging-setup.example.env tests/security/.env.setup.local
# Fill staging URLs, anon key, service role key, SEC_TEST_PASSWORD
# Set SEC_SETUP_ALLOW_STAGING_WRITE=true

export SEC_SETUP_ENV_FILE=tests/security/.env.setup.local
bun run security:setup-staging
```

### B. Run security harness

```bash
cp tests/security/security-test.config.example.env tests/security/.env.local
# Or use auto-generated .env.local from setup script

export SEC_TEST_ENV_FILE=tests/security/.env.local
bun run security:test
```

## Required environment

| Variable | Purpose |
|----------|---------|
| `SEC_TEST_TARGET_URL` | Staging app base URL (no trailing slash) |
| `SEC_TEST_SUPABASE_URL` | Staging Supabase project URL |
| `SEC_TEST_SUPABASE_ANON_KEY` | Anon/public key (not service role) |

## Test suites

| Suite | File | Coverage |
|-------|------|----------|
| T1 | `t1-student-idor.test.ts` | Student cross-access (progress, transcript, documents) |
| T2 | `t2-server-functions-authz.test.ts` | Sensitive server fns without token / wrong role |
| T3 | `t3-import-role-separation.test.ts` | Registrar vs finance import preview separation |
| T4 | `t4-anon-public-surface.test.ts` | `verify_document`, anon `class_schedule` |
| T5 | `t5-audit-log-scope.test.ts` | RBAC-06 audit_logs scope |

## Result codes

| Status | Meaning |
|--------|---------|
| **PASS** | Expected behavior observed |
| **FAIL** | Unexpected access or leak — investigate |
| **SKIP** | Missing config (account, fn id, test data) |
| **MANUAL** | Needs human review or staging data not present |

## Without configuration

Running `bun run security:test` with no env must fail safely:

```text
SEC_TEST_TARGET_URL is required
```

No network calls are made until required variables pass the production guard.

See also: [SECURITY-FULL-ASSURANCE-02.md](../../docs/security/SECURITY-FULL-ASSURANCE-02.md)
