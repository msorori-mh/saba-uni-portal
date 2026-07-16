/**
 * Guards the archive-step executor (executeStudentRequestArchiveAction),
 * the StaffRequestArchivePanel, and the StaffRequestDetailPanel gating for
 * workflow steps whose config.action_type = 'archive'.
 *
 * SOURCE-LEVEL. Does not touch the DB, does not call the RPC.
 * DB `can_current_user_act_on_step` still enforces the actor/step
 * assignment invariants — these tests guarantee the client + server fn
 * wrapper cannot bypass them, and that the archive path never creates
 * documents or PDFs.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ARCHIVE_BUTTON_LABEL_AR } from "@/components/student-requests/StaffRequestArchivePanel";

const ROOT = join(import.meta.dir, "../..");
const SERVER_SRC = readFileSync(
  join(ROOT, "src/lib/student-requests/staff-inbox.functions.ts"),
  "utf-8",
);
const ARCHIVE_PANEL_SRC = readFileSync(
  join(ROOT, "src/components/student-requests/StaffRequestArchivePanel.tsx"),
  "utf-8",
);
const DETAIL_PANEL_SRC = readFileSync(
  join(ROOT, "src/components/student-requests/StaffRequestDetailPanel.tsx"),
  "utf-8",
);

const execStart = SERVER_SRC.indexOf(
  "export const executeStudentRequestArchiveAction",
);
const listStart = SERVER_SRC.indexOf(
  "export const listStudentRequestOfficialDocuments",
);
const execBlock =
  execStart >= 0 && listStart > execStart
    ? SERVER_SRC.slice(execStart, listStart)
    : execStart >= 0
      ? SERVER_SRC.slice(execStart)
      : "";
const listBlock = listStart >= 0 ? SERVER_SRC.slice(listStart) : "";

describe("executeStudentRequestArchiveAction — server fn contract", () => {
  it("exists as a POST createServerFn", () => {
    expect(execBlock).not.toEqual("");
    expect(execBlock).toMatch(/createServerFn\(\{\s*method:\s*["']POST["']/);
  });

  it("runs under requireSupabaseAuth + assertStaffInboxAccess", () => {
    expect(execBlock).toMatch(/\.middleware\(\[requireSupabaseAuth\]\)/);
    expect(execBlock).toMatch(/await\s+assertStaffInboxAccess\(context\.userId\)/);
  });

  it("calls act_on_student_request_step with p_action='archive' via context.supabase (not admin)", () => {
    expect(execBlock).toMatch(
      /context\.supabase[\s\S]*?\.rpc\(\s*["']act_on_student_request_step["']/,
    );
    expect(execBlock).toMatch(/p_action:\s*["']archive["']/);
    expect(execBlock).toMatch(/p_step_id:\s*data\.workflowStepRuntimeId/);
    expect(execBlock).not.toMatch(
      /supabaseAdmin\.rpc\(\s*["']act_on_student_request_step["']/,
    );
  });

  it("rejects steps that are not active OR do not belong to the request OR are not action_type='archive'", () => {
    expect(execBlock).toMatch(/stepRow\.status\s*!==\s*["']active["']/);
    expect(execBlock).toMatch(/student_request_id\s*!==\s*data\.requestId/);
    expect(execBlock).toMatch(/actionType\s*!==\s*["']archive["']/);
  });

  it("does NOT create documents / PDFs / storage artifacts in the archive path", () => {
    // No PDF generation, no upload, no insert into official_documents.
    expect(execBlock).not.toMatch(/\.insert\([\s\S]*official_documents/);
    expect(execBlock).not.toMatch(/\.upload\(/);
    expect(execBlock).not.toMatch(/buildEnrollmentCertificatePdfBytes/);
    expect(execBlock).not.toMatch(/issue_document/);
    expect(execBlock).not.toMatch(/pdf-lib/);
  });

  it("writes an audit_logs row for the archive action", () => {
    expect(execBlock).toMatch(/audit_logs/);
    expect(execBlock).toMatch(/action_type:\s*`workflow_archive`/);
  });

  it("does not hard-code the next step key / terminal transition (RPC drives lifecycle)", () => {
    // The next-step / terminal outcome MUST come from the RPC payload.
    expect(execBlock).not.toMatch(/nextStepId:\s*["']/);
    expect(execBlock).toMatch(/next_step_id/);
    expect(execBlock).toMatch(/payload\.terminal/);
  });
});

describe("listStudentRequestOfficialDocuments — read-only doc lookup", () => {
  it("is a POST createServerFn guarded by requireSupabaseAuth + staff-inbox access", () => {
    expect(listBlock).not.toEqual("");
    expect(listBlock).toMatch(/createServerFn\(\{\s*method:\s*["']POST["']/);
    expect(listBlock).toMatch(/\.middleware\(\[requireSupabaseAuth\]\)/);
    expect(listBlock).toMatch(/assertStaffInboxAccess\(context\.userId\)/);
  });

  it("reads official_documents filtered by student_request_id and never writes", () => {
    expect(listBlock).toMatch(
      /\.from\(\s*["']official_documents["']\s*\)[\s\S]*\.eq\(\s*["']student_request_id["']/,
    );
    expect(listBlock).not.toMatch(/\.insert\(/);
    expect(listBlock).not.toMatch(/\.update\(/);
    expect(listBlock).not.toMatch(/\.delete\(/);
  });
});

describe("StaffRequestArchivePanel — reusable archive UI", () => {
  it("exposes the localized archive button label", () => {
    expect(ARCHIVE_BUTTON_LABEL_AR).toBe("أرشفة الطلب وإغلاق المعاملة");
    expect(ARCHIVE_PANEL_SRC).toMatch(/ARCHIVE_BUTTON_LABEL_AR/);
  });

  it("wires the execute button to executeStudentRequestArchiveAction via useServerFn", () => {
    expect(ARCHIVE_PANEL_SRC).toMatch(/useServerFn\(executeStudentRequestArchiveAction\)/);
    expect(ARCHIVE_PANEL_SRC).toMatch(/data-testid="execute-archive-action"/);
  });

  it("disables the archive button when the user is not the assigned actor", () => {
    expect(ARCHIVE_PANEL_SRC).toMatch(/canArchive\s*=[\s\S]*isActionable/);
    expect(ARCHIVE_PANEL_SRC).toMatch(/disabled=\{!canArchive\}/);
  });

  it("disables the archive button when there is no runtime step id (prevents future-step archive)", () => {
    expect(ARCHIVE_PANEL_SRC).toMatch(/canArchive\s*=[\s\S]*!!workflowStepRuntimeId/);
  });

  it("only renders when actionType === 'archive'", () => {
    expect(ARCHIVE_PANEL_SRC).toMatch(
      /if\s*\(actionType\s*!==\s*["']archive["']\)\s*return\s+null/,
    );
  });

  it("shows the real document number / status / issued_at from listStudentRequestOfficialDocuments (not the foundation preview)", () => {
    expect(ARCHIVE_PANEL_SRC).toMatch(/listStudentRequestOfficialDocuments/);
    expect(ARCHIVE_PANEL_SRC).toMatch(/data-testid="archive-panel-document-number"/);
    expect(ARCHIVE_PANEL_SRC).toMatch(/تاريخ الإصدار/);
    // Foundation-preview strings must NOT leak into the archive panel.
    expect(ARCHIVE_PANEL_SRC).not.toMatch(/DOCUMENT_ARCHIVE_FOUNDATION_PREVIEW_MSG/);
    expect(ARCHIVE_PANEL_SRC).not.toMatch(/المعاينة التأسيسية/);
  });

  it("uses the authorized signed-url helper for preview/download and never generates a new PDF", () => {
    expect(ARCHIVE_PANEL_SRC).toMatch(/getEnrollmentCertificateDocumentSignedUrl/);
    expect(ARCHIVE_PANEL_SRC).not.toMatch(/buildEnrollmentCertificatePdfBytes/);
    expect(ARCHIVE_PANEL_SRC).not.toMatch(/\.upload\(/);
    expect(ARCHIVE_PANEL_SRC).not.toMatch(/prepare_enrollment_certificate_document_generation/);
  });
});

describe("StaffRequestDetailPanel — action_type='archive' gating", () => {
  it("computes showArchivePanel from activeType === 'archive'", () => {
    expect(DETAIL_PANEL_SRC).toMatch(
      /showArchivePanel\s*=\s*activeType\s*===\s*["']archive["']/,
    );
  });

  it("renders <StaffRequestArchivePanel/> only when showArchivePanel", () => {
    expect(DETAIL_PANEL_SRC).toMatch(
      /\{showArchivePanel\s*&&\s*\(?\s*<StaffRequestArchivePanel/,
    );
  });

  it("HIDES the generic review action panel when the active step is an archive step", () => {
    // The review action panel must be wrapped in both !showSignPanel AND !showArchivePanel.
    expect(DETAIL_PANEL_SRC).toMatch(
      /\{!showSignPanel\s*&&\s*!showArchivePanel\s*&&\s*\(?\s*<StaffRequestActionPanel/,
    );
  });

  it("no longer shows the foundational-preview RequestDocumentArchivePanel on archive steps", () => {
    // The old panel must not be imported into the detail panel anymore.
    expect(DETAIL_PANEL_SRC).not.toMatch(/RequestDocumentArchivePanel/);
  });
});
