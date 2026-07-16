/**
 * Guards the sign-step executor (executeStudentRequestSignAction) and the
 * StaffRequestSignaturePanel + StaffRequestDetailPanel gating.
 *
 * Scope: SOURCE-LEVEL. Does not touch the DB, does not call the RPC.
 * DB `can_current_user_act_on_step` already enforces the actor/step
 * assignment invariants — these tests guarantee the client + server fn
 * wrapper cannot bypass them.
 *
 * Covers:
 *  - registrar_signature sign uses p_action='sign' via caller's session,
 *  - transition registrar_signature → dean_signature is left to the RPC
 *    (executor never hard-codes step_key transitions),
 *  - dean_signature reuses the same panel/executor,
 *  - unassigned user cannot execute payment_confirmation/signing through
 *    this executor (step must be active + action_type='sign'; RPC then
 *    enforces per-user assignment via can_current_user_act_on_step).
 *  - no PDF/document creation happens in the sign path.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getSignStepButtonLabel,
} from "@/components/student-requests/StaffRequestSignaturePanel";

const ROOT = join(import.meta.dir, "../..");
const SERVER_SRC = readFileSync(
  join(ROOT, "src/lib/student-requests/staff-inbox.functions.ts"),
  "utf-8",
);
const SIGN_PANEL_SRC = readFileSync(
  join(ROOT, "src/components/student-requests/StaffRequestSignaturePanel.tsx"),
  "utf-8",
);
const DETAIL_PANEL_SRC = readFileSync(
  join(ROOT, "src/components/student-requests/StaffRequestDetailPanel.tsx"),
  "utf-8",
);

const signExecutorStart = SERVER_SRC.indexOf("export const executeStudentRequestSignAction");
const signExecutorEnd = (() => {
  if (signExecutorStart < 0) return -1;
  const nextExport = SERVER_SRC.indexOf("\nexport const ", signExecutorStart + 1);
  return nextExport > 0 ? nextExport : SERVER_SRC.length;
})();
const signExecutorBlock =
  signExecutorStart >= 0 ? SERVER_SRC.slice(signExecutorStart, signExecutorEnd) : "";

describe("executeStudentRequestSignAction — server fn contract", () => {
  it("exists as a POST createServerFn", () => {
    expect(signExecutorBlock).not.toEqual("");
    expect(signExecutorBlock).toMatch(/createServerFn\(\{\s*method:\s*["']POST["']/);
  });

  it("runs under requireSupabaseAuth + assertStaffInboxAccess", () => {
    expect(signExecutorBlock).toMatch(/\.middleware\(\[requireSupabaseAuth\]\)/);
    expect(signExecutorBlock).toMatch(/await\s+assertStaffInboxAccess\(context\.userId\)/);
  });

  it("calls act_on_student_request_step with p_action='sign' via context.supabase (not admin)", () => {
    expect(signExecutorBlock).toMatch(
      /context\.supabase[\s\S]*?\.rpc\(\s*["']act_on_student_request_step["']/,
    );
    expect(signExecutorBlock).toMatch(/p_action:\s*["']sign["']/);
    expect(signExecutorBlock).toMatch(/p_step_id:\s*data\.workflowStepRuntimeId/);
    expect(signExecutorBlock).not.toMatch(
      /supabaseAdmin\.rpc\(\s*["']act_on_student_request_step["']/,
    );
  });

  it("rejects steps that are not active OR do not belong to the request OR are not action_type='sign'", () => {
    expect(signExecutorBlock).toMatch(/stepRow\.status\s*!==\s*["']active["']/);
    expect(signExecutorBlock).toMatch(/student_request_id\s*!==\s*data\.requestId/);
    expect(signExecutorBlock).toMatch(/actionType\s*!==\s*["']sign["']/);
  });

  it("does NOT create documents / PDFs / storage artifacts in the sign path", () => {
    expect(signExecutorBlock).not.toMatch(/issue_document/);
    expect(signExecutorBlock).not.toMatch(/enrollment_certificate/);
    expect(signExecutorBlock).not.toMatch(/pdf/i);
    expect(signExecutorBlock).not.toMatch(/storage/i);
    expect(signExecutorBlock).not.toMatch(/official_documents/);
  });

  it("writes an audit_logs row for the sign action", () => {
    expect(signExecutorBlock).toMatch(/audit_logs/);
    expect(signExecutorBlock).toMatch(/action_type:\s*`workflow_sign`/);
  });

  it("does not hard-code registrar_signature → dean_signature transition (RPC drives lifecycle)", () => {
    expect(signExecutorBlock).not.toMatch(/registrar_signature/);
    expect(signExecutorBlock).not.toMatch(/dean_signature/);
  });
});

describe("StaffRequestSignaturePanel — reusable sign UI", () => {
  it("renders the registrar-specific button label for registrar_signature", () => {
    expect(getSignStepButtonLabel("registrar_signature")).toBe(
      "توقيع مسجل الكلية واعتماد الطلب",
    );
  });

  it("renders the dean-specific button label for dean_signature", () => {
    expect(getSignStepButtonLabel("dean_signature")).toBe(
      "توقيع عميد الكلية واعتماد الطلب",
    );
  });

  it("falls back to a generic sign label for other sign-type steps (future reuse)", () => {
    expect(getSignStepButtonLabel("vice_president_signature")).toBe("توقيع واعتماد الطلب");
    expect(getSignStepButtonLabel(null)).toBe("توقيع واعتماد الطلب");
  });

  it("wires the execute button to executeStudentRequestSignAction via useServerFn", () => {
    expect(SIGN_PANEL_SRC).toMatch(/useServerFn\(executeStudentRequestSignAction\)/);
    expect(SIGN_PANEL_SRC).toMatch(/data-testid="execute-sign-action"/);
  });

  it("disables the sign button when the user is not the assigned actor", () => {
    // canSign requires isActionable === true
    expect(SIGN_PANEL_SRC).toMatch(/canSign\s*=[\s\S]*isActionable/);
    expect(SIGN_PANEL_SRC).toMatch(/disabled=\{!canSign\}/);
  });

  it("disables the sign button when there is no runtime step id (prevents future-step signing)", () => {
    expect(SIGN_PANEL_SRC).toMatch(/canSign\s*=[\s\S]*!!workflowStepRuntimeId/);
  });

  it("only renders when actionType === 'sign' (never on review/assess_fee/etc.)", () => {
    expect(SIGN_PANEL_SRC).toMatch(/if\s*\(actionType\s*!==\s*["']sign["']\)\s*return\s+null/);
  });

  it("does not import or reference any PDF / document-issuance module", () => {
    expect(SIGN_PANEL_SRC).not.toMatch(/EnrollmentCertificate/);
    expect(SIGN_PANEL_SRC).not.toMatch(/DocumentArchive/);
    expect(SIGN_PANEL_SRC).not.toMatch(/pdf/i);
    expect(SIGN_PANEL_SRC).not.toMatch(/issue_document/);
  });
});

describe("StaffRequestDetailPanel — action_type='sign' gating", () => {
  it("computes showSignPanel from activeType === 'sign'", () => {
    expect(DETAIL_PANEL_SRC).toMatch(
      /showSignPanel\s*=\s*activeType\s*===\s*["']sign["']/,
    );
  });

  it("renders <StaffRequestSignaturePanel/> only when showSignPanel", () => {
    expect(DETAIL_PANEL_SRC).toMatch(
      /\{showSignPanel\s*&&\s*\(?\s*<StaffRequestSignaturePanel/,
    );
  });

  it("HIDES the generic review action panel when the active step is a sign step", () => {
    // The review action panel must be wrapped in !showSignPanel.
    expect(DETAIL_PANEL_SRC).toMatch(
      /\{!showSignPanel\s*&&\s*\(?\s*<StaffRequestActionPanel/,
    );
  });
});
