import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertGenericStaffExecutorAllowed,
  B1_PANEL_ACTION_LABELS_AR,
  GENERIC_EXECUTOR_B1_FORBIDDEN_ERROR,
  isB1StaffRoutedRequestType,
  resolveB1StaffActionContract,
  toB1CanonicalCode,
} from "../../src/lib/student-requests/b1-staff-action-routing";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

const DETAIL_PANEL = read("src/components/student-requests/StaffRequestDetailPanel.tsx");
const GENERIC_PANEL = read("src/components/student-requests/StaffRequestActionPanel.tsx");
const B1_SECTION = read("src/components/student-requests/b1/B1StaffStepActionSection.tsx");
const B1_PANEL = read("src/components/student-requests/b1/B1EmployeeActionPanel.tsx");
const STAFF_FUNCTIONS = read("src/lib/student-requests/staff-inbox.functions.ts");
const B1_FUNCTIONS = read("src/lib/student-requests/b1-ui/b1-ui.functions.ts");

const FIVE = [
  "enrollment_suspension",
  "excused_absence",
  "department_transfer",
  "final_chance",
  "file_withdrawal",
] as const;

const base = {
  stepId: "11111111-1111-1111-1111-111111111111",
  isActionable: true,
};

describe("G2 — five services route to the B1 panel", () => {
  for (const code of FIVE) {
    test(`${code} is classified as B1`, () => {
      expect(isB1StaffRoutedRequestType(code)).toBe(true);
      expect(toB1CanonicalCode(code)).toBe(code);
      const contract = resolveB1StaffActionContract({
        ...base,
        requestTypeCode: code,
        configuredActionType: "review",
      });
      expect(contract.ok).toBe(true);
    });
  }

  test("detail panel mounts the B1 section for B1 and the generic panel otherwise", () => {
    expect(DETAIL_PANEL).toContain("isB1StaffRoutedRequestType(detail.requestTypeCode)");
    expect(DETAIL_PANEL).toContain(
      "{isB1Service && !showSignPanel && !showArchivePanel && !showFee && !showEcIssueButton && (",
    );
    expect(DETAIL_PANEL).toContain("{!isB1Service && !showSignPanel && !showArchivePanel && (");
    expect(DETAIL_PANEL).toContain("<B1StaffStepActionSection");
  });
});

describe("G6 — enrollment_certificate protection", () => {
  test("enrollment_certificate is not a B1 service", () => {
    expect(isB1StaffRoutedRequestType("enrollment_certificate")).toBe(false);
    expect(toB1CanonicalCode("enrollment_certificate")).toBeNull();
    const contract = resolveB1StaffActionContract({
      ...base,
      requestTypeCode: "enrollment_certificate",
      configuredActionType: "review",
    });
    expect(contract).toMatchObject({ ok: false, code: "NOT_B1_SERVICE" });
  });

  test("non-target services keep the generic executor path", () => {
    expect(() => assertGenericStaffExecutorAllowed("enrollment_certificate")).not.toThrow();
    expect(() => assertGenericStaffExecutorAllowed("transcript_request")).not.toThrow();
  });
});

describe("G1/G19 — canonical request-type mapping", () => {
  test("absence_excuse legacy alias maps to excused_absence", () => {
    expect(toB1CanonicalCode("absence_excuse")).toBe("excused_absence");
    expect(isB1StaffRoutedRequestType("absence_excuse")).toBe(true);
  });

  test("unrelated codes are not misclassified", () => {
    for (const code of ["", null, undefined, "absence", "excused", "certificate"]) {
      expect(isB1StaffRoutedRequestType(code)).toBe(false);
    }
  });
});

describe("G3 — single configured action, review stays review", () => {
  test("configured review renders «مراجعة» and sends review literally", () => {
    const contract = resolveB1StaffActionContract({
      ...base,
      requestTypeCode: "excused_absence",
      configuredActionType: "review",
    });
    expect(contract).toMatchObject({ ok: true, action: "review", labelAr: "مراجعة" });
    expect(B1_PANEL_ACTION_LABELS_AR.review).toBe("مراجعة");
    expect(B1_PANEL).toContain('labelAr: "مراجعة"');
  });

  test("a review step never yields approve", () => {
    const contract = resolveB1StaffActionContract({
      ...base,
      requestTypeCode: "excused_absence",
      configuredActionType: "review",
    });
    expect(contract.ok && contract.action).not.toBe("approve");
    expect(B1_SECTION).not.toContain("mapToReviewRpcAction");
    expect(B1_SECTION).not.toContain('"approve"');
  });

  test("action_result `reviewed` is rejected, never sent as an action", () => {
    const contract = resolveB1StaffActionContract({
      ...base,
      requestTypeCode: "excused_absence",
      configuredActionType: "reviewed",
    });
    expect(contract).toMatchObject({ ok: false, code: "CONFIGURED_ACTION_IS_RESULT" });
  });
});

