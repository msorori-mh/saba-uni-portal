import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
const migration = readFileSync(
  join(
    root,
    "supabase/migrations/20260711050000_enrollment_certificate_workflow_round3_hardening.sql",
  ),
  "utf8",
);

function functionBody(name: string, nextMarker: string): string {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  const end = migration.indexOf(nextMarker, start + 1);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}

describe("PR115 remediation round 3 — active-step actor enforcement", () => {
  const assessBody = functionBody(
    "assess_student_request_fee",
    "-- =============================================================================\n-- 2. confirm_student_request_fee_payment",
  );
  const confirmBody = functionBody(
    "confirm_student_request_fee_payment",
    "-- Preserve explicit authenticated-only execution grants.",
  );

  it("requires the fee assessor to match the active runtime step", () => {
    expect(assessBody).toContain("public.user_matches_workflow_runtime_step(v_runtime_step.id)");
    expect(assessBody).toContain("public.is_current_user_admin_actor()");
    expect(assessBody).toContain("غير مصرح بتنفيذ الخطوة الحالية");
    expect(assessBody.indexOf("user_matches_workflow_runtime_step")).toBeGreaterThan(
      assessBody.indexOf("action_type IS DISTINCT FROM 'assess_fee'"),
    );
    expect(assessBody.indexOf("user_matches_workflow_runtime_step")).toBeLessThan(
      assessBody.indexOf("INSERT INTO public.student_request_fee_assessments"),
    );
  });

  it("requires finance confirmation actor to match the active runtime step", () => {
    expect(confirmBody).toContain("public.user_matches_workflow_runtime_step(v_runtime_step.id)");
    expect(confirmBody).toContain("public.is_current_user_admin_actor()");
    expect(confirmBody).toContain("غير مصرح بتنفيذ الخطوة الحالية");
    expect(confirmBody.indexOf("user_matches_workflow_runtime_step")).toBeGreaterThan(
      confirmBody.indexOf("action_type IS DISTINCT FROM 'confirm_payment'"),
    );
    expect(confirmBody.indexOf("user_matches_workflow_runtime_step")).toBeLessThan(
      confirmBody.indexOf("UPDATE public.student_request_fee_assessments"),
    );
  });
});

describe("PR115 remediation round 3 — no-fee runtime branch", () => {
  const assessBody = functionBody(
    "assess_student_request_fee",
    "-- =============================================================================\n-- 2. confirm_student_request_fee_payment",
  );

  it("marks intermediate finance confirmation steps as skipped", () => {
    expect(assessBody).toContain("WITH skipped_payment_steps AS");
    expect(assessBody).toContain("c.action_type = 'confirm_payment'");
    expect(assessBody).toContain("status = 'skipped'");
    expect(assessBody).toContain("decision = 'skipped'");
    expect(assessBody).toContain("s.status = 'pending'");
    expect(assessBody).toContain("s.step_order > v_runtime_step.step_order");
    expect(assessBody).toContain("s.step_order < v_next_step_order");
  });

  it("records an internal workflow event explaining why finance was skipped", () => {
    expect(assessBody).toContain("تم تجاوز خطوة المالية لعدم وجود رسوم");
    expect(assessBody).toContain("'reason', 'fee_not_required'");
    expect(assessBody).toContain("FROM skipped_payment_steps skipped");
  });

  it("does not create a payment notification when amount is zero", () => {
    expect(assessBody).toContain("IF v_amount > 0 THEN");
    expect(assessBody).toContain("PERFORM public.create_notification(");
    expect(assessBody.indexOf("IF v_amount > 0 THEN")).toBeLessThan(
      assessBody.indexOf("PERFORM public.create_notification("),
    );
  });

  it("keeps the next routed step separate from skipped intermediate finance steps", () => {
    expect(assessBody).toContain("v_next_step_id := public.apply_student_request_workflow_transition");
    expect(assessBody).toContain("SELECT s.step_order INTO v_next_step_order");
    expect(assessBody).toContain("WHERE s.id = v_next_step_id");
  });
});
