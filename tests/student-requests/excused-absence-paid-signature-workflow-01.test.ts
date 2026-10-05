/**
 * EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01
 *
 * Source contract for moving «غياب بعذر» from the free three-step cycle to
 * dean review → registrar fee referral → external payment confirmation →
 * department-head / dean / student-affairs-manager signatures → registrar →
 * archive.
 *
 * The executable proof (apply twice, fail-closed probes, direct-RPC allow/deny
 * matrix on every step) lives in scripts/excused-absence-paid-signature-01-pg17
 * and runs as a "PG 17 verifier" CI leg. This file pins the source side: the
 * TypeScript contract, the migration DRAFT, the anchors it patches, and the
 * wording the student sees.
 */

import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  B1_FEE_POLICIES,
  B1_SERVICE_ADAPTERS,
  B1_STUDENT_DEPARTMENT_SCOPED_STEPS,
  B1_WORKFLOWS,
  EXCUSED_ABSENCE_LEGACY_FREE_WORKFLOW,
} from "../../src/lib/student-requests/request-service-adapter";
import {
  B1_EXTERNAL_PAYMENT_STEP_KEY,
  B1_EXTERNAL_PAYMENT_STUDENT_GUIDANCE_AR,
  B1_FEE_POLICY_LABELS_AR,
  B1_STEP_LABELS_AR,
  getB1ServiceConfig,
} from "../../src/lib/student-requests/b1-ui/service-config";
import { getStudentRequestFormDefinition } from "../../src/lib/student-requests/request-form-registry";
import { getCanonicalWorkflowPreview } from "../../src/lib/student-requests/request-workflow-preview-registry";

const root = process.cwd();
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8").replace(/\r\n/g, "\n");

const DRAFT_PATH = ["docs", "migration-drafts", "EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01.sql"];
const draft = read(...DRAFT_PATH);
/** SQL with `--` line comments removed (the header legitimately names what the draft never does). */
const draftSql = draft
  .split("\n")
  .map((line) => (line.trimStart().startsWith("--") ? "" : line))
  .join("\n");

const migrationsDir = join(root, "supabase", "migrations");
const migration = (prefix: string) => {
  const matches = readdirSync(migrationsDir).filter((name) => name.startsWith(prefix));
  expect(matches, `exactly one migration starts with ${prefix}`).toHaveLength(1);
  return read("supabase", "migrations", matches[0]!);
};

/** Extracts one `CREATE OR REPLACE FUNCTION public.<name>(` … `$tag$;` statement. */
function functionSource(sql: string, name: string): string {
  const start = sql.search(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\s*\\(`, "i"));
  expect(start, `${name} is defined`).toBeGreaterThanOrEqual(0);
  const rest = sql.slice(start);
  const tag = /AS\s+(\$[A-Za-z_]*\$)/.exec(rest)!;
  const bodyStart = tag.index + tag[0].length;
  const bodyEnd = rest.indexOf(tag[1]!, bodyStart);
  return rest.slice(0, bodyEnd + tag[1]!.length);
}

const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

type DraftStep = { key: string; name_ar: string; unit: string; role: string; action: string; action_code: string; scope: string };
const draftSteps: DraftStep[] = draft
  .split("\n")
  .filter((line) => line.includes("jsonb_build_object('key',"))
  .map((line) => {
    const field = (name: string) => new RegExp(`'${name}','([^']*)'`).exec(line)?.[1] ?? "";
    return {
      key: field("key"),
      name_ar: field("name_ar"),
      unit: field("unit"),
      role: field("role"),
      action: field("action"),
      action_code: field("action_code"),
      scope: field("scope"),
    };
  });

const draftTransitions = draft
  .split("\n")
  .filter((line) => line.includes("jsonb_build_object('from',"))
  .map((line) => ({
    from: /'from',(NULL|'([^']*)')/.exec(line)![2] ?? null,
    to: /'to',(NULL|'([^']*)')/.exec(line)![2] ?? null,
    result: /'result','([^']*)'/.exec(line)![1]!,
  }));

