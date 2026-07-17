import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  B1_ACTION_OUTCOME,
  B1_CANONICAL_CODES,
  B1_FEE_POLICIES,
  B1_SERVICE_ADAPTERS,
  B1_WORKFLOWS,
  CHANCE_TYPE_ACTIVATION_BLOCK,
  CHANCE_TYPE_VALUES,
  canActOnB1Step,
  canSubmitWithReferenceData,
  getRequestServiceAdapter,
  isRealAttachmentReference,
  isResolvedReferenceValue,
  parseChanceTypeCompatibility,
  resolveDirectDepartmentHead,
  roundTripChanceType,
} from "../../src/lib/student-requests/request-service-adapter";
import {
  getDbCodesForRequestTypeFilter,
  getStudentRequestTypeDefinition,
  normalizeStudentRequestTypeCode,
} from "../../src/lib/student-requests/request-type-registry";
import { getCanonicalWorkflowPreview } from "../../src/lib/student-requests/request-workflow-preview-registry";
import { buildStudentRequestDetailPersistencePlan } from "../../src/lib/student-requests/student-request-submit-contract";
import { ATOMIC_STUDENT_REQUEST_SUBMIT_CAPABILITY } from "../../src/lib/student-request-rpc";

describe("B1 canonical and stored-code compatibility", () => {
  it("normalizes stored aliases without renaming canonical codes", () => {
    expect(normalizeStudentRequestTypeCode("transfer")).toBe("department_transfer");
    expect(normalizeStudentRequestTypeCode("extra_chance")).toBe("final_chance");
    for (const code of B1_CANONICAL_CODES) expect(normalizeStudentRequestTypeCode(code)).toBe(code);
  });
  it("passes an unknown code through safely and returns no definition", () => {
    expect(normalizeStudentRequestTypeCode("unknown_b1")).toBe("unknown_b1");
    expect(getStudentRequestTypeDefinition("unknown_b1")).toBeUndefined();
  });
  it("expands canonical filters to stored legacy codes", () => {
    expect(new Set(getDbCodesForRequestTypeFilter("department_transfer"))).toEqual(new Set(["department_transfer", "transfer"]));
    expect(new Set(getDbCodesForRequestTypeFilter("final_chance"))).toEqual(new Set(["final_chance", "extra_chance"]));
  });
  it("keeps enrollment_certificate identity and policy unchanged", () => {
    const def = getStudentRequestTypeDefinition("enrollment_certificate");
    expect(def?.code).toBe("enrollment_certificate");
    expect([def?.requiresFee, def?.producesDocument, def?.requiresArchive]).toEqual([true, true, true]);
  });
});

describe("B1 adapter, reference and detail foundation", () => {
  it("registers all five services and aliases", () => {
    expect(Object.keys(B1_SERVICE_ADAPTERS)).toEqual([...B1_CANONICAL_CODES]);
    expect(getRequestServiceAdapter("transfer")?.canonicalCode).toBe("department_transfer");
    expect(getRequestServiceAdapter("extra_chance")?.canonicalCode).toBe("final_chance");
  });
  it("keeps detail bindings metadata-only and submit runtime unavailable", () => {
    for (const adapter of Object.values(B1_SERVICE_ADAPTERS)) {
      expect(adapter.detailBinding.clientWriteAllowed).toBe(false);
      expect(adapter.submit.transactionRequired).toBe(true);
      expect(adapter.submit.workflowStartsAfterValidation).toBe(true);
      expect(adapter.submit.runtimeAvailable).toBe(false);
    }
  });
  it("fails closed while reference data is loading, missing, or failed", () => {
    const resolvers = B1_SERVICE_ADAPTERS.enrollment_suspension.referenceResolvers;
    expect(canSubmitWithReferenceData(resolvers, {})).toBe(false);
    expect(canSubmitWithReferenceData(resolvers, { academic_years: { status: "loading", options: [] } })).toBe(false);
    expect(canSubmitWithReferenceData(resolvers, { academic_years: { status: "error", options: [], message: "failed" } })).toBe(false);
  });
  it("accepts only values returned by ready resolvers and rejects placeholders", () => {
    const ready = { status: "ready", options: [{ value: "real-id", labelAr: "فعلي" }] } as const;
    expect(isResolvedReferenceValue(ready, "real-id")).toBe(true);
    expect(isResolvedReferenceValue(ready, "other-id")).toBe(false);
    expect(isResolvedReferenceValue({ status: "ready", options: [{ value: "placeholder-id", labelAr: "x" }] }, "placeholder-id")).toBe(false);
  });
  it("requires a real uploaded attachment reference", () => {
    expect(isRealAttachmentReference({ fileName: "excuse.pdf", storagePath: "student-requests/u/r.pdf" })).toBe(true);
    expect(isRealAttachmentReference({ fileName: "placeholder.pdf", storagePath: "placeholder" })).toBe(false);
    expect(isRealAttachmentReference({ fileName: "excuse.pdf" })).toBe(false);
  });
});

