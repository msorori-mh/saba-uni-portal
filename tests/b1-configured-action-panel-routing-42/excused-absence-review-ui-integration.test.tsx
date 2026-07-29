/**
 * PORTAL-B1 — single local UI integration test for `excused_absence`.
 *
 * Proves, with the EXISTING test harness only (bun:test + react-dom/server +
 * bun mock.module — no new framework, no new dependency, no browser, no DB):
 *  - configured action_type=review renders exactly ONE button labelled «مراجعة»
 *  - the generic staff action set is not rendered
 *  - the executed action is literally "review"
 *  - execution goes through the B1 adapter (atomic RPC path) only
 *  - the generic executor is unreachable for this service
 *  - a second click while pending does not execute twice
 */

import { describe, expect, it, mock } from "bun:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { B1StaffStepActionSection } from "@/components/student-requests/b1/B1StaffStepActionSection";
import {
  GENERIC_EXECUTOR_B1_FORBIDDEN_ERROR,
  assertGenericStaffExecutorAllowed,
} from "@/lib/student-requests/b1-staff-action-routing";
import type { B1StaffAction } from "@/lib/student-requests/b1-ui/adapter.types";

const GENERIC_LABELS = ["موافقة", "إعادة للطالب", "تحويل", "إصدار الوثيقة", "توقيع", "أرشفة"];

const PROPS = {
  requestId: "req-excused-absence-1",
  requestTypeCode: "excused_absence",
  stepId: "step-student-affairs-intake-1",
  stepKey: "student_affairs_intake",
  stepLabelAr: "استلام شؤون الطلاب",
  configuredActionType: "review",
  allowedAction: "review",
  isActionable: true,
} as const;

function render(node: ReactNode): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client }, node) as never,
  );
}

describe("excused_absence — configured action_type=review UI integration", () => {
  it("renders exactly one «مراجعة» action and no generic actions", () => {
    const html = render(createElement(B1StaffStepActionSection, PROPS));

    expect(html).toContain('data-b1-action="review"');
    expect(html).not.toContain("b1-staff-action-blocked");

    const buttons = html.match(/<button/g) ?? [];
    expect(buttons).toHaveLength(1);

    const reviewLabelCount = (html.match(/مراجعة/g) ?? []).length;
    expect(reviewLabelCount).toBe(1);

    for (const label of GENERIC_LABELS) {
      expect(html).not.toContain(label);
    }
  });

  it("sends action='review' through the B1 adapter only, once, while pending", async () => {
    const calls: Array<{ stepId: string; action: B1StaffAction; comment?: string }> = [];
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const actual = await import("@/lib/student-requests/b1-ui");
    mock.module("@/lib/student-requests/b1-ui", () => ({
      ...actual,
      getB1UiAdapter: () => ({
        actOnB1RequestStep: async (
          stepId: string,
          action: B1StaffAction,
          comment?: string,
        ) => {
          calls.push({ stepId, action, comment });
          await gate;
          return { accepted: true, action, requestId: PROPS.requestId };
        },
      }),
    }));

    let captured: ((action: B1StaffAction, comment?: string) => Promise<void>) | undefined;
    mock.module("@/components/student-requests/b1/B1EmployeeActionPanel", () => ({
      B1EmployeeActionPanel: (props: {
        allowedAction: B1StaffAction;
        onAct: (action: B1StaffAction, comment?: string) => Promise<void>;
      }) => {
        captured = props.onAct;
        return createElement("button", { type: "button" }, props.allowedAction);
      },
    }));

    const { B1StaffStepActionSection: Section } = await import(
      "@/components/student-requests/b1/B1StaffStepActionSection"
    );
    render(createElement(Section, PROPS));

    expect(typeof captured).toBe("function");

    // Two clicks: the second happens while the first is still pending.
    const first = captured!("review");
    const second = captured!("review");
    release!();
    await Promise.all([first, second]);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.action).toBe("review");
    expect(calls[0]!.stepId).toBe(PROPS.stepId);
  });

  it("blocks the generic staff executor for excused_absence", () => {
    expect(() => assertGenericStaffExecutorAllowed("excused_absence")).toThrow(
      GENERIC_EXECUTOR_B1_FORBIDDEN_ERROR,
    );
    expect(() => assertGenericStaffExecutorAllowed("absence_excuse")).toThrow();
    expect(() => assertGenericStaffExecutorAllowed("enrollment_certificate")).not.toThrow();
  });
});
