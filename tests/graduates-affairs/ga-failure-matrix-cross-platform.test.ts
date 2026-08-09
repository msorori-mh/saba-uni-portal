/**
 * PORTAL-GA-CROSS-PLATFORM-FAILURE-RECOVERY-AND-OPERATOR-REHEARSAL-LONGRUN-16
 *
 * Contract tests for the canonical Windows PowerShell failure-matrix runner.
 * Does not start Docker here (execution evidence is produced by the PS1 rehearsal).
 */
import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

const PS1 = join(root, "scripts/ga-failure-matrix-rehearsal.ps1");
const SH = join(root, "scripts/ga-failure-matrix-rehearsal.sh");
const EXACT_PS1 = join(root, "scripts/ga-local-exact-rehearsal.ps1");
const GITATTRIBUTES = join(root, ".gitattributes");

const SCENARIOS = [
  { n: 1, marker: "GA_FOUNDATION_PREFLIGHT_ALREADY_APPLIED" },
  { n: 2, marker: "GA_COMPLETION_PREFLIGHT_MISSING" },
  { n: 3, marker: "GA_AUTH04_PREFLIGHT_MISSING" },
  { n: 4, marker: "GA_COMPLETION_PREFLIGHT_ALREADY_APPLIED" },
  { n: 5, marker: "GA_AUTH04_PREFLIGHT_MISSING" },
  { n: 6, marker: "CONFIG HOLD: manager_staff_profile_id is required" },
  { n: 7, marker: "GA_FOUNDATION_PREFLIGHT_MISSING_UNIT" },
  { n: 8, marker: "CONFIG HOLD: a current graduate_account_continuity_policies row already exists" },
  { n: 9, marker: "owns more than one active staff_profile" },
  { n: 10, marker: "is not scoped to department" },
] as const;