const EXPECTED_STEPS = [
  ["dean_review", "dean", "dean", "review", "REVIEW"],
  ["registrar_fee_referral", "registrar", "registrar_general", "review", "REVIEW"],
  ["payment_confirmation", "finance", "revenue_finance_officer", "confirm_payment", "PAYMENT_CONFIRMATION"],
  ["department_head_signature", "department", "department_head", "approve", "APPROVE"],
  ["dean_signature", "dean", "dean", "approve", "APPROVE"],
  ["student_affairs_manager_signature", "student_affairs", "student_affairs_manager", "approve", "APPROVE"],
  ["record_apply", "registrar", "registrar_general", "apply_decision", "REGISTER_EXCUSED_ABSENCE"],
  ["archive", "archive", "archive_officer", "archive", "ARCHIVE"],
] as const;

describe("EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01 — TypeScript contract", () => {
  it("declares the eight-step cycle with a processing unit and role on every staff step", () => {
    expect(B1_WORKFLOWS.excused_absence.map((s) => [s.key, s.unit, s.role, s.action])).toEqual(
      EXPECTED_STEPS.map(([key, unit, role, action]) => [key, unit, role, action]),
    );
    for (const step of B1_WORKFLOWS.excused_absence) {
      expect(step.unit.trim().length, `${step.key} unit`).toBeGreaterThan(0);
      expect(step.role.trim().length, `${step.key} role`).toBeGreaterThan(0);
    }
    expect(new Set(B1_WORKFLOWS.excused_absence.map((s) => s.key)).size).toBe(8);
  });

  it("is an external-payment service everywhere the policy is read", () => {
    expect(B1_FEE_POLICIES.excused_absence).toBe("EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION");
    expect(B1_SERVICE_ADAPTERS.excused_absence.feePolicy).toBe("EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION");
    expect(B1_SERVICE_ADAPTERS.excused_absence.activationBlockedReason).toBeUndefined();
    const config = getB1ServiceConfig("excused_absence")!;
    expect(config.feePolicy).toBe("EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION");
    expect(config.feePolicyLabelAr).toBe(B1_FEE_POLICY_LABELS_AR.EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION);
    expect(config.feePolicyLabelAr).toContain("النظام الجامعي الرئيسي");
    expect(getB1ServiceConfig("absence_excuse")).toBe(config);
  });

  it("keeps student attachments mandatory at submission", () => {
    expect(getB1ServiceConfig("excused_absence")!.requiresAttachments).toBe(true);
    expect(
      (getStudentRequestFormDefinition("excused_absence")!.requiredAttachments ?? []).map((a) => [a.key, a.required]),
    ).toEqual([["excuse_documents", true]]);
    const valid = {
      course_section_id: "section", absence_date: "2026-10-01", reason_type: "medical",
      absence_reason_detail: "detail",
      excuse_documents: { fileName: "excuse.pdf", storagePath: "student-requests/s/r/excuse.pdf" },
    };
    expect(B1_SERVICE_ADAPTERS.excused_absence.validate(valid).valid).toBe(true);
    expect(B1_SERVICE_ADAPTERS.excused_absence.validate({ ...valid, excuse_documents: null }).errors).toMatchObject({
      excuse_documents: "secure_attachment_required",
    });
  });

  it("labels every new step in Arabic for the student timeline and the admin preview", () => {
    const preview = getCanonicalWorkflowPreview("excused_absence")!;
    for (const step of B1_WORKFLOWS.excused_absence) {
      const uiLabel = B1_STEP_LABELS_AR[step.key];
      expect(uiLabel, `${step.key} student label`).toBeTruthy();
      expect(/[؀-ۿ]/.test(uiLabel!)).toBe(true);
      const previewLabel = preview.steps.find((s) => s.key === step.key)!.labelAr;
      expect(previewLabel).not.toBe(step.key);
      expect(/[؀-ۿ]/.test(previewLabel)).toBe(true);
    }
    expect(B1_STEP_LABELS_AR.registrar_fee_referral).toBe("إحالة الطلب لسداد الرسوم");
    expect(B1_STEP_LABELS_AR.department_head_signature).toContain("توقيع رئيس القسم");
    expect(B1_STEP_LABELS_AR.dean_signature).toContain("توقيع العميد");
    expect(B1_STEP_LABELS_AR.student_affairs_manager_signature).toContain("توقيع مدير شؤون الطلاب");
  });

  it("tells the student to pay in the university's main system — never inside the portal", () => {
    expect(B1_EXTERNAL_PAYMENT_STEP_KEY).toBe("payment_confirmation");
    expect(B1_EXTERNAL_PAYMENT_STUDENT_GUIDANCE_AR).toContain("النظام الجامعي الرئيسي");
    expect(B1_EXTERNAL_PAYMENT_STUDENT_GUIDANCE_AR).toContain("لا يتم أي سداد داخل هذه البوابة");
    const everyStudentString = [
      B1_EXTERNAL_PAYMENT_STUDENT_GUIDANCE_AR,
      ...B1_WORKFLOWS.excused_absence.map((s) => B1_STEP_LABELS_AR[s.key]!),
      ...getCanonicalWorkflowPreview("excused_absence")!.steps.map((s) => s.labelAr),
    ];
    for (const text of everyStudentString) {
      expect(text).not.toMatch(
        /\b(amount|currency|invoice|gateway|wallet|balance|payment_url|transaction)\b|فاتورة|محفظة|رصيد|بوابة دفع|مبلغ|عملة|ريال|دولار|\d/i,
      );
    }
    const detail = read("src", "components", "student-requests", "b1", "B1StudentRequestDetail.tsx");
    expect(detail).toContain("activeStep?.key === B1_EXTERNAL_PAYMENT_STEP_KEY");
    expect(detail).toContain("{B1_EXTERNAL_PAYMENT_STUDENT_GUIDANCE_AR}");
    expect(detail).not.toMatch(/confirmB1RevenueReceipt|record_external_university_payment_confirmation/);
    expect(detail).not.toMatch(/<button|<input|<form/);
  });

  it("scopes exactly one step to the student's department", () => {
    expect(B1_STUDENT_DEPARTMENT_SCOPED_STEPS).toEqual({ excused_absence: ["department_head_signature"] });
    expect(
      B1_WORKFLOWS.excused_absence.filter((s) => s.role === "department_head").map((s) => s.key),
    ).toEqual(["department_head_signature"]);
  });
});

