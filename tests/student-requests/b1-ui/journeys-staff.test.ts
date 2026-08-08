/**
 * Staff journey coverage for the five B1 services (16 cases).
 *
 * Runs against the scripted scenario adapter (never a real backend) plus
 * static renders and source contracts for component-only behaviors.
 */

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  B1_STAFF_ACTIONS_REQUIRING_COMMENT,
  B1AdapterError,
  b1AdapterErrorMessageAr,
} from "@/lib/student-requests/b1-ui";
import { B1EmployeeActionPanel } from "@/components/student-requests/b1/B1EmployeeActionPanel";
import { B1RequestSummary } from "@/components/student-requests/b1/B1RequestSummary";
import { B1RevenueReceiptCard } from "@/components/student-requests/b1/B1RevenueReceiptCard";
import { B1WorkflowTimeline } from "@/components/student-requests/b1/B1WorkflowTimeline";
import { createScenarioAdapter, makeAssigned } from "./fixtures/scenario-adapter";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const workspaceSource = read("src/components/student-requests/b1/B1StaffWorkspace.tsx");
const panelSource = read("src/components/student-requests/b1/B1EmployeeActionPanel.tsx");
const revenueSource = read("src/components/student-requests/b1/B1RevenueReceiptCard.tsx");
const summarySource = read("src/components/student-requests/b1/B1RequestSummary.tsx");
const uploaderSource = read("src/components/student-requests/b1/B1AttachmentUploader.tsx");

describe("staff journey — inbox states (cases 1-4)", () => {
  it("renders an explicit empty inbox state (case 1)", async () => {
    const { adapter } = createScenarioAdapter({ assigned: [] });
    expect(await adapter.getAssignedB1Requests()).toEqual([]);
    expect(workspaceSource).toContain("لا توجد طلبات مسندة");
    expect(workspaceSource).toContain("B1EmptyState");
  });

  it("loads assigned requests into the inbox (case 2)", async () => {
    const seed = [
      makeAssigned(),
      makeAssigned({ allowedAction: "review", stepKey: "manager_review" }),
    ];
    const { adapter } = createScenarioAdapter({ assigned: seed });
    const rows = await adapter.getAssignedB1Requests();
    expect(rows).toHaveLength(2);
    // The inbox rows carry no detail payloads (summary/attachments/steps stripped).
    expect(rows[0]).not.toHaveProperty("formDataSummary");
    expect(rows[0]).not.toHaveProperty("attachments");
  });

  it("loads details for a request assigned to the staff member (case 3)", async () => {
    const seed = makeAssigned();
    const { adapter } = createScenarioAdapter({ assigned: [seed] });
    const details = await adapter.getAssignedB1RequestDetails(seed.requestId);
    expect(details.studentNameAr).toBe("طالب تجريبي");
    expect(details.steps[0].status).toBe("active");
  });

  it("never exposes a request that is not assigned (case 4)", async () => {
    const { adapter } = createScenarioAdapter({ assigned: [makeAssigned()] });
    try {
      await adapter.getAssignedB1RequestDetails("req-unassigned");
      throw new Error("expected NOT_FOUND");
    } catch (error) {
      expect(error).toBeInstanceOf(B1AdapterError);
      expect((error as B1AdapterError).code).toBe("NOT_FOUND");
    }
    expect(b1AdapterErrorMessageAr(new B1AdapterError("NOT_FOUND", "x"))).toBe(
      "تعذر العثور على الطلب المطلوب.",
    );
  });
});

describe("staff journey — legal actions only (cases 5-9)", () => {
  it("renders exactly the backend-authorized action and nothing else (case 5)", () => {
    for (const action of ["approve", "review", "return", "reject"] as const) {
      const html = renderToStaticMarkup(
        createElement(B1EmployeeActionPanel, {
          allowedAction: action,
          stepLabelAr: "المراجعة الأولية",
          onAct: () => {},
        }),
      );
      const labels = ["اعتماد", "مراجعة", "إرجاع للاستكمال", "رفض"];
      const expected = {
        approve: "اعتماد",
        review: "مراجعة",
        return: "إرجاع للاستكمال",
        reject: "رفض",
      }[action];
      for (const label of labels) {
        // The reject label is a substring of the return label — count button tags instead.
        if (label === expected) continue;
        expect(html.includes(`>${label}<`), `${action} must not render ${label}`).toBe(false);
      }
      expect(html.match(/<button/g)?.length).toBe(1);
    }
  });

  it("executes a regular action and requires a comment for return/reject (case 6)", async () => {
    const seed = makeAssigned({ allowedAction: "approve" });
    const { adapter } = createScenarioAdapter({ assigned: [seed] });
    const result = await adapter.actOnB1RequestStep(seed.stepId, "approve");
    expect(result.accepted).toBe(true);
    expect(result.action).toBe("approve");
    expect(B1_STAFF_ACTIONS_REQUIRING_COMMENT).toEqual(["return", "reject"]);
    expect(panelSource).toContain("التعليق إلزامي لتنفيذ هذا الإجراء.");
  });

  it("routes confirm_payment exclusively through the revenue card (case 7)", () => {
    expect(workspaceSource).toContain('details.allowedAction === "confirm_payment"');
    expect(workspaceSource).toContain("B1RevenueReceiptCard");
    const html = renderToStaticMarkup(
      createElement(B1RevenueReceiptCard, { stepId: "step-1", onConfirm: async () => {} }),
    );
    expect(html).toContain("تأكيد استلام الرسوم");
    expect(html).toContain("ملاحظة اختيارية");
    expect(html).not.toMatch(/مبلغ|عملة|فاتورة|محفظة|رصيد|رقم عملية|بوابة دفع/);
    expect(html).not.toMatch(/\b(amount|currency|invoice|gateway|wallet|balance)\b/i);
    // Exactly one action: the confirm button.
    expect(html.match(/<button/g)?.length).toBe(1);
  });

  it("blocks confirm_payment from the generic action panel (case 8)", () => {
    const html = renderToStaticMarkup(
      createElement(B1EmployeeActionPanel, {
        allowedAction: "confirm_payment",
        stepLabelAr: "تأكيد استلام الرسوم",
        onAct: () => {},
      }),
    );
    expect(html).toContain("بطاقة الإيرادات المخصصة");
    expect(html).not.toContain("<button");
    expect(panelSource).not.toContain("confirmB1RevenueReceipt");
  });

  it("acknowledges the action only after it resolves, then re-reads (no optimistic status) (case 9)", () => {
    expect(panelSource).toContain("await onAct(allowedAction");
    expect(panelSource.indexOf("await onAct(allowedAction")).toBeLessThan(
      panelSource.indexOf('toast.success("تم تنفيذ الإجراء بنجاح.")'),
    );
    expect(workspaceSource).toContain("refreshAfterAction");
    expect(workspaceSource).toContain("await adapter.getAssignedB1RequestDetails");
    expect(workspaceSource).not.toMatch(/optimistic/i);
  });
});