function normalizeLf(raw: string | Buffer): string {
  const s = typeof raw === "string" ? raw : raw.toString("utf8");
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function sha256Lf(raw: string | Buffer): string {
  return createHash("sha256").update(normalizeLf(raw), "utf8").digest("hex");
}

describe("GA failure-matrix cross-platform contract (LONGRUN-16)", () => {
  it("Windows canonical runner is present", () => {
    expect(existsSync(PS1)).toBe(true);
    expect(existsSync(EXACT_PS1)).toBe(true);
  });

  it("declares PowerShell as the canonical operator path (no Bash-only dependency)", () => {
    const ps1 = normalizeLf(readFileSync(PS1, "utf8"));
    expect(ps1).toContain("CANONICAL_RUNNER=scripts/ga-failure-matrix-rehearsal.ps1");
    expect(ps1).toContain("No WSL requirement");
    expect(ps1).toContain("No Git-Bash-only requirement");
    expect(ps1).toMatch(/postgres:17/);
    // Must speak Docker directly — not shell out to the .sh companion as the only path.
    expect(ps1).not.toMatch(/bash\s+.*ga-failure-matrix-rehearsal\.sh/);
    expect(ps1).not.toMatch(/wsl\.exe/i);

    const sh = normalizeLf(readFileSync(SH, "utf8"));
    expect(sh).toContain("CANONICAL_RUNNER=scripts/ga-failure-matrix-rehearsal.ps1");
    expect(sh).toContain("COMPANION_RUNNER=scripts/ga-failure-matrix-rehearsal.sh");
  });

  it("enumerates all 10 scenarios with precise expected markers", () => {
    const ps1 = normalizeLf(readFileSync(PS1, "utf8"));
    for (const s of SCENARIOS) {
      expect(ps1).toContain(`Scenario ${s.n}:`);
      expect(ps1).toContain(s.marker);
    }
    expect(SCENARIOS).toHaveLength(10);
  });

  it("checks failure exit codes and does not swallow psql failures with || true", () => {
    const ps1 = normalizeLf(readFileSync(PS1, "utf8"));
    expect(ps1).toContain("ExitCode");
    expect(ps1).toContain("EXPECTED_FAILURE");
    expect(ps1).toContain("UNEXPECTED_FAILURE");
    // PowerShell harness must require non-zero exit for expected failures.
    expect(ps1).toMatch(/ExitCode -ne 0/);

    const sh = normalizeLf(readFileSync(SH, "utf8"));
    // Fixed: no docker/psql helper may end with `|| true` that hides failure class.
    expect(sh).not.toMatch(/docker exec -i .*psql.*\|\|\s*true/);
    expect(sh).toContain("LAST_PSQL_EXIT");
    expect(sh).toContain("expected non-zero exit");
    // Heredoc must attach to docker exec, not to true.
    expect(sh).not.toMatch(/\|\|\s*true\s*<<EOF/);
  });

  it("proves LF/CRLF equivalence for runner + SQL inputs under normalization", () => {
    const files = [
      PS1,
      SH,
      join(root, "supabase/migrations/20260808210000_ga_mvp_foundation_01.sql"),
      join(root, "docs/migration-drafts/GA-PRODUCTION-PROMOTION-CONFIG-01.sql"),
    ];
    for (const f of files) {
      const raw = readFileSync(f);
      const lf = normalizeLf(raw);
      const crlf = lf.replace(/\n/g, "\r\n");
      expect(sha256Lf(lf)).toBe(sha256Lf(crlf));
      expect(normalizeLf(crlf)).toBe(lf);
    }
    const ps1 = normalizeLf(readFileSync(PS1, "utf8"));
    expect(ps1).toContain("ConvertTo-Lf");
    expect(ps1).toContain("Read-SqlLf");
  });

  it("embeds no production endpoint and stores no credentials", () => {
    const ps1 = normalizeLf(readFileSync(PS1, "utf8"));
    const sh = normalizeLf(readFileSync(SH, "utf8"));
    for (const text of [ps1, sh]) {
      expect(text).not.toMatch(/wpmicqriltrowwonknox/);
      expect(text).not.toMatch(/supabase\.co/i);
      expect(text).not.toMatch(/postgres(ql)?:\/\/[^\s]+/);
      expect(text).not.toMatch(/service_role/i);
      expect(text).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\./); // JWT-shaped secrets
      // Local disposable password only — never a production secret file path.
      expect(text).not.toMatch(/\.pgpass/);
      expect(text).not.toMatch(/SUPABASE_SERVICE_ROLE/);
    }
    // Disposable local rehearsal password is explicit and non-production.
    expect(ps1).toContain("ci_pg_verifier_password");
  });

  it("package .gitattributes pins LF for GA operational scripts and migrations", () => {
    const attrs = normalizeLf(readFileSync(GITATTRIBUTES, "utf8"));
    expect(attrs).toContain("scripts/ga-failure-matrix-rehearsal.ps1 text eol=lf");
    expect(attrs).toContain("scripts/ga-failure-matrix-rehearsal.sh text eol=lf");
    expect(attrs).toContain("supabase/migrations/20260808210000_ga_mvp_foundation_01.sql text eol=lf");
    expect(attrs).toContain("supabase/migrations/20260808210100_ga_mvp_completion_01.sql text eol=lf");
    expect(attrs).toContain("supabase/migrations/20260808210200_ga_authorization_04.sql text eol=lf");
    expect(attrs).toContain("tests/graduates-affairs/** text eol=lf");
  });

  it("captures structural fingerprints for zero-unintended-mutation proof", () => {
    const ps1 = normalizeLf(readFileSync(PS1, "utf8"));
    expect(ps1).toContain("Get-StructuralFingerprintSql");
    expect(ps1).toContain("ZERO_UNINTENDED_MUTATION");
    expect(ps1).toContain("Recovery drill");
    expect(ps1).toContain("GA-PRODUCTION-PROMOTION-ROLLBACK-BY-FORWARD-01.sql");
  });
});
