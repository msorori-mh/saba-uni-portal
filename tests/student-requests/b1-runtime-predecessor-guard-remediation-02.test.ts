import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(
    import.meta.dir,
    "../../docs/migration-drafts/B1-RUNTIME-PREDECESSOR-GUARD-REMEDIATION-02.sql",
  ),
  "utf8",
).replace(/\r\n/g, "\n");

const actFn =
  sql.match(
    /create or replace function public\.can_current_user_act_on_step\([\s\S]*?\$function\$;/i,
  )?.[0] ?? "";

const b1ListBlock =
  actFn.match(/v_is_b1\s*:=\s*v_request_type\s+in\s*\(([\s\S]*?)\)\s*;/i)?.[1] ?? "";

const b1StrictBranch =
  actFn.match(/if\s+v_is_b1\s+then([\s\S]*?)\n\s*end if;\n\n\s*-- Non-B1 path/i)?.[1] ?? "";

const nonB1Path =
  actFn.match(/-- Non-B1 path:[\s\S]*?return true;\nend;/i)?.[0] ?? "";

const B1_STORED_TYPES = [
  "enrollment_suspension",
  "excused_absence",
  "absence_excuse",
  "department_transfer",
  "transfer",
  "final_chance",
  "extra_chance",
  "file_withdrawal",
] as const;

describe("B1 runtime predecessor guard remediation 02 (M3-02)", () => {
  it("is SOURCE-ONLY and NEVER APPLIED BY THIS PR", () => {
    expect(sql).toContain("SOURCE-ONLY");
    expect(sql).toContain("NEVER APPLIED BY THIS PR");
    expect(sql).toContain("begin;");
    expect(sql).toContain("commit;");
  });

  it("creates workflow_action_result_matches(text,text) and workflow_runtime_predecessors_satisfied(uuid)", () => {
    expect(sql).toMatch(
      /create or replace function public\.workflow_action_result_matches\s*\(\s*p_action_type\s+text\s*,\s*p_result\s+text\s*\)/i,
    );
    expect(sql).toMatch(
      /create or replace function public\.workflow_runtime_predecessors_satisfied\s*\(\s*p_step_id\s+uuid\s*\)/i,
    );
    expect(actFn).not.toBe("");
  });

  it("scopes strict runtime/config correspondence, predecessor guard, and action gate to v_is_b1 only", () => {
    expect(b1StrictBranch).not.toBe("");
    expect(nonB1Path).not.toBe("");

    expect(b1StrictBranch).toContain("c.workflow_id = v_step.workflow_id");
    expect(b1StrictBranch).toContain(
      "v_config.step_order is distinct from v_step.step_order",
    );
    expect(b1StrictBranch).toContain(
      "workflow_runtime_predecessors_satisfied(p_step_id)",
    );
    expect(b1StrictBranch).toContain("p_action = v_config.action_type");
    expect(b1StrictBranch).toContain("v_transition_count = 1");

    expect(nonB1Path).not.toContain("workflow_runtime_predecessors_satisfied");
    expect(nonB1Path).not.toContain("c.workflow_id = v_step.workflow_id");
    expect(nonB1Path).not.toContain("p_action = v_config.action_type");
    expect(nonB1Path).not.toContain("v_transition_count");
  });

  it("assigns v_is_b1 from the full B1 stored-type list and excludes enrollment_certificate", () => {
    expect(b1ListBlock).not.toBe("");
    for (const requestType of B1_STORED_TYPES) {
      expect(b1ListBlock).toContain(`'${requestType}'`);
    }
    expect(b1ListBlock).not.toContain("enrollment_certificate");
    expect(actFn).not.toMatch(
      /v_is_b1\s*:=\s*v_request_type\s+in\s*\([\s\S]*enrollment_certificate[\s\S]*\)\s*;/i,
    );
  });

  it("requires exact assignee always and exact processing binding only when v_is_b1", () => {
    expect(actFn).toMatch(
      /if\s+not\s+public\.user_matches_workflow_runtime_step\s*\(\s*p_step_id\s*\)\s+then/i,
    );
    expect(actFn).toMatch(
      /if\s+v_is_b1\s+and\s+not\s+public\.current_user_has_exact_processing_binding\s*\(/i,
    );
    expect(actFn).not.toMatch(
      /if\s+not\s+public\.current_user_has_exact_processing_binding\s*\(/i,
    );
    expect(nonB1Path).not.toContain("current_user_has_exact_processing_binding");
  });

  it("preserves the non-B1 lenient contract (active/pending, comment-on-completed, flags, return true)", () => {
    expect(actFn).toContain("v_step.status not in ('active', 'pending')");
    expect(actFn).toContain("p_action = 'comment' and v_step.status = 'completed'");
    expect(nonB1Path).toContain("can_skip");
    expect(nonB1Path).toContain("can_reject");
    expect(nonB1Path).toContain("can_return_to_student");
    expect(nonB1Path).toMatch(/return true;\s*\nend;/);
  });

  it("contains no student_requests DML, student_visible changes, or workflow activation", () => {
    expect(sql).not.toMatch(/\b(insert|update|delete)\s+(into\s+)?public\.student_requests\b/i);
    expect(sql).not.toMatch(/student_visible/i);
    expect(sql).not.toMatch(/\bupdate\s+public\.request_types\b/i);
    expect(sql).not.toMatch(/\binsert\s+into\s+public\.request_type_workflows\b/i);
    expect(sql).not.toMatch(/\bis_active\s*=\s*true\b/i);
  });

  it("revokes PUBLIC/anon execute on the guard functions and does not grant them", () => {
    expect(sql).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.workflow_runtime_predecessors_satisfied\s*\(\s*uuid\s*\)\s+from\s+public\s*,\s*anon\s*;/i,
    );
    expect(sql).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.workflow_action_result_matches\s*\(\s*text\s*,\s*text\s*\)\s+from\s+public\s*,\s*anon\s*;/i,
    );
    expect(sql).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.can_current_user_act_on_step\s*\(\s*uuid\s*,\s*text\s*\)\s+from\s+public\s*,\s*anon\s*;/i,
    );
    expect(sql).not.toMatch(
      /grant\s+execute\s+on\s+function\s+public\.(workflow_runtime_predecessors_satisfied|workflow_action_result_matches|can_current_user_act_on_step)[^\n]*\b(to\s+)?(public|anon)\b/i,
    );
  });
});
