import { describe, expect, test } from "bun:test";

const path = new URL(
  "../../docs/migration-drafts/B1-FIVE-SERVICES-ACTOR-ACTION-ASSIGNMENT-HARDENING-01.sql",
  import.meta.url,
);
const sql = await Bun.file(path).text();

describe("B1 five-services F1/F2 forward-only authorization remediation", () => {
  test("preserves the existing action vocabulary and adds only four required B1 actions", () => {
    for (const action of [
      "approve", "reject", "return", "comment", "request_attachment",
      "request_payment", "sign", "archive", "issue_document", "complete", "skip",
      "review", "clear", "apply_decision", "confirm_payment",
    ]) expect(sql).toContain(`'${action}'`);
  });

  test("requires active temporal authority for the exact runtime unit and role", () => {
    expect(sql).toContain("current_user_has_exact_processing_binding(");
    expect(sql).toContain("v_step.processing_unit_id,v_step.processing_role_id");
    expect(sql).toContain("user_matches_workflow_runtime_step(p_step_id)");
    expect(sql).toContain("workflow_runtime_predecessors_satisfied(p_step_id)");
  });

  test("keeps action/transition and transfer-department scope fail closed", () => {
    expect(sql).toContain("v_config.processing_unit_id is distinct from v_step.processing_unit_id");
    expect(sql).toContain("v_config.processing_role_id is distinct from v_step.processing_role_id");
    expect(sql).toContain("v_transition_count=1");
    expect(sql).toContain("assigned_faculty_profile_id");
  });

  test("is source-only and does not activate or expose services", () => {
    expect(sql).toContain("FORWARD-ONLY DRAFT. SOURCE ONLY");
    expect(sql).not.toMatch(/student_visible\s*=|update\s+public\.request_types/i);
    expect(sql).not.toMatch(/insert\s+into\s+public\.request_type_workflows/i);
  });
});
