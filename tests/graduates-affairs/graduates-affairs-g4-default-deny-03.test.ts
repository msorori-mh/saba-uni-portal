/**
 * GRADUATES-AFFAIRS-G4-DEFAULT-DENY-03
 *
 * Shared fail-closed foundations that hold under EVERY option of the still
 * unresolved G4 authorization package (see
 * docs/GRADUATES-AFFAIRS-G4-AUTHORIZATION-DECISION-MEMO-01.md). These are
 * source-contract tests: they scan source/SQL text and exercise the pure
 * lib/catalog contracts. Whichever staffing option the product owner later
 * approves, none of these invariants may relax:
 *
 * - no route or server function consumes the graduates-affairs surface;
 * - the lib contract layer stays pure (no server fns, no Supabase, no RPC);
 * - both SQL drafts stay default-deny (RLS everywhere, zero policies, pinned
 *   search_path, client-callable functions revoked);
 * - every ALU-* catalog entry stays unrouted with a pending role placeholder;
 * - the display components keep no network or export affordance;
 * - D-13 account continuity denies every capability while undecided;
 * - reports stay aggregate with small-cell suppression.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { REPORT_CATALOG_ENTRIES } from "../../src/lib/reports/catalog/entries";
import {
  ACCOUNT_CONTINUITY_POLICY_UNDECIDED,
  evaluateAccountContinuityAccess,
  GRADUATE_ACCOUNT_CAPABILITIES,
} from "../../src/lib/graduates-affairs/account-continuity";
import {
  assertAggregateReportSafe,
  buildCohortEmploymentReports,
} from "../../src/lib/graduates-affairs/reports";

const root = join(import.meta.dir, "../..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

const FOUNDATION_SQL = "docs/migration-drafts/GRADUATES-AFFAIRS-MVP-FOUNDATION-01.sql";
const COMPLETION_SQL = "docs/migration-drafts/GRADUATES-AFFAIRS-MVP-COMPLETION-01.sql";

describe("routes stay free of the graduates-affairs surface", () => {
  const routeFiles = walkFiles(join(root, "src/routes")).filter((file) =>
    /\.(ts|tsx)$/.test(file),
  );
  const sources = routeFiles.map((file) => ({
    file: file.slice(root.length + 1).replaceAll("\\", "/"),
    source: readFileSync(file, "utf8"),
  }));

  test("the scan is non-vacuous and precise about graduation-projects", () => {
    expect(sources.length).toBeGreaterThan(0);
    // The unrelated graduation-projects / graduation-candidates surfaces must
    // exist and be covered by the scan without matching the GA pattern below
    // ("graduates-affairs" never collides with "graduation-projects").
    expect(sources.some(({ file }) => file.includes("graduation-projects"))).toBe(true);
    expect(sources.some(({ file }) => file.includes("graduation-candidates"))).toBe(true);
  });

  test("no route file references graduates-affairs modules or graduate_* GA objects", () => {
    for (const { file, source } of sources) {
      expect(source.includes("graduates-affairs"), file).toBe(false);
      // GA-owned object vocabulary only — deliberately not a blanket
      // /graduate_/ so unrelated graduation features can never false-positive.
      expect(
        /graduate_(affairs(?!_manager|_specialist)|record|profile|consent|employment|survey|followup|domain|account|communication|official|contact|event|opportunit|employer)/i.test(
          source,
        ),
        file,
      ).toBe(false);
    }
  });
});

describe("lib contract layer stays pure", () => {
  const libDir = join(root, "src/lib/graduates-affairs");
  const libFiles = readdirSync(libDir).filter((file) => file.endsWith(".ts"));

  test("no createServerFn, no Supabase client, no .rpc( anywhere in the layer", () => {
    expect(libFiles.length).toBeGreaterThan(0);
    for (const file of libFiles) {
      const source = readFileSync(join(libDir, file), "utf8");
      expect(source.includes("createServerFn"), file).toBe(false);
      expect(/from\s+["'][^"']*supabase/i.test(source), file).toBe(false);
      expect(source.includes(".rpc("), file).toBe(false);
    }
  });
});

describe.each([FOUNDATION_SQL, COMPLETION_SQL])("SQL draft %s stays default-deny", (path) => {
  const sql = read(path);

  test("RLS is enabled on every created table", () => {
    const tables = [...sql.matchAll(/CREATE TABLE (public\.\w+)/g)].map((match) => match[1]!);
    expect(tables.length).toBeGreaterThan(0);
    for (const table of tables) {
      expect(sql).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    }
  });

  test("zero CREATE POLICY statements — authorization awaits the G4 package", () => {
    expect(sql).not.toMatch(/CREATE\s+POLICY/i);
    expect(sql).not.toMatch(/DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
  });

  test("every SECURITY DEFINER function pins search_path; client-callable ones are revoked", () => {
    const functions = [...sql.matchAll(/CREATE OR REPLACE FUNCTION (public\.\w+)\s*\([\s\S]*?\$\$;/g)];
    expect(functions.length).toBeGreaterThan(0);
    for (const match of functions) {
      const [block, name] = match;
      if (!/SECURITY DEFINER/.test(block)) continue;
      expect(block, `${name} search_path`).toContain("SET search_path = public, pg_temp");
      // Trigger functions (RETURNS trigger) are internal plumbing; every
      // other SECURITY DEFINER function is a potential client entry point and
      // must stay revoked from PUBLIC/anon/authenticated until the G4 package.
      if (!/RETURNS\s+trigger/i.test(block)) {
        expect(
          new RegExp(
            `REVOKE ALL ON FUNCTION ${name!.replace(".", "\\.")}\\s*\\([^)]*\\) FROM PUBLIC, anon, authenticated`,
          ).test(sql),
          `${name} REVOKE`,
        ).toBe(true);
      }
    }
  });

  test("no client grants sneak in", () => {
    expect(sql).not.toMatch(
      /GRANT\s+(?:ALL|INSERT|UPDATE|DELETE|SELECT|EXECUTE)[^;]*TO\s+(?:PUBLIC|anon|authenticated)/i,
    );
  });
});

describe("reports catalog keeps every ALU-* entry blocked on G4", () => {
  const aluEntries = REPORT_CATALOG_ENTRIES.filter((entry) =>
    entry.report_code.startsWith("ALU-"),
  );

  test("the graduates family is exactly the nine known entries", () => {
    expect(aluEntries.map((entry) => entry.report_code).toSorted()).toEqual([
      "ALU-CANDIDATES-PIPELINE",
      "ALU-COHORT-EMPLOYMENT",
      "ALU-COMMUNICATIONS-LOG",
      "ALU-CONSENT-COMPLIANCE",
      "ALU-GRADUATE-REGISTRY",
      "ALU-GRADUATION-DECISIONS",
      "ALU-QUALITY-INDICATORS",
      "ALU-SURVEY-AGGREGATES",
      "ALU-SURVEY-RESPONSE-RATE",
    ]);
  });

  test("every ALU-* entry stays unrouted with a pending role placeholder", () => {
    for (const entry of aluEntries) {
      expect(entry.route, entry.report_code).toBeNull();
      expect(entry.required_role.length, entry.report_code).toBeGreaterThan(0);
      for (const role of entry.required_role) {
        expect(role.startsWith("pending:"), `${entry.report_code}: ${role}`).toBe(true);
      }
    }
  });

  test("all G4-blocked entries carry the g4_authorization_package placeholder", () => {
    const g4Blocked = aluEntries
      .filter((entry) =>
        entry.required_role.some((role) => role.includes("pending:g4_authorization_package")),
      )
      .map((entry) => entry.report_code)
      .toSorted();
    expect(g4Blocked).toEqual([
      "ALU-COHORT-EMPLOYMENT",
      "ALU-COMMUNICATIONS-LOG",
      "ALU-CONSENT-COMPLIANCE",
      "ALU-GRADUATE-REGISTRY",
      "ALU-GRADUATION-DECISIONS",
      "ALU-QUALITY-INDICATORS",
      "ALU-SURVEY-AGGREGATES",
      "ALU-SURVEY-RESPONSE-RATE",
    ]);
    // Sole documented exception: the candidates-pipeline report rides the
    // live admin graduation-candidates route, so its placeholder names the
    // graduates report-roles decision instead of the G4 package.
    const exceptions = aluEntries
      .filter(
        (entry) =>
          !entry.required_role.some((role) => role.includes("pending:g4_authorization_package")),
      )
      .map((entry) => entry.report_code);
    expect(exceptions).toEqual(["ALU-CANDIDATES-PIPELINE"]);
  });
});

describe("display components keep no network or export surface", () => {
  const componentDir = join(root, "src/components/graduates-affairs");
  const componentFiles = readdirSync(componentDir).filter(
    (file) => file.endsWith(".ts") || file.endsWith(".tsx"),
  );

  test("no fetch, Supabase, server-fn or RPC usage", () => {
    expect(componentFiles.length).toBeGreaterThan(0);
    for (const file of componentFiles) {
      const source = readFileSync(join(componentDir, file), "utf8");
      expect(/from\s+["'][^"']*supabase/i.test(source), file).toBe(false);
      expect(/\bfetch\(|useServerFn|useQuery|useMutation|\.rpc\(/.test(source), file).toBe(false);
    }
  });

  test("no export affordance (csv/xlsx/download/تصدير)", () => {
    for (const file of componentFiles) {
      if (!file.endsWith(".tsx")) continue;
      const source = readFileSync(join(componentDir, file), "utf8");
      expect(/تصدير|download|csv|xlsx/i.test(source), file).toBe(false);
    }
  });
});

describe("D-13 undecided policy denies every capability", () => {
  test("evaluateAccountContinuityAccess fails closed for the full capability set", () => {
    expect(GRADUATE_ACCOUNT_CAPABILITIES.length).toBeGreaterThan(0);
    for (const capability of GRADUATE_ACCOUNT_CAPABILITIES) {
      expect(
        evaluateAccountContinuityAccess(
          ACCOUNT_CONTINUITY_POLICY_UNDECIDED,
          capability,
          "2026-08-01T00:00:00Z",
        ),
        capability,
      ).toEqual({ ok: false, reason: "account_continuity_policy_undecided" });
    }
  });
});

describe("aggregate reporting suppresses small cells and rejects identifying keys", () => {
  const programId = "44444444-4444-4444-8444-444444444444";
  const row = {
    status: "employed" as const,
    specializationRelationship: "directly_related" as const,
    verified: true,
  };

  test("a cohort below 5 suppresses every metric", () => {
    const reports = buildCohortEmploymentReports(
      Array.from({ length: 4 }, () => ({ programId, graduationYear: 2026, row })),
      5,
    );
    expect(reports).toHaveLength(1);
    for (const metric of Object.values(reports[0]!.summary)) {
      expect(metric).toEqual({ total: null, suppressed: true });
    }
  });

  test("each cell below 5 is suppressed individually inside an above-threshold cohort", () => {
    const rows = [
      ...Array.from({ length: 4 }, () => ({ programId, graduationYear: 2026, row })),
      ...Array.from({ length: 2 }, () => ({
        programId,
        graduationYear: 2026,
        row: {
          status: "seeking_work" as const,
          specializationRelationship: "not_assessed" as const,
          verified: false,
        },
      })),
    ];
    const [report] = buildCohortEmploymentReports(rows, 5);
    expect(report!.summary.population).toEqual({ total: 6, suppressed: false });
    // 4 employed and 4 specialization-related and 4 verified are all < 5.
    expect(report!.summary.employed).toEqual({ total: null, suppressed: true });
    expect(report!.summary.specializationRelated).toEqual({ total: null, suppressed: true });
    expect(report!.summary.verified).toEqual({ total: null, suppressed: true });
  });

  test("assertAggregateReportSafe rejects person-identifying keys at any depth", () => {
    expect(assertAggregateReportSafe([{ programId, graduateName: "leak" }])).toEqual({
      ok: false,
      violations: ["report[0].graduateName"],
    });
    for (const key of ["email", "phone", "nationalId", "studentProfileId", "graduateRecordId"]) {
      const verdict = assertAggregateReportSafe([{ summary: { [key]: "leak" } }]);
      expect(verdict.ok, key).toBe(false);
    }
    const reports = buildCohortEmploymentReports(
      Array.from({ length: 6 }, () => ({ programId, graduationYear: 2026, row })),
      5,
    );
    expect(assertAggregateReportSafe(reports)).toEqual({ ok: true });
  });
});
