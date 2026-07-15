/**
 * Guards the review-step executor (executeStudentRequestStaffAction) and the
 * StaffRequestDetailPanel gating logic that only shows the "اعتماد المراجعة
 * الأولية" button on the actual active review step for the assigned actor.
 *
 * Scope: SOURCE-LEVEL. Does not touch the DB, does not call the RPC.
 * The RPC (`act_on_student_request_step`) is already covered by DB-level
 * `can_current_user_act_on_step` — these tests guarantee the client + server
 * fn wrapper cannot bypass it.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  computeActiveStep,
} from "@/lib/student-requests/staff-inbox.functions";
import type { StaffRequestWorkflowStep } from "@/lib/student-requests/staff-inbox-ui";

const ROOT = join(import.meta.dir, "../..");
const SERVER_SRC = readFileSync(
  join(ROOT, "src/lib/student-requests/staff-inbox.functions.ts"),
  "utf-8",
);
const PANEL_SRC = readFileSync(
  join(ROOT, "src/components/student-requests/StaffRequestDetailPanel.tsx"),
  "utf-8",
);
const ACTION_PANEL_SRC = readFileSync(
  join(ROOT, "src/components/student-requests/StaffRequestActionPanel.tsx"),
  "utf-8",
);

const runtimeStep = (
  overrides: Partial<StaffRequestWorkflowStep> = {},
): StaffRequestWorkflowStep => ({
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  stepKey: "initial_review",
  labelAr: "المراجعة الأولية",
  roleKey: null,
  roleLabelAr: null,
  status: "current",
  enteredAt: null,
  completedAt: null,
  notes: null,
  actionType: "review",
  isActionable: true,
  ...overrides,
});

describe("executeStudentRequestStaffAction — server fn contract", () => {
  it("exists and calls the SECURITY DEFINER RPC act_on_student_request_step", () => {
    expect(SERVER_SRC).toMatch(/export\s+const\s+executeStudentRequestStaffAction/);
    expect(SERVER_SRC).toMatch(/act_on_student_request_step/);
  });

  it("uses the caller's session client (context.supabase) so auth.uid() is populated", () => {
    // Must NOT use supabaseAdmin.rpc for act_on — service role has no auth.uid().
    const rpcCall = SERVER_SRC.match(
      /\.rpc\(\s*["']act_on_student_request_step["'][\s\S]*?\)/,
    )?.[0] ?? "";
    expect(rpcCall).not.toEqual("");
    // The block around the rpc call reads context.supabase
    const block =
      SERVER_SRC.match(
        /executeStudentRequestStaffAction[\s\S]*?act_on_student_request_step[\s\S]*?\}\);/,
      )?.[0] ?? "";
    expect(block).toMatch(/context\.supabase/);
    expect(block).not.toMatch(/supabaseAdmin\.rpc\([\s\S]*?act_on_student_request_step/);
  });

  it("verifies the runtime step is 'active' and belongs to the request before calling the RPC", () => {
    const block =
      SERVER_SRC.match(
        /executeStudentRequestStaffAction[\s\S]*?act_on_student_request_step/,
      )?.[0] ?? "";
    expect(block).toMatch(/stepRow\.status\s*!==\s*["']active["']/);
    expect(block).toMatch(/student_request_id\s*!==\s*data\.requestId/);
  });

  it("rejects non-review action_types (sign / issue_document / archive have their own paths)", () => {
    const block =
      SERVER_SRC.match(
        /executeStudentRequestStaffAction[\s\S]*?act_on_student_request_step/,
      )?.[0] ?? "";
    expect(block).toMatch(/actionType\s*!==\s*["']review["']/);
  });

  it("passes through under requireSupabaseAuth and assertStaffInboxAccess", () => {
    const block =
      SERVER_SRC.match(
        /executeStudentRequestStaffAction[\s\S]*?p_payload/,
      )?.[0] ?? "";
    expect(block).toMatch(/requireSupabaseAuth/);
    expect(block).toMatch(/assertStaffInboxAccess/);
  });

  it("writes an audit_logs row for the workflow action", () => {
    const block =
      SERVER_SRC.match(
        /executeStudentRequestStaffAction[\s\S]*?return\s*\{/,
      )?.[0] ?? "";
    expect(block).toMatch(/audit_logs/);
    expect(block).toMatch(/action_type:\s*`workflow_/);
  });

  it("requires a comment for reject/return", () => {
    const block =
      SERVER_SRC.match(
        /executeStudentRequestStaffAction[\s\S]*?act_on_student_request_step/,
      )?.[0] ?? "";
    expect(block).toMatch(/reject[\s\S]*return[\s\S]*comment/);
  });
});

describe("computeActiveStep", () => {
  it("returns the runtime active step (status=current, non-preview UUID id)", () => {
    const steps: StaffRequestWorkflowStep[] = [
      runtimeStep({ status: "completed", stepKey: "submitted" }),
      runtimeStep(),
      runtimeStep({
        id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        stepKey: "fee_assessment",
        status: "upcoming",
        actionType: "assess_fee",
      }),
    ];
    const active = computeActiveStep(steps, false);
    expect(active).toEqual({
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      stepKey: "initial_review",
      actionType: "review",
      isActionable: true,
    });
  });

  it("returns null when workflow is a preview", () => {
    const steps: StaffRequestWorkflowStep[] = [runtimeStep()];
    expect(computeActiveStep(steps, true)).toBeNull();
  });

  it("ignores preview steps whose id starts with 'step:'", () => {
    const steps: StaffRequestWorkflowStep[] = [
      runtimeStep({ id: "step:initial_review", isPreview: true }),
    ];
    expect(computeActiveStep(steps, false)).toBeNull();
  });

  it("returns null when there is no active step (all completed/pending)", () => {
    const steps: StaffRequestWorkflowStep[] = [
      runtimeStep({ status: "completed" }),
      runtimeStep({
        id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
        status: "upcoming",
      }),
    ];
    expect(computeActiveStep(steps, false)).toBeNull();
  });
});

describe("StaffRequestDetailPanel — gating by activeStep.actionType", () => {
  it("shows fee panel ONLY for assess_fee / confirm_payment active steps", () => {
    expect(PANEL_SRC).toMatch(
      /activeType\s*===\s*["']assess_fee["'][\s\S]*activeType\s*===\s*["']confirm_payment["']/,
    );
    expect(PANEL_SRC).toMatch(/\{showFee\s*&&\s*<StaffRequestFeeProcessingSection/);
  });

  it("shows archive panel ONLY for archive active step", () => {
    expect(PANEL_SRC).toMatch(
      /showArchivePanel\s*=\s*activeType\s*===\s*["']archive["']/,
    );
    expect(PANEL_SRC).toMatch(/\{showArchivePanel\s*&&\s*\(?\s*<RequestDocumentArchivePanel/);
  });

  it("shows enrollment certificate issue button ONLY for issue_document active step", () => {
    expect(PANEL_SRC).toMatch(
      /showEcIssueButton\s*=\s*activeType\s*===\s*["']issue_document["']/,
    );
    expect(PANEL_SRC).toMatch(/\{showEcIssueButton\s*&&\s*\(?\s*<EnrollmentCertificateIssueButton/);
  });

  it("passes the real runtime workflowStepRuntimeId (not null) to the action panel", () => {
    const panelCall =
      PANEL_SRC.match(/<StaffRequestActionPanel[\s\S]*?\/>/)?.[0] ?? "";
    expect(panelCall).toMatch(/workflowStepRuntimeId=\{active\?\.id\s*\?\?\s*null\}/);
    expect(panelCall).not.toMatch(/workflowStepRuntimeId=\{null\}/);
  });

  it("sets canExecuteReview from activeStep.actionType==='review' AND actor assignment", () => {
    const panelCall =
      PANEL_SRC.match(/<StaffRequestActionPanel[\s\S]*?\/>/)?.[0] ?? "";
    expect(panelCall).toMatch(
      /canExecuteReview=\{isReviewStep\s*&&\s*\(active\?\.isActionable\s*\?\?\s*false\)\}/,
    );
  });
});

describe("StaffRequestActionPanel — execute button behavior", () => {
  it("has a real execute button (data-testid=execute-review-action) wired to executeStudentRequestStaffAction", () => {
    expect(ACTION_PANEL_SRC).toMatch(/data-testid="execute-review-action"/);
    expect(ACTION_PANEL_SRC).toMatch(/useServerFn\(executeStudentRequestStaffAction\)/);
  });

  it("disables execute button when canExecuteReview is false", () => {
    expect(ACTION_PANEL_SRC).toMatch(/executeEnabled\s*=\s*[\s\S]*canExecuteReview/);
    expect(ACTION_PANEL_SRC).toMatch(/disabled=\{!executeEnabled\}/);
  });

  it("disables execute button when no runtime step id is present (prevents future-step execution)", () => {
    expect(ACTION_PANEL_SRC).toMatch(/!!workflowStepRuntimeId/);
  });

  it("does not send forward_to_next_step through the review executor (unsupported)", () => {
    expect(ACTION_PANEL_SRC).toMatch(
      /if\s*\(action\s*===\s*["']add_note["']\)\s*return\s*["']comment["'];[\s\S]*return\s+null;/,
    );
  });
});
