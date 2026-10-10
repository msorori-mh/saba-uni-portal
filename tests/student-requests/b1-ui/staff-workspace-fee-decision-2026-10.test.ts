import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { isB1FeeDecisionStep } from "../../../src/lib/student-requests/b1-fee-decision-contract";

const workspace = readFileSync("src/components/student-requests/b1/B1StaffWorkspace.tsx", "utf8");

describe("staff workspace — registrar fee decision (2026-10 gap)", () => {
  test("the fee step renders the decision card, not the plain review panel", () => {
    const card = workspace.indexOf("<B1FeeDecisionCard");
    const generic = workspace.indexOf(") : details.allowedAction ? (");
    expect(card).toBeGreaterThan(0);
    expect(generic).toBeGreaterThan(card);
    expect(workspace).toContain('details.allowedAction === "review" &&');
    expect(workspace).toContain("isB1FeeDecisionStep(details.serviceCode, details.stepKey)");
  });

  test("the decision goes through the dedicated executor, never a plain step action", () => {
    const fn = workspace.slice(workspace.indexOf("const recordFeeDecision"), workspace.indexOf("const exitAct"));
    expect(fn).toContain("adapter.recordB1ExcusedAbsenceFeeDecision(");
    expect(fn).not.toContain("actOnB1RequestStep");
    expect(fn).toContain('throw new Error("B1_STEP_ID_MISMATCH")');
    expect(fn).toContain("getB1FeeDecisionService(details.serviceCode)");
  });

  test("return / reject are offered only through the service contract", () => {
    expect(workspace).toContain("getB1StepExitActions(details.serviceCode, details.stepKey)");
    expect(workspace).toContain('if (action !== "return" && action !== "reject") throw new Error("B1_ACTION_TYPE_MISMATCH")');
  });

  test("contract covers the three services' registrar steps only", () => {
    expect(isB1FeeDecisionStep("excused_absence", "registrar_fee_referral")).toBe(true);
    expect(isB1FeeDecisionStep("department_transfer", "registrar_fee_decision")).toBe(true);
    expect(isB1FeeDecisionStep("final_chance", "registrar_fee_decision")).toBe(true);
    expect(isB1FeeDecisionStep("excused_absence", "dean_review")).toBe(false);
    expect(isB1FeeDecisionStep("enrollment_certificate", "registrar_fee_referral")).toBe(false);
  });
});
