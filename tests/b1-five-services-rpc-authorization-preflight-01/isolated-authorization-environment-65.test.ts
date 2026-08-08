import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isStoredAsLf, toCrlf, toLf } from "./eol";

const root = process.cwd();

/** Central EOL normalization (70): assertions must hold on LF and CRLF checkouts. */
const CASES_REL = "scripts/b1-isolated-authorization-env-65/41-negative-cases.sql";
const RENDERER_REL = "scripts/b1-isolated-authorization-env-65/40-generate-iso-matrix.py";
const matrix = JSON.parse(
  toLf(readFileSync(join(root, "scripts/b1-isolated-authorization-env-65/ISO-MATRIX.json"), "utf8")),
);
const cases = toLf(readFileSync(join(root, CASES_REL), "utf8"));
const renderer = toLf(readFileSync(join(root, RENDERER_REL), "utf8"));
const report = toLf(readFileSync(
  join(root, "docs/PORTAL-B1-ISOLATED-NONPRODUCTION-AUTHORIZATION-ENVIRONMENT-65-REPORT.md"),
  "utf8",
));


describe("PORTAL-65 — isolated non-production authorization environment", () => {
  it("targets an isolated TEST_ONLY environment, never production or staging", () => {
    expect(matrix.environment.kind).toBe("ISOLATED_NON_PRODUCTION");
    expect(matrix.environment.production_ref).toBeNull();
    expect(matrix.environment.staging_ref).toBeNull();
    expect(matrix.environment.data_policy).toBe("TEST_ONLY_ONLY");
  });

  it("reaches 267 executable cases with zero blocked", () => {
    expect(matrix.counts).toMatchObject({ total: 267, executable: 267, blocked: 0 });
    const all = [
      ...matrix.negative_cases,
      ...matrix.illegal_action_cases,
      ...matrix.supplemental_department_scope_cases,
    ];
    expect(all).toHaveLength(267);
    for (const c of all) {
      expect(c.expect).toBe("DENY");
      expect(c.zero_mutation).toBe(true);
      expect(c.execution_status).toBe("EXECUTABLE");
    }
  });

  it("covers all 24 B1 staff steps with active isolated fixtures", () => {
    const fixtures = Object.values(matrix.fixtures) as Array<{
      request_number: string;
      target_step_order: number;
      steps: Array<{ step_order: number; status: string }>;
    }>;
    expect(fixtures).toHaveLength(24);
    for (const f of fixtures) {
      expect(f.request_number.startsWith("ISO-TESTONLY-")).toBe(true);
      const target = f.steps.find((s) => s.step_order === f.target_step_order);
      expect(target?.status).toBe("active");
    }
  });

  it("renders one generated SQL case per matrix row and is stored as LF", () => {
    expect(cases.match(/pg_temp\.iso_neg_case\(/g) ?? []).toHaveLength(267);
    for (const rel of [
      CASES_REL,
      RENDERER_REL,
      "scripts/b1-isolated-authorization-env-65/ISO-MATRIX.json",
      "scripts/b1-isolated-authorization-env-65/42-negative-harness.sql",
    ]) {
      expect([rel, isStoredAsLf(rel)]).toEqual([rel, true]);
    }
  });

  it("forces deterministic LF writes in the generator, independent of the host OS", () => {
    const openLines = renderer.split("\n").filter((l) => l.includes("open("));
    expect(openLines.length).toBeGreaterThan(0);
    for (const line of openLines) {
      // explicit UTF-8 on every handle: a CRLF input still decodes to LF text
      expect([line, line.includes('encoding="utf-8"')]).toEqual([line, true]);
      // and every write handle pins newline="\n" so output never becomes CRLF
      if (line.includes('"w"')) {
        expect([line, line.includes('newline="\\n"')]).toEqual([line, true]);
      }
    }
  });


  it("is EOL portable: a CRLF twin yields the identical case set and no semantic diff", () => {
    const crlf = toCrlf(cases);
    expect(toLf(crlf)).toBe(cases);
    expect(toLf(crlf).match(/pg_temp\.iso_neg_case\(/g) ?? []).toHaveLength(267);
    expect(crlf.replace(/\s+/g, " ").trim()).toBe(cases.replace(/\s+/g, " ").trim());
  });


  it("records the PASS decision and zero production impact", () => {
    expect(report).toContain("PASS_B1_ISOLATED_AUTHORIZATION_ENVIRONMENT_267_EXECUTABLE_0_BLOCKED");
    expect(report).toContain("ISO_NEG_MATRIX total=267 fail=0 drift=NONE");
    expect(report).toContain("كتابات إنتاجية: **0**");
  });
});
