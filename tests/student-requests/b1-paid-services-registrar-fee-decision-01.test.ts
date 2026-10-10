/**
 * B1-PAID-SERVICES-REGISTRAR-FEE-DECISION-01 — التحويل بين الأقسام + الفرصة الأخيرة:
 * per-request fee decision by the college registrar. Source-level guards.
 *
 * The executable proof (apply twice, fail-closed probes, both services × both
 * fee branches, direct-RPC deny matrix, excused-absence cases re-run) is
 * scripts/b1-paid-services-registrar-fee-decision-01-pg17/run.sh and the CI leg.
 */
import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  B1_FEE_DECISION_BINDINGS,
  B1_FEE_DECISION_SERVICES,
  b1StepsForFeeDecision,
  canConfirmB1PaymentAfterFeeDecision,
  canRecordB1FeeDecision,
  getB1FeeDecisionRpcs,
  getB1FeeDecisionService,
  isB1FeeDecisionStep,
  resolveStepAfterB1FeeDecision,
} from "@/lib/student-requests/b1-fee-decision-contract";
import { B1_FEE_POLICIES, B1_SERVICE_ADAPTERS, B1_WORKFLOWS } from "@/lib/student-requests/request-service-adapter";
import { resolveB1FeeDecisionRpcName, rpcGetExcusedAbsenceFeeDecision, rpcRecordExcusedAbsenceFeeDecision } from "@/lib/student-requests/b1-ui/b1-rpc";
import { b1BusinessRuleMessageAr, isB1BusinessRuleError } from "@/lib/student-requests/b1-ui/b1-business-error-mapping";
import { B1_STEP_LABELS_AR, getB1ServiceConfig } from "@/lib/student-requests/b1-ui/service-config";
import { createMockB1UiAdapter } from "@/lib/student-requests/b1-ui/adapter.mock";
import { B1AdapterError } from "@/lib/student-requests/b1-ui/adapter.types";

const ROOT = join(import.meta.dir, "..", "..");
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");
const PKG = "B1-PAID-SERVICES-REGISTRAR-FEE-DECISION-01";
const HARNESS = ["scripts", "b1-paid-services-registrar-fee-decision-01-pg17"] as const;
const draft = read("docs", "migration-drafts", `${PKG}.sql`);
const preflight = read("docs", "migration-drafts", `${PKG}.preflight.sql`);
const verify = read("docs", "migration-drafts", `${PKG}.verify.sql`);
const rollback = read("docs", "migration-drafts", `${PKG}.rollback-by-forward.sql`);

/** SQL with comments and string literals removed — what would actually execute. */
const executable = (sql: string) => sql.replace(/--[^\n]*/g, "").replace(/'(?:[^']|'')*'/g, "''");
const count = (text: string, needle: string) => text.split(needle).length - 1;

