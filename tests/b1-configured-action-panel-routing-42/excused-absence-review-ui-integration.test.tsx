/**
 * PORTAL-B1 — single local UI integration test for `excused_absence`.
 *
 * Remediation 46: contains NO `mock.module`. The real
 * `B1StaffStepActionSection` and the real `B1EmployeeActionPanel` are
 * rendered, and the B1 adapter is supplied through the component's explicit
 * dependency-injection prop, so nothing leaks into the module cache of any
 * later test file.
 *
 * Proves:
 *  - configured action_type=review renders exactly ONE button labelled «مراجعة»
 *  - the generic staff action set is not rendered
 *  - the executed action is literally "review"
 *  - execution goes through the B1 adapter (atomic RPC path) only
 *  - the in-flight guard blocks a duplicate concurrent execution
 *  - the generic executor is unreachable for this service
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

type RecordedCall = { stepId: string; action: B1StaffAction; comment?: string };

/** Isolated fake adapter — injected as a prop, never registered globally. */
function createFakeAdapter(gate?: Promise<void>) {
  const calls: RecordedCall[] = [];
  return {
    calls,
    actOnB1RequestStep: async (stepId: string, action: B1StaffAction, comment?: string) => {
      calls.push({ stepId, action, comment });
      if (gate) await gate;
      return { accepted: true, action, requestId: PROPS.requestId } as never;
    },
  };
}

function render(node: ReactNode): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client }, node) as never,
  );
}

describe("excused_absence — configured action_type=review UI integration", () => {
  it("renders exactly one «مراجعة» action and no generic actions", () => {
    const fake = createFakeAdapter();
    const html = render(
      createElement(B1StaffStepActionSection, { ...PROPS, adapter: fake }),
    );

    expect(html).toContain('data-b1-action="review"');
    expect(html).toContain('data-testid="b1-employee-action-panel"');
    expect(html).not.toContain("b1-staff-action-blocked");

    const buttons = html.match(/<button/g) ?? [];
    expect(buttons).toHaveLength(1);

    const reviewLabelCount = (html.match(/مراجعة/g) ?? []).length;
    expect(reviewLabelCount).toBe(1);

    for (const label of GENERIC_LABELS) {
      expect(html).not.toContain(label);
    }

    // Pure render must never execute anything.
    expect(fake.calls).toHaveLength(0);
  });

  it("sends action='review' through the B1 adapter only, once, while pending", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fake = createFakeAdapter(gate);

    // Exact production handler used by B1StaffStepActionSection.
    const inFlightRef = { current: false };
    const handleAct = createB1StaffActHandler({
      adapter: fake,
      stepId: PROPS.stepId,
      contractAction: "review",
      inFlightRef,
    });

    // Two clicks: the second happens while the first is still pending.
    const first = handleAct("review");
    const second = handleAct("review");
    release!();
    await Promise.all([first, second]);

    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]!.action).toBe("review");
    expect(fake.calls[0]!.stepId).toBe(PROPS.stepId);
    expect(inFlightRef.current).toBe(false);
  });

  it("rejects any action that differs from the configured contract action", async () => {
    const fake = createFakeAdapter();
    const handleAct = createB1StaffActHandler({
      adapter: fake,
      stepId: PROPS.stepId,
      contractAction: "review",
      inFlightRef: { current: false },
    });

    await expect(handleAct("approve" as B1StaffAction)).rejects.toThrow(
      "B1_ACTION_TYPE_MISMATCH",
    );
    expect(fake.calls).toHaveLength(0);
  });

  it("blocks the generic staff executor for excused_absence", () => {
    expect(() => assertGenericStaffExecutorAllowed("excused_absence")).toThrow(
      GENERIC_EXECUTOR_B1_FORBIDDEN_ERROR,
    );
    expect(() => assertGenericStaffExecutorAllowed("absence_excuse")).toThrow();
    expect(() => assertGenericStaffExecutorAllowed("enrollment_certificate")).not.toThrow();
  });

  it("leaves no module mocks behind (no mock.module in this file)", async () => {
    const src = await Bun.file(import.meta.path).text();
    expect(src.includes("mock.module")).toBe(false);
  });
});
