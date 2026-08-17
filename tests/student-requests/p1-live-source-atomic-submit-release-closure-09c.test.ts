/**
 * PORTAL_REFORM_P1_LIVE_SOURCE_ATOMIC_SUBMIT_RELEASE_CLOSURE_09C
 * Source-only closure proofs: atomic capability enabled, the three P1 services
 * wired exclusively to submit_student_request_with_details, forms aligned with
 * the live backend field names, and nothing else changed.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  ATOMIC_STUDENT_REQUEST_SUBMIT_CAPABILITY,
  P1_ATOMIC_SUBMIT_SERVICES,
  STUDENT_REQUEST_DETAIL_SUBMIT_RUNTIME_AVAILABLE,
  isP1AtomicSubmitService,
  rpcSubmitStudentRequestWithDetails,
} from "@/lib/student-request-rpc";
import { getStudentRequestFormDefinition } from "@/lib/student-requests/request-form-registry";
import {
  P1_SOURCE_READINESS,
  isP1ServiceProductionActivatable,
} from "@/lib/student-requests/p1/activation-gate";

const root = resolve(__dirname, "../..");
const src = (p: string) => readFileSync(resolve(root, p), "utf8");

const THREE = ["october_exam_entry_form", "replacement_student_card", "grade_appeal"] as const;

describe("G1 — atomic capability enabled in source", () => {
  it("runtime flag is true", () => {
    expect(STUDENT_REQUEST_DETAIL_SUBMIT_RUNTIME_AVAILABLE).toBe(true);
    expect(ATOMIC_STUDENT_REQUEST_SUBMIT_CAPABILITY.available).toBe(true);
    expect(ATOMIC_STUDENT_REQUEST_SUBMIT_CAPABILITY.rpcName).toBe(
      "submit_student_request_with_details",
    );
  });
  it("exactly the three P1 services are atomic", () => {
    expect([...P1_ATOMIC_SUBMIT_SERVICES].sort()).toEqual([...THREE].sort());
    for (const code of THREE) expect(isP1AtomicSubmitService(code)).toBe(true);
    for (const code of ["enrollment_suspension", "excused_absence", "department_transfer"]) {
      expect(isP1AtomicSubmitService(code)).toBe(false);
    }
  });
});

describe("G2/G3 — canonical submission routes P1 to the atomic RPC only", () => {
  const fn = src("src/lib/student-affairs.functions.ts");

  it("atomic call site exists in the canonical core", () => {
    expect(fn).toContain("isP1AtomicSubmitService(validation.normalized.requestTypeCode)");
    expect(fn).toContain("rpcSubmitStudentRequestWithDetails(input.sessionClient");
  });

  it("P1 branch precedes any generic create/submit helper", () => {
    const atomicIdx = fn.indexOf("rpcSubmitStudentRequestWithDetails(input.sessionClient");
    for (const marker of [
      "createDraftViaRpcOrFallback({",
      "submitViaRpcOrFallback({",
      "createB1DraftFailClosed({",
    ]) {
      expect(fn.indexOf(marker, atomicIdx)).toBeGreaterThan(atomicIdx);
    }
    expect(atomicIdx).toBeGreaterThan(-1);
  });

  it("normal production path passes p_test_run_id = null", () => {
    expect(fn).toContain("testRunId: null");
  });

  it("P1 resubmit fails closed instead of using generic submit", () => {
    expect(fn).toContain("P1_RESUBMIT_NOT_SUPPORTED");
    expect(ATOMIC_STUDENT_REQUEST_SUBMIT_CAPABILITY.supportsResubmit).toBe(false);
  });

  it("generic draft-create server fn fails closed for P1", () => {
    expect(fn).toContain(
      'if (isP1AtomicSubmitService(requestType)) throw new Error("P1_ATOMIC_SUBMIT_REQUIRED");',
    );
  });

  it("RPC unavailable maps to the service-updating message (no fallback)", () => {
    expect(fn).toContain("if (atomic.rpcUnavailable) throw new Error(STUDENT_REQUEST_SERVICE_UPDATING_MSG);");
  });
});

describe("G2 — rpc wrapper sends the exact live signature", () => {
  it("passes canonical parameter names", async () => {
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const client = {
      rpc: async (fnName: string, args?: Record<string, unknown>) => {
        calls.push({ fn: fnName, args: args ?? {} });
        return { data: "11111111-1111-1111-1111-111111111111", error: null };
      },
    };
    const res = await rpcSubmitStudentRequestWithDetails(client, {
      requestType: "grade_appeal",
      title: "t",
      formData: { final_result_id: "x", appeal_reason: "reason" },
      studentNotes: null,
      testRunId: null,
    });
    expect(res.rpcUnavailable).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0].fn).toBe("submit_student_request_with_details");
    expect(Object.keys(calls[0].args).sort()).toEqual([
      "p_form_data",
      "p_request_type",
      "p_student_notes",
      "p_test_run_id",
      "p_title",
    ]);
    expect(calls[0].args.p_test_run_id).toBeNull();
  });
});

describe("G4 — form contracts match live backend field names", () => {
  const names = (code: string) =>
    (getStudentRequestFormDefinition(code)?.sections ?? []).flatMap((s) =>
      s.fields.map((f) => f.name),
    );

  it("october", () => {
    expect(names("october_exam_entry_form")).toContain("remaining_courses");
  });
  it("replacement card", () => {
    const f = names("replacement_student_card");
    for (const n of [
      "loss_reason",
      "loss_declaration_ack",
      "loss_incident_date",
      "previous_card_serial",
    ]) {
      expect(f).toContain(n);
    }
  });
  it("appeal", () => {
    const f = names("grade_appeal");
    expect(f).toContain("final_result_id");
    expect(f).toContain("appeal_reason");
  });
});

describe("G5 — schema-pending cleared only for the three", () => {
  it("the three are available", () => {
    for (const code of THREE) {
      expect(getStudentRequestFormDefinition(code)?.unavailableUntilSchemaApplied).toBe(false);
    }
  });
  it("all other forms keep their pending flag", () => {
    for (const code of [
      "enrollment_suspension",
      "excused_absence",
      "file_withdrawal",
      "department_transfer",
      "final_chance",
      "enrollment_certificate",
      "grade_statement_non_graduate",
    ]) {
      expect(getStudentRequestFormDefinition(code)?.unavailableUntilSchemaApplied).toBe(true);
    }
  });
});

describe("G6 — activation gate source truth", () => {
  it("E2E PASS only for the three", () => {
    for (const code of THREE) {
      expect(P1_SOURCE_READINESS[code].E2E).toBe("PASS");
      expect(isP1ServiceProductionActivatable(code)).toBe(true);
    }
    expect(P1_SOURCE_READINESS.department_transfer.E2E).toBe("PENDING");
    expect(isP1ServiceProductionActivatable("department_transfer")).toBe(false);
  });
});

describe("G9 — zero scope creep", () => {
  it("source never writes student_visible", () => {
    const fn = src("src/lib/student-affairs.functions.ts");
    expect(fn).not.toContain("student_visible: true");
  });
});
