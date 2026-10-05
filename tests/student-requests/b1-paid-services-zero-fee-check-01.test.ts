/**
 * B1-PAID-SERVICES-ZERO-FEE-CHECK-01 and the production-readiness files of
 * EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01 — source-level guards.
 *
 * The executable proof is the throwaway-cluster rehearsal in
 * scripts/b1-paid-services-zero-fee-check-01-pg17/run.sh and
 * scripts/excused-absence-paid-signature-01-pg17/run.sh.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");
const DRAFTS = ["docs", "migration-drafts"] as const;
const ABSENCE = "EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01";

/** SQL with comments and string literals removed — what would actually execute. */
function executable(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, "")
    .replace(/'(?:[^']|'')*'/g, "''");
}

describe("the applied chain really contains the defect the rehearsal reproduces", () => {
  const v2 = read("supabase", "migrations", "20260811202824_2e666deb-8cdd-41f4-9bd7-2bdcb5663e77.sql");
  const condition = read("supabase", "migrations", "20260811202314_488b316c-1f2f-464b-9087-0c2204c671e8.sql");
  const predecessors = read("supabase", "migrations", "20260723225159_6af54cae-3956-4f19-bbd9-a4aa8a8f446f.sql");

  it("version 2 makes the paid edge conditional and the bypass the default", () => {
    expect(v2).toContain("IF v_code IN ('department_transfer','final_chance') THEN");
    expect(v2).toContain("jsonb_build_object('code','FEE_GREATER_THAN_ZERO','params','{}'::jsonb)");
    expect(v2).toMatch(/VALUES \(v_new, v_dean_step, v_after_pay, 'approved',\s*'[^']+', '\{\}'::jsonb, true, 0\)/);
    // steps are cloned as they were: can_skip stays false on the payment step
    expect(v2).toContain("s.can_reject, s.can_skip,");
  });

  it("the condition reads the fee ledger, and a skipped predecessor needs can_skip", () => {
    expect(condition).toContain("FROM public.student_request_fee_assessments f");
    expect(condition).toContain("RETURN COALESCE(v_amount, 0) > 0;");
    expect(predecessors).toContain("(pr.status='completed' or (pr.status='skipped' and v_pred.can_skip))");
  });

  it("the rehearsal replays those two migration blocks verbatim", () => {
    const run = read("scripts", "b1-paid-services-zero-fee-check-01-pg17", "run.sh");
    expect(run).toContain("20260727120100_b1_26_academic_effect_functions_01.sql");
    expect(run).toContain("20260811202824_2e666deb-8cdd-41f4-9bd7-2bdcb5663e77.sql");
    expect(run).toContain("EXTRACT_FAIL: v2 service list drifted");
    expect(run).toContain("EXCUSED_ABSENCE_DRAFT_CHANGED_PAID_SERVICE_BEHAVIOUR");
    expect(run).toContain("IDEMPOTENCY_FINGERPRINT_MISMATCH");
    expect(run).toContain("B1_PAID_SERVICES_ZERO_FEE_CHECK_01_REHEARSAL_PASS");
    expect((run.match(/^probe "/gm) ?? []).length).toBe(5);
    // never a real database
    expect(run).toContain("listen_addresses=''");
    expect(run).not.toMatch(/supabase\.co|DATABASE_URL|SUPABASE_/);
  });

  it("the cases assert the exact failure codes before the fix and success after it", () => {
    const before = read("scripts", "b1-paid-services-zero-fee-check-01-pg17", "03-cases-v2-as-deployed.sql");
    const after = read("scripts", "b1-paid-services-zero-fee-check-01-pg17", "04-cases-after-fix.sql");
    expect(before).toContain("v_result = 'B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED'");
    expect(before).toContain("v_result = 'INVALID_ACTIVE_PAYMENT_CONFIRMATION_STEP'");
    expect(before).toContain("payment_confirmation is SKIPPED and registrar_apply is active");
    expect(before).toContain("paid branch completes end to end");
    expect(after).toContain("payment_confirmation is ACTIVE (not skipped) without any fee assessment");
    expect(after).toContain("FIXED — the registrar applies the decision");
    expect(after).toContain("byte-identical after the fix (not repaired, not migrated)");
    for (const file of [before, after]) expect(file).toContain("hp_deny_sample");
  });
});

describe("B1-PAID-SERVICES-ZERO-FEE-SKIP-FIX-01 — separate draft", () => {
  const draft = read(...DRAFTS, "B1-PAID-SERVICES-ZERO-FEE-SKIP-FIX-01.sql");
  const code = executable(draft);

  it("is a draft, one transaction, and independent of the excused-absence draft", () => {
    expect(draft.split("\n")[0]).toBe("-- DRAFT ONLY — DO NOT APPLY FROM THIS PATH.");
    expect((code.match(/^BEGIN;$/gm) ?? []).length).toBe(1);
    expect((code.match(/^COMMIT;$/gm) ?? []).length).toBe(1);
    expect(code).not.toMatch(/excused_absence|EAWF01/i);
    expect(read(...DRAFTS, `${ABSENCE}.sql`)).not.toContain("B1_PAID_FIX01");
  });

  it("creates no function and writes only workflow-definition and audit tables", () => {
    expect(code).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?(FUNCTION|TABLE|TRIGGER|POLICY)|ALTER\s+|DROP\s+|GRANT\s+|EXECUTE\s/i);
    expect(code).not.toMatch(/DELETE\s+FROM|TRUNCATE/i);
    const inserts = [...new Set([...code.matchAll(/INSERT\s+INTO\s+(public\.[a-z0-9_]+)/gi)].map((m) => m[1]!))].sort();
    expect(inserts).toEqual([
      "public.b1_workflow_runtime_contract_snapshot",
      "public.request_type_workflow_change_log",
      "public.request_type_workflow_steps",
      "public.request_type_workflow_transitions",
      "public.request_type_workflows",
      "public.request_workflow_publish_validations",
    ]);
    const updates = [...new Set([...code.matchAll(/UPDATE\s+(public\.[a-z0-9_]+)/gi)].map((m) => m[1]!))];
    expect(updates).toEqual(["public.request_type_workflows"]);
    // can_skip is copied, never forced to true
    expect(code).not.toMatch(/can_skip\s*=\s*true/i);
  });

  it("fails closed on any shape other than the known defect and proves payment is mandatory", () => {
    for (const guard of [
      "B1_PAID_FIX01_REQUEST_TYPE_MUST_RESOLVE_EXACTLY_ONCE",
      "B1_PAID_FIX01_ACTIVE_WORKFLOW_MUST_RESOLVE_EXACTLY_ONCE",
      "B1_PAID_FIX01_UNEXPECTED_ACTIVE_WORKFLOW_CODE",
      "B1_PAID_FIX01_UNEXPECTED_FEE_BRANCH_SHAPE",
      "B1_PAID_FIX01_WORKFLOW_HAS_A_FEE_ASSESSMENT_STEP",
      "B1_PAID_FIX01_PAYMENT_STEP_IS_SKIPPABLE",
      "B1_PAID_FIX01_ACTIVE_VERSION_IS_NOT_THE_LATEST",
      "B1_PAID_FIX01_RUNTIME_CONTRACT_PIN_INCOMPLETE",
      "B1_PAID_FIX01_POST_PAYMENT_IS_NOT_MANDATORY",
      "B1_PAID_FIX01_POST_REQUEST_ROWS_CHANGED",
      "B1_PAID_FIX01_POST_REQUEST_TYPES_CHANGED",
      "B1_PAID_FIX01_POST_EXISTING_WORKFLOW_DEFINITIONS_CHANGED",
    ]) {
      expect(draft, guard).toContain(guard);
    }
    expect(draft).toContain("PERFORM public.validate_request_workflow_publish(v_new_id);");
  });

  it("is documented in Arabic with the exact failure codes and the owner decisions", () => {
    const note = read("docs", "reviews", "B1-PAID-SERVICES-ZERO-FEE-CHECK-01.md");
    for (const text of [
      "B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED",
      "INVALID_ACTIVE_PAYMENT_CONFIRMATION_STEP",
      "`registrar_apply`",
      "FEE_GREATER_THAN_ZERO",
      "docs/migration-drafts/B1-PAID-SERVICES-ZERO-FEE-SKIP-FIX-01.sql",
      "قرارات مطلوبة من المالك",
      "requests_stuck_at_registrar_apply",
    ]) {
      expect(note, text).toContain(text);
    }
    expect(note).toMatch(/PASS|HOLD/);
  });
});

describe("EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01 — production readiness files", () => {
  const draft = read(...DRAFTS, `${ABSENCE}.sql`);
  const preflight = read(...DRAFTS, `${ABSENCE}.preflight.sql`);
  const verify = read(...DRAFTS, `${ABSENCE}.verify.sql`);
  const rollback = read(...DRAFTS, `${ABSENCE}.rollback-by-forward.sql`);
  const doc = read("docs", "reviews", `${ABSENCE}.md`);

  it("pre-flight and verification are read-only single statements", () => {
    for (const [name, sql] of [["preflight", preflight], ["verify", verify]] as const) {
      const code = executable(sql);
      expect((code.match(/;/g) ?? []).length, `${name}: one statement`).toBe(1);
      expect(code.trim().startsWith("WITH"), `${name}: starts with WITH`).toBe(true);
      expect(code, name).not.toMatch(
        /\b(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|EXECUTE|PERFORM|CALL|COPY|LOCK|SET|DO)\b/,
      );
      expect(code, name).not.toMatch(/FOR\s+(UPDATE|SHARE)|nextval|set_config|pg_advisory/i);
    }
    expect(preflight).toContain("AS ready_to_apply");
    expect(verify).toContain("AS applied_correctly");
  });

  it("the pre-flight checks exactly the draft's eleven anchors, verbatim", () => {
    const lines = draft.split("\n");
    const anchors: Array<{ marker: string; anchor: string }> = [];
    lines.forEach((line, index) => {
      const marker = /^\s+'(EAWF01:[a-z-]+)',\s*$/.exec(line)?.[1];
      if (marker && /^\s+'public\./.test(lines[index - 1] ?? "")) {
        anchors.push({ marker, anchor: lines[index + 1]!.trim().replace(/,$/, "") });
      }
    });
    expect(anchors.length).toBe(11);
    for (const { marker, anchor } of anchors) {
      expect(preflight, marker).toContain(`'${marker}'`);
      expect(preflight, `${marker} anchor`).toContain(anchor);
      expect(verify, marker).toContain(`'${marker}'`);
    }
    // every relation, function and guard family of the draft's preflight is mirrored
    for (const name of [
      "public.request_workflow_transition_condition_catalog",
      "public.notifications",
      "public.trg_notify_student_request()",
      "public.create_notification(uuid,text,text,text,text,uuid)",
      "REGISTER_EXCUSED_ABSENCE",
      "is_valid_b1_direct_assignment",
      "excused_absence_free_workflow",
    ]) {
      expect(preflight, name).toContain(name);
    }
  });

  it("the verification pins the eight steps, seventeen transitions and the exposure", () => {
    for (const text of [
      "'record_apply:registrar/registrar_general:apply_decision:REGISTER_EXCUSED_ABSENCE'",
      "count(*) = 17",
      "ARRAY['payment_confirmation'] AS only_payment_step_skippable",
      "'public.record_excused_absence_fee_decision(uuid,text,text,text,numeric)', true",
      "'public.b1_excused_absence_before_step_action(uuid,text,text)', false",
      "has_function_privilege('anon'",
      "fee_decision_table_not_exposed",
    ]) {
      expect(verify, text).toContain(text);
    }
  });

  it("the rollback is a guarded draft that deletes nothing and refuses once requests exist", () => {
    expect(rollback.split("\n")[0]).toBe("-- DRAFT ONLY — DO NOT APPLY FROM THIS PATH.");
    const code = executable(rollback);
    expect(code).not.toMatch(/DELETE\s+FROM|TRUNCATE|DROP\s+|ALTER\s+|CREATE\s+/i);
    expect([...new Set([...code.matchAll(/UPDATE\s+(public\.[a-z0-9_]+)/gi)].map((m) => m[1]!))]).toEqual([
      "public.request_type_workflows",
    ]);
    expect(rollback).toContain("EXCUSED_ABSENCE_WF01_ROLLBACK_BLOCKED_REQUESTS_EXIST_ON_NEW_CYCLE");
    expect(rollback).toContain("'workflow_rolled_back'");
  });

  it("the review doc embeds both queries verbatim and names the rollback file", () => {
    expect(doc).toContain(preflight.trimEnd());
    expect(doc).toContain(verify.trimEnd());
    expect(doc).toContain(`docs/migration-drafts/${ABSENCE}.rollback-by-forward.sql`);
    expect(doc).toContain("ready_to_apply = true");
    expect(doc).toContain("applied_correctly = true");
  });

  it("the rehearsal exercises the queries and the rollback", () => {
    const run = read("scripts", "excused-absence-paid-signature-01-pg17", "run.sh");
    for (const text of [
      "PREFLIGHT_QUERY_IS_NOT_READ_ONLY",
      "VERIFY_QUERY_IS_NOT_READ_ONLY",
      "pre-flight names the drifted anchor",
      "ROLLBACK_IS_NOT_IDEMPOTENT",
      "ROLLBACK_RAN_ALTHOUGH_REQUESTS_EXIST_ON_THE_NEW_CYCLE",
      "draft re-applied after a rollback",
    ]) {
      expect(run, text).toContain(text);
    }
  });

  it("the draft stores one display-only amount and no currency; the verification pins it", () => {
    const code = executable(draft);
    expect(code).toContain("amount_due numeric(12,2),");
    expect(code).not.toMatch(/currency|balance|receipt|invoice/i);
    expect(verify).toContain("display_only_amount_column_exact");
    expect(verify).toContain("'excused_absence_fee_decisions_amount_due_chk'");
  });
});
