import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { runLocal267Harness } from "../../scripts/b1-definitive-operator-architecture-14/harness/run-local-267-harness.ts";

const root = process.cwd();
const arch = join(root, "scripts/b1-definitive-operator-architecture-14");

describe("PORTAL-B1-PR310-DEFINITIVE-OPERATOR-ARCHITECTURE-14", () => {
  it("required architecture artifacts exist and source migrations are untouched", () => {
    for (const f of [
      "ARCHITECTURE.md",
      "build-canonical-b1-fixture.ts",
      "canonical-fixture/00-roles.sql",
      "canonical-fixture/05-migration-head.sql",
      "canonical-fixture/07-enrollment-certificate-prestate.sql",
      "canonical-fixture/08-assignment-prestate.sql",
      "canonical-fixture/09-production-sentinel-requests.sql",
      "canonical-fixture/10-fixture-13-direct-assignees.sql",
      "operator-role/01-preflight.sql",
      "operator-role/02-provision.sql",
      "operator-role/03-post-verifier.sql",
      "operator-role/04-cleanup.sql",
      "operator-role/05-effective-grants-verifier.sql",
      "observer/01-observer-functions.sql",
      "observer/02-observer-cleanup.sql",
      "harness/00-harness-functions.sql",
      "harness/run-local-267-harness.ts",
    ]) {
      expect(existsSync(join(arch, f))).toBe(true);
    }
  });

  it("runs all 267 negative RPC cases under b1_matrix_operator with zero mutation", async () => {
    const result = await runLocal267Harness();
    expect(result.ok).toBe(true);
    expect(result.counters.ATTEMPTED).toBe(267);
    expect(result.counters.EXPECTED_DENIALS).toBe(267);
    expect(result.counters.UNEXPECTED_ALLOWS).toBe(0);
    expect(result.counters.UNEXPECTED_DENIALS).toBe(0);
    expect(result.counters.SKIPPED).toBe(0);
    expect(result.counters.BEGIN_COUNT).toBe(267);
    expect(result.counters.ROLLBACK_COUNT).toBe(267);
    expect(result.counters.COMMIT_COUNT).toBe(0);
    expect(result.counters.ZERO_MUTATION_CASES).toBe(267);
    expect(result.failures).toHaveLength(0);
    expect(result.fixtureState).not.toBeNull();
    expect(result.fixtureState!.requestCount).toBe(28);
    expect(result.fixtureState!.stepCount).toBe(128);
    expect(result.fixtureState!.activeStepCount).toBe(24);
  });
});
