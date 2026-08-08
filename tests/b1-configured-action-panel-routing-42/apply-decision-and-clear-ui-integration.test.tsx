/**
 * PORTAL-B1-APPLY-DECISION-AND-CLEAR-ACTION-ROUTING-REMEDIATION-53
 *
 * Proves that configured `apply_decision` and `clear` steps of the five B1
 * services render a single literal action on the dedicated B1 panel and are
 * executed literally through the atomic RPC adapter — never aliased to
 * `approve`, never routed to the generic executor.
 *
 * No module mocking: the adapter is supplied through the component's explicit
 * dependency-injection prop.
 */

import { describe, expect, it } from "bun:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  B1StaffStepActionSection,
  createB1StaffActHandler,
} from "@/components/student-requests/b1/B1StaffStepActionSection";
import {
  B1_PANEL_ACTION_LABELS_AR,
  B1_PANEL_EXECUTABLE_ACTIONS,
  B1_SPECIALIZED_ACTION_TYPES,
  GENERIC_EXECUTOR_B1_FORBIDDEN_ERROR,
  assertGenericStaffExecutorAllowed,
  resolveB1StaffActionContract,
} from "@/lib/student-requests/b1-staff-action-routing";
import { B1_ACT_ON_STEP_ACTIONS } from "@/lib/student-requests/b1-ui/b1-rpc";
import type { B1StaffAction } from "@/lib/student-requests/b1-ui/adapter.types";

const GENERIC_LABELS = ["موافقة", "إعادة للطالب", "تحويل", "إصدار الوثيقة", "توقيع"];

type RecordedCall = { stepId: string; action: B1StaffAction; comment?: string };

function createFakeAdapter(gate?: Promise<void>) {
  const calls: RecordedCall[] = [];
  return {
    calls,
    actOnB1RequestStep: async (stepId: string, action: B1StaffAction, comment?: string) => {
      calls.push({ stepId, action, comment });
      if (gate) await gate;
      return { accepted: true, action } as never;
    },
  };
}

function render(node: ReactNode): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, node) as never);
}

const CASES = [
  {
    action: "apply_decision" as const,
    labelAr: "تطبيق القرار",
    requestTypeCode: "excused_absence",
    stepId: "step-record-apply-1",
    stepKey: "record_apply",
    stepLabelAr: "مرحلة السجل الأكاديمي",
  },
  {
    action: "clear" as const,
    labelAr: "إخلاء طرف",
    requestTypeCode: "file_withdrawal",
    stepId: "step-library-clear-1",
    stepKey: "library_clear",
    stepLabelAr: "مرحلة المكتبة",
  },
  {
    action: "archive" as const,
    labelAr: "أرشفة",
    requestTypeCode: "enrollment_suspension",
    stepId: "step-archive-1",
    stepKey: "archive",
    stepLabelAr: "المرحلة الختامية",
  },
];

describe("B1 apply_decision / clear — contract", () => {
  it("no longer classifies apply_decision or clear as specialized", () => {
    expect(B1_SPECIALIZED_ACTION_TYPES).toEqual(["confirm_payment", "issue_document", "sign"]);
    expect(B1_PANEL_EXECUTABLE_ACTIONS).toContain("apply_decision");
    expect(B1_PANEL_EXECUTABLE_ACTIONS).toContain("clear");
    expect(B1_PANEL_EXECUTABLE_ACTIONS).toContain("archive");
  });

  it("keeps both actions supported by the atomic RPC action set", () => {
    expect(B1_ACT_ON_STEP_ACTIONS).toContain("apply_decision");
    expect(B1_ACT_ON_STEP_ACTIONS).toContain("clear");
  });

  it("labels them literally, never as approve", () => {
    expect(B1_PANEL_ACTION_LABELS_AR.apply_decision).toBe("تطبيق القرار");
    expect(B1_PANEL_ACTION_LABELS_AR.clear).toBe("إخلاء طرف");
    expect(B1_PANEL_ACTION_LABELS_AR.archive).toBe("أرشفة");
    expect(B1_PANEL_ACTION_LABELS_AR.approve).toBe("اعتماد");
  });

  it("keeps specialized action types off the B1 panel", () => {
    for (const specialized of B1_SPECIALIZED_ACTION_TYPES) {
      const contract = resolveB1StaffActionContract({
        requestTypeCode: "file_withdrawal",
        stepId: "step-x",
        configuredActionType: specialized,
        isActionable: true,
      });
      expect(contract.ok).toBe(false);
      if (!contract.ok) expect(contract.code).toBe("CONFIGURED_ACTION_SPECIALIZED");
    }
  });
});

