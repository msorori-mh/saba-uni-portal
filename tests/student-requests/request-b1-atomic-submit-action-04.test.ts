import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(process.cwd(), "docs", "migration-drafts", "REQUEST-B1-ATOMIC-SUBMIT-ACTION-04.sql"),
  "utf8",
);

describe("B1 atomic submit/action draft 04", () => {
  it("is transactional, source-only, and fail-closed until service persistence exists", () => {
    expect(sql).toContain("DRAFT ONLY — DO NOT APPLY FROM THIS FILE");
    expect(sql).toContain("BEGIN;");
    expect(sql).toContain("COMMIT;");
    expect(sql).toContain("B1_SERVICE_PERSISTENCE_NOT_INSTALLED");
  });

  it("locks an owned request and rejects stale submissions before any workflow write", () => {
    const submit = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.submit_b1_student_request_atomic"),
    );
    expect(submit).toContain("FOR UPDATE");
    expect(submit).toContain("B1_OWNED_SUBMITTABLE_REQUEST_REQUIRED");
    expect(submit).toContain("B1_STALE_REQUEST_VERSION");
    expect(submit.indexOf("persist_validated_b1_request_details")).toBeLessThan(
      submit.indexOf("initialize_b1_request_workflow_strict"),
    );
    expect(submit.indexOf("initialize_b1_request_workflow_strict")).toBeLessThan(
      submit.indexOf("UPDATE public.student_requests SET status='submitted'"),
    );
  });

  it("creates exact direct assignments and isolates transfer departments", () => {
    expect(sql).toContain(
      "num_nonnulls(a.user_id,a.staff_profile_id,a.faculty_profile_id,a.position_assignment_id)=1",
    );
    expect(sql).toContain("B1_DIRECT_ASSIGNMENT_MUST_RESOLVE_ONCE");
    expect(sql).toContain("source_department_head_approval");
    expect(sql).toContain("d.current_department_id");
    expect(sql).toContain("d.requested_department_id");
    expect(sql).toContain("a.department_id=v_department_id");
    expect(sql).toContain("B1_EXACTLY_ONE_ACTIVE_STEP_REQUIRED");
    expect(sql).toContain("is_valid_b1_direct_assignment");
    expect(sql).toContain("fp.status='active'");
    expect(sql).toContain("pa.assigned_from<=CURRENT_DATE");
  });

  it("closes legacy B1 mutations and explicitly permits the specialized payment RPC", () => {
    expect(sql).toContain("B1_ATOMIC_SUBMIT_BOUNDARY_REQUIRED");
    expect(sql).toContain("B1_ATOMIC_RUNTIME_BOUNDARY_REQUIRED");
    expect(sql).toContain("current_setting('b1.atomic_submit',true)");
    expect(sql).toContain("current_setting('b1.atomic_action',true)");
    expect(sql).toContain("current_setting('b1.specialized_action',true)");
    expect(sql).toContain("tgtype=19 AND tgenabled='O'");
    expect(sql).toContain("tgtype=31 AND tgenabled='O'");
    expect(sql).toContain("B1_SUBMIT_GUARD_TRIGGER_CONTRACT_MISMATCH");
    expect(sql).toContain("B1_RUNTIME_GUARD_TRIGGER_CONTRACT_MISMATCH");
  });

  it("revalidates and clears the returned runtime before resubmit", () => {
    expect(sql).toContain("B1_RUNTIME_RESUBMIT_CONTRACT_INVALID");
    expect(sql).toContain("s.assigned_faculty_profile_id IS DISTINCT FROM a.faculty_profile_id");
    expect(sql).toContain("completed_at=NULL,completed_by=NULL");
    expect(sql).toContain("decision=NULL,comment=NULL");
    expect(sql).toContain("B1_RUNTIME_RESUBMIT_SEQUENCE_INVALID");
    expect(sql).toContain("c.workflow_id IS DISTINCT FROM v_workflow.id");
    expect(sql).toContain("s.step_order IS DISTINCT FROM c.step_order");
    expect(sql).toContain("LEFT JOIN public.request_type_workflow_steps c");
    expect(sql).toContain("c.id IS NULL OR u.id IS NULL OR r.id IS NULL");
    expect(sql).toContain("B1_RUNTIME_RESUBMIT_COVERAGE_INVALID");
  });

  it("locks and authorizes before resolving a unique transition and mutating", () => {
    const action = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.act_on_b1_student_request_step_atomic"),
    );
    expect(action.indexOf("FOR UPDATE")).toBeLessThan(
      action.indexOf("can_current_user_act_on_step"),
    );
    expect(action.indexOf("can_current_user_act_on_step")).toBeLessThan(
      action.indexOf("B1_TRANSITION_MUST_RESOLVE_ONCE"),
    );
    expect(action.indexOf("B1_TRANSITION_MUST_RESOLVE_ONCE")).toBeLessThan(
      action.indexOf("UPDATE public.student_request_workflow_steps SET status="),
    );
    expect(action).toContain("B1_PREDECESSOR_INCOMPLETE");
    expect(action).toContain("B1_NEXT_RUNTIME_STEP_MUST_RESOLVE_ONCE");
    expect(action).toContain("B1_ACTIVE_STEP_INVARIANT_FAILED");
    expect(action).toContain("LOCK TABLE public.request_type_workflow_transitions IN SHARE MODE");
    expect(action).toContain("B1_CLIENT_ACTION_PAYLOAD_FORBIDDEN");
  });

  it("uses only the closed B1 action/outcome vocabulary", () => {
    for (const pair of [
      ["review", "reviewed"],
      ["approve", "approved"],
      ["clear", "cleared"],
      ["apply_decision", "applied"],
      ["archive", "archived"],
    ]) {
      expect(sql).toContain(`WHEN '${pair[0]}' THEN '${pair[1]}'`);
    }
    expect(sql).toContain("B1_SPECIALIZED_ACTION_RPC_REQUIRED");
    expect(sql).toContain("ELSE v_result END");
    expect(sql).not.toContain("ELSE 'completed' END; -- fallback");
  });

  it("contains no payment ledger fields, bypass, protected IDs, or visibility mutation", () => {
    for (const forbidden of [
      "fee_type.code",
      "amount",
      "currency",
      "invoice",
      "gateway",
      "internal_balance",
      "93807768-a281-42de-bfb4-0c0c03786b20",
      "SR-20260713-2DE64041",
      "SR-20260715-FEDCB3E1",
      "USR-2026-000001",
      "student_visible",
      "is_current_user_admin_actor()",
      "is_current_user_registrar()",
    ])
      expect(sql.toLowerCase()).not.toContain(forbidden.toLowerCase());
  });
});