describe("G4 — atomic RPC only", () => {
  test("B1 section executes through the B1 adapter", () => {
    expect(B1_SECTION).toContain("adapter.actOnB1RequestStep(");
    expect(B1_SECTION).not.toContain("executeStudentRequestStaffAction");
    expect(B1_SECTION).not.toContain("act_on_student_request_step");
  });

  test("the B1 server function calls act_on_b1_student_request_step_atomic", () => {
    expect(B1_FUNCTIONS).toContain("rpcActOnB1StudentRequestStepAtomic");
    expect(B1_FUNCTIONS).not.toContain('"act_on_student_request_step"');
  });

  test("generic executor rejects B1 in the input validator before any DB call", () => {
    expect(STAFF_FUNCTIONS).toContain("isB1StaffRoutedRequestType(value.requestTypeCode)");
    expect(STAFF_FUNCTIONS).toContain("GENERIC_EXECUTOR_B1_FORBIDDEN_ERROR");
    const validatorIndex = STAFF_FUNCTIONS.indexOf("isB1StaffRoutedRequestType(value.requestTypeCode)");
    const handlerIndex = STAFF_FUNCTIONS.indexOf(
      "export const executeStudentRequestStaffAction",
    );
    expect(validatorIndex).toBeLessThan(handlerIndex);
  });

  test("client guard throws for B1 before invoking the server function", () => {
    for (const code of FIVE) {
      expect(() => assertGenericStaffExecutorAllowed(code)).toThrow(
        GENERIC_EXECUTOR_B1_FORBIDDEN_ERROR,
      );
    }
    expect(GENERIC_PANEL).toContain("assertGenericStaffExecutorAllowed(requestTypeCode)");
    expect(GENERIC_PANEL).toContain("isB1StaffRoutedRequestType(requestTypeCode)");
  });
});

describe("G5 — fail-closed UI contract", () => {
  const cases: Array<[string, Parameters<typeof resolveB1StaffActionContract>[0], string]> = [
    [
      "missing configured action",
      { ...base, requestTypeCode: "final_chance", configuredActionType: null },
      "CONFIGURED_ACTION_MISSING",
    ],
    [
      "empty configured action",
      { ...base, requestTypeCode: "final_chance", configuredActionType: "   " },
      "CONFIGURED_ACTION_MISSING",
    ],
    [
      "more than one configured action",
      { ...base, requestTypeCode: "final_chance", configuredActionType: "review,approve" },
      "CONFIGURED_ACTION_AMBIGUOUS",
    ],
    [
      "unsupported action",
      { ...base, requestTypeCode: "final_chance", configuredActionType: "escalate" },
      "CONFIGURED_ACTION_UNSUPPORTED",
    ],
    [
      "specialized action belongs to its own panel",
      { ...base, requestTypeCode: "file_withdrawal", configuredActionType: "confirm_payment" },
      "CONFIGURED_ACTION_SPECIALIZED",
    ],
    [
      "allowedAction mismatch",
      {
        ...base,
        requestTypeCode: "final_chance",
        configuredActionType: "review",
        allowedAction: "approve",
      },
      "ALLOWED_ACTION_MISMATCH",
    ],
    [
      "missing step id",
      {
        requestTypeCode: "final_chance",
        stepId: null,
        configuredActionType: "review",
        isActionable: true,
      },
      "STEP_ID_MISSING",
    ],
    [
      "not actionable",
      {
        ...base,
        requestTypeCode: "final_chance",
        configuredActionType: "review",
        isActionable: false,
      },
      "NOT_ACTIONABLE",
    ],
  ];

  for (const [name, input, code] of cases) {
    test(`${name} fails closed`, () => {
      const contract = resolveB1StaffActionContract(input);
      expect(contract.ok).toBe(false);
      expect(contract.ok === false && contract.code).toBe(code);
      expect(contract.ok === false && contract.messageAr.length > 0).toBe(true);
    });
  }

  test("no unknown action silently becomes approve", () => {
    const contract = resolveB1StaffActionContract({
      ...base,
      requestTypeCode: "final_chance",
      configuredActionType: "unknown_action",
    });
    expect(contract.ok).toBe(false);
  });

  test("double submit is guarded while pending", () => {
    expect(B1_SECTION).toContain("inFlightRef");
    expect(B1_PANEL).toContain("if (inFlightRef.current || controlsDisabled) return;");
  });
});

describe("G7 — no production side effects in this change", () => {
  test("no migration is introduced by the routing module", () => {
    expect(B1_SECTION).not.toContain("CREATE ");
    expect(read("src/lib/student-requests/b1-staff-action-routing.ts")).not.toContain("supabase");
  });

  test("no visibility changes and no production endpoints/secrets in changed files", () => {
    for (const source of [B1_SECTION, GENERIC_PANEL, DETAIL_PANEL]) {
      expect(source).not.toContain("student_visible");
      expect(source).not.toContain("service_role");
      expect(source).not.toContain("https://");
    }
  });
});
