import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION,
  canAdvanceAfterExternalPaymentConfirmation,
  validateExternalPaymentConfirmationInput,
} from "../../src/lib/student-requests/external-payment-confirmation-contract";
import { B1_WORKFLOWS, canActOnB1Step } from "../../src/lib/student-requests/request-service-adapter";

describe("external university payment confirmation", () => {
  it("records only request and optional note input", () => {
    expect(EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION).toBe("EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION");
    expect(validateExternalPaymentConfirmationInput({ requestId: " request-1 ", note: " received externally " })).toEqual({
      valid: true,
      normalized: { requestId: "request-1", note: "received externally" },
    });
    const source = readFileSync(join(process.cwd(), "src", "lib", "student-requests", "external-payment-confirmation-contract.ts"), "utf8");
    for (const forbidden of ["amount", "currency", "feeTypeCode", "invoice", "gatewayTransaction", "internalBalance", "paymentReference"]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("advances only after confirmation", () => {
    expect(canAdvanceAfterExternalPaymentConfirmation("awaiting_payment_confirmation")).toBe(false);
    expect(canAdvanceAfterExternalPaymentConfirmation("payment_not_confirmed")).toBe(false);
    expect(canAdvanceAfterExternalPaymentConfirmation("payment_confirmed")).toBe(true);
  });

  it("keeps the legacy final-chance portal path fail-closed", () => {
    const portal = readFileSync(join(process.cwd(), "src", "components", "portal", "StudentRequestsSection.tsx"), "utf8");
    const modal = portal.slice(portal.indexOf("function ExtraChanceModal"), portal.indexOf("function TransferModal"));
    expect(modal).not.toContain('.from("student_requests").insert');
    expect(modal).not.toContain('.from("extra_chance_details").insert');
    expect(modal).not.toContain("<Actions");
    expect(modal).toContain("التقديم مغلق مؤقتاً");
  });

  it("keeps the legacy transfer portal action unreachable until runtime exists", () => {
    const portal = readFileSync(join(process.cwd(), "src", "components", "portal", "StudentRequestsSection.tsx"), "utf8");
    const modal = portal.slice(portal.indexOf("function TransferModal"), portal.indexOf("type EqCourseRow"));
    expect(modal).not.toContain("<Actions");
    expect(modal).toContain("التقديم مغلق مؤقتاً");
  });

  for (const service of ["department_transfer", "final_chance"] as const) {
    it(`${service}: allows only the directly assigned finance actor`, () => {
      const step = B1_WORKFLOWS[service].find((item) => item.key === "payment_confirmation")!;
      const base = {
        step,
        assignedFacultyProfileId: "finance-assignee",
        actor: { facultyProfileId: "finance-assignee", unit: "finance", role: "revenue_finance_officer" },
        action: "confirm_payment",
        predecessorComplete: true,
      };
      expect(canActOnB1Step(base)).toBe(true);
      expect(canActOnB1Step({ ...base, actor: { ...base.actor, facultyProfileId: "same-role-other-user" } })).toBe(false);
      for (const role of ["admin", "registrar_general", "dean"]) {
        expect(canActOnB1Step({ ...base, actor: { ...base.actor, role } })).toBe(false);
      }
      expect(canActOnB1Step({ ...base, predecessorComplete: false })).toBe(false);
    });
  }
});
