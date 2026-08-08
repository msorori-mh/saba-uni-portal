# PORTAL GP / GA / COUNCILS RELEASE ORCHESTRATOR RUNBOOK

**Mission:** `PORTAL-RELEASE-ORCHESTRATOR-FINAL-HEADS-AND-RC-HARDENING-LONGRUN-02`
**PR:** `#301`
**Head:** `cef393a064488338ee5a04da5a12d5ed0f02c897`
**System:** Deterministic LOCAL Release Orchestration System
**Scope:** Graduation Projects (GP), Graduates Affairs (GA), Academic Councils (Councils)
**Safety Contract:** READ-ONLY / LOCAL ONLY — ZERO Production Mutation — FAIL-CLOSED

---

## 1. Overview & Purpose

This orchestrator automates preflight preparation, dependency graph validation, SHA drift checking, and local merge simulation for three major university portal release streams:
1. **Graduation Projects (GP)**
2. **Graduates Affairs (GA)**
3. **Academic Councils (Councils)**

It operates strictly locally and fail-closed: if any SHA moves, migration timestamp collides or is out of order, file is missing, or unexpected diff is detected, the system halts with an explicit `HOLD` status.

---

## 2. Command Line Interface

The canonical local check command is:

```bash
bun run portal:release:check
```

### Supported Modes

| Mode | Command | Description |
|---|---|---|
| `release-ready` | `bun run portal:release:check` | Default. Runs all safety checks end-to-end and prints release status. |
| `status` | `bun run portal:release:check --mode=status` | Prints human-readable subsystem status matrix and production gate report. |
| `source-check` | `bun run portal:release:check --mode=source-check` | Verifies Git base, candidate SHAs, working tree status, and migration body hashes. |
| `candidate-refresh` | `bun run portal:release:check --mode=candidate-refresh` | Reports detected branch drift without auto-updating pins. Requires owner sign-off. |
| `migration-chain` | `bun run portal:release:check --mode=migration-chain` | Validates migration timestamp uniqueness and chronological sequence ordering. |
| `merge-simulation` | `bun run portal:release:check --mode=merge-simulation` | Performs isolated local merge-tree simulation across stacked candidate branches without altering `main`. |
| `preflight-package-check` | `bun run portal:release:check --mode=preflight-package-check` | Validates preflight SQL runbooks and asserts zero DML mutations. |
| `post-verifier-check` | `bun run portal:release:check --mode=post-verifier-check` | Verifies presence and structure of all post-migration SQL verifiers. |
| `e2e-package-check` | `bun run portal:release:check --mode=e2e-package-check` | Asserts presence and integrity of candidate test suites. |

---

## 3. Release Manifest (`src/release/release-manifest.json`)

The orchestrator reads a machine-readable manifest defining:

- **CURRENT MAIN:** `e71d9aa8cfc0f5ddefef08c16bb361413eb97496`
- **GP Subsystem:**
  - L4 Migration: `supabase/migrations/20260808010000_gp_student_level4_only_eligibility_guard_01.sql`
  - Full Hash: `5815d99f2556336e4029dc1dda7dba4ded0e495d58cdb0fa7ecc46b40ea6ff3c`
  - Body Hash (`SHA256_LF_NORMALIZED_V1`): `9e0422f84d7b5605a63c56b12be2428e97db1cf4fe44a48d0d6b894e2d1086c3`
  - Authoritative Operator Package SHA (#293): `61952df385eea12f57720ea33b2d10b5b6621247`
- **GA Subsystem:**
  - Source SHA (#291): `ef73881fbf7b8a12729c0f04b46fb346c47e7fb8`
  - Promotion Package SHA (#299): `c016b4c287825ea28d76aff6b44e53fa68f66f2b`
  - Security Review Gate: `GA_FINAL_SECURITY_REVIEW_REQUIRED` (initially `PENDING`)
  - 3-Migration Sequence: `20260808210000_ga_mvp_foundation_01.sql`, `20260808210100_ga_mvp_completion_01.sql`, `20260808210200_ga_authorization_04.sql`
- **Academic Councils Subsystem:**
  - Final Integrated Candidate SHA (#300): `d3ddce61f1d339d418d9c494fc8b456d4a5f6d85`
  - Historical Inputs (Superseded): #298 (`96fc02ee...`), #297 (`681192e3...`)
  - Status Distinction: `C0-C8_CORE_READY` achieved vs `C0-C9_FULL_PRODUCT_READY` (C9 extension slot initial status: `PENDING`)
  - Required Verifications for #300: `WEB_CI`, `MIGRATION_REVIEW`, `INDEPENDENT_SECURITY_REVIEW`
  - 8-Migration Sequence: C0 through C7 (`20260808120000` to `20260808170000`)

---

## 4. Production Gate Classification

The orchestrator strictly enforces the boundary between safe local operations and owner-required production gates:

### SAFE AUTOMATIC (Local Execution Permitted)
- Local unit & contract test execution
- LF-normalized SHA256 file/body hash verification
- Isolated Git `merge-tree` simulation
- Disposable PostgreSQL 17 Docker container verification
- Read-only preflight package validation

### OWNER APPROVAL REQUIRED (Tool NEVER Automatically Crosses)
- Production database migration apply (`OWNER_APPROVAL_MIGRATION_APPLY`)
- GP test fixture execution on production (`OWNER_APPROVAL_GP_FIXTURE_EXECUTION`)
- GA operational config production writes (`OWNER_APPROVAL_GA_CONFIG_WRITE`)
- GA final security review signoff (`GA_FINAL_SECURITY_REVIEW_REQUIRED`)
- Production feature flag enablement (`OWNER_APPROVAL_FEATURE_FLAG_ENABLE`)
- Application deployment or publish (`OWNER_APPROVAL_DEPLOY` / `OWNER_APPROVAL_PUBLISH`)
- Candidate branch merge to `main` (`OWNER_APPROVAL_INTEGRATION_MERGE`)

---

## 5. Security & Isolation Invariants

1. **NO Hardcoded Credentials or Tokens:** Zero secrets, passwords, or production API tokens exist in source or manifest.
2. **NO Production DB Write Capability:** The orchestrator contains zero code to connect to or execute mutations against production database instances.
3. **FAIL-CLOSED Default:** Any hash mismatch, missing verifier, duplicate timestamp, backwards migration sequence, or unexpected git state produces an immediate `HOLD` verdict and non-zero exit code.
