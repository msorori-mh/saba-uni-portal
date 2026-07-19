import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const sql = readFileSync(
  join(
    import.meta.dir,
    "../../docs/migration-drafts/B1-RUNTIME-PREDECESSOR-GUARD-REMEDIATION-01.sql",
  ),
  "utf8",
);
describe("B1 runtime predecessor guard remediation", () => {
  it("is a forward-only atomic draft", () => {
    expect(sql).toContain("begin;");
    expect(sql).toContain("commit;");
    expect(sql).not.toMatch(/^\s*(delete|drop|truncate)\b/im);
  });
  it("binds request runtime config and workflow version exactly", () => {
    for (const s of [
      "student_request_id=v_step.student_request_id",
      "workflow_id=v_step.workflow_id",
      "workflow_step_id=v_step.workflow_step_id",
      ")<>1 then return false",
    ])
      expect(sql).toContain(s);
  });
  it("fails closed on active state and predecessor ambiguity", () => {
    for (const s of [
      "v_step.status<>'active'",
      "v_incoming=0",
      "t.action_result='submit'",
      "pr.status='completed'",
      "pr.status='skipped' and v_pred.can_skip",
      "pc.is_required",
    ])
      expect(sql).toContain(s);
  });
  it("requires exact action and one transition with no bypass", () => {
    expect(sql).toContain("p_action=v_config.action_type");
    expect(sql).toContain("v_transition_count=1");
    expect(sql).toContain("user_matches_workflow_runtime_step");
    expect(sql).not.toMatch(/has_any_role|user_roles|\badmin\b|\bdean\b|\bregistrar\b/);
  });
  it("checks authorization before any mutation", () => {
    expect(sql).toContain("workflow_runtime_predecessors_satisfied(p_step_id)");
    expect(sql).not.toMatch(/\b(update|insert)\b/i);
  });
});
