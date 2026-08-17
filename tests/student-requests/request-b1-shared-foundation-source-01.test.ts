import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  B1_ACTION_OUTCOME,
  B1_CANONICAL_CODES,
  B1_FEE_POLICIES,
  B1_SERVICE_ADAPTERS,
  B1_WORKFLOWS,
  FINAL_CHANCE_TYPE,
  canActOnB1Step,
  canActOnDepartmentHeadStep,
  canSubmitWithReferenceData,
  getRequestServiceAdapter,
  isRealAttachmentReference,
  isResolvedReferenceValue,
  isFinalChanceTypeForWrite,
  normalizeChanceTypeForRead,
  resolveDirectDepartmentHead,
  validateB1ServiceActivation,
} from "../../src/lib/student-requests/request-service-adapter";
import {
  getDbCodesForRequestTypeFilter,
  getStoredWriteCodeForRequestType,
  getStudentRequestTypeDefinition,
  normalizeStudentRequestTypeCode,
  requireCanonicalStudentRequestTypeCode,
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
  it("uses explicit historical write codes and rejects unknown writes", () => {
    expect(getStoredWriteCodeForRequestType("final_chance")).toBe("extra_chance");
    expect(getStoredWriteCodeForRequestType("department_transfer")).toBe("transfer");
    expect(requireCanonicalStudentRequestTypeCode("extra_chance")).toBe("final_chance");
    expect(() => getStoredWriteCodeForRequestType("unknown_b1")).toThrow("UNKNOWN_STUDENT_REQUEST_TYPE_CODE");
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
  it("uses external university confirmation without portal fee assessment", () => {
    for (const code of ["department_transfer", "final_chance"] as const) {
      expect(B1_FEE_POLICIES[code]).toBe("EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION");
      const keys = B1_WORKFLOWS[code].map((s) => s.key);
      expect(keys).not.toContain("fee_assessment");
      expect(keys).toContain("payment_confirmation");
      expect(B1_SERVICE_ADAPTERS[code].activationBlockedReason).toBeUndefined();
    }
  });
  it("wires authenticated reference data through the new-request route into the dynamic form", () => {
    const server = readFileSync(join(process.cwd(), "src", "lib", "student-affairs.functions.ts"), "utf8");
    const route = readFileSync(join(process.cwd(), "src", "components", "student-requests", "NewStudentRequestScreen.tsx"), "utf8");
    const form = readFileSync(join(process.cwd(), "src", "components", "student-requests", "DynamicStudentRequestForm.tsx"), "utf8");
    expect(server).toContain("getStudentRequestFormReferenceData");
    expect(server).toContain('context.supabase.from("academic_years")');
    expect(server).toContain('context.supabase.from("semesters")');
    expect(server).toContain('context.supabase.from("student_enrollments")');
    expect(route).toContain("referenceData={referenceData}");
    expect(route).toContain("canSubmitWithReferenceData");
    expect(route).toContain('target_semester: ""');
    expect(form).toContain('referenceState?.status === "ready"');
    expect(form).not.toContain("placeholder-id");
  });
  it("does not couple external confirmation activation to fee_type.code", () => {
    for (const code of [
      "enrollment_suspension",
      "excused_absence",
      "department_transfer",
      "final_chance",
      "file_withdrawal",
    ] as const) {
      expect(validateB1ServiceActivation({ requestTypeCode: code })).toEqual({ ok: true });
    }
    expect(() => validateB1ServiceActivation({ requestTypeCode: "unknown" })).toThrow("UNKNOWN_STUDENT_REQUEST_TYPE_CODE");
  });
  it("connects activation, trusted reference validation, and stored codes to the submit boundary", () => {
    const server = readFileSync(join(process.cwd(), "src", "lib", "student-affairs.functions.ts"), "utf8");
    const route = readFileSync(join(process.cwd(), "src", "components", "student-requests", "NewStudentRequestScreen.tsx"), "utf8");
    expect(server).toContain("validateB1ServiceActivation({ requestTypeCode: validation.normalized.requestTypeCode })");
    expect(server).toContain("assertTrustedB1FormReferences");
    expect(server).toContain('.eq("student_profile_id", input.profileId)');
    expect(server).toContain('.eq("enrollment_status", "enrolled")');
    expect(server).toContain('.eq("academic_year_id", academicYear)');
    expect(server).toContain("getStoredWriteCodeForRequestType(validation.normalized.requestTypeCode)");
    expect(route).toContain("serviceActivation.ok &&");
    expect(route).toContain("if (!serviceActivation.ok)");
  });
  it("keeps the general submit path open for non-B1 enrollment_certificate", () => {
    const server = readFileSync(join(process.cwd(), "src", "lib", "student-affairs.functions.ts"), "utf8");
    const route = readFileSync(join(process.cwd(), "src", "components", "student-requests", "NewStudentRequestScreen.tsx"), "utf8");
    expect(getRequestServiceAdapter("enrollment_certificate")).toBeUndefined();
    expect(server).toContain("if (b1Adapter) {");
    expect(server).toContain("if (b1Adapter) payload.requestType = getStoredWriteCodeForRequestType");
    expect(route).toContain(": { ok: true as const };");
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
      archive: "archived", confirm_payment: "payment_confirmed",
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
  it("isolates source and target department heads by direct assignment and department scope", () => {
    const sourceStep = B1_WORKFLOWS.department_transfer.find((s) => s.key === "source_department_head_approval")!;
    const targetStep = B1_WORKFLOWS.department_transfer.find((s) => s.key === "target_department_head_approval")!;
    const base = { assignedFacultyProfileId: "source-head", actor: { facultyProfileId: "source-head", unit: "department", role: "department_head", departmentId: "source" }, action: "approve", predecessorComplete: true };
    expect(canActOnDepartmentHeadStep({ ...base, step: sourceStep, requiredDepartmentId: "source" })).toBe(true);
    expect(canActOnDepartmentHeadStep({ ...base, step: targetStep, requiredDepartmentId: "target" })).toBe(false);
    expect(canActOnDepartmentHeadStep({ ...base, assignedFacultyProfileId: "target-head", actor: { ...base.actor, facultyProfileId: "target-head", departmentId: "target" }, step: targetStep, requiredDepartmentId: "target" })).toBe(true);
    expect(canActOnDepartmentHeadStep({ ...base, step: sourceStep, requiredDepartmentId: null })).toBe(false);
    expect(canActOnDepartmentHeadStep({ ...base, actor: { ...base.actor, facultyProfileId: "third-head", departmentId: "third" }, step: sourceStep, requiredDepartmentId: "source" })).toBe(false);
    for (const role of ["admin", "registrar_general", "dean"]) {
      expect(canActOnDepartmentHeadStep({ ...base, actor: { ...base.actor, role }, step: sourceStep, requiredDepartmentId: "source" })).toBe(false);
    }
  });

  it("binds department transfer to the proven historical detail relation", () => {
    expect(B1_SERVICE_ADAPTERS.department_transfer.detailBinding.contractKey).toBe("transfer_request_details");
    expect(B1_SERVICE_ADAPTERS.department_transfer.detailBinding.clientWriteAllowed).toBe(false);
    expect(B1_SERVICE_ADAPTERS.department_transfer.detailBinding.fields).toContainEqual({
      formField: "transfer_reason",
      detailField: "transfer_reason",
    });
    expect(B1_SERVICE_ADAPTERS.department_transfer.validate({
      target_department_id: "department",
      target_program_id: "program",
    })).toMatchObject({ valid: false, errors: { transfer_reason: "required" } });
  });

  it("keeps excused absence attachment-gated in validation and rejects unknown reason types", () => {
    const adapter = B1_SERVICE_ADAPTERS.excused_absence;
    expect(adapter.activationBlockedReason).toBeUndefined();
    const valid = {
      course_section_id: "section",
      absence_date: "2026-07-17",
      reason_type: "medical",
      absence_reason_detail: "detail",
      excuse_documents: { fileName: "excuse.pdf", storagePath: "student-requests/student/request/excuse.pdf" },
    };
    expect(adapter.validate(valid).valid).toBe(true);
    expect(adapter.validate({ ...valid, reason_type: "placeholder" })).toMatchObject({ valid: false, errors: { reason_type: "unknown_reason_type" } });
  });
});

describe("B1 chance compatibility and submit extension", () => {
  it("writes only final_chance and normalizes legacy values for read compatibility", () => {
    expect(FINAL_CHANCE_TYPE).toBe("final_chance");
    expect(isFinalChanceTypeForWrite("final_chance")).toBe(true);
    for (const value of ["additional_exam", "grade_recovery", "additional_chance"]) {
      expect(isFinalChanceTypeForWrite(value)).toBe(false);
      expect(normalizeChanceTypeForRead(value)).toBe("final_chance");
    }
    expect(normalizeChanceTypeForRead("invented_mapping")).toBeNull();
    const valid = { target_academic_year: "year", target_semester: "semester", reason: "final exam" };
    expect(B1_SERVICE_ADAPTERS.final_chance.validate(valid).valid).toBe(true);
    expect(B1_SERVICE_ADAPTERS.final_chance.validate({ ...valid, chance_type: "additional_chance" }).valid).toBe(false);
  });
  it("exposes an optional non-runtime persistence plan without breaking legacy RPC", () => {
    expect(buildStudentRequestDetailPersistencePlan("extra_chance")).toMatchObject({ canonicalCode: "final_chance", runtimeAvailable: false });
    expect(buildStudentRequestDetailPersistencePlan("enrollment_certificate")).toBeNull();
    expect(ATOMIC_STUDENT_REQUEST_SUBMIT_CAPABILITY).toMatchObject({ available: true, transactionRequired: true, validatesBeforeWorkflow: true });
  });
  it("keeps the SQL source a non-applied draft with no invented financial values", () => {
    const sql = readFileSync(join(process.cwd(), "docs", "migration-drafts", "REQUEST-B1-SHARED-FOUNDATION-SOURCE-01.sql"), "utf8");
    expect(sql).toContain("DRAFT ONLY");
    expect(sql).toContain("EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION");
    expect(sql).toContain("never fall back to the role pool");
    expect(sql).not.toMatch(/INSERT\s+INTO|UPDATE\s+public|DELETE\s+FROM/i);
    expect(sql).not.toMatch(/fee_type\.code\s*=|amount\s*=|currency\s*=/i);
  });
});
