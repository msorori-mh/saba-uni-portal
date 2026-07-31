/**
 * B1_STAGE2_SHARED_UI_CONFIRM_PAYMENT_CARD_MISSING_FIX-91
 *
 * Proves that a B1 active step configured with `action_type = confirm_payment`
 * renders the dedicated revenue receipt card (never the generic review panel,
 * never a no-action view) and executes exclusively through
 * `confirmB1RevenueReceipt` — never `actOnB1RequestStep`.
 *
 * No module mocking and no workflow RPC: the executor is injected.
 */

import { describe, expect, it } from "bun:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  B1StaffStepActionSection,
  createB1ConfirmPaymentHandler,
  createB1StaffActHandler,
} from "@/components/student-requests/b1/B1StaffStepActionSection";
import {
  B1_SPECIALIZED_ACTION_TYPES,
  assertGenericStaffExecutorAllowed,
  GENERIC_EXECUTOR_B1_FORBIDDEN_ERROR,
  resolveB1StaffActionContract,
} from "@/lib/student-requests/b1-staff-action-routing";
import type { B1StaffAction } from "@/lib/student-requests/b1-ui/adapter.types";

const GENERIC_LABELS = ["موافقة", "إعادة للطالب", "تحويل", "إصدار الوثيقة", "توقيع"];
const FORBIDDEN_ACTIONS = ["اعتماد", "مراجعة", "تطبيق القرار"];

type ActCall = { stepId: string; action: B1StaffAction; comment?: string };
type ConfirmCall = { stepId: string; note?: string };

function createFakeAdapter(gate?: Promise<void>) {
  const actCalls: ActCall[] = [];
  const confirmCalls: ConfirmCall[] = [];
  return {
    actCalls,
    confirmCalls,
    actOnB1RequestStep: async (stepId: string, action: B1StaffAction, comment?: string) => {
      actCalls.push({ stepId, action, comment });
      return { accepted: true, action } as never;
    },
    confirmB1RevenueReceipt: async (stepId: string, note?: string) => {
      confirmCalls.push({ stepId, note });
      if (gate) await gate;
      return { accepted: true, stepId, action: "confirm_payment" } as never;
    },
  };
}

function render(node: ReactNode): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, node) as never);
}

const SERVICES = [
  { requestTypeCode: "department_transfer", stepId: "step-dt-pay-1" },
  { requestTypeCode: "final_chance", stepId: "step-fc-pay-1" },
];

for (const svc of SERVICES) {
  describe(`B1 confirm_payment card — ${svc.requestTypeCode}`, () => {
    const PROPS = {
      requestId: `req-${svc.requestTypeCode}`,
      requestTypeCode: svc.requestTypeCode,
      stepId: svc.stepId,
      stepKey: "payment_confirmation",
      stepLabelAr: "تأكيد السداد",
      configuredActionType: "confirm_payment",
      allowedAction: "confirm_payment",
      isActionable: true,
    } as const;

    it("renders the specialized revenue receipt card", () => {
      const fake = createFakeAdapter();
      const html = render(createElement(B1StaffStepActionSection, { ...PROPS, adapter: fake }));

      expect(html).toContain('data-testid="b1-revenue-receipt-card"');
      expect(html).toContain('data-b1-action="confirm_payment"');
      expect(html).toContain("تأكيد استلام الرسوم");
      expect(html).not.toContain("b1-staff-action-blocked");
      expect(fake.actCalls).toHaveLength(0);
      expect(fake.confirmCalls).toHaveLength(0);
    });

    it("does not render the review-only / generic action panel", () => {
      const fake = createFakeAdapter();
      const html = render(createElement(B1StaffStepActionSection, { ...PROPS, adapter: fake }));
      expect(html).not.toContain('data-testid="b1-employee-action-panel"');
      for (const label of [...GENERIC_LABELS, ...FORBIDDEN_ACTIONS]) {
        expect(html).not.toContain(label);
      }
    });

    it("is never a no-action view: exactly one actionable button exists", () => {
      const fake = createFakeAdapter();
      const html = render(createElement(B1StaffStepActionSection, { ...PROPS, adapter: fake }));
      expect((html.match(/<button/g) ?? []).length).toBe(1);
    });

    it("executes through confirmB1RevenueReceipt only, once", async () => {
      let release: (() => void) | undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const fake = createFakeAdapter(gate);
      const inFlightRef = { current: false };
      const handleConfirm = createB1ConfirmPaymentHandler({
        adapter: fake,
        stepId: svc.stepId,
        inFlightRef,
      });

      const first = handleConfirm(svc.stepId, "ملاحظة");
      const second = handleConfirm(svc.stepId);
      release!();
      await Promise.all([first, second]);

      expect(fake.confirmCalls).toHaveLength(1);
      expect(fake.confirmCalls[0]!.stepId).toBe(svc.stepId);
      expect(fake.actCalls).toHaveLength(0);
      expect(inFlightRef.current).toBe(false);
    });

    it("never sends approve/review/apply_decision for this step", async () => {
      const fake = createFakeAdapter();
      const handleAct = createB1StaffActHandler({
        adapter: fake,
        stepId: svc.stepId,
        contractAction: "confirm_payment" as B1StaffAction,
        inFlightRef: { current: false },
      });
      for (const forbidden of ["approve", "review", "apply_decision"] as B1StaffAction[]) {
        await expect(handleAct(forbidden)).rejects.toThrow("B1_ACTION_TYPE_MISMATCH");
      }
      expect(fake.actCalls).toHaveLength(0);
      expect(fake.confirmCalls).toHaveLength(0);
    });

    it("blocks the card when the actor is not the assignee", () => {
      const fake = createFakeAdapter();
      const html = render(
        createElement(B1StaffStepActionSection, { ...PROPS, isActionable: false, adapter: fake }),
      );
      expect(html).toContain("b1-staff-action-blocked");
      expect(html).toContain('data-failure-code="NOT_ACTIONABLE"');
      expect(html).not.toContain("<button");
      expect(fake.confirmCalls).toHaveLength(0);
    });

    it("never reaches the generic staff executor", () => {
      expect(() => assertGenericStaffExecutorAllowed(svc.requestTypeCode)).toThrow(
        GENERIC_EXECUTOR_B1_FORBIDDEN_ERROR,
      );
    });
  });
}

describe("Package 66 literal contract unchanged", () => {
  it("keeps confirm_payment classified as specialized in the panel contract", () => {
    expect(B1_SPECIALIZED_ACTION_TYPES).toEqual(["confirm_payment", "issue_document", "sign"]);
    const contract = resolveB1StaffActionContract({
      requestTypeCode: "department_transfer",
      stepId: "step-x",
      configuredActionType: "confirm_payment",
      isActionable: true,
    });
    expect(contract.ok).toBe(false);
    if (!contract.ok) expect(contract.code).toBe("CONFIGURED_ACTION_SPECIALIZED");
  });

  it("keeps enrollment_certificate outside the B1 panel", () => {
    const contract = resolveB1StaffActionContract({
      requestTypeCode: "enrollment_certificate",
      stepId: "step-ec",
      configuredActionType: "confirm_payment",
      isActionable: true,
    });
    expect(contract.ok).toBe(false);
    if (!contract.ok) expect(contract.code).toBe("NOT_B1_SERVICE");
    expect(() => assertGenericStaffExecutorAllowed("enrollment_certificate")).not.toThrow();
  });
});