describe("B1 workflows and payment policy", () => {
  it("encodes the exact free suspension and absence workflows", () => {
    expect(B1_WORKFLOWS.enrollment_suspension.map((s) => [s.key, s.unit, s.role, s.action])).toEqual([
      ["initial_review", "student_affairs", "student_affairs_specialist", "review"],
      ["manager_approval", "student_affairs", "student_affairs_manager", "approve"],
      ["registrar_apply", "registrar", "registrar_general", "apply_decision"],
    ]);
    expect(B1_WORKFLOWS.excused_absence.map((s) => s.key)).toEqual(["student_affairs_intake", "manager_review", "record_apply"]);
  });
  it("encodes file withdrawal as a non-parallel seven-step chain", () => {
    expect(B1_WORKFLOWS.file_withdrawal.map((s) => s.key)).toEqual([
      "student_affairs_intake", "library_clearance", "labs_clearance", "activities_clearance",
      "finance_clearance", "registrar_apply", "archive",
    ]);
    expect(B1_WORKFLOWS.file_withdrawal.every((s) => !["sign", "assess_fee", "confirm_payment"].includes(s.action))).toBe(true);
  });
  it("requires fee assessment then external manual confirmation for paid services", () => {
    for (const code of ["department_transfer", "final_chance"] as const) {
      expect(B1_FEE_POLICIES[code]).toBe("PAID_EXTERNAL_MANUAL_CONFIRMATION");
      const keys = B1_WORKFLOWS[code].map((s) => s.key);
      expect(keys.indexOf("fee_assessment")).toBeLessThan(keys.indexOf("payment_confirmation"));
      expect(B1_SERVICE_ADAPTERS[code].activationBlockedReason).toBeTruthy();
    }
  });
  it("keeps free services free and document-free in their previews", () => {
    for (const code of ["enrollment_suspension", "excused_absence", "file_withdrawal"] as const) {
      expect(B1_FEE_POLICIES[code]).toBe("FREE_NO_PAYMENT");
      const preview = getCanonicalWorkflowPreview(code)!;
      expect(preview.steps.some((s) => s.requiresFee || s.issuesDocument || s.actionType === "sign" || s.actionType === "issue_document")).toBe(false);
    }
  });
  it("maps actions explicitly with no fallback", () => {
    expect(B1_ACTION_OUTCOME).toEqual({
      review: "reviewed", approve: "approved", clear: "cleared", apply_decision: "applied",
      archive: "archived", assess_fee: "fee_assessed", confirm_payment: "payment_confirmed",
    });
  });
});

describe("B1 direct assignment and authorization source contract", () => {
  for (const [service, steps] of Object.entries(B1_WORKFLOWS)) {
    for (const step of steps) {
      it(`${service}/${step.key}: allows only exact direct assignee, unit, role, action and predecessor`, () => {
        const base = { step, assignedFacultyProfileId: "assigned", actor: { facultyProfileId: "assigned", unit: step.unit, role: step.role }, action: step.action, predecessorComplete: true };
        expect(canActOnB1Step(base)).toBe(true);
        expect(canActOnB1Step({ ...base, actor: { ...base.actor, facultyProfileId: "same-role-other-user" } })).toBe(false);
        expect(canActOnB1Step({ ...base, actor: { ...base.actor, unit: "wrong" } })).toBe(false);
        expect(canActOnB1Step({ ...base, actor: { ...base.actor, role: "wrong" } })).toBe(false);
        expect(canActOnB1Step({ ...base, assignedFacultyProfileId: null })).toBe(false);
        for (const role of ["admin", "registrar_general", "dean"]) {
          expect(canActOnB1Step({ ...base, actor: { ...base.actor, facultyProfileId: "bypass-actor", role } })).toBe(false);
        }
        expect(canActOnB1Step({ ...base, action: "wrong_action" })).toBe(false);
        expect(canActOnB1Step({ ...base, predecessorComplete: false })).toBe(false);
      });
    }
  }
  it("resolves exactly one active same-department head and fails closed otherwise", () => {
    const head = { departmentId: "source", facultyProfileId: "head-source", unit: "department", role: "department_head", active: true };
    expect(resolveDirectDepartmentHead("source", [head])).toEqual({ ok: true, facultyProfileId: "head-source" });
    expect(resolveDirectDepartmentHead(null, [head])).toEqual({ ok: false, reason: "missing_department_id" });
    expect(resolveDirectDepartmentHead("target", [head])).toEqual({ ok: false, reason: "department_head_not_found" });
    expect(resolveDirectDepartmentHead("source", [head, { ...head, facultyProfileId: "other" }])).toEqual({ ok: false, reason: "ambiguous_department_head" });
  });
});

describe("B1 chance compatibility and submit extension", () => {
  it("knows all four chance values, rejects unknown and preserves round trips", () => {
    for (const value of CHANCE_TYPE_VALUES) {
      expect(parseChanceTypeCompatibility(value)).toBe(value);
      expect(roundTripChanceType(value)).toBe(value);
    }
    expect(parseChanceTypeCompatibility("invented_mapping")).toBeNull();
    expect(CHANCE_TYPE_ACTIVATION_BLOCK).toBe("NEEDS_USER_DECISION_FOR_ACADEMIC_MAPPING");
  });
  it("exposes an optional non-runtime persistence plan without breaking legacy RPC", () => {
    expect(buildStudentRequestDetailPersistencePlan("extra_chance")).toMatchObject({ canonicalCode: "final_chance", runtimeAvailable: false });
    expect(buildStudentRequestDetailPersistencePlan("enrollment_certificate")).toBeNull();
    expect(ATOMIC_STUDENT_REQUEST_SUBMIT_CAPABILITY).toMatchObject({ available: false, transactionRequired: true, validatesBeforeWorkflow: true });
  });
  it("keeps the SQL source a non-applied draft with no invented financial values", () => {
    const sql = readFileSync(join(process.cwd(), "docs", "migration-drafts", "REQUEST-B1-SHARED-FOUNDATION-SOURCE-01.sql"), "utf8");
    expect(sql).toContain("DRAFT ONLY");
    expect(sql).toContain("NEEDS_USER_DECISION_FOR_ACADEMIC_MAPPING");
    expect(sql).toContain("never fall back to the role pool");
    expect(sql).not.toMatch(/INSERT\s+INTO|UPDATE\s+public|DELETE\s+FROM/i);
    expect(sql).not.toMatch(/fee_type\.code\s*=|amount\s*=|currency\s*=/i);
  });
});
