import { describe, expect, it } from "bun:test";
import { B1_WORKFLOWS } from "../../src/lib/student-requests/request-service-adapter";
import {
  canActOnTransferOrFinalChanceStep,
  getB102ActivationDecision,
  resolveTransferDepartmentAssignments,
} from "../../src/lib/student-requests/transfer-final-chance-contract";

const heads = [
  { departmentId: "source", facultyProfileId: "source-head", unit: "department", role: "department_head", active: true },
  { departmentId: "target", facultyProfileId: "target-head", unit: "department", role: "department_head", active: true },
];

describe("B1-02 transfer and final-chance source contract", () => {
  it("resolves exactly one directly assigned head for each distinct department", () => {
    expect(resolveTransferDepartmentAssignments({ sourceDepartmentId: "source", targetDepartmentId: "target", candidates: heads })).toEqual({
      ok: true,
      assignments: {
        sourceDepartmentId: "source",
        targetDepartmentId: "target",
        sourceHeadFacultyProfileId: "source-head",
        targetHeadFacultyProfileId: "target-head",
      },
    });
    expect(resolveTransferDepartmentAssignments({ sourceDepartmentId: "source", targetDepartmentId: "source", candidates: heads })).toEqual({ ok: false, reason: "same_department_transfer" });
    expect(resolveTransferDepartmentAssignments({ sourceDepartmentId: "source", targetDepartmentId: "missing", candidates: heads })).toEqual({ ok: false, reason: "target_department_head_not_found" });
    expect(resolveTransferDepartmentAssignments({ sourceDepartmentId: "source", targetDepartmentId: "target", candidates: [...heads, { ...heads[0], facultyProfileId: "other" }] })).toEqual({ ok: false, reason: "source_ambiguous_department_head" });
  });

  it("allows only the pinned chair on the matching department step", () => {
    const base = { service: "department_transfer" as const, action: "approve", predecessorComplete: true, sourceDepartmentId: "source", targetDepartmentId: "target" };
    expect(canActOnTransferOrFinalChanceStep({ ...base, stepKey: "source_department_head_approval", assignedFacultyProfileId: "source-head", actor: { facultyProfileId: "source-head", unit: "department", role: "department_head", departmentId: "source" } })).toBe(true);
    expect(canActOnTransferOrFinalChanceStep({ ...base, stepKey: "source_department_head_approval", assignedFacultyProfileId: "source-head", actor: { facultyProfileId: "target-head", unit: "department", role: "department_head", departmentId: "target" } })).toBe(false);
    for (const role of ["admin", "registrar_general", "dean"]) {
      expect(canActOnTransferOrFinalChanceStep({ ...base, stepKey: "source_department_head_approval", assignedFacultyProfileId: "source-head", actor: { facultyProfileId: "source-head", unit: "department", role, departmentId: "source" } })).toBe(false);
    }
  });

  it("requires the predecessor, exact action, unit, role and direct assignee on every step", () => {
    for (const service of ["department_transfer", "final_chance"] as const) {
      for (const step of B1_WORKFLOWS[service]) {
        if (step.role === "department_head") continue;
        const base = { service, stepKey: step.key, assignedFacultyProfileId: "assigned", actor: { facultyProfileId: "assigned", unit: step.unit, role: step.role }, action: step.action, predecessorComplete: true };
        expect(canActOnTransferOrFinalChanceStep(base)).toBe(true);
        expect(canActOnTransferOrFinalChanceStep({ ...base, predecessorComplete: false })).toBe(false);
        expect(canActOnTransferOrFinalChanceStep({ ...base, assignedFacultyProfileId: null })).toBe(false);
        expect(canActOnTransferOrFinalChanceStep({ ...base, action: "approve" === step.action ? "review" : "approve" })).toBe(false);
      }
    }
  });

  it("records the approved external university confirmation policy as go-live ready", () => {
    expect(getB102ActivationDecision("department_transfer")).toEqual({
      status: "SOURCE_POLICY_APPROVED",
      policy: "EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION",
      activationBlockedReason: undefined,
      runtimeAvailable: true,
    });
    expect(getB102ActivationDecision("final_chance")).toEqual({
      status: "SOURCE_POLICY_APPROVED",
      policy: "EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION",
      activationBlockedReason: undefined,
      runtimeAvailable: true,
    });
  });
});
