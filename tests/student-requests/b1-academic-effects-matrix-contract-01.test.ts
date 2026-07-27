import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("B1 academic effects authz matrix harness contract", () => {
  test("harness covers positive/deny/zero/idempotent/rollback/ec regression", () => {
    const runner = read("tests/b1-academic-effects/run-harness.ps1");
    const matrix = read("tests/b1-academic-effects/pg/20-effect-authz-matrix.sql");
    const summarize = read("tests/b1-academic-effects/pg/30-summarize.sql");

    expect(runner).toContain("20260727120000_b1_25_academic_effect_markers_01.sql");
    expect(runner).toContain("20260727120100_b1_26_academic_effect_functions_01.sql");
    expect(runner).toContain("20260727120200_b1_27_act_on_academic_effect_integration_01.sql");
    expect(runner).toContain("PASS_B1_ACADEMIC_EFFECTS_AUTHZ_MATRIX");

    for (const needle of [
      "positive/suspension",
      "positive/absence",
      "positive/transfer",
      "positive/final_chance",
      "positive/file_withdrawal",
      "deny/wrong_actor",
      "deny/wrong_step",
      "deny/wrong_action",
      "deny/incomplete_predecessor",
      "zero/wrong_actor",
      "idempotent/",
      "rollback/savepoint",
      "regression/enrollment_certificate",
    ]) {
      expect(matrix).toContain(needle);
    }

    expect(summarize).toContain("positive=%");
    expect(summarize).toContain("ec_regression=%");
    expect(runner).toContain("POSITIVE=5");
    expect(runner).toContain("EC_REGRESSION=NONE");
    expect(matrix).not.toMatch(/student_visible\s*=\s*true/i);
  });
});