for (const c of CASES) {
  describe(`B1 configured action_type=${c.action} UI integration`, () => {
    const PROPS = {
      requestId: `req-${c.action}`,
      requestTypeCode: c.requestTypeCode,
      stepId: c.stepId,
      stepKey: c.stepKey,
      stepLabelAr: c.stepLabelAr,
      configuredActionType: c.action,
      allowedAction: c.action,
      isActionable: true,
    } as const;

    it(`renders exactly one «${c.labelAr}» button and no generic actions`, () => {
      const fake = createFakeAdapter();
      const html = render(createElement(B1StaffStepActionSection, { ...PROPS, adapter: fake }));

      expect(html).toContain(`data-b1-action="${c.action}"`);
      expect(html).toContain('data-testid="b1-employee-action-panel"');
      expect(html).not.toContain("b1-staff-action-blocked");
      expect((html.match(/<button/g) ?? []).length).toBe(1);
      expect((html.match(new RegExp(c.labelAr, "g")) ?? []).length).toBe(1);
      expect(html).not.toContain("اعتماد");
      for (const label of GENERIC_LABELS) expect(html).not.toContain(label);
      expect(fake.calls).toHaveLength(0);
    });

    it(`sends "${c.action}" literally through the atomic adapter, once`, async () => {
      let release: (() => void) | undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const fake = createFakeAdapter(gate);
      const inFlightRef = { current: false };
      const handleAct = createB1StaffActHandler({
        adapter: fake,
        stepId: PROPS.stepId,
        contractAction: c.action,
        inFlightRef,
      });

      const first = handleAct(c.action);
      const second = handleAct(c.action);
      release!();
      await Promise.all([first, second]);

      expect(fake.calls).toHaveLength(1);
      expect(fake.calls[0]!.action).toBe(c.action);
      expect(fake.calls[0]!.stepId).toBe(PROPS.stepId);
      expect(inFlightRef.current).toBe(false);
    });

    it("rejects any aliasing to approve", async () => {
      const fake = createFakeAdapter();
      const handleAct = createB1StaffActHandler({
        adapter: fake,
        stepId: PROPS.stepId,
        contractAction: c.action,
        inFlightRef: { current: false },
      });
      await expect(handleAct("approve")).rejects.toThrow("B1_ACTION_TYPE_MISMATCH");
      expect(fake.calls).toHaveLength(0);
    });

    it("blocks execution when is_actionable=false", () => {
      const fake = createFakeAdapter();
      const html = render(
        createElement(B1StaffStepActionSection, {
          ...PROPS,
          isActionable: false,
          adapter: fake,
        }),
      );
      expect(html).toContain("b1-staff-action-blocked");
      expect(html).toContain('data-failure-code="NOT_ACTIONABLE"');
      expect(html).not.toContain("<button");
      expect(fake.calls).toHaveLength(0);
    });

    it("never reaches the generic executor", () => {
      expect(() => assertGenericStaffExecutorAllowed(c.requestTypeCode)).toThrow(
        GENERIC_EXECUTOR_B1_FORBIDDEN_ERROR,
      );
    });
  });
}

describe("enrollment_certificate regression", () => {
  it("remains outside the B1 panel and allowed on the generic executor", () => {
    const contract = resolveB1StaffActionContract({
      requestTypeCode: "enrollment_certificate",
      stepId: "step-ec",
      configuredActionType: "review",
      isActionable: true,
    });
    expect(contract.ok).toBe(false);
    if (!contract.ok) expect(contract.code).toBe("NOT_B1_SERVICE");
    expect(() => assertGenericStaffExecutorAllowed("enrollment_certificate")).not.toThrow();
  });
});
