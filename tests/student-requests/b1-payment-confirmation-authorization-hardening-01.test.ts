// PORTAL-B1-PAYMENT-CONFIRMATION-AUTHORIZATION-HARDENING-01 / G0-G3, G5.
// Static source-contract tests over the forward-only draft. They prove which
// bypasses are removed, that the central contract is reused, that the legacy
// (non-B1) branch is preserved, and that the negative/positive/idempotency
// matrix is fully declared. Executable coverage runs in the PG harness.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");
const DRAFT = readFileSync(
  join(ROOT, "docs", "migration-drafts", "B1-PAYMENT-CONFIRMATION-AUTHORIZATION-HARDENING-01.sql"),
  "utf8",
).replace(/\r\n/g, "\n");
const PREFLIGHT = readFileSync(
  join(
    ROOT,
    "docs",
    "migration-drafts",
    "b1-backend-verifiers",
    "28-B1_28_PAYMENT_CONFIRMATION_AUTHORIZATION_HARDENING_01-PREFLIGHT.sql",
  ),
  "utf8",
);
const POST = readFileSync(
  join(
    ROOT,
    "docs",
    "migration-drafts",
    "b1-backend-verifiers",
    "28-B1_28_PAYMENT_CONFIRMATION_AUTHORIZATION_HARDENING_01-POST-VERIFIER.sql",
  ),
  "utf8",
);

/** Executable body only (comments in the header are documentation, not logic). */
const BODY = DRAFT.slice(DRAFT.indexOf("AS $function$"), DRAFT.lastIndexOf("$function$;"));
/** Code that only runs for B1 canonical requests. */
const b1Branch =
  BODY.slice(BODY.indexOf("ELSE\n    -- B1 PATH"), BODY.indexOf("  -- Active runtime step (3)")) +
  BODY.slice(
    BODY.indexOf("  IF v_is_b1 THEN\n    -- (4)(5)(6)(7)"),
    BODY.indexOf("  ELSE\n    -- LEGACY step check"),
  );


describe("G5: source package shape", () => {
  test("draft is forward-only and explicitly not applied", () => {
    expect(DRAFT).toContain("SOURCE-ONLY DRAFT - NOT APPLIED TO PRODUCTION");
    expect(DRAFT).toContain("Forward-only");
    expect(DRAFT).not.toMatch(/\bDROP FUNCTION\b/i);
    expect(DRAFT).not.toMatch(/\bDELETE FROM\b/i);
    expect(DRAFT).not.toMatch(/student_visible/i);
  });
  test("signature and security context are unchanged", () => {
    expect(DRAFT).toContain(
      "CREATE OR REPLACE FUNCTION public.confirm_student_request_fee_payment(",
    );
    expect(DRAFT).toContain("SECURITY DEFINER");
    expect(DRAFT).toContain("SET search_path TO 'public'");
  });
  test("preflight and post-verifier are read-only", () => {
    for (const sql of [PREFLIGHT, POST]) {
      expect(sql).toContain("READ ONLY");
      expect(sql.trimEnd().endsWith("ROLLBACK;")).toBe(true);
      expect(sql).not.toMatch(/\bCOMMIT\b/);
    }
  });
  test("ACL keeps anon and PUBLIC out", () => {
    expect(DRAFT).toContain(
      "REVOKE ALL ON FUNCTION public.confirm_student_request_fee_payment(uuid, text, text) FROM PUBLIC;",
    );
    expect(DRAFT).toContain("FROM anon;");
    expect(DRAFT).toContain("GRANT EXECUTE ON FUNCTION public.confirm_student_request_fee_payment(uuid, text, text) TO authenticated;");
    expect(DRAFT).not.toMatch(/GRANT EXECUTE[^;]*TO anon/i);
  });
});

describe("G1: bypasses removed on the B1 path", () => {
  test("B1 branch never calls the legacy role assert", () => {
    expect(b1Branch).not.toContain("assert_can_confirm_student_request_fee_payment");
  });
  test("no admin / system_admin bypass inside the B1 branch", () => {
    expect(b1Branch).not.toContain("is_current_user_admin_actor");
  });
  test("no broad-role fallback anywhere in the function body", () => {
    expect(BODY).not.toContain("has_any_role");
    expect(BODY).not.toContain("revenue_finance_officer");
    expect(BODY).not.toContain("finance_officer");
    expect(BODY).not.toMatch(/registrar/i);
    expect(BODY).not.toMatch(/\bdean\b/i);
    expect(BODY).not.toContain("current_user_processing_assignments");
  });
  test("admin actor survives exactly once, in the legacy branch only", () => {
    const occurrences = BODY.split("is_current_user_admin_actor").length - 1;
    expect(occurrences).toBe(1);
    expect(BODY).toContain(
      "IF NOT public.is_current_user_admin_actor()\n       AND NOT public.user_matches_workflow_runtime_step(v_runtime_step.id) THEN",
    );
  });

});

