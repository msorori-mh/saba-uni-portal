import { describe, expect, it } from "bun:test";
import { runFailureInjectionHarness } from "../../scripts/b1-definitive-operator-architecture-14/harness/failure-injection-harness.ts";

describe("PORTAL-B1-PR310-DEFINITIVE-OPERATOR-FAILURE-INJECTION-14", () => {
  it("every mandatory failure-injection scenario results in HOLD", async () => {
    const result = await runFailureInjectionHarness();
    expect(result.ok).toBe(true);
    expect(result.scenarios.length).toBeGreaterThan(0);
    for (const s of result.scenarios) {
      expect(s.ok).toBe(true);
    }
    const holdTokens = result.scenarios.map((s) => s.holdToken);
    expect(holdTokens).toContain("HOLD_OPERATOR_ROLE_ALREADY_EXISTS");
    expect(holdTokens).toContain("OPERATOR_POST_VERIFY_FAIL");
    expect(holdTokens).toContain("EXTRA_FUNCTION_EXECUTE");
    expect(holdTokens).toContain("HOLD_UNEXPECTED_OPERATOR_OWNERSHIP");
    expect(holdTokens).toContain("HOLD_OPEN_OPERATOR_SESSIONS");
    expect(holdTokens).toContain("CASE_INFRASTRUCTURE_OR_UNEXPECTED_DENIAL");
    expect(holdTokens).toContain("HOLD_OBSERVATION_SCOPE_VIOLATION");
    expect(holdTokens).toContain("ATTEMPTED_MISMATCH");
    expect(holdTokens).toContain("UNEXPECTED_ALLOW");
    expect(holdTokens).toContain("FINGERPRINT_MUTATION");
    expect(holdTokens).toContain("FUNCTION_HASH_DRIFT");
    expect(holdTokens).toContain("FIXTURE_STATE_DRIFT");
  });
});
