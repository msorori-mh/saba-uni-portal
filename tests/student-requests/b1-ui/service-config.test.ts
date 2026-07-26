import { describe, expect, it } from "bun:test";
import {
  B1_FEE_POLICY_LABELS_AR,
  B1_STEP_LABELS_AR,
  B1_UI_SERVICES,
  getB1ServiceConfig,
  isB1ServiceCode,
} from "@/lib/student-requests/b1-ui/service-config";
import {
  B1_CANONICAL_CODES,
  B1_FEE_POLICIES,
  B1_WORKFLOWS,
} from "@/lib/student-requests/request-service-adapter";

describe("B1 UI service config", () => {
  it("covers exactly the five B1 services in canonical order", () => {
    expect(B1_UI_SERVICES.map((service) => service.code)).toEqual([...B1_CANONICAL_CODES]);
  });

  it("derives fee policies from the backend contract", () => {
    for (const service of B1_UI_SERVICES) {
      expect(service.feePolicy).toBe(B1_FEE_POLICIES[service.code]);
    }
    expect(getB1ServiceConfig("enrollment_suspension")!.feePolicy).toBe("FREE_NO_PAYMENT");
    expect(getB1ServiceConfig("excused_absence")!.feePolicy).toBe("FREE_NO_PAYMENT");
    expect(getB1ServiceConfig("file_withdrawal")!.feePolicy).toBe("FREE_NO_PAYMENT");
    expect(getB1ServiceConfig("department_transfer")!.feePolicy).toBe(
      "EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION",
    );
    expect(getB1ServiceConfig("final_chance")!.feePolicy).toBe(
      "EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION",
    );
  });

  it("ships Arabic fee copy with no amounts or currency", () => {
    expect(B1_FEE_POLICY_LABELS_AR.FREE_NO_PAYMENT).toContain("مجانية");
    expect(B1_FEE_POLICY_LABELS_AR.EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION).toContain(
      "النظام الجامعي الرئيسي",
    );
    for (const service of B1_UI_SERVICES) {
      expect(service.feePolicyLabelAr).toBe(B1_FEE_POLICY_LABELS_AR[service.feePolicy]);
    }
  });

  it("labels every workflow step in Arabic and mirrors B1_WORKFLOWS", () => {
    for (const service of B1_UI_SERVICES) {
      const backendSteps = B1_WORKFLOWS[service.code];
      expect(service.workflowSteps.length).toBe(backendSteps.length);
      service.workflowSteps.forEach((step, index) => {
        expect(step.key).toBe(backendSteps[index]!.key);
        expect(step.unit).toBe(backendSteps[index]!.unit);
        expect(step.role).toBe(backendSteps[index]!.role);
        expect(step.action).toBe(backendSteps[index]!.action);
        expect(step.labelAr).toBe(B1_STEP_LABELS_AR[step.key]);
        expect(step.labelAr.trim().length).toBeGreaterThan(0);
      });
    }
  });

  it("marks attachment-requiring services", () => {
    expect(getB1ServiceConfig("excused_absence")!.requiresAttachments).toBe(true);
    expect(getB1ServiceConfig("department_transfer")!.requiresAttachments).toBe(true);
    expect(getB1ServiceConfig("enrollment_suspension")!.requiresAttachments).toBe(false);
    expect(getB1ServiceConfig("file_withdrawal")!.requiresAttachments).toBe(false);
    expect(getB1ServiceConfig("final_chance")!.requiresAttachments).toBe(false);
  });

  it("carries activation blockers only for blocked services", () => {
    expect(getB1ServiceConfig("enrollment_suspension")!.activationBlockedReason).toBeUndefined();
    expect(getB1ServiceConfig("file_withdrawal")!.activationBlockedReason).toBeUndefined();
    expect(getB1ServiceConfig("excused_absence")!.activationBlockedReason).toBe(
      "BLOCKED_PENDING_SECURE_ATTACHMENTS_RUNTIME",
    );
    expect(getB1ServiceConfig("department_transfer")!.activationBlockedReason).toBeTruthy();
    expect(getB1ServiceConfig("final_chance")!.activationBlockedReason).toBeTruthy();
  });

  it("contains no amount/currency/price fields anywhere", () => {
    const forbiddenKey = /amount|currency|price|cost/i;
    const scan = (value: unknown, path: string) => {
      if (Array.isArray(value)) {
        value.forEach((item, index) => scan(item, `${path}[${index}]`));
      } else if (value && typeof value === "object") {
        for (const [key, nested] of Object.entries(value)) {
          expect(forbiddenKey.test(key), `forbidden key at ${path}.${key}`).toBe(false);
          scan(nested, `${path}.${key}`);
        }
      }
    };
    scan(B1_UI_SERVICES, "B1_UI_SERVICES");
  });

  it("resolves codes through legacy aliases and guards unknown codes", () => {
    expect(isB1ServiceCode("enrollment_suspension")).toBe(true);
    expect(isB1ServiceCode("transfer")).toBe(true);
    expect(isB1ServiceCode("absence_excuse")).toBe(true);
    expect(isB1ServiceCode("extra_chance")).toBe(true);
    expect(isB1ServiceCode("grade_appeal")).toBe(false);
    expect(isB1ServiceCode("")).toBe(false);
    expect(isB1ServiceCode(null)).toBe(false);

    expect(getB1ServiceConfig("transfer")!.code).toBe("department_transfer");
    expect(getB1ServiceConfig("unknown_code")).toBeUndefined();
  });
});