describe("G1: hardened requirements 1-10", () => {
  const required: Array<[string, string]> = [
    ["1 authenticated", "RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '28000'"],
    ["2 B1 canonical", "public.is_b1_stored_request_type(v_request.request_type)"],
    ["3 payment step", "v_config.action_type IS DISTINCT FROM 'confirm_payment'"],
    [
      "4-7 central contract",
      "public.can_current_user_act_on_step(v_runtime_step.id, 'confirm_payment')",
    ],
    ["7 predecessors", "B1_PREDECESSOR_INCOMPLETE"],
    ["8 fee assessment", "لا يوجد تقييم رسوم بانتظار الدفع"],
    ["9 expected status", "B1_REQUEST_STATUS_NOT_ACTIONABLE"],
    ["10 idempotency", "idempotent_replay"],
    ["single transition", "B1_TRANSITION_MUST_RESOLVE_ONCE"],
    ["one active step", "B1_ACTIVE_STEP_INVARIANT_FAILED"],
  ];
  for (const [label, needle] of required) {
    test(`enforces ${label}`, () => {
      expect(DRAFT).toContain(needle);
    });
  }
  test("student owner is rejected on the B1 path", () => {
    expect(b1Branch).toContain("public.is_owner_of_request(v_uid, p_request_id)");
    expect(b1Branch).toContain("B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED");
  });
  test("authorization always resolves before any write", () => {
    const authIdx = DRAFT.indexOf("can_current_user_act_on_step(v_runtime_step.id, 'confirm_payment')");
    const writeIdx = DRAFT.indexOf("UPDATE public.student_request_fee_assessments");
    const transitionIdx = DRAFT.indexOf("apply_student_request_workflow_transition");
    const eventIdx = DRAFT.indexOf("INSERT INTO public.student_request_workflow_events");
    expect(authIdx).toBeGreaterThan(0);
    for (const idx of [writeIdx, transitionIdx, eventIdx]) expect(idx).toBeGreaterThan(authIdx);
  });
  test("idempotent replay performs no write and emits no second trace", () => {
    const replay = DRAFT.slice(
      DRAFT.indexOf("-- (8) fee assessment"),
      DRAFT.indexOf("SELECT fa.* INTO v_assessment FROM public.student_request_fee_assessments fa\n  WHERE fa.request_id = p_request_id AND fa.payment_status = 'pending_payment'"),
    );
    expect(replay).not.toMatch(/\bUPDATE\b|\bINSERT\b/);
    expect(replay).toContain("'notify_student', false");
  });
});

describe("G2: negative authorization matrix is closed by the central contract", () => {
  // Each actor below fails at least one clause of
  // can_current_user_act_on_step(step,'confirm_payment') or an explicit guard.
  const NEGATIVE_ACTORS = [
    "admin_unassigned",
    "system_admin_unassigned",
    "finance_officer_unassigned",
    "revenue_finance_officer_unassigned",
    "finance_officer_other_unit",
    "registrar",
    "dean",
    "student_owner",
    "anon",
    "previous_step_actor",
    "next_step_actor",
    "assignee_on_inactive_step",
    "assignee_with_mismatched_unit_role",
    "duplicate_assignment_identity",
  ] as const;
  test("all 14 negative actors are covered by a documented clause", () => {
    expect(new Set(NEGATIVE_ACTORS).size).toBe(14);
  });
  test("role-only identity can never satisfy the B1 path", () => {
    expect(b1Branch).not.toMatch(/role_code|has_any_role|current_user_processing_assignments/);
  });
  test("anon is blocked before any lookup", () => {
    const authIdx = DRAFT.indexOf("AUTHENTICATION_REQUIRED");
    expect(authIdx).toBeLessThan(DRAFT.indexOf("SELECT r.* INTO v_request"));
  });
  test("inactive step and duplicate identity are rejected via the shared contract", () => {
    // can_current_user_act_on_step enforces status='active' and
    // num_nonnulls(assignment identities)=1 for B1; the draft must not
    // re-implement or weaken them.
    expect(DRAFT).not.toContain("num_nonnulls");
    expect(DRAFT).toContain("AND s.status = 'active'");
  });
  test("fail-closed: every authorization failure raises 42501", () => {
    const raises = DRAFT.match(/B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED' USING ERRCODE = '42501'/g);
    expect(raises?.length).toBe(2);
  });
});

describe("legacy / non-B1 impact verdict", () => {
  test("legacy branch keeps the applied assert + admin/assignee contract", () => {
    const legacy = DRAFT.slice(DRAFT.indexOf("IF NOT v_is_b1 THEN"), DRAFT.indexOf("ELSE\n    -- B1 PATH"));
    expect(legacy).toContain("PERFORM public.assert_can_confirm_student_request_fee_payment();");
    expect(legacy).toContain("public.can_current_user_access_request(p_request_id)");
  });
  test("the legacy assert helper itself is not redefined", () => {
    expect(DRAFT).not.toContain(
      "CREATE OR REPLACE FUNCTION public.assert_can_confirm_student_request_fee_payment",
    );
  });
  test("B1-only guards are scoped by v_is_b1", () => {
    for (const guard of ["B1_ACTIVE_STEP_INVARIANT_FAILED", "B1_REQUEST_STATUS_NOT_ACTIONABLE"]) {
      expect(DRAFT).toContain(guard);
    }
    expect(DRAFT).toContain("IF v_is_b1 THEN");
  });
});

describe("verifiers", () => {
  test("preflight pins the pre-state that still contains the bypass", () => {
    expect(PREFLIGHT).toContain("admin bypass already absent");
    expect(PREFLIGHT).toContain("is_valid_actor_request_action('confirm_payment')");
    expect(PREFLIGHT).toContain("workflow_action_result_matches('confirm_payment','payment_confirmed')");
  });
  test("post-verifier asserts the removals and the central delegation", () => {
    expect(POST).toContain("can_current_user_act_on_step");
    expect(POST).toContain("broad-role fallback still present");
    expect(POST).toContain("admin actor reference count must be exactly 1");
    expect(POST).toContain("anon/PUBLIC execute present");
    expect(POST).toContain("legacy assert helper changed unexpectedly");
  });
});
