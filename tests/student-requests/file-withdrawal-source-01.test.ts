import { describe, expect, it } from "bun:test";
import {
  FILE_WITHDRAWAL_FEE_POLICY,
  FILE_WITHDRAWAL_STEPS,
  canActOnFileWithdrawalStep,
  canCompleteFileWithdrawalStep,
  validateFileWithdrawalForm,
} from "../../src/lib/student-requests/file-withdrawal-contract";
import { getCanonicalWorkflowPreview } from "../../src/lib/student-requests/request-workflow-preview-registry";
import { getParallelClearanceRequirementForRequestType } from "../../src/lib/student-requests/parallel-clearance-contract";
import { getDocumentDefinitionsForRequestType } from "../../src/lib/student-requests/request-document-archive-contract";

describe("file_withdrawal source contract", () => {
  it("validates the required student fields", () => {
    expect(validateFileWithdrawalForm({ withdrawal_reason: "سبب واضح ومفصل", impact_acknowledgment: true }).valid).toBe(true);
    expect(validateFileWithdrawalForm({ withdrawal_reason: "قصير", impact_acknowledgment: false }).errors).toEqual({
      withdrawal_reason: expect.any(String), impact_acknowledgment: expect.any(String),
    });
  });

  it("encodes the sequential unit and role chain, including interim activities ownership", () => {
    expect(FILE_WITHDRAWAL_STEPS.map(({ key, unit, role }) => [key, unit, role])).toEqual([
      ["student_affairs_intake", "student_affairs", "student_affairs_specialist"],
      ["library_clearance", "library", "library_officer"],
      ["labs_clearance", "labs", "labs_manager"],
      ["activities_clearance", "student_affairs", "student_affairs_manager"],
      ["finance_clearance", "finance", "revenue_finance_officer"],
      ["registrar_apply", "registrar", "registrar_general"],
      ["archive", "archive", "archive_officer"],
    ]);
  });

  const assignedLibraryOfficer = { userId: "library-user", directlyAssignedUserId: "library-user", unit: "library", role: "library_officer" };

  it("allows only the directly assigned actor in the exact unit and role", () => {
    expect(canActOnFileWithdrawalStep("library_clearance", assignedLibraryOfficer)).toBe(true);
    expect(canActOnFileWithdrawalStep("library_clearance", { ...assignedLibraryOfficer, unit: "labs" })).toBe(false);
    expect(canActOnFileWithdrawalStep("library_clearance", { ...assignedLibraryOfficer, role: "labs_manager" })).toBe(false);
    expect(canActOnFileWithdrawalStep("library_clearance", { ...assignedLibraryOfficer, directlyAssignedUserId: null })).toBe(false);
  });

  it("provides no registrar, admin, or dean bypass", () => {
    for (const role of ["registrar_general", "admin", "dean"]) {
      expect(canActOnFileWithdrawalStep("library_clearance", { ...assignedLibraryOfficer, role })).toBe(false);
    }
  });

  it("blocks skipping incomplete clearances and premature archive", () => {
    expect(canCompleteFileWithdrawalStep("labs_clearance", { student_affairs_intake: true })).toBe(false);
    expect(canCompleteFileWithdrawalStep("archive", {
      student_affairs_intake: true, library_clearance: true, labs_clearance: true,
      activities_clearance: true, finance_clearance: true,
    })).toBe(false);
    expect(canCompleteFileWithdrawalStep("archive", {
      student_affairs_intake: true, library_clearance: true, labs_clearance: true,
      activities_clearance: true, finance_clearance: true, registrar_apply: true,
    })).toBe(true);
  });

  it("is free and forbids portal payment data", () => {
    expect(FILE_WITHDRAWAL_FEE_POLICY).toEqual({ feeRequired: false, portalPaymentAllowed: false, amountOrCurrencyAllowed: false });
  });

  it("keeps the shared preview aligned with the source contract", () => {
    const preview = getCanonicalWorkflowPreview("file_withdrawal");
    expect(preview?.steps.map(({ key, processingUnitCode, roleKey, actionType }) => [
      key, processingUnitCode, roleKey, actionType,
    ])).toEqual(FILE_WITHDRAWAL_STEPS.map(({ key, unit, role, action }) => [key, unit, role, action]));
    expect(preview?.steps.every((step) => !step.requiresFee && !step.issuesDocument && !step.isParallel)).toBe(true);
    expect(preview?.steps.some((step) => step.roleKey === "admin" || step.roleKey === "dean")).toBe(false);
  });

  it("disables the obsolete parallel-clearance and document contracts", () => {
    expect(getParallelClearanceRequirementForRequestType("file_withdrawal")).toEqual({
      parallelClearanceRequired: false,
      groupKey: null,
      expectedMemberCount: 0,
    });
    expect(getDocumentDefinitionsForRequestType("file_withdrawal")).toEqual([]);
  });
});
