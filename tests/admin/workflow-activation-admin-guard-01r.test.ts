import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  canRoleActivateWorkflow,
  canRoleSaveWorkflowDraft,
  evaluateWorkflowSaveModeAuthorization,
  rolesAllowedForWorkflowSaveMode,
  workflowPayloadRequestsActivation,
  WORKFLOW_ACTIVATE_ROLES,
  WORKFLOW_DRAFT_SAVE_ROLES,
} from "../../src/lib/workflow-activation-auth";
import { workflowMetaForSaveMode } from "../../src/lib/admin-request-workflow-rpc";

const ROOT = join(import.meta.dir, "../..");
const MIGRATION = join(
  ROOT,
  "supabase/migrations/20260713010000_restrict_workflow_activation_to_admins.sql",
);

describe("workflow activation auth policy 01R-A1", () => {
  it("activate roles are admin and system_admin only", () => {
    expect([...WORKFLOW_ACTIVATE_ROLES]).toEqual(["admin", "system_admin"]);
    expect(canRoleActivateWorkflow("admin")).toBe(true);
    expect(canRoleActivateWorkflow("system_admin")).toBe(true);
    expect(canRoleActivateWorkflow("registrar")).toBe(false);
    expect(canRoleActivateWorkflow("student_affairs")).toBe(false);
    expect(canRoleActivateWorkflow("dean")).toBe(false);
    expect(canRoleActivateWorkflow("faculty_member")).toBe(false);
    expect(canRoleActivateWorkflow("finance_officer")).toBe(false);
    expect(canRoleActivateWorkflow("student")).toBe(false);
    expect(canRoleActivateWorkflow("graduate")).toBe(false);
    expect(canRoleActivateWorkflow(null)).toBe(false);
  });

  it("draft save roles remain admin/system_admin/registrar/student_affairs", () => {
    expect([...WORKFLOW_DRAFT_SAVE_ROLES]).toEqual([
      "admin",
      "system_admin",
      "registrar",
      "student_affairs",
    ]);
    expect(canRoleSaveWorkflowDraft("registrar")).toBe(true);
    expect(canRoleSaveWorkflowDraft("student_affairs")).toBe(true);
    expect(canRoleSaveWorkflowDraft("dean")).toBe(false);
  });

  it("authorization matrix for activate vs draft", () => {
    expect(
      evaluateWorkflowSaveModeAuthorization({
        saveMode: "activate",
        userRoles: ["admin"],
      }).allowed,
    ).toBe(true);
    expect(
      evaluateWorkflowSaveModeAuthorization({
        saveMode: "activate",
        userRoles: ["system_admin"],
      }).allowed,
    ).toBe(true);
    expect(
      evaluateWorkflowSaveModeAuthorization({
        saveMode: "activate",
        userRoles: ["registrar"],
      }).allowed,
    ).toBe(false);
    expect(
      evaluateWorkflowSaveModeAuthorization({
        saveMode: "activate",
        userRoles: ["student_affairs"],
      }).allowed,
    ).toBe(false);
    expect(
      evaluateWorkflowSaveModeAuthorization({
        saveMode: "activate",
        userRoles: [],
      }).allowed,
    ).toBe(false);

    expect(
      evaluateWorkflowSaveModeAuthorization({
        saveMode: "draft",
        userRoles: ["registrar"],
      }).allowed,
    ).toBe(true);
    expect(
      evaluateWorkflowSaveModeAuthorization({
        saveMode: "draft",
        userRoles: ["student_affairs"],
      }).allowed,
    ).toBe(true);
  });

  it("activate payload detection matches RPC status/is_active normalization", () => {
    expect(workflowPayloadRequestsActivation({ status: "active", is_active: false })).toBe(true);
    expect(workflowPayloadRequestsActivation({ status: "draft", is_active: true })).toBe(true);
    expect(workflowPayloadRequestsActivation({ status: "draft", is_active: false })).toBe(false);
    expect(workflowMetaForSaveMode("activate")).toEqual({ status: "active", is_active: true });
    expect(workflowMetaForSaveMode("draft")).toEqual({ status: "draft", is_active: false });
    expect(
      workflowPayloadRequestsActivation(workflowMetaForSaveMode("activate")),
    ).toBe(true);
    expect(
      workflowPayloadRequestsActivation(workflowMetaForSaveMode("draft")),
    ).toBe(false);
  });

  it("rolesAllowedForWorkflowSaveMode separates draft and activate", () => {
    expect(rolesAllowedForWorkflowSaveMode("activate")).toEqual(WORKFLOW_ACTIVATE_ROLES);
    expect(rolesAllowedForWorkflowSaveMode("draft")).toEqual(WORKFLOW_DRAFT_SAVE_ROLES);
  });
});

describe("workflow activation migration static contracts 01R-A1", () => {
  const migration = readFileSync(MIGRATION, "utf8");
  const previous = readFileSync(
    join(ROOT, "supabase/migrations/20260711195110_16738687-5ea0-410a-937e-e2e39a70c8d3.sql"),
    "utf8",
  );
  const serverFn = readFileSync(
    join(ROOT, "src/lib/admin-request-workflow.functions.ts"),
    "utf8",
  );

  it("creates activate guard and does not grant EXECUTE to authenticated", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.assert_can_activate_request_workflow()");
    expect(migration).toContain("ARRAY['admin','system_admin']");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.assert_can_activate_request_workflow() FROM PUBLIC, anon, authenticated",
    );
    expect(migration).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.assert_can_activate_request_workflow/,
    );
  });

  it("wires activate guard when status/is_active request activation", () => {
    expect(migration).toContain("PERFORM public.assert_can_activate_request_workflow()");
    expect(migration).toContain("IF v_is_active OR v_status = 'active' THEN");
    expect(migration).toContain("PERFORM public.assert_can_admin_save_request_workflow()");
  });

  it("preserves RPC signature, versioning, fingerprint, lock, audit, retire", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.admin_save_request_workflow_config(",
    );
    expect(migration).toContain("p_request_type_id uuid, p_workflow jsonb, p_steps jsonb, p_transitions jsonb");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("v_payload_fp");
    expect(migration).toContain("v_existing_fp");
    expect(migration).toContain("reused_existing_draft");
    expect(migration).toContain("workflow_config_activated");
    expect(migration).toContain("status = 'retired'");
    expect(migration).toContain("COALESCE(max(w.version), 0) + 1");
    // No request_types mutation.
    expect(migration).not.toMatch(/UPDATE\s+public\.request_types/i);
    expect(migration).not.toMatch(/UPDATE\s+request_types/i);
  });

  it("keeps draft save roles broader in existing assert helper source of truth", () => {
    expect(previous).toContain(
      "ARRAY['admin','system_admin','registrar','student_affairs']",
    );
    expect(migration).not.toContain(
      "CREATE OR REPLACE FUNCTION public.assert_can_admin_save_request_workflow()",
    );
  });

  it("server function gates activate separately from draft", () => {
    expect(serverFn).toContain('if (data.saveMode === "activate")');
    expect(serverFn).toContain("assertRequestWorkflowActivate");
    expect(serverFn).toContain("WORKFLOW_ACTIVATE_ROLES");
    expect(serverFn).toContain("WORKFLOW_DRAFT_SAVE_ROLES");
  });

  it("does not touch enrollment certificate workflow id or assignments", () => {
    expect(migration).not.toContain("8a0ef6b8-5f51-4d3e-9f25-3b2ba51b74e1");
    expect(migration).not.toContain("request_processing_assignments");
    expect(migration).not.toContain("da670e75-2ce3-4a60-a41e-7eb89fa9dfdc");
  });
});
