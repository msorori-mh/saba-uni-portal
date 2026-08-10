import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const packagePath = join(
  root,
  "docs/B1-D02-READONLY-PRODUCTION-PREFLIGHT-PACKAGE-01.md",
);

const sql = readFileSync(packagePath, "utf8").toLowerCase();

describe("B1-D02 chair sensor source contract", () => {
  it("does not rely on substring chair matching", () => {
    expect(sql).not.toContain("ilike '%chair%'");
    expect(sql).not.toContain("like '%chair%'");
    expect(sql).not.toContain("'%chair%'");
  });

  it("uses exact semantic anchors: department unit + department_head role", () => {
    expect(sql).toContain("u.code = 'department'");
    expect(sql).toContain("r.code = 'department_head'");
  });

  it("restricts chair identity to faculty_profile assignment type", () => {
    expect(sql).toContain("a.assignment_type = 'faculty_profile'");
  });

  it("counts only currently effective active assignments", () => {
    expect(sql).toContain("a.is_active");
    expect(sql).toContain("starts_at");
    expect(sql).toContain("ends_at");
  });

  it("does not treat source SHA as deployed proof", () => {
    expect(sql).not.toContain("0e2d25c9a2d7923ce74cfae079b99691d61eb1b6");
    expect(sql).toContain("never");
    expect(sql).toContain("deployed proof");
  });
});
