import { describe, expect, it } from "bun:test";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const buildScript = join(
  root,
  "scripts",
  "b1-definitive-operator-architecture-14",
  "build-canonical-b1-fixture.ts",
);
const fixturePath = join(
  root,
  "scripts",
  "b1-definitive-operator-architecture-14",
  "generated",
  "canonical-b1-fixture.sql",
);

function buildFixture(): string {
  execSync(`bun ${buildScript}`, { cwd: root, stdio: "pipe" });
  return readFileSync(fixturePath, "utf8");
}

describe("PORTAL-B1-PR310-FIXTURE-REPRODUCIBILITY-14", () => {
  it("generates a deterministic fixture byte-for-byte across runs", () => {
    const first = buildFixture();
    const second = buildFixture();
    expect(second.length).toBe(first.length);
    expect(second).toBe(first);
  });

  it("never references b1_matrix_operator before the role is created", () => {
    const sql = buildFixture();
    const lines = sql.split(/\r?\n/);
    let createRoleLine = -1;
    const operatorHits: number[] = [];
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]!;
      if (/^\s*CREATE\s+ROLE\s+b1_matrix_operator\b/i.test(line)) {
        createRoleLine = i;
        break;
      }
      if (/\bb1_matrix_operator\b/i.test(line)) {
        operatorHits.push(i);
      }
    }
    // The canonical fixture load must be completely free of operator references;
    // operator provisioning happens only after the fixture is loaded.
    expect(createRoleLine).toBe(-1);
    expect(operatorHits).toEqual([]);
  });

  it("contains no blind DROP OWNED cleanup", () => {
    const sql = buildFixture();
    expect(sql).not.toMatch(/DROP\s+OWNED\b/i);
  });

  it("contains no PUBLIC/anon/authenticated/service_role EXECUTE grants to observer functions", () => {
    const sql = buildFixture();
    const observerGrantRe =
      /^\s*GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.b1_observer_[^(]+\([^)]*\)\s+TO\s+(PUBLIC|anon|authenticated|service_role)\s*;/im;
    expect(sql).not.toMatch(observerGrantRe);
  });
});