describe("staff journey — failure modes (cases 10-13)", () => {
  it("surfaces a stale request state with a safe message (cases 10, 13)", async () => {
    const { adapter } = createScenarioAdapter({
      assigned: [makeAssigned()],
      failOn: { actOnB1RequestStep: "STALE_VERSION" },
    });
    try {
      await adapter.actOnB1RequestStep("step-x", "approve");
      throw new Error("expected STALE_VERSION");
    } catch (error) {
      expect((error as B1AdapterError).code).toBe("STALE_VERSION");
    }
    expect(b1AdapterErrorMessageAr(new B1AdapterError("STALE_VERSION", "x"))).toContain(
      "تغيّرت حالة الطلب",
    );
  });

  it("shows an in-panel error when the action fails (case 11)", async () => {
    const { adapter } = createScenarioAdapter({
      assigned: [makeAssigned()],
      failOn: { actOnB1RequestStep: "NETWORK_ERROR" },
    });
    try {
      await adapter.actOnB1RequestStep("step-x", "approve");
      throw new Error("expected NETWORK_ERROR");
    } catch (error) {
      expect((error as B1AdapterError).code).toBe("NETWORK_ERROR");
    }
    // The panel keeps the failure inside the workspace as an alert, no crash.
    expect(panelSource).toContain("setActionError(messageAr)");
    expect(panelSource).toContain('role="alert"');
  });

  it("rejects an action the backend did not authorize (case 12)", async () => {
    const seed = makeAssigned({ allowedAction: "approve" });
    const { adapter } = createScenarioAdapter({ assigned: [seed] });
    try {
      await adapter.actOnB1RequestStep(seed.stepId, "reject", "سبب");
      throw new Error("expected PERMISSION_DENIED");
    } catch (error) {
      expect((error as B1AdapterError).code).toBe("PERMISSION_DENIED");
    }
    expect(b1AdapterErrorMessageAr(new B1AdapterError("PERMISSION_DENIED", "x"))).toBe(
      "لا تملك صلاحية تنفيذ هذا الإجراء على هذا الطلب.",
    );
    // A non-payment step cannot be confirmed as revenue either.
    try {
      await adapter.confirmB1RevenueReceipt(seed.stepId);
      throw new Error("expected PERMISSION_DENIED");
    } catch (error) {
      expect((error as B1AdapterError).code).toBe("PERMISSION_DENIED");
    }
  });
});

describe("staff journey — attachments and data hygiene (cases 14-16)", () => {
  it("lists viewable attachment names in the details summary (case 14)", () => {
    const seed = makeAssigned();
    const html = renderToStaticMarkup(
      createElement(B1RequestSummary, {
        serviceTitleAr: seed.serviceTitleAr,
        items: [...seed.formDataSummary],
        attachments: seed.attachments,
      }),
    );
    expect(html).toContain("وثيقة-داعمة.pdf");
    expect(html).toContain("المرفقات (1)");
  });

  it("never renders storage internals anywhere in the staff/student UI (case 15)", () => {
    const seed = makeAssigned();
    const html = renderToStaticMarkup(
      createElement(B1RequestSummary, {
        serviceTitleAr: seed.serviceTitleAr,
        items: [...seed.formDataSummary],
        attachments: seed.attachments,
      }),
    );
    expect(html).not.toContain("opaque-server-ref");
    expect(html).not.toMatch(/(?:href|src)="https?:/);
    for (const source of [summarySource, uploaderSource, workspaceSource, revenueSource]) {
      expect(source).not.toMatch(/storage_bucket|storage_object_path|objectPath/i);
      expect(source).not.toMatch(/storageRef.*(?:href|src=)/i);
    }
  });

  it("shows no actor ids or machine timestamps — dates are formatted Arabic (case 16)", () => {
    const forbidden = /\b(confirmed_by|confirmed_at|acted_by|actor_id|user_id)\b/i;
    for (const source of [workspaceSource, revenueSource, panelSource, summarySource]) {
      expect(forbidden.test(source)).toBe(false);
    }
    const html = renderToStaticMarkup(
      createElement(B1WorkflowTimeline, {
        steps: [
          {
            key: "initial_review",
            labelAr: "المراجعة الأولية",
            status: "completed",
            actedAt: "2026-01-10T09:30:00.000Z",
            commentAr: "تمت المراجعة.",
          },
        ],
      }),
    );
    expect(html).not.toContain("2026-01-10T09:30:00.000Z");
    expect(html).toContain("بتاريخ:");
  });
});
