import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(process.cwd(), "docs", "migration-drafts", "EXTERNAL-UNIVERSITY-PAYMENT-CONFIRMATION-01.sql"),
  "utf8",
);

describe("external payment confirmation migration draft", () => {
  it("is explicitly non-applied and contains no data DML", () => {
    expect(sql).toContain("DRAFT ONLY — DO NOT APPLY FROM THIS FILE");
    expect(sql).not.toMatch(/\b(?:DELETE|TRUNCATE|DROP TABLE|UPDATE\s+public\.student_requests)\b/i);
  });

  it("stores confirmation metadata without financial ledger fields", () => {
    expect(sql).not.toContain("CREATE TABLE IF NOT EXISTS public.student_request_external_payment_confirmations");
    for (const forbidden of ["fee_type_id", "fee_type_code", "amount numeric", "currency text", "invoice", "gateway_transaction", "payment_reference", "internal_balance"]) {
      expect(sql.toLowerCase()).not.toContain(forbidden);
    }
    for (const required of ["completed_by = v_uid", "completed_at = now()", "p_note text", "payment_confirmed"]) {
      expect(sql).toContain(required);
    }
  });

  it("requires exactly one direct finance assignee and never calls role-pool authorization", () => {
    expect(sql).toContain("EXACTLY_ONE_DIRECT_PAYMENT_ASSIGNEE_REQUIRED");
    expect(sql).toContain("DIRECT_PAYMENT_ASSIGNEE_REQUIRED");
    expect(sql).toContain("num_nonnulls");
    expect(sql).toContain("v_unit_code IS DISTINCT FROM 'finance'");
    expect(sql).toContain("v_role_code IS DISTINCT FROM 'revenue_finance_officer'");
    expect(sql).not.toContain("can_current_user_act_on_step");
    expect(sql).not.toContain("user_matches_workflow_runtime_step");
    expect(sql).not.toContain("has_any_role");
    expect(sql).not.toContain("p_payload");
  });

  it("has no rejection path and advances only on confirmation", () => {
    expect(sql).not.toContain("payment_not_confirmed");
    expect(sql).not.toContain("p_status");
    expect(sql).toContain("DROP FUNCTION IF EXISTS public.record_external_university_payment_confirmation(uuid, text, text)");
    expect(sql).toContain("record_external_university_payment_confirmation(uuid, text)");
    expect(sql).toContain("AND t.action_result = 'payment_confirmed'");
    expect(sql).toContain("NEXT_PAYMENT_WORKFLOW_STEP_NOT_READY");
    expect(sql).toContain("EXACTLY_ONE_PAYMENT_CONFIRMED_TRANSITION_REQUIRED");
    expect(sql).toContain("SELECT s.* INTO v_step");
    expect(sql).toContain("SELECT r.request_type, u.code, pr.code");
    expect(sql).toContain("PAYMENT_CONFIRMATION_REQUEST_NOT_FOUND");
    expect(sql).not.toContain("SELECT s.*, r.request_type");
    expect(sql).not.toMatch(/UPDATE\s+public\.student_requests/i);
  });

  it("keeps protected production entities out of the draft", () => {
    for (const protectedValue of [
      "93807768-a281-42de-bfb4-0c0c03786b20",
      "SR-20260713-2DE64041",
      "SR-20260715-FEDCB3E1",
      "USR-2026-000001",
      "student_visible",
      "enrollment_certificate",
    ]) {
      expect(sql).not.toContain(protectedValue);
    }
  });

  it("limits stored request codes to the two approved canonical services", () => {
    expect(sql).toContain("historical stored-code aliases for the two");
    expect(sql).toContain("'department_transfer','transfer','final_chance','extra_chance'");
    expect(sql).not.toContain("'grade_recovery'");
    expect(sql).not.toContain("'additional_chance'");
    expect(sql).not.toContain("'additional_exam'");
  });

  it("keeps the replacement action_type constraint a superset of the applied one (assess_fee retained)", () => {
    const chk = sql.slice(
      sql.indexOf("ADD CONSTRAINT request_type_workflow_steps_action_type_chk"),
      sql.indexOf("ALTER TABLE public.request_type_workflow_transitions"),
    );
    // Every value in the currently applied constraint
    // (supabase/migrations/20260711195110_16738687-5ea0-410a-937e-e2e39a70c8d3.sql)
    // must survive; the live enrollment_certificate fee machinery requires assess_fee.
    for (const applied of [
      "review", "approve", "reject", "comment", "return_to_student",
      "request_attachment", "request_payment", "assess_fee", "confirm_payment",
      "sign", "archive", "issue_document", "complete",
    ]) {
      expect(chk).toContain(`'${applied}'`);
    }
    // The only additions are the B1 vocabulary values.
    for (const added of ["clear", "apply_decision"]) {
      expect(chk).toContain(`'${added}'`);
    }
  });
});
