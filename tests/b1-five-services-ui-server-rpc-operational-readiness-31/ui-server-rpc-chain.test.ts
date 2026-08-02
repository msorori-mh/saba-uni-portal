/**
 * PORTAL-B1-FIVE-SERVICES-UI-SERVER-RPC-OPERATIONAL-READINESS-AUDIT-31
 *
 * Source-only proofs that every five-service action is routed
 * UI → server function → schema → request-type guard → configured action → RPC,
 * and that the generic executor cannot bypass the B1 atomic path.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertGenericExecutorAuthoritativeRequestType,
  assertGenericStaffExecutorAllowed,
  B1_PANEL_EXECUTABLE_ACTIONS,
  GENERIC_EXECUTOR_B1_FORBIDDEN_ERROR,
  GENERIC_EXECUTOR_TYPE_UNRESOLVED_ERROR,
  isB1StaffRoutedRequestType,
  resolveB1StaffActionContract,
  toB1CanonicalCode,
} from "@/lib/student-requests/b1-staff-action-routing";
import {
  ACT_ON_B1_ATOMIC_ARG_KEYS,
  B1_ACT_ON_STEP_ACTIONS,
  B1_SPECIALIZED_ACTIONS_FORBIDDEN_ON_ACT_ON,
  RECORD_EXTERNAL_PAYMENT_ARG_KEYS,
  RECORD_EXTERNAL_PAYMENT_FORBIDDEN_CLIENT_KEYS,
  SUBMIT_B1_ATOMIC_ARG_KEYS,
} from "@/lib/student-requests/b1-ui/b1-rpc";
import {
  B1_CANONICAL_CODES,
  B1_WORKFLOWS,
} from "@/lib/student-requests/request-service-adapter";
import { mapBackendRowsToB1Availability } from "@/lib/student-requests/b1-ui/availability";
import {
  b1AdapterErrorMessageAr,
  B1AdapterError,
} from "@/lib/student-requests/b1-ui/adapter.types";
import { sanitizeStaffErrorMessage } from "@/lib/student-requests/staff-inbox-ui";
import {
  createB1ConfirmPaymentHandler,
  createB1StaffActHandler,
} from "@/components/student-requests/b1/B1StaffStepActionSection";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");

const DETAIL_PANEL = read("src/components/student-requests/StaffRequestDetailPanel.tsx");
const GENERIC_PANEL = read("src/components/student-requests/StaffRequestActionPanel.tsx");
const B1_SECTION = read("src/components/student-requests/b1/B1StaffStepActionSection.tsx");
const B1_PANEL = read("src/components/student-requests/b1/B1EmployeeActionPanel.tsx");
const REVENUE_CARD = read("src/components/student-requests/b1/B1RevenueReceiptCard.tsx");
const STAFF_FUNCTIONS = read("src/lib/student-requests/staff-inbox.functions.ts");
const B1_FUNCTIONS = read("src/lib/student-requests/b1-ui/b1-ui.functions.ts");
const B1_RPC = read("src/lib/student-requests/b1-ui/b1-rpc.ts");
const ADAPTER_LIVE = read("src/lib/student-requests/b1-ui/adapter.live.ts");
const STUDENT_FORM = read("src/components/student-requests/b1/B1StudentRequestForm.tsx");
const AVAILABILITY = read("src/lib/student-requests/b1-ui/availability.ts");
const ROUTING = read("src/lib/student-requests/b1-staff-action-routing.ts");

const FIVE = [...B1_CANONICAL_CODES] as const;
const STEP_UUID = "11111111-1111-4111-8111-111111111111";

const WORKFLOW_BY_SERVICE: Readonly<
  Record<(typeof FIVE)[number], readonly { key: string; action: string; unit: string; role: string }[]>
> = B1_WORKFLOWS;

describe("P31-G1 — B1 requests always mount the B1-specific panel", () => {
  for (const code of FIVE) {
    test(`${code} is B1-routed`, () => {
      expect(isB1StaffRoutedRequestType(code)).toBe(true);
      expect(toB1CanonicalCode(code)).toBe(code);
    });
  }

  test("legacy aliases normalize into B1 routing", () => {
    expect(toB1CanonicalCode("absence_excuse")).toBe("excused_absence");
    expect(toB1CanonicalCode("transfer")).toBe("department_transfer");
    expect(toB1CanonicalCode("extra_chance")).toBe("final_chance");
    expect(isB1StaffRoutedRequestType("absence_excuse")).toBe(true);
  });

  test("detail panel mounts B1StaffStepActionSection for B1 and generic otherwise", () => {
    expect(DETAIL_PANEL).toContain("isB1StaffRoutedRequestType(detail.requestTypeCode)");
    expect(DETAIL_PANEL).toContain("<B1StaffStepActionSection");
    expect(DETAIL_PANEL).toContain("{isB1Service && !showSignPanel && !showArchivePanel && !showFee && !showEcIssueButton && (");
    expect(DETAIL_PANEL).toContain("{!isB1Service && !showSignPanel && !showArchivePanel && (");
    expect(DETAIL_PANEL).toContain("<StaffRequestActionPanel");
  });

  test("B1 payment steps skip the generic fee section and stay on B1 revenue card", () => {
    expect(DETAIL_PANEL).toContain("isB1PaymentConfirmation");
    expect(DETAIL_PANEL).toContain('activeType === "confirm_payment"');
    expect(B1_SECTION).toContain('B1_CONFIRM_PAYMENT_ACTION_TYPE = "confirm_payment"');
    expect(B1_SECTION).toContain("<B1RevenueReceiptCard");
  });
});

describe("P31-G2 — generic executor cannot bypass B1 routing", () => {
  test("client guard throws for every B1 code before server call", () => {
    for (const code of FIVE) {
      expect(() => assertGenericStaffExecutorAllowed(code)).toThrow(
        GENERIC_EXECUTOR_B1_FORBIDDEN_ERROR,
      );
    }
    expect(GENERIC_PANEL).toContain("assertGenericStaffExecutorAllowed(requestTypeCode)");
    expect(GENERIC_PANEL).toContain("isB1StaffRoutedRequestType(requestTypeCode)");
  });

  test("server input validator rejects B1 requestTypeCode before handler body", () => {
    expect(STAFF_FUNCTIONS).toContain("isB1StaffRoutedRequestType(value.requestTypeCode)");
    expect(STAFF_FUNCTIONS).toContain("GENERIC_EXECUTOR_B1_FORBIDDEN_ERROR");
    const validatorIdx = STAFF_FUNCTIONS.indexOf(
      "isB1StaffRoutedRequestType(value.requestTypeCode)",
    );
    const handlerIdx = STAFF_FUNCTIONS.indexOf(
      "export const executeStudentRequestStaffAction",
    );
    expect(validatorIdx).toBeGreaterThan(-1);
    expect(handlerIdx).toBeGreaterThan(-1);
    expect(validatorIdx).toBeLessThan(handlerIdx);
  });

  test("authoritative guard blocks forged non-B1 client codes when DB type is B1", async () => {
    for (const code of FIVE) {
      let rpcCalls = 0;
      await expect(
        assertGenericExecutorAuthoritativeRequestType({
          requestId: STEP_UUID,
          stepId: "22222222-2222-4222-8222-222222222222",
          clientRequestTypeCode: "enrollment_certificate",
          lookup: async () => {
            rpcCalls += 1;
            return { requestId: STEP_UUID, requestTypeCode: code };
          },
        }),
      ).rejects.toThrow(GENERIC_EXECUTOR_B1_FORBIDDEN_ERROR);
      // lookup still runs after the cheap client claim check fails for B1 client codes;
      // when client claims non-B1, lookup must run and still block on authoritative B1.
      expect(rpcCalls).toBe(1);
    }
  });

  test("B1 section never references the generic executor or generic RPC", () => {
    expect(B1_SECTION).not.toContain("executeStudentRequestStaffAction");
    expect(B1_SECTION).not.toContain("act_on_student_request_step");
    expect(B1_SECTION).toContain("adapter.actOnB1RequestStep(");
  });
});

describe("P31-G3 — missing requestTypeCode fails closed", () => {
  test("empty/null/undefined codes are not B1-routed and fail the contract", () => {
    for (const code of ["", null, undefined, "   "] as const) {
      expect(isB1StaffRoutedRequestType(code)).toBe(false);
      const contract = resolveB1StaffActionContract({
        requestTypeCode: code,
        stepId: STEP_UUID,
        configuredActionType: "review",
        isActionable: true,
      });
      expect(contract).toMatchObject({ ok: false, code: "NOT_B1_SERVICE" });
    }
  });

  test("generic executor schema requires non-empty requestTypeCode", () => {
    expect(STAFF_FUNCTIONS).toContain("requestTypeCode: z.string().trim().min(1)");
    const schemaBlock = STAFF_FUNCTIONS.slice(
      STAFF_FUNCTIONS.indexOf("const executeReviewActionSchema"),
      STAFF_FUNCTIONS.indexOf("export const executeStudentRequestStaffAction"),
    );
    expect(schemaBlock).toContain("requestTypeCode: z.string().trim().min(1)");
    expect(schemaBlock).toContain(".superRefine");
    expect(schemaBlock).toContain("isB1StaffRoutedRequestType(value.requestTypeCode)");
  });

  test("authoritative guard fails closed when client requestTypeCode is missing", async () => {
    await expect(
      assertGenericExecutorAuthoritativeRequestType({
        requestId: STEP_UUID,
        stepId: STEP_UUID,
        clientRequestTypeCode: "",
        lookup: async () => ({
          requestId: STEP_UUID,
          requestTypeCode: "enrollment_certificate",
        }),
      }),
    ).rejects.toThrow(GENERIC_EXECUTOR_TYPE_UNRESOLVED_ERROR);
  });
});

describe("P31-G4 — buttons derive from server capability / configured action", () => {
  test("exactly one configured action resolves; no static role button matrix", () => {
    expect(B1_SECTION).toContain("resolveB1StaffActionContract");
    expect(B1_SECTION).not.toContain("getAllowedActionsForStepContext");
    expect(B1_PANEL).toContain("allowedAction");
    expect(B1_PANEL).toContain("ACTION_META[allowedAction]");
    // Exactly one primary <button> in the executable panel path (confirm_payment early-return has none).
    const executableButtons = B1_PANEL.match(/<button\b/g) ?? [];
    expect(executableButtons.length).toBe(1);
    expect(B1_PANEL).not.toContain("getAllowedActionsForStepContext");
  });

  for (const action of B1_PANEL_EXECUTABLE_ACTIONS) {
    test(`configured ${action} yields a single executable contract action`, () => {
      const contract = resolveB1StaffActionContract({
        requestTypeCode: "file_withdrawal",
        stepId: STEP_UUID,
        configuredActionType: action,
        isActionable: true,
      });
      expect(contract).toMatchObject({ ok: true, action });
    });
  }

  test("isActionable=false blocks the button path", () => {
    const contract = resolveB1StaffActionContract({
      requestTypeCode: "excused_absence",
      stepId: STEP_UUID,
      configuredActionType: "review",
      isActionable: false,
    });
    expect(contract).toMatchObject({ ok: false, code: "NOT_ACTIONABLE" });
  });
});

describe("P31-G5 — no alternative action button / specialized routing", () => {
  test("confirm_payment is specialized — not executable via atomic panel contract", () => {
    const contract = resolveB1StaffActionContract({
      requestTypeCode: "department_transfer",
      stepId: STEP_UUID,
      configuredActionType: "confirm_payment",
      isActionable: true,
    });
    expect(contract).toMatchObject({ ok: false, code: "CONFIGURED_ACTION_SPECIALIZED" });
    expect(B1_PANEL).toContain("إجراء تأكيد استلام الإيراد");
    expect(B1_SECTION).toContain("createB1ConfirmPaymentHandler");
  });

  test("action_result values never become actions", () => {
    for (const result of ["reviewed", "approved", "cleared", "applied", "archived", "payment_confirmed"]) {
      const contract = resolveB1StaffActionContract({
        requestTypeCode: "final_chance",
        stepId: STEP_UUID,
        configuredActionType: result,
        isActionable: true,
      });
      expect(contract).toMatchObject({ ok: false, code: "CONFIGURED_ACTION_IS_RESULT" });
    }
  });

  test("employee panel refuses to execute confirm_payment", () => {
    expect(B1_PANEL).toContain('if (allowedAction === "confirm_payment")');
    expect(REVENUE_CARD).toContain("onConfirm");
    expect(REVENUE_CARD).not.toContain("actOnB1RequestStep");
  });
});

describe("P31-G6 — per-service / per-step chain inventory (source)", () => {
  for (const code of FIVE) {
    for (const step of WORKFLOW_BY_SERVICE[code]) {
      test(`${code}.${step.key} → ${step.action} has a fail-closed UI→RPC path`, () => {
        expect(step.unit.length).toBeGreaterThan(0);
        expect(step.role.length).toBeGreaterThan(0);

        if (step.action === "confirm_payment") {
          expect(B1_SECTION).toContain("confirmB1RevenueReceipt");
          expect(B1_FUNCTIONS).toContain("confirmB1UiRevenueReceiptFn");
          expect(B1_RPC).toContain("record_external_university_payment_confirmation");
          expect([...RECORD_EXTERNAL_PAYMENT_ARG_KEYS]).toEqual(["p_step_id", "p_note"]);
          for (const forbidden of RECORD_EXTERNAL_PAYMENT_FORBIDDEN_CLIENT_KEYS) {
            expect(RECORD_EXTERNAL_PAYMENT_ARG_KEYS).not.toContain(forbidden as never);
          }
          return;
        }

        expect((B1_ACT_ON_STEP_ACTIONS as readonly string[]).includes(step.action)).toBe(true);
        const contract = resolveB1StaffActionContract({
          requestTypeCode: code,
          stepId: STEP_UUID,
          configuredActionType: step.action,
          isActionable: true,
        });
        expect(contract).toMatchObject({ ok: true, action: step.action, canonicalCode: code });
        expect(B1_FUNCTIONS).toContain("actOnB1UiRequestStepFn");
        expect(B1_RPC).toContain("act_on_b1_student_request_step_atomic");
        expect([...ACT_ON_B1_ATOMIC_ARG_KEYS]).toEqual([
          "p_step_id",
          "p_action",
          "p_comment",
          "p_payload",
        ]);
      });
    }
  }

  test("student submit chain uses atomic submit RPC only", () => {
    expect(STUDENT_FORM).toContain("submitB1Request");
    expect(ADAPTER_LIVE).toContain("submitB1UiRequestFn");
    expect(B1_FUNCTIONS).toContain("submitB1UiRequestFn");
    expect(B1_FUNCTIONS).toContain("rpcSubmitB1StudentRequestAtomic");
    expect(B1_RPC).toContain("submit_b1_student_request_atomic");
    expect([...SUBMIT_B1_ATOMIC_ARG_KEYS]).toEqual([
      "p_request_id",
      "p_canonical_code",
      "p_form_data",
      "p_expected_updated_at",
      "p_attachment_ids",
    ]);
    expect(B1_FUNCTIONS).toContain("B1_CANONICAL_CODE_REQUIRED");
  });

  test("server act-on re-reads configured action and rejects mismatch / specialized", () => {
    expect(B1_FUNCTIONS).toContain("resolveB1ActOnRpcAction");
    expect(B1_FUNCTIONS).toContain("B1_ACTION_TYPE_MISMATCH");
    expect(B1_FUNCTIONS).toContain("B1_SPECIALIZED_ACTION_RPC_REQUIRED");
    for (const specialized of B1_SPECIALIZED_ACTIONS_FORBIDDEN_ON_ACT_ON) {
      expect(B1_RPC).toContain(`"${specialized}"`);
    }
  });

  test("post-action refresh invalidates staff inbox detail keys", () => {
    expect(B1_SECTION).toContain('queryKey: ["staff-inbox-detail", requestId]');
    expect(B1_SECTION).toContain('queryKey: ["staff-inbox"]');
    expect(B1_SECTION).toContain('queryKey: ["notifications"]');
  });
});

describe("P31-G7 — direct assignee / no general bypass (source contracts)", () => {
  test("atomic act-on SQL raises B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED", () => {
    const actSql = read(
      "supabase/migrations/20260727120200_b1_27_act_on_academic_effect_integration_01.sql",
    );
    expect(actSql).toContain("can_current_user_act_on_step");
    expect(actSql).toContain("B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED");
    expect(actSql).not.toMatch(/system_admin\s*=\s*true|IF\s+v_is_admin|bypass/i);
  });

  test("payment confirmation SQL requires exact direct finance assignee", () => {
    const paySql = read(
      "supabase/migrations/20260725120000_b1_confirm_payment_predecessor_guard_01.sql",
    );
    expect(paySql).toContain("EXACTLY_ONE_DIRECT_PAYMENT_ASSIGNEE_REQUIRED");
    expect(paySql).toContain("DIRECT_PAYMENT_ASSIGNEE_REQUIRED");
    expect(paySql).toContain("current_user_has_exact_processing_binding");
    expect(paySql).toContain("confirm_payment");
    expect(paySql).toContain("no role-pool/admin/registrar/dean bypass");
    // No affirmative bypass branch (the COMMENT above documents the prohibition).
    expect(paySql).not.toMatch(
      /IF\s+.*system_admin|IF\s+.*is_admin|bypass\s*=\s*true|ALLOW_ADMIN_BYPASS/i,
    );
  });

  test("UI contract requires isActionable before rendering the executable button", () => {
    expect(ROUTING).toContain('NOT_ACTIONABLE');
    expect(B1_SECTION).toContain("isActionable");
  });
});

describe("P31-G8 — loading/error/retry cannot double-submit", () => {
  test("section + panel both guard inFlightRef", () => {
    expect(B1_SECTION).toContain("inFlightRef");
    expect(B1_PANEL).toContain("if (inFlightRef.current || controlsDisabled) return;");
    expect(REVENUE_CARD).toMatch(/acting|disabled|busy/i);
  });

  test("createB1StaffActHandler ignores concurrent calls", async () => {
    let calls = 0;
    const inFlightRef = { current: false };
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const handler = createB1StaffActHandler({
      adapter: {
        actOnB1RequestStep: async () => {
          calls += 1;
          await gate;
        },
      },
      stepId: STEP_UUID,
      contractAction: "review",
      inFlightRef,
    });
    const first = handler("review");
    const second = handler("review");
    release();
    await Promise.all([first, second]);
    expect(calls).toBe(1);
  });

  test("createB1ConfirmPaymentHandler ignores concurrent calls", async () => {
    let calls = 0;
    const inFlightRef = { current: false };
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const handler = createB1ConfirmPaymentHandler({
      adapter: {
        actOnB1RequestStep: async () => {
          throw new Error("must not use act-on for payment");
        },
        confirmB1RevenueReceipt: async () => {
          calls += 1;
          await gate;
        },
      },
      stepId: STEP_UUID,
      inFlightRef,
    });
    const first = handler(STEP_UUID);
    const second = handler(STEP_UUID);
    release();
    await Promise.all([first, second]);
    expect(calls).toBe(1);
  });
});

describe("P31-G9 — stale views cannot act on transitioned steps", () => {
  test("generic executor refuses non-active steps", () => {
    expect(STAFF_FUNCTIONS).toContain('stepRow.status !== "active"');
    expect(STAFF_FUNCTIONS).toContain("الخطوة ليست نشطة");
  });

  test("B1 adapter surfaces STALE_VERSION for reloads", () => {
    expect(ADAPTER_LIVE).toMatch(/STALE_VERSION|stale/i);
    expect(b1AdapterErrorMessageAr(new B1AdapterError("STALE_VERSION", "x"))).toContain(
      "أعد تحميل",
    );
  });

  test("atomic act-on SQL requires active step + predecessor completeness", () => {
    const actSql = read(
      "supabase/migrations/20260727120200_b1_27_act_on_academic_effect_integration_01.sql",
    );
    expect(actSql).toMatch(/B1_ACTIVE_STEP|active/i);
    expect(actSql).toMatch(/B1_PREDECESSOR_INCOMPLETE|predecessor/i);
  });
});

describe("P31-G10 — PII / backend errors are not rendered raw", () => {
  test("b1AdapterErrorMessageAr never echoes SQL/PostgREST", () => {
    const raw = new Error("PostgREST PGRST116 relation student_requests does not exist");
    const msg = b1AdapterErrorMessageAr(raw);
    expect(msg).not.toMatch(/PostgREST|PGRST|relation|SQL/i);
    expect(msg.length).toBeGreaterThan(0);
  });

  test("sanitizeStaffErrorMessage redacts SQL/permission/schema leaks", () => {
    expect(sanitizeStaffErrorMessage("permission denied for table x")).not.toContain(
      "permission denied for table",
    );
    expect(sanitizeStaffErrorMessage("syntax error near SELECT")).not.toMatch(/SELECT/i);
    expect(sanitizeStaffErrorMessage("PGRST301 JWT expired")).not.toContain("PGRST");
  });

  test("staff + B1 panels use sanitized messages", () => {
    expect(B1_PANEL).toContain("b1AdapterErrorMessageAr");
    expect(REVENUE_CARD).toContain("b1AdapterErrorMessageAr");
    expect(STAFF_FUNCTIONS).toContain("sanitizeStaffErrorMessage");
  });
});

describe("P31-G11 — RTL / mobile action-state surface", () => {
  test("B1 action surfaces root with dir=rtl and no absolute/fixed overlays", () => {
    for (const source of [B1_PANEL, B1_SECTION, REVENUE_CARD, STUDENT_FORM]) {
      expect(source).toContain('dir="rtl"');
      expect(source).not.toMatch(/position:\s*absolute|className=\"[^\"]*\bfixed\b/);
    }
  });

  test("touch targets and overflow safeguards remain present", () => {
    expect(B1_PANEL).toContain("min-h-11");
    expect(STUDENT_FORM).toContain("min-w-0");
    expect(B1_PANEL).toContain("w-full");
  });
});

describe("P31-G12 — student visibility fail-closed at UI boundary", () => {
  test("empty backend availability hides every B1 service", () => {
    const rows = mapBackendRowsToB1Availability([]);
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.studentVisible === false)).toBe(true);
    expect(rows.every((r) => r.runtimeAvailable === false)).toBe(true);
  });

  test("studentVisible is derived only from backend inclusion", () => {
    expect(AVAILABILITY).toContain("studentVisible comes only from backend inclusion");
    expect(AVAILABILITY).toContain("runtimeAvailable is NEVER hardcoded true");
    expect(STUDENT_FORM).toContain("item.studentVisible && item.runtimeAvailable");
  });
});

describe("P31-G13 — enrollment_certificate remains unaffected", () => {
  test("enrollment_certificate is outside B1 routing and keeps the generic executor", () => {
    expect(isB1StaffRoutedRequestType("enrollment_certificate")).toBe(false);
    expect(toB1CanonicalCode("enrollment_certificate")).toBeNull();
    expect(() => assertGenericStaffExecutorAllowed("enrollment_certificate")).not.toThrow();
    expect(B1_CANONICAL_CODES).not.toContain("enrollment_certificate" as never);
  });

  test("detail panel still mounts EnrollmentCertificateIssueButton for issue_document", () => {
    expect(DETAIL_PANEL).toContain("EnrollmentCertificateIssueButton");
    expect(DETAIL_PANEL).toContain('activeType === "issue_document"');
  });
});

describe("P31-G14 — source migration terminal visibility (required launch-hide proof)", () => {
  /**
   * Walk every supabase migration that SETs student_visible for the five B1
   * codes and compute the terminal source-chain value. Launch approval requires
   * the terminal value to remain false.
   */
  function terminalStudentVisibleForFive(): Record<(typeof FIVE)[number], boolean | null> {
    const migDir = join(ROOT, "supabase/migrations");
    const files = readdirSync(migDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    const state: Record<(typeof FIVE)[number], boolean | null> = {
      enrollment_suspension: null,
      excused_absence: null,
      department_transfer: null,
      final_chance: null,
      file_withdrawal: null,
    };
    const codeList =
      "'enrollment_suspension'|'excused_absence'|'department_transfer'|'final_chance'|'file_withdrawal'";
    const setRe =
      /SET\s+student_visible\s*=\s*(true|false)[\s\S]*?WHERE\s+code\s+IN\s*\(([^)]+)\)/gi;

    for (const file of files) {
      const sql = readFileSync(join(migDir, file), "utf8");
      let match: RegExpExecArray | null;
      const local = new RegExp(setRe.source, "gi");
      while ((match = local.exec(sql)) !== null) {
        const value = match[1] === "true";
        const list = match[2] ?? "";
        for (const code of FIVE) {
          if (new RegExp(`'${code}'`).test(list) || new RegExp(codeList).test(list)) {
            if (list.includes(`'${code}'`)) state[code] = value;
          }
        }
      }
    }
    return state;
  }

  test("DETECT — records terminal student_visible from ordered migrations", () => {
    const terminal = terminalStudentVisibleForFive();
    // Pin the detected source-chain terminal so the report stays reproducible.
    for (const code of FIVE) {
      expect(terminal[code], code).not.toBeNull();
    }
    // Required operational proof: services remain hidden until launch approval.
    // This assertion is the HOLD gate for pack 31 when migrations leave true.
    for (const code of FIVE) {
      expect(terminal[code], `${code} terminal student_visible`).toBe(false);
    }
  });
});
