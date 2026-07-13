import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ACTION_TO_TRANSITION_RESULT,
  ARCHIVE_CONTRACT_GATED_CODE,
  DOCUMENT_ISSUANCE_CONTRACT_MISSING_CODE,
  ENROLLMENT_CERTIFICATE_POST_FEE_TRANSITIONS,
  evaluatePostZeroFeeActorAction,
  isValidWorkflowActorAction,
  mapActorActionToTransitionResult,
} from "../../src/lib/student-requests/post-zero-fee-execution-contract";
import { getCanonicalDraftTransitionsForType } from "../../src/lib/student-requests/request-workflow-preview-registry";
import { validateStaffActionCapability } from "../../src/lib/student-requests/staff-action-contract";

const ROOT = join(import.meta.dir, "../..");
const MIGRATION =
  "supabase/migrations/20260713100000_enrollment_certificate_post_zero_fee_execution_contract_remediation_01.sql";

function readMigration(): string {
  return readFileSync(join(ROOT, MIGRATION), "utf8");
}

describe("post-zero-fee execution contract — pure policy", () => {
  it("1 — sign maps to signed (not approve)", () => {
    expect(mapActorActionToTransitionResult("sign")).toBe("signed");
    expect(ACTION_TO_TRANSITION_RESULT.sign).toBe("signed");
  });

  it("2 — issue_document maps to issued; archive to archived", () => {
    expect(mapActorActionToTransitionResult("issue_document")).toBe("issued");
    expect(mapActorActionToTransitionResult("archive")).toBe("archived");
  });

  it("3 — registrar sign activates dean when transition exists", () => {
    const gate = evaluatePostZeroFeeActorAction({
      action: "sign",
      stepStatus: "active",
      stepActionType: "sign",
      hasMatchingTransition: true,
    });
    expect(gate).toEqual({
      allowed: true,
      actionResult: "signed",
      eventType: "signed",
    });
  });

  it("4 — approve on sign step is rejected without write", () => {
    const gate = evaluatePostZeroFeeActorAction({
      action: "approve",
      stepStatus: "active",
      stepActionType: "sign",
      hasMatchingTransition: true,
    });
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) expect(gate.reason).toBe("approve_on_sign_step");
  });

  it("5 — dean sign activates document_issuance when transition exists", () => {
    const t = ENROLLMENT_CERTIFICATE_POST_FEE_TRANSITIONS.find(
      (x) => x.from === "dean_signature",
    )!;
    expect(t.to).toBe("document_issuance");
    expect(t.actionResult).toBe("signed");
    const gate = evaluatePostZeroFeeActorAction({
      action: "sign",
      stepStatus: "active",
      stepActionType: "sign",
      hasMatchingTransition: true,
    });
    expect(gate.allowed).toBe(true);
  });

  it("6 — issue_document without real doc contract is rejected (HOLD)", () => {
    const gate = evaluatePostZeroFeeActorAction({
      action: "issue_document",
      stepStatus: "active",
      stepActionType: "issue_document",
      hasMatchingTransition: true,
    });
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) {
      expect(gate.reason).toBe("document_issuance_contract_missing");
      expect(gate.messageAr).toContain("غير مكتمل");
    }
  });

  it("7 — correct issuance mapping is encoded but gated (single doc + archive next)", () => {
    const issued = ENROLLMENT_CERTIFICATE_POST_FEE_TRANSITIONS.find(
      (x) => x.from === "document_issuance",
    )!;
    expect(issued.actionResult).toBe("issued");
    expect(issued.to).toBe("archive");
    expect(DOCUMENT_ISSUANCE_CONTRACT_MISSING_CODE).toBe(
      "DOCUMENT_ISSUANCE_EXECUTION_CONTRACT_MISSING",
    );
  });

  it("8 — archive without issued document contract is rejected", () => {
    const gate = evaluatePostZeroFeeActorAction({
      action: "archive",
      stepStatus: "active",
      stepActionType: "archive",
      hasMatchingTransition: true,
    });
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) {
      expect(gate.reason).toBe("archive_contract_gated");
      expect(ARCHIVE_CONTRACT_GATED_CODE).toContain("ARCHIVE");
    }
  });

  it("9 — terminal archive mapping is archived → completed request (encoded)", () => {
    const arch = ENROLLMENT_CERTIFICATE_POST_FEE_TRANSITIONS.find(
      (x) => x.from === "archive",
    )!;
    expect(arch.to).toBeNull();
    expect(arch.actionResult).toBe("archived");
  });

  it("10 — missing transition fails closed (no remap)", () => {
    const gate = evaluatePostZeroFeeActorAction({
      action: "sign",
      stepStatus: "active",
      stepActionType: "sign",
      hasMatchingTransition: false,
    });
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) expect(gate.reason).toBe("transition_missing");
  });

  it("11 — non-active step cannot mutate", () => {
    const gate = evaluatePostZeroFeeActorAction({
      action: "sign",
      stepStatus: "completed",
      stepActionType: "sign",
      hasMatchingTransition: true,
    });
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) expect(gate.reason).toBe("step_not_active");
  });

  it("12 — student-facing / invalid actions stay gated", () => {
    expect(isValidWorkflowActorAction("bogus")).toBe(false);
    const gate = evaluatePostZeroFeeActorAction({
      action: "bogus",
      stepStatus: "active",
      stepActionType: "sign",
      hasMatchingTransition: true,
    });
    expect(gate.allowed).toBe(false);
  });

  it("13 — unassigned user path: action_type mismatch rejects", () => {
    const gate = evaluatePostZeroFeeActorAction({
      action: "sign",
      stepStatus: "active",
      stepActionType: "review",
      hasMatchingTransition: true,
    });
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) expect(gate.reason).toBe("action_type_mismatch");
  });

  it("14 — staff UI execute remains disabled (no unsafe auto-execute)", () => {
    const cap = validateStaffActionCapability();
    expect(cap.canExecute).toBe(false);
  });

  it("canonical registry still requires signed / issued / archived", () => {
    const transitions = getCanonicalDraftTransitionsForType("enrollment_certificate");
    expect(
      transitions.find(
        (t) =>
          t.from_step_key === "registrar_signature" &&
          t.to_step_key === "dean_signature",
      )?.action_result,
    ).toBe("signed");
    expect(
      transitions.find(
        (t) =>
          t.from_step_key === "dean_signature" &&
          t.to_step_key === "document_issuance",
      )?.action_result,
    ).toBe("signed");
    expect(
      transitions.find(
        (t) =>
          t.from_step_key === "document_issuance" && t.to_step_key === "archive",
      )?.action_result,
    ).toBe("issued");
    expect(
      transitions.find(
        (t) => t.from_step_key === "archive" && t.to_step_key === null,
      )?.action_result,
    ).toBe("archived");
  });
});