describe("EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01 — migration draft", () => {
  it("is a draft, transaction-wrapped, and lives only under docs/migration-drafts", () => {
    expect(draft.split("\n")[0]).toBe("-- DRAFT ONLY — DO NOT APPLY FROM THIS PATH.");
    expect(occurrences(draftSql, "\nBEGIN;\n")).toBe(1);
    expect(draftSql.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(occurrences(draftSql, "COMMIT;")).toBe(1);
    expect(
      readdirSync(migrationsDir).some((name) => /excused[-_]absence[-_](paid|external)/i.test(name)),
    ).toBe(false);
    for (const name of readdirSync(migrationsDir)) {
      if (!name.endsWith(".sql")) continue;
      expect(
        readFileSync(join(migrationsDir, name), "utf8").includes("excused_absence_external_payment_workflow"),
        `${name} must not reference the unapplied workflow`,
      ).toBe(false);
    }
  });

  it("declares exactly the eight steps of the TypeScript contract, each with unit, role and catalog action", () => {
    expect(draftSteps.map((s) => [s.key, s.unit, s.role, s.action, s.action_code])).toEqual(
      EXPECTED_STEPS.map((s) => [...s]),
    );
    expect(draftSteps.map((s) => [s.key, s.unit, s.role, s.action])).toEqual(
      B1_WORKFLOWS.excused_absence.map((s) => [s.key, s.unit, s.role, s.action]),
    );
    for (const step of draftSteps) {
      expect(/[؀-ۿ]/.test(step.name_ar), `${step.key} Arabic name`).toBe(true);
      expect(step.name_ar).not.toMatch(/مبلغ|عملة|ريال|\d/);
    }
    expect(draftSteps.find((s) => s.key === "registrar_fee_referral")!.name_ar).toBe("إحالة الطلب لسداد الرسوم");
    expect(draftSteps.filter((s) => s.scope !== "request").map((s) => [s.key, s.scope])).toEqual([
      ["department_head_signature", "student_department"],
    ]);
    expect(draftSql).toContain("'specific_user'");
    expect(draftSql).toContain("'authorization', 'exactly_one_direct_assignee'");
  });

  it("declares a single linear path with no fee branch", () => {
    expect(draftTransitions).toEqual([
      { from: null, to: "dean_review", result: "submit" },
      { from: "dean_review", to: "registrar_fee_referral", result: "reviewed" },
      { from: "registrar_fee_referral", to: "payment_confirmation", result: "reviewed" },
      { from: "payment_confirmation", to: "department_head_signature", result: "payment_confirmed" },
      { from: "department_head_signature", to: "dean_signature", result: "approved" },
      { from: "dean_signature", to: "student_affairs_manager_signature", result: "approved" },
      { from: "student_affairs_manager_signature", to: "record_apply", result: "approved" },
      { from: "record_apply", to: "archive", result: "applied" },
      { from: "archive", to: null, result: "archived" },
    ]);
    expect(draftSql).not.toMatch(/FEE_GREATER_THAN_ZERO|FEE_IS_ZERO|PAYMENT_ALREADY_CONFIRMED/);
    expect(draftSql).toContain("'{}'::jsonb, true, 0");
  });

  it("models signatures as approvals — no sign action, no document, no fee assessment", () => {
    expect(draftSteps.some((s) => ["sign", "issue_document", "assess_fee", "request_payment"].includes(s.action))).toBe(false);
    expect(draftSteps.some((s) => ["SIGN", "ASSESS_FEE"].includes(s.action_code))).toBe(false);
    expect(draftSql).toContain("EXCUSED_ABSENCE_WF01_FORBIDDEN_STEP_SHAPE");
    // the deployed executor refuses `sign`, which is why signatures are approvals
    const executor = functionSource(migration("20260816230440"), "act_on_b1_student_request_step_atomic");
    expect(executor).toContain(
      "IF v_action IN ('confirm_payment','issue_document','sign') THEN RAISE EXCEPTION 'B1_SPECIALIZED_ACTION_RPC_REQUIRED'",
    );
  });

  it("keeps payment external: one confirmation step, no amount, currency, ledger or gateway", () => {
    expect(draftSteps.filter((s) => s.action === "confirm_payment").map((s) => [s.key, s.unit, s.role])).toEqual([
      ["payment_confirmation", "finance", "revenue_finance_officer"],
    ]);
    expect(draftSql).toContain("'EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION'");
    expect(draftSql).toContain("'awaiting_payment_confirmation'");
    expect(draftSql).not.toMatch(/\b(amount|currency|invoice|gateway|wallet|balance|price)\b/i);
    expect(draftSql).not.toMatch(/student_request_fee_assessments|student_fees|student_payments|payment_receipts/);
    expect(draftSql).not.toContain("FREE_NO_PAYMENT");
  });

  it("never touches requests, runtime steps, request types, accounts or assignments", () => {
    const forbiddenTargets = [
      "public.student_requests",
      "public.student_request_workflow_steps",
      "public.student_request_workflow_events",
      "public.absence_excuse_details",
      "public.student_excused_absences",
      "public.request_types",
      "public.request_processing_assignments",
      "public.request_processing_units",
      "public.request_processing_roles",
      "public.position_assignments",
      "public.staff_profiles",
      "public.faculty_profiles",
      "public.student_profiles",
      "public.user_roles",
      "auth.users",
      "public.request_workflow_action_catalog",
      "public.service_platform_runtime_flags",
    ];
    for (const target of forbiddenTargets) {
      const escaped = target.replace(".", "\\.");
      expect(
        new RegExp(`(INSERT\\s+INTO|UPDATE|DELETE\\s+FROM|TRUNCATE(\\s+TABLE)?|ALTER\\s+TABLE)\\s+(ONLY\\s+)?${escaped}\\b`, "i").test(draftSql),
        `no write to ${target}`,
      ).toBe(false);
    }
    expect(draftSql).not.toMatch(/\bstudent_visible\s*=/i);
    expect(draftSql).not.toMatch(/\bDELETE\s+FROM\b|\bTRUNCATE\b|\bDROP\s+(TABLE|FUNCTION|TRIGGER|POLICY|INDEX)\b/i);
    expect(draftSql).not.toMatch(/DISABLE\s+(TRIGGER|ROW\s+LEVEL)|session_replication_role/i);
    // the only tables written
    const written = [...draftSql.matchAll(/(?:INSERT\s+INTO|UPDATE)\s+(public\.[a-z0-9_]+)/gi)].map((m) => m[1]!);
    expect([...new Set(written)].sort()).toEqual([
      "public.b1_workflow_runtime_contract_snapshot",
      "public.request_type_workflow_change_log",
      "public.request_type_workflow_steps",
      "public.request_type_workflow_transitions",
      "public.request_type_workflows",
      "public.request_workflow_publish_validations",
    ]);
    // the only UPDATE target is the workflow header (retire old / activate new)
    expect([...draftSql.matchAll(/\bUPDATE\s+(public\.[a-z0-9_]+)/gi)].map((m) => m[1])).toEqual([
      "public.request_type_workflows",
      "public.request_type_workflows",
    ]);
  });

  it("fails closed on every missing prerequisite", () => {
    for (const guard of [
      "EXCUSED_ABSENCE_WF01_RELATION_MISSING",
      "EXCUSED_ABSENCE_WF01_FUNCTION_MISSING",
      "EXCUSED_ABSENCE_WF01_COLUMN_MISSING",
      "EXCUSED_ABSENCE_WF01_REQUEST_TYPE_MUST_RESOLVE_EXACTLY_ONCE",
      "EXCUSED_ABSENCE_WF01_REQUEST_TYPE_CODE_NOT_CANONICAL",
      "EXCUSED_ABSENCE_WF01_CATALOG_ACTION_MISSING_OR_DRIFTED",
      "EXCUSED_ABSENCE_WF01_EFFECT_STEP_KEY_BINDING_DRIFTED",
      "EXCUSED_ABSENCE_WF01_PROCESSING_UNIT_MUST_RESOLVE_EXACTLY_ONCE",
      "EXCUSED_ABSENCE_WF01_PROCESSING_ROLE_MUST_RESOLVE_EXACTLY_ONCE",
      "EXCUSED_ABSENCE_WF01_DIRECT_ASSIGNEE_MUST_RESOLVE_EXACTLY_ONCE",
      "EXCUSED_ABSENCE_WF01_NO_DEPARTMENT_SCOPED_HEAD_ASSIGNMENT",
      "EXCUSED_ABSENCE_WF01_AMBIGUOUS_DEPARTMENT_HEAD_ASSIGNMENT",
      "EXCUSED_ABSENCE_WF01_ACTIVE_WORKFLOW_MUST_RESOLVE_EXACTLY_ONCE",
      "EXCUSED_ABSENCE_WF01_UNEXPECTED_ACTIVE_WORKFLOW_CODE",
      "EXCUSED_ABSENCE_WF01_PATCH_ANCHOR_MUST_MATCH_EXACTLY_ONCE",
      "EXCUSED_ABSENCE_WF01_PATCH_NOT_EFFECTIVE",
      "EXCUSED_ABSENCE_WF01_STEP_STRUCTURE_MISMATCH",
      "EXCUSED_ABSENCE_WF01_TRANSITION_STRUCTURE_MISMATCH",
      "EXCUSED_ABSENCE_WF01_RUNTIME_CONTRACT_PIN_INCOMPLETE",
      "EXCUSED_ABSENCE_WF01_PREVIOUS_ACTIVE_FREE_WORKFLOW_NOT_FOUND",
      "EXCUSED_ABSENCE_WF01_POST_ACTIVE_WORKFLOW_COUNT",
      "EXCUSED_ABSENCE_WF01_POST_REQUEST_TYPE_ROW_CHANGED",
      "EXCUSED_ABSENCE_WF01_POST_LEGACY_WORKFLOW_DEFINITION_CHANGED",
      "EXCUSED_ABSENCE_WF01_POST_PROCESSING_ASSIGNMENTS_CHANGED",
    ]) {
      expect(draftSql, guard).toContain(`RAISE EXCEPTION '${guard}`);
    }
    for (const code of ["REVIEW", "APPROVE", "PAYMENT_CONFIRMATION", "ARCHIVE", "REGISTER_EXCUSED_ABSENCE"]) {
      expect(draftSql).toContain(`('${code}',`);
    }
  });

  it("supersedes the free cycle with the same columns and values the applied publish path uses", () => {
    const publishMigration = migration("20260811202824");
    const normalize = (sql: string) => sql.replace(/\s+/g, " ");
    expect(normalize(publishMigration)).toContain(
      "UPDATE public.request_type_workflows SET status='retired', is_active=false, updated_at=now() WHERE request_type_id = v_type_id AND id <> v_new AND is_active = true;",
    );
    expect(normalize(draftSql)).toContain(
      "UPDATE public.request_type_workflows SET status = 'retired', is_active = false, updated_at = now() WHERE request_type_id = v_request_type_id AND id <> v_workflow_id AND is_active = true;",
    );
    expect(normalize(draftSql)).toContain(
      "UPDATE public.request_type_workflows SET status = 'active', is_active = true, updated_at = now() WHERE id = v_workflow_id;",
    );
    // retire strictly before activate (one-active-per-type unique index)
    expect(draftSql.indexOf("SET status = 'retired'")).toBeLessThan(draftSql.indexOf("SET status = 'active'"));
    expect(draftSql.indexOf("PERFORM public.validate_request_workflow_publish(v_workflow_id);")).toBeLessThan(
      draftSql.indexOf("SET status = 'retired'"),
    );
    expect(draftSql).toContain("INSERT INTO public.request_workflow_publish_validations");
    expect(draftSql).toContain("INSERT INTO public.request_type_workflow_change_log");
    expect(draftSql).toContain("'excused_absence_external_payment_workflow'");
    expect(draftSql).toContain("WHERE w.request_type_id = v_request_type_id;"); // next version across the service
  });

  it("pins the runtime contract of the new version (the legacy hard-coded contract does not know it)", () => {
    expect(draftSql).toContain("INSERT INTO public.b1_workflow_runtime_contract_snapshot");
    expect(draftSql).toContain("public.b1_runtime_step_contract_ok(");
    const legacyContract = functionSource(migration("20260723070217"), "is_valid_b1_runtime_step_contract");
    for (const step of EXCUSED_ABSENCE_LEGACY_FREE_WORKFLOW) {
      expect(legacyContract).toContain(
        `('excused_absence','${step.key}','${step.unit}','${step.role}','${step.action}')`,
      );
    }
    for (const key of ["dean_review", "registrar_fee_referral", "department_head_signature", "dean_signature"]) {
      expect(legacyContract).not.toContain(`'${key}'`);
    }
  });
});

describe("EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01 — engine patches match the applied sources", () => {
  const patches = [
    {
      marker: "EAWF01:init-student-department-scope",
      fn: "initialize_b1_request_workflow_strict",
      migration: "20260817000415",
      anchor: "ELSIF v_is_p1 THEN",
    },
    {
      marker: "EAWF01:resubmit-student-department-scope",
      fn: "initialize_b1_request_workflow_strict",
      migration: "20260817000415",
      anchor: "ELSE public.p1_runtime_step_department_scope(p_canonical_code,s.step_key,p_request_id) END",
    },
    {
      marker: "EAWF01:activation-student-department-scope",
      fn: "assert_b1_runtime_step_row_assignee_effective",
      migration: "20260729014518",
      anchor: "IF v_canonical = 'department_transfer'",
    },
    {
      marker: "EAWF01:effect-before-archive",
      fn: "act_on_b1_student_request_step_atomic",
      migration: "20260816230440",
      anchor: "v_action='apply_decision' AND v_canonical='file_withdrawal'",
    },
    {
      marker: "EAWF01:external-payment-service",
      fn: "record_external_university_payment_confirmation",
      migration: "20260816230440",
      anchor: "'october_exam_entry_form','replacement_student_card')",
    },
  ] as const;

  for (const patch of patches) {
    it(`${patch.marker}: the anchor occurs exactly once in the latest applied ${patch.fn}`, () => {
      const source = functionSource(migration(patch.migration), patch.fn);
      expect(occurrences(source, patch.anchor)).toBe(1);
      // the anchor is written in the draft as a SQL string literal (quotes doubled)
      expect(draftSql).toContain(`'${patch.anchor.replace(/'/g, "''")}'`);
      expect(draftSql).toContain(`'${patch.marker}'`);
      expect(draftSql).toContain(`/* ${patch.marker} */`);
    });
  }

  it("patches the deployed definition in place and replaces no engine function wholesale", () => {
    expect(draftSql).toContain("pg_get_functiondef(v_patch.fn::regprocedure)");
    expect(draftSql).toContain("EXECUTE v_def;");
    const created = [...draftSql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(public\.[a-z0-9_]+)/gi)].map((m) => m[1]);
    expect(created).toEqual(["public.b1_excused_absence_student_department"]);
    expect(draftSql).toContain("REVOKE ALL ON FUNCTION public.b1_excused_absence_student_department(uuid) FROM PUBLIC;");
    expect(draftSql).toContain("REVOKE ALL ON FUNCTION public.b1_excused_absence_student_department(uuid) FROM anon;");
    expect(draftSql).toContain("REVOKE ALL ON FUNCTION public.b1_excused_absence_student_department(uuid) FROM authenticated;");
    expect(draftSql).not.toMatch(/GRANT\s+/i);
  });

  it("leaves the academic effect bound to record_apply and the authorization gate untouched", () => {
    const effect = functionSource(migration("20260727120100"), "apply_b1_excused_absence_effect");
    expect(effect).toContain("c.step_key='record_apply' AND c.action_type='apply_decision'");
    expect(B1_WORKFLOWS.excused_absence.filter((s) => s.action === "apply_decision").map((s) => s.key)).toEqual([
      "record_apply",
    ]);
    expect(draftSql).not.toMatch(/FUNCTION\s+public\.apply_b1_excused_absence_effect/i);
    expect(draftSql).not.toMatch(/FUNCTION\s+public\.can_current_user_act_on_step/i);
    expect(draftSql).not.toMatch(/'public\.can_current_user_act_on_step\(uuid,text\)',\s*'EAWF01/);
    // no general admin / registrar / dean bypass is introduced anywhere
    expect(draftSql).not.toMatch(/has_role\s*\(|has_any_role\s*\(|is_current_user_admin_actor|is_current_user_registrar/);
  });

  it("no engine function reads config.department_scope — the scope is resolved in code", () => {
    for (const [prefix, fn] of [
      ["20260817000415", "initialize_b1_request_workflow_strict"],
      ["20260729014518", "assert_b1_runtime_step_row_assignee_effective"],
      ["20260816230440", "can_current_user_act_on_step"],
    ] as const) {
      expect(functionSource(migration(prefix), fn)).not.toMatch(/config\s*->>?\s*'department_scope'/);
    }
    expect(draftSql).toContain("JOIN public.student_profiles sp ON sp.id = r.student_profile_id");
    expect(draftSql).toContain("r.request_type IN ('excused_absence', 'absence_excuse')");
  });
});

describe("EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01 — executable rehearsal and review doc", () => {
  const harnessDir = ["scripts", "excused-absence-paid-signature-01-pg17"];

  it("ships an isolated rehearsal that applies the draft twice and runs the direct-RPC matrix", () => {
    for (const file of ["run.sh", "00-preimages.sql", "01-fixtures.sql", "02-necessity-probe.sql", "03-cases.sql"]) {
      expect(existsSync(join(root, ...harnessDir, file)), file).toBe(true);
    }
    const runner = read(...harnessDir, "run.sh");
    expect(runner).toContain('listen_addresses=\'\'');
    expect(occurrences(runner, '"$DRAFT"')).toBeGreaterThanOrEqual(3);
    expect(runner).toContain("IDEMPOTENCY_FINGERPRINT_MISMATCH");
    expect(runner).toContain("aborted apply left changes behind");
    expect(runner).not.toMatch(/supabase\.co|SUPABASE_|SERVICE_ROLE|DATABASE_URL|PGPASSWORD=/);

    const cases = read(...harnessDir, "03-cases.sql");
    for (const [key, , , action] of EXPECTED_STEPS) {
      expect(cases, `${key} matrix`).toContain(`'${key}'`);
      expect(cases).toContain(`'${action}'`);
    }
    for (const rpc of [
      "public.can_current_user_act_on_step(",
      "public.act_on_b1_student_request_step_atomic(",
      "public.record_external_university_payment_confirmation(",
      "public.initialize_b1_request_workflow_strict(",
    ]) {
      expect(cases).toContain(rpc);
    }
    expect(cases).toContain("zero mutation");
    expect(cases).toContain("B1_EXCUSED_ABSENCE_STUDENT_DEPARTMENT_SCOPE_MISSING");
    expect(cases).toContain("B1_RUNTIME_ASSIGNEE_IDENTITY_MISMATCH");
    expect(cases).toContain("in-flight request completes on the old three steps");
  });

  it("runs the same chain as a PG 17 verifier leg in CI", () => {
    const ci = read(".github", "workflows", "ci.yml");
    expect(ci).toContain("- name: excused-absence-paid-signature-workflow");
    expect(occurrences(ci, "docs/migration-drafts/EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01.sql")).toBe(2);
    expect(ci).toContain("scripts/excused-absence-paid-signature-01-pg17/03-cases.sql");
  });

  it("documents the lifecycle, the matrix, in-flight handling and the apply/rollback procedure in Arabic", () => {
    const doc = read("docs", "reviews", "EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01.md");
    for (const [key] of EXPECTED_STEPS) expect(doc, key).toContain(`\`${key}\``);
    for (const heading of [
      "جدول الخطوات",
      "ما يراه الطالب",
      "الطلبات القائمة",
      "مصفوفة التفويض",
      "الافتراضات",
      "المخاطر",
      "أسئلة مفتوحة",
      "إجراء التطبيق",
      "إجراء التراجع",
    ]) {
      expect(doc, heading).toContain(heading);
    }
    expect(doc).toContain("docs/migration-drafts/EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01.sql");
    expect(doc).toMatch(/PASS|HOLD/);
  });
});