describe("the defect this package replaces is in the applied chain", () => {
  const v2 = read("supabase", "migrations", "20260811202824_2e666deb-8cdd-41f4-9bd7-2bdcb5663e77.sql");
  const effects = read("supabase", "migrations", "20260727120100_b1_26_academic_effect_functions_01.sql");

  it("version 2 routes the dean step on a fee ledger nobody can write for these services", () => {
    expect(v2).toContain("jsonb_build_object('code','FEE_GREATER_THAN_ZERO','params','{}'::jsonb)");
    expect(v2).toMatch(/VALUES \(v_new, v_dean_step, v_after_pay, 'approved',\s*'[^']+', '\{\}'::jsonb, true, 0\)/);
  });

  it("the rehearsal's applied extracts are verbatim copies of the two migrations", () => {
    const extractedEffects = read(...HARNESS, "00a-applied-effects.sql").split("\n").slice(2).join("\n");
    for (const fn of ["apply_b1_department_transfer_effect", "apply_b1_final_chance_effect"]) {
      const start = effects.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
      const body = effects.slice(start, effects.indexOf("\nEND $$;", start) + "\nEND $$;".length);
      expect(start, fn).toBeGreaterThan(0);
      expect(extractedEffects, fn).toContain(body);
    }
    const all = "('enrollment_suspension','excused_absence','department_transfer','final_chance','file_withdrawal')";
    const start = v2.indexOf("DO $$");
    const block = v2.slice(start, v2.indexOf("\nEND $$;", start) + "\nEND $$;".length);
    expect(count(block, all)).toBe(1);
    expect(read(...HARNESS, "01a-applied-v2-publish.sql").split("\n").slice(2).join("\n").trimEnd()).toBe(
      block.replace(all, "('department_transfer','final_chance')"),
    );
  });
});

describe(`${PKG} — draft`, () => {
  const code = executable(draft);

  it("is a compact single-transaction draft that requires the applied excused-absence package", () => {
    expect(draft.split("\n")[0]).toBe("-- DRAFT ONLY — DO NOT APPLY FROM THIS PATH.");
    expect((code.match(/^BEGIN;$/gm) ?? []).length).toBe(1);
    expect((code.match(/^COMMIT;$/gm) ?? []).length).toBe(1);
    expect(draft.split("\n").length).toBeLessThan(520);
    expect(draft).toContain("'PERFORM public.b1_excused_absence_before_step_action(v_step.id, v_action, p_comment);'");
  });

  it("creates exactly one table, four functions and one catalog condition — nothing excused-absence", () => {
    expect([...code.matchAll(/CREATE TABLE IF NOT EXISTS (public\.[a-z0-9_]+)/g)].map((m) => m[1])).toEqual([
      "public.b1_request_fee_decisions",
    ]);
    expect([...code.matchAll(/CREATE OR REPLACE FUNCTION (public\.[a-z0-9_]+)/g)].map((m) => m[1])).toEqual([
      "public.b1_fee_decision_step",
      "public.guard_b1_request_fee_decision_write",
      "public.record_b1_fee_decision",
      "public.get_b1_fee_decision",
    ]);
    expect(code).not.toMatch(/CREATE OR REPLACE FUNCTION public\.[a-z0-9_]*excused/);
    expect(code).not.toMatch(/(INSERT INTO|UPDATE|DELETE FROM|ALTER TABLE|DROP [A-Z]+) public\.excused_absence/i);
    expect(code).not.toMatch(/DROP\s|TRUNCATE|DELETE\s+FROM/i);
    // exposure: two RPCs for authenticated, nothing for anon, the table not at all
    expect([...draft.matchAll(/GRANT ([A-Z ]+) ON (FUNCTION|TABLE) (public\.[a-z0-9_]+)[^;]* TO ([a-z_, ]+);/g)].map((m) => `${m[3]}|${m[4]}`)).toEqual([
      "public.record_b1_fee_decision|authenticated",
      "public.get_b1_fee_decision|authenticated",
    ]);
    expect(draft).toContain("REVOKE ALL ON TABLE public.b1_request_fee_decisions FROM PUBLIC, anon, authenticated;");
    expect(draft).toContain("REVOKE ALL ON FUNCTION public.b1_fee_decision_step(uuid) FROM PUBLIC, anon, authenticated;");
    expect(draft).toContain("ALTER TABLE public.b1_request_fee_decisions ENABLE ROW LEVEL SECURITY;");
  });

  it("writes only its own table, workflow definitions and audit rows", () => {
    const inserts = [...new Set([...code.matchAll(/INSERT\s+INTO\s+(public\.[a-z0-9_]+)/gi)].map((m) => m[1]!))].sort();
    expect(inserts).toEqual([
      "public.b1_request_fee_decisions",
      "public.b1_workflow_runtime_contract_snapshot",
      "public.request_type_workflow_change_log",
      "public.request_type_workflow_steps",
      "public.request_type_workflow_transitions",
      "public.request_type_workflows",
      "public.request_workflow_publish_validations",
      "public.request_workflow_transition_condition_catalog",
      "public.student_request_workflow_events",
    ]);
    expect([...new Set([...code.matchAll(/UPDATE\s+(public\.[a-z0-9_]+)/gi)].map((m) => m[1]!))]).toEqual([
      "public.request_type_workflows",
    ]);
    expect(draft).not.toMatch(/INSERT\s+INTO\s+public\.notifications/i);
    expect(count(draft, "PERFORM public.create_notification(")).toBe(1);
    expect(draft).not.toContain("student_request_fee_assessments");
  });

  it("stores a decision plus ONE display-only amount — bounded, tied to the decision, never computed", () => {
    const table = draft.slice(draft.indexOf("CREATE TABLE IF NOT EXISTS public.b1_request_fee_decisions"), draft.indexOf("COMMENT ON TABLE"));
    expect([...table.matchAll(/^  ([a-z_]+) (uuid|text|timestamptz|numeric\(12,2\))/gm)].map((m) => `${m[1]}:${m[2]}`)).toEqual([
      "id:uuid", "request_id:uuid", "runtime_step_id:uuid", "service_code:text", "decision:text",
      "exemption_reason:text", "amount_due:numeric(12,2)", "note:text", "decided_by:uuid", "decided_at:timestamptz",
    ]);
    expect(table).toContain("AND amount_due IS NOT NULL AND amount_due > 0 AND amount_due <= 9999999.99)");
    expect(table).toContain("OR (decision = 'FEE_NOT_REQUIRED' AND exemption_reason IN ('FREE_SERVICE', 'EXEMPTION')");
    expect(table).toContain("AND amount_due IS NULL)");
    expect(table).toContain("CHECK (service_code IN ('department_transfer', 'final_chance'))");
    expect(table).not.toMatch(/currency|balance|receipt|invoice|paid|money/i);
    expect(draft).toContain("OR p_amount_due <= 0 OR p_amount_due > 9999999.99 OR p_amount_due <> round(p_amount_due, 2)) THEN 'amount_due'");
    expect(draft).toContain("WHEN p_decision = 'FEE_NOT_REQUIRED' AND p_amount_due IS NOT NULL THEN 'amount_due'");
    expect(draft).toContain("' ريال. سدّد الرسوم في النظام الجامعي الرئيسي");
    expect(draft).not.toMatch(/amount_due\s*[-+*\/]\s*[a-z0-9]|[a-z0-9)]\s*[-+*\/]\s*(p_)?amount_due|sum\((d\.)?amount_due/i);
    expect(draft).toContain("RAISE EXCEPTION 'B1_FEE_DECISION_IS_IMMUTABLE'");
    expect(draft).toContain("BEFORE INSERT OR UPDATE OR DELETE ON public.b1_request_fee_decisions");
  });

  it("authorizes the decision exactly like acting on the step, before it writes anything", () => {
    const rpc = draft.slice(draft.indexOf("CREATE OR REPLACE FUNCTION public.record_b1_fee_decision("), draft.indexOf("CREATE OR REPLACE FUNCTION public.get_b1_fee_decision("));
    const gate = rpc.indexOf("IF NOT public.can_current_user_act_on_step(p_step_id, 'review') THEN");
    expect(gate).toBeGreaterThan(0);
    expect(gate).toBeLessThan(rpc.indexOf("INSERT INTO public.b1_request_fee_decisions"));
    expect(rpc).toContain("B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED");
    expect(rpc).toContain("B1_FEE_DECISION_ROUTING_MISMATCH");
    expect(rpc).not.toMatch(/has_role|is_admin|admin_/i);
  });

  it("patches two functions through checked anchors and publishes both workflows data-driven", () => {
    expect([...draft.matchAll(/^\s+\(\d, '(public\.[a-z0-9_]+)\([^']*', '(B1PFD01:[a-z-]+)',$/gm)].map((m) => `${m[1]}|${m[2]}`)).toEqual([
      "public.act_on_b1_student_request_step_atomic|B1PFD01:fee-decision-required",
      "public.evaluate_workflow_transition_condition|B1PFD01:fee-not-required-condition",
    ]);
    for (const guard of [
      "B1_PFD01_PATCH_ANCHOR_MUST_MATCH_EXACTLY_ONCE",
      "B1_PFD01_PATCH_NOT_EFFECTIVE",
      "B1_PFD01_FEE_CONDITION_MUST_BE_ACTIVE_IN_CATALOG",
      "B1_PFD01_REGISTRAR_DIRECT_ASSIGNEE_MUST_RESOLVE_EXACTLY_ONCE",
      "B1_PFD01_REQUEST_TYPE_MUST_RESOLVE_EXACTLY_ONCE",
      "B1_PFD01_ACTIVE_WORKFLOW_MUST_RESOLVE_EXACTLY_ONCE",
      "B1_PFD01_UNEXPECTED_ACTIVE_WORKFLOW_CODE",
      "B1_PFD01_UNEXPECTED_WORKFLOW_SHAPE",
      "B1_PFD01_RUNTIME_CONTRACT_PIN_INCOMPLETE",
      "B1_PFD01_POST_WORKFLOW_SHAPE_INVALID",
      "B1_PFD01_POST_PROTECTED_STATE_CHANGED",
    ]) {
      expect(draft, guard).toContain(guard);
    }
    expect(draft).toContain("('department_transfer'::text, 'dean_approval'::text), ('final_chance', 'dean_decision')");
    expect(draft).toContain("PERFORM public.validate_request_workflow_publish(v_new);");
    // payment is skippable ONLY as the copied payment step; the fee step never is
    expect(draft).toContain("v_row.id = v_pay AND NOT v_row.is_fee_step,");
    expect(draft).toContain("jsonb_build_object('code', 'B1_FEE_NOT_REQUIRED', 'params', '{}'::jsonb), false, 100)");
    expect(draft).toContain("WHERE t.workflow_id = v_old.id AND t.from_step_id IS DISTINCT FROM v_dean");
    expect(draft).not.toContain("FEE_IS_ZERO");
  });
});

describe(`${PKG} — readiness files`, () => {
  it("pre-flight and verification are read-only single statements", () => {
    for (const [name, sql] of [["preflight", preflight], ["verify", verify]] as const) {
      const code = executable(sql);
      expect((code.match(/;/g) ?? []).length, name).toBe(1);
      expect(code.trim().startsWith("WITH"), name).toBe(true);
      expect(code, name).not.toMatch(
        /\b(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|EXECUTE|PERFORM|CALL|COPY|LOCK|SET|DO)\b/,
      );
      expect(code, name).not.toMatch(/FOR\s+(UPDATE|SHARE)|nextval|set_config|pg_advisory/i);
    }
    expect(preflight).toContain("AS ready_to_apply");
    expect(verify).toContain("AS applied_correctly");
    expect(preflight).toContain("AS excused_absence_package_applied");
    expect(verify).toContain("excused_absence_workflow_still_active");
  });

  it("the pre-flight checks the draft's two anchors verbatim", () => {
    for (const anchor of [
      "'PERFORM public.b1_excused_absence_before_step_action(v_step.id, v_action, p_comment);'",
      "'ELSIF v_code = ''FEE_GREATER_THAN_ZERO'' THEN'",
    ]) {
      expect(draft).toContain(anchor);
      expect(preflight).toContain(anchor);
    }
    for (const marker of ["B1PFD01:fee-decision-required", "B1PFD01:fee-not-required-condition"]) {
      expect(preflight).toContain(marker);
      expect(verify).toContain(marker);
    }
  });

  it("the rollback is a guarded draft that deletes nothing and refuses once requests exist", () => {
    expect(rollback.split("\n")[0]).toBe("-- DRAFT ONLY — DO NOT APPLY FROM THIS PATH.");
    const code = executable(rollback);
    expect(code).not.toMatch(/DELETE\s+FROM|TRUNCATE|DROP\s+|ALTER\s+|CREATE\s+/i);
    expect([...new Set([...code.matchAll(/UPDATE\s+(public\.[a-z0-9_]+)/gi)].map((m) => m[1]!))]).toEqual([
      "public.request_type_workflows",
    ]);
    expect(rollback).toContain("B1_PFD01_ROLLBACK_BLOCKED_REQUESTS_EXIST_ON_NEW_VERSION");
  });

  it("the superseded mandatory-payment draft cannot be applied by mistake", () => {
    expect(existsSync(join(ROOT, "docs", "migration-drafts", "B1-PAID-SERVICES-ZERO-FEE-SKIP-FIX-01.sql"))).toBe(false);
    const old = read("docs", "migration-drafts", "B1-PAID-SERVICES-ZERO-FEE-SKIP-FIX-01.SUPERSEDED.NOT_APPLIED.sql");
    expect(old.indexOf("RAISE EXCEPTION 'B1_PAID_FIX01_SUPERSEDED_DO_NOT_APPLY'")).toBeLessThan(old.indexOf("BEGIN;"));
    expect(read(...HARNESS, "04-cases-after-fix.SUPERSEDED.sql")).toContain("RAISE EXCEPTION 'SUPERSEDED_DO_NOT_RUN'");
    expect(read("docs", "reviews", "B1-PAID-SERVICES-ZERO-FEE-CHECK-01.md")).toContain(`docs/reviews/${PKG}.md`);
  });

  it("ships an isolated rehearsal and the same chain as a CI leg", () => {
    const run = read(...HARNESS, "run.sh");
    for (const text of [
      "listen_addresses=''",
      "APPLIED excused-absence draft (production state)",
      "IDEMPOTENCY_FINGERPRINT_MISMATCH",
      "PREFLIGHT_QUERY_IS_NOT_READ_ONLY",
      "VERIFY_QUERY_IS_NOT_READ_ONLY",
      "ROLLBACK_IS_NOT_IDEMPOTENT",
      "ROLLBACK_RAN_ALTHOUGH_REQUESTS_EXIST_ON_THE_NEW_VERSIONS",
      "EXCUSED_ABSENCE_CASES_FAILED_AFTER_THIS_DRAFT",
      "B1_PAID_SERVICES_REGISTRAR_FEE_DECISION_01_REHEARSAL_PASS",
    ]) {
      expect(run, text).toContain(text);
    }
    expect((run.match(/^probe "/gm) ?? []).length).toBe(8);
    expect(run).not.toMatch(/supabase\.co|DATABASE_URL|SUPABASE_/);
    const cases = read(...HARNESS, "05-cases-fee-decision.sql");
    for (const proof of [
      "13 other principals are refused the fee decision",
      "the registrar cannot complete the step without a recorded decision",
      "amount missing / zero / negative / over bound / 3 decimals / NaN / given with no-fee are refused",
      "byte-identical",
      "the notification states the amount exactly once with «ريال» and where to pay",
      "exactly one notification, addressed to the request''s student only",
      "the amount cannot be updated",
      "finance cannot confirm a payment that was not required",
      "payment_confirmation SKIPPED, registrar_apply active",
      "the in-flight version-2 request is byte-identical and still on version 2",
      "the request completes end to end and the academic effect is applied exactly once",
    ]) {
      expect(cases, proof).toContain(proof);
    }
    const ci = read(".github", "workflows", "ci.yml");
    expect(ci).toContain("- name: b1-paid-services-registrar-fee-decision");
    expect(count(ci, `docs/migration-drafts/${PKG}.sql`)).toBe(2);
    for (const file of ["00a-applied-effects.sql", "01a-applied-v2-publish.sql", "03-cases-v2-as-deployed.sql", "05-cases-fee-decision.sql", "06-before-absence-cases.sql"]) {
      expect(ci, file).toContain(`${HARNESS.join("/")}/${file}`);
    }
  });

  it("AGENTS.md grants the display-only amount to these two services as well", () => {
    // Source must not get ahead of the project rule: this fails until the
    // owner-approved exception line names the two services (review doc, section 9).
    const agents = read("AGENTS.md");
    const exception = agents.slice(agents.indexOf("### استثناء معتمد من المالك — مبلغ للعرض فقط"), agents.indexOf("## الوثائق"));
    expect(exception).toContain("«غياب بعذر»");
    expect(exception).toContain("«التحويل بين الأقسام»");
    expect(exception).toContain("«الفرصة الأخيرة»");
    expect(exception).toContain("للعرض فقط");
  });

  it("is documented in Arabic and the doc embeds both queries verbatim", () => {
    const doc = read("docs", "reviews", `${PKG}.md`);
    for (const text of [
      "`registrar_fee_decision`", "`payment_confirmation`", "`registrar_apply`", "`dean_approval`", "`dean_decision`",
      "`source_department_head_approval`", "`target_department_head_approval`", "`manager_review`",
      "جدول الخطوات", "قرار الرسوم", "الإشعارات", "مصفوفة التفويض", "الطلبات القائمة", "الكائنات",
      "المخاطر", "إجراء التطبيق", "إجراء التراجع", "AGENTS.md",
      `docs/migration-drafts/${PKG}.rollback-by-forward.sql`,
    ]) {
      expect(doc, text).toContain(text);
    }
    expect(doc).toContain(preflight.trimEnd());
    expect(doc).toContain(verify.trimEnd());
    expect(doc).toMatch(/PASS|HOLD/);
  });
});

describe("TypeScript contract — three services share one registrar fee decision", () => {
  it("binds each service to its step, its RPCs and its no-fee condition", () => {
    expect([...B1_FEE_DECISION_SERVICES]).toEqual(["excused_absence", "department_transfer", "final_chance"]);
    expect(B1_FEE_DECISION_BINDINGS.excused_absence).toEqual({
      stepKey: "registrar_fee_referral",
      stepWhenNotRequired: "department_head_signature",
      recordRpc: "record_excused_absence_fee_decision",
      readRpc: "get_excused_absence_fee_decision",
      notRequiredCondition: "EXCUSED_ABSENCE_FEE_NOT_REQUIRED",
    });
    for (const service of ["department_transfer", "final_chance"] as const) {
      expect(B1_FEE_DECISION_BINDINGS[service]).toEqual({
        stepKey: "registrar_fee_decision",
        stepWhenNotRequired: "registrar_apply",
        recordRpc: "record_b1_fee_decision",
        readRpc: "get_b1_fee_decision",
        notRequiredCondition: "B1_FEE_NOT_REQUIRED",
      });
      expect(B1_FEE_POLICIES[service]).toBe("REGISTRAR_FEE_DECISION_EXTERNAL_PAYMENT");
      expect(B1_SERVICE_ADAPTERS[service].feePolicy).toBe("REGISTRAR_FEE_DECISION_EXTERNAL_PAYMENT");
      expect(getB1ServiceConfig(service)!.feePolicyLabelAr).toContain("مسجل الكلية");
    }
    expect(getB1FeeDecisionService("transfer")).toBe("department_transfer");
    expect(getB1FeeDecisionService("extra_chance")).toBe("final_chance");
    for (const other of ["enrollment_suspension", "file_withdrawal", "enrollment_certificate", null, ""]) {
      expect(getB1FeeDecisionService(other), String(other)).toBeNull();
      expect(getB1FeeDecisionRpcs(other), String(other)).toBeNull();
    }
    expect(() => resolveB1FeeDecisionRpcName("file_withdrawal", "recordRpc")).toThrow("B1_FEE_DECISION_SERVICE_NOT_SUPPORTED");
  });

  it("keeps every version-2 step in order and inserts the fee decision right before payment", () => {
    expect(B1_WORKFLOWS.department_transfer.map((step) => `${step.key}:${step.unit}/${step.role}:${step.action}`)).toEqual([
      "student_affairs_intake:student_affairs/student_affairs_specialist:review",
      "source_department_head_approval:department/department_head:approve",
      "target_department_head_approval:department/department_head:approve",
      "dean_approval:dean/dean:approve",
      "registrar_fee_decision:registrar/registrar_general:review",
      "payment_confirmation:finance/revenue_finance_officer:confirm_payment",
      "registrar_apply:registrar/registrar_general:apply_decision",
    ]);
    expect(B1_WORKFLOWS.final_chance.map((step) => `${step.key}:${step.unit}/${step.role}:${step.action}`)).toEqual([
      "student_affairs_intake:student_affairs/student_affairs_specialist:review",
      "manager_review:student_affairs/student_affairs_manager:approve",
      "dean_decision:dean/dean:approve",
      "registrar_fee_decision:registrar/registrar_general:review",
      "payment_confirmation:finance/revenue_finance_officer:confirm_payment",
      "registrar_apply:registrar/registrar_general:apply_decision",
    ]);
    expect(B1_STEP_LABELS_AR.registrar_fee_decision).toBe("قرار مسجل الكلية بشأن الرسوم");
    for (const service of B1_FEE_DECISION_SERVICES) {
      expect(isB1FeeDecisionStep(service, B1_FEE_DECISION_BINDINGS[service].stepKey)).toBe(true);
      for (const step of B1_WORKFLOWS[service]) {
        expect(isB1FeeDecisionStep(service, step.key), `${service}/${step.key}`).toBe(
          step.key === B1_FEE_DECISION_BINDINGS[service].stepKey,
        );
      }
    }
    expect(isB1FeeDecisionStep("department_transfer", "registrar_fee_referral")).toBe(false);
    expect(isB1FeeDecisionStep("excused_absence", "registrar_fee_decision")).toBe(false);
    expect(isB1FeeDecisionStep("file_withdrawal", "registrar_apply")).toBe(false);
  });

  it("routes both branches and lets finance confirm only a required payment", () => {
    for (const service of ["department_transfer", "final_chance"] as const) {
      expect(resolveStepAfterB1FeeDecision(service, "FEE_REQUIRED")).toBe("payment_confirmation");
      expect(resolveStepAfterB1FeeDecision(service, "FEE_NOT_REQUIRED")).toBe("registrar_apply");
      expect(b1StepsForFeeDecision(service, "FEE_NOT_REQUIRED").map((step) => step.key)).toEqual(
        B1_WORKFLOWS[service].map((step) => step.key).filter((key) => key !== "payment_confirmation"),
      );
      expect(b1StepsForFeeDecision(service, null)).toEqual(B1_WORKFLOWS[service]);
    }
    expect(resolveStepAfterB1FeeDecision("excused_absence", "FEE_NOT_REQUIRED")).toBe("department_head_signature");
    expect(canConfirmB1PaymentAfterFeeDecision("FEE_REQUIRED")).toBe(true);
    for (const decision of ["FEE_NOT_REQUIRED", null, undefined] as const) {
      expect(canConfirmB1PaymentAfterFeeDecision(decision)).toBe(false);
    }
  });

  it("allows only the fee step's exact direct assignee to record the decision", () => {
    for (const service of ["department_transfer", "final_chance"] as const) {
      const allow = {
        service,
        stepKey: "registrar_fee_decision",
        authenticatedUserId: "u",
        assignedUserId: "u",
        actorUnit: "registrar",
        actorRole: "registrar_general",
        stepStatus: "active",
        stepRequestId: "r",
        actionRequestId: "r",
        predecessorComplete: true,
      };
      expect(canRecordB1FeeDecision(allow)).toBe(true);
      const denials: Array<[string, object]> = [
        ["anonymous", { authenticatedUserId: null }],
        ["another user", { authenticatedUserId: "x" }],
        ["no assignee", { assignedUserId: null }],
        ["dean", { actorUnit: "dean", actorRole: "dean" }],
        ["finance", { actorUnit: "finance", actorRole: "revenue_finance_officer" }],
        ["department head", { actorUnit: "department", actorRole: "department_head" }],
        ["admin role", { actorRole: "admin" }],
        ["pending step", { stepStatus: "pending" }],
        ["completed step", { stepStatus: "completed" }],
        ["other request", { actionRequestId: "r2" }],
        ["predecessor incomplete", { predecessorComplete: false }],
        ["apply step", { stepKey: "registrar_apply" }],
        ["payment step", { stepKey: "payment_confirmation" }],
        ["excused step key", { stepKey: "registrar_fee_referral" }],
        ["free service", { service: "file_withdrawal" }],
      ];
      for (const [label, patch] of denials) {
        expect(canRecordB1FeeDecision({ ...allow, ...patch }), `${service}/${label}`).toBe(false);
      }
    }
  });

  it("calls the service's own RPC with the shared argument contract", async () => {
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const client = {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        return { data: { success: true }, error: null };
      },
    } as never;
    await rpcRecordExcusedAbsenceFeeDecision(client, { stepId: "s", decision: "FEE_REQUIRED", amountDue: "12500.5" }, "department_transfer");
    await rpcRecordExcusedAbsenceFeeDecision(client, { stepId: "s", decision: "FEE_NOT_REQUIRED", exemptionReason: "EXEMPTION" }, "final_chance");
    await rpcRecordExcusedAbsenceFeeDecision(client, { stepId: "s", decision: "FEE_REQUIRED", amountDue: "1" });
    await rpcGetExcusedAbsenceFeeDecision(client, "r", "final_chance");
    await rpcGetExcusedAbsenceFeeDecision(client, "r");
    expect(calls.map((call) => call.fn)).toEqual([
      "record_b1_fee_decision",
      "record_b1_fee_decision",
      "record_excused_absence_fee_decision",
      "get_b1_fee_decision",
      "get_excused_absence_fee_decision",
    ]);
    expect(calls[0]!.args).toEqual({ p_step_id: "s", p_decision: "FEE_REQUIRED", p_exemption_reason: null, p_note: null, p_amount_due: "12500.50" });
    expect(calls[1]!.args).toEqual({ p_step_id: "s", p_decision: "FEE_NOT_REQUIRED", p_exemption_reason: "EXEMPTION", p_note: null, p_amount_due: null });
    await expect(rpcRecordExcusedAbsenceFeeDecision(client, { stepId: "s", decision: "FEE_REQUIRED", amountDue: "1" }, "file_withdrawal")).rejects.toThrow(
      "B1_FEE_DECISION_SERVICE_NOT_SUPPORTED",
    );
    await expect(rpcRecordExcusedAbsenceFeeDecision(client, { stepId: "s", decision: "FEE_REQUIRED" }, "final_chance")).rejects.toThrow(
      "B1_EXCUSED_ABSENCE_FEE_DECISION_INPUT_INVALID:amount_due_required",
    );
    expect(calls.length).toBe(5);
  });

  it("maps the new database codes to Arabic and exposes none raw", () => {
    for (const code of ["B1_FEE_DECISION_REQUIRED", "B1_FEE_DECISION_RPC_REQUIRED"]) {
      expect(isB1BusinessRuleError(code)).toBe(true);
      expect(b1BusinessRuleMessageAr(code)).toMatch(/[؀-ۿ]/);
      expect(b1BusinessRuleMessageAr(code)).not.toContain("B1_");
    }
    const mapping = read("src", "lib", "student-requests", "b1-ui", "b1-business-error-mapping.ts");
    for (const code of new Set([...draft.matchAll(/RAISE EXCEPTION '(B1_FEE_DECISION_[A-Z_]+)/g)].map((m) => m[1]!))) {
      const known = mapping.includes(code) || /B1_FEE_DECISION_(IS_IMMUTABLE|ROUTING_MISMATCH|INPUT_INVALID)/.test(code);
      expect(known, code).toBe(true);
    }
  });
});

describe("mock adapter and UI — the same card for the three services", () => {
  const FORMS = {
    final_chance: { target_academic_year: "2025/2026", target_semester: "الأول", reason: "ظرف أكاديمي موثق (بيانات تجريبية)." },
  } as const;

  async function denied(promise: Promise<unknown>, code: string) {
    try {
      await promise;
    } catch (error) {
      expect(error).toBeInstanceOf(B1AdapterError);
      expect((error as B1AdapterError).code).toBe(code);
      return;
    }
    throw new Error(`expected ${code}`);
  }

  async function finalChanceAtFeeStep() {
    const adapter = createMockB1UiAdapter();
    const draftRequest = await adapter.createB1RequestDraft("final_chance");
    const saved = await adapter.saveB1RequestDraft(draftRequest.requestId, FORMS.final_chance, draftRequest.updatedAt);
    await adapter.submitB1Request(draftRequest.requestId, saved.updatedAt);
    const active = async () =>
      (await adapter.getAssignedB1Requests()).find((row) => row.requestId === draftRequest.requestId);
    for (const [key, action] of [["student_affairs_intake", "review"], ["manager_review", "approve"], ["dean_decision", "approve"]] as const) {
      const item = await active();
      expect(item!.stepKey).toBe(key);
      await adapter.actOnB1RequestStep(item!.stepId, action);
    }
    return { adapter, requestId: draftRequest.requestId, active };
  }

  it("final chance: FEE_NOT_REQUIRED skips payment; the step needs a decision; wrong service is refused", async () => {
    const { adapter, requestId, active } = await finalChanceAtFeeStep();
    const item = await active();
    expect(item!.stepKey).toBe("registrar_fee_decision");
    await denied(adapter.actOnB1RequestStep(item!.stepId, "review"), "BUSINESS_RULE_BLOCKED");
    await denied(adapter.recordB1ExcusedAbsenceFeeDecision(item!.stepId, { decision: "FEE_REQUIRED" }), "VALIDATION_ERROR");
    await denied(
      adapter.recordB1ExcusedAbsenceFeeDecision(item!.stepId, { decision: "FEE_NOT_REQUIRED", exemptionReason: "EXEMPTION", amountDue: "5" }),
      "VALIDATION_ERROR",
    );
    await denied(
      adapter.recordB1ExcusedAbsenceFeeDecision(item!.stepId, {
        decision: "FEE_NOT_REQUIRED", exemptionReason: "EXEMPTION", serviceCode: "excused_absence",
      }),
      "PERMISSION_DENIED",
    );
    expect(await adapter.getB1ExcusedAbsenceFeeDecision(requestId, "final_chance")).toBeNull();
    await adapter.recordB1ExcusedAbsenceFeeDecision(item!.stepId, {
      decision: "FEE_NOT_REQUIRED", exemptionReason: "FREE_SERVICE", serviceCode: "final_chance",
    });
    expect((await active())!.stepKey).toBe("registrar_apply");
    expect((await adapter.getB1RequestDetails(requestId)).steps.map((step) => step.key)).not.toContain("payment_confirmation");
    expect(await adapter.getB1ExcusedAbsenceFeeDecision(requestId, "final_chance")).toMatchObject({
      decision: "FEE_NOT_REQUIRED", exemptionReason: "FREE_SERVICE", amountDue: null,
    });
  });

  it("final chance: FEE_REQUIRED keeps payment and shows the display-only value", async () => {
    const { adapter, requestId, active } = await finalChanceAtFeeStep();
    const item = await active();
    await adapter.recordB1ExcusedAbsenceFeeDecision(item!.stepId, { decision: "FEE_REQUIRED", amountDue: "12500.5", serviceCode: "final_chance" });
    expect((await active())!.stepKey).toBe("payment_confirmation");
    expect(await adapter.getB1ExcusedAbsenceFeeDecision(requestId)).toMatchObject({ decision: "FEE_REQUIRED", amountDue: "12500.50" });
    await denied(
      adapter.recordB1ExcusedAbsenceFeeDecision(item!.stepId, { decision: "FEE_NOT_REQUIRED", exemptionReason: "EXEMPTION" }),
      "PERMISSION_DENIED",
    );
  });

  it("the seeded transfer waits on finance after a recorded FEE_REQUIRED decision", async () => {
    const adapter = createMockB1UiAdapter();
    const seeded = (await adapter.getAssignedB1Requests()).find((row) => row.serviceCode === "department_transfer");
    expect(seeded!.stepKey).toBe("payment_confirmation");
    expect(await adapter.getB1ExcusedAbsenceFeeDecision(seeded!.requestId, "department_transfer")).toMatchObject({
      decision: "FEE_REQUIRED", amountDue: "5000",
    });
  });

  it("the staff section and the student view use the generic contract, not a service name", () => {
    const section = read("src", "components", "student-requests", "b1", "B1StaffStepActionSection.tsx");
    const detail = read("src", "components", "student-requests", "b1", "B1StudentRequestDetail.tsx");
    expect(section).toContain("isB1FeeDecisionStep(requestTypeCode, stepKey) && contract.action === \"review\"");
    expect(section).toContain("serviceCode: feeDecisionService,");
    expect(section).toContain("{ ...submission, serviceCode: params.serviceCode }");
    expect(detail).toContain("const feeDecisionService = getB1FeeDecisionService(loaded.serviceCode);");
    expect(detail).not.toMatch(/recordB1ExcusedAbsenceFeeDecision|<button|<input|<form/);
  });
});