describe("post-zero-fee execution contract — migration source policy", () => {
  const sql = readMigration();

  it("adds sign to is_valid_actor_request_action", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.is_valid_actor_request_action");
    expect(sql).toMatch(/'sign'/);
  });

  it("maps sign→signed, issue_document→issued, archive→archived", () => {
    expect(sql).toContain("WHEN 'sign' THEN 'signed'");
    expect(sql).toContain("WHEN 'issue_document' THEN 'issued'");
    expect(sql).toContain("WHEN 'archive' THEN 'archived'");
    expect(sql).toContain("WHEN 'sign' THEN 'signed'"); // event
    expect(sql).not.toMatch(/WHEN 'archive' THEN 'complete'/);
    expect(sql).not.toMatch(/WHEN 'issue_document' THEN 'complete'/);
  });

  it("fail-closed: transition lookup before UPDATE of runtime step", () => {
    const lookupIdx = sql.indexOf("لا يوجد انتقال للنتيجة");
    const updateIdx = sql.search(
      /UPDATE public\.student_request_workflow_steps\s+SET\s+status = v_new_step_status/,
    );
    expect(lookupIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeGreaterThan(lookupIdx);
  });

  it("requires active step and action_type match", () => {
    expect(sql).toContain("الخطوة ليست نشطة");
    expect(sql).toContain("WHEN 'sign' THEN 'sign'");
    expect(sql).toContain("خطوة التوقيع تتطلب إجراء sign وليس approve");
  });

  it("HOLDs issue_document and archive without inventing issuance", () => {
    expect(sql).toContain("DOCUMENT_ISSUANCE_EXECUTION_CONTRACT_MISSING");
    expect(sql).toContain("ARCHIVE_REQUIRES_ISSUED_DOCUMENT_CONTRACT");
    expect(sql).not.toContain("INSERT INTO public.official_documents");
    expect(sql).not.toContain("issue_official_document(");
  });

  it("preserves auth.uid and revokes public/anon execute", () => {
    expect(sql).toContain("v_uid uuid := auth.uid()");
    expect(sql).toContain("ERRCODE = '28000'");
    expect(sql).toContain("can_current_user_act_on_step");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.act_on_student_request_step(uuid, text, text, jsonb)",
    );
    expect(sql).toContain("FROM PUBLIC, anon");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.act_on_student_request_step");
  });

  it("no data DML / seed / request mutations outside function bodies", () => {
    // Strip function bodies roughly — ensure no top-level DELETE/UPDATE on data tables.
    const withoutFunctions = sql
      .replace(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/g, "")
      .replace(/COMMENT ON FUNCTION[\s\S]*?;/g, "")
      .replace(/REVOKE ALL[\s\S]*?;/g, "")
      .replace(/GRANT EXECUTE[\s\S]*?;/g, "");
    expect(withoutFunctions).not.toMatch(/\bDELETE\b/i);
    expect(withoutFunctions).not.toMatch(/\bUPDATE\s+public\.student_requests\b/i);
    expect(withoutFunctions).not.toMatch(/\bINSERT\s+INTO\s+public\.student_requests\b/i);
  });

  it("staff inbox prepare path remains dry-run (no execute enablement in this phase)", () => {
    const staff = readFileSync(
      join(ROOT, "src/lib/student-requests/staff-inbox.functions.ts"),
      "utf8",
    );
    expect(staff).toContain("Dry-run only");
    expect(staff).toContain("prepareStudentRequestDocumentArchiveAction");
    const capSrc = readFileSync(
      join(ROOT, "src/lib/student-requests/staff-action-contract.ts"),
      "utf8",
    );
    expect(capSrc).toContain("canExecute: false");
  });
});
