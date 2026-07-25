/**
 * Content matrix for the five B1 services.
 *
 * Asserts the actual, contract-backed content of each service (titles,
 * descriptions, warnings, required fields/attachments/acknowledgments, fee
 * notes, Arabic step labels) and that every user-facing message is Arabic,
 * non-technical and free of amounts/currency/invoice vocabulary.
 * Anything missing from the definition stays missing here (fail-closed) —
 * gaps are pinned by explicit expectations, not guessed.
 */

import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { B1_CANONICAL_CODES } from "@/lib/student-requests/request-service-adapter";
import { getStudentRequestFormDefinition } from "@/lib/student-requests/request-form-registry";
import {
  B1_FEE_POLICY_LABELS_AR,
  B1_STEP_LABELS_AR,
  B1_UI_SERVICES,
  b1AdapterErrorMessageAr,
  B1AdapterError,
  B1_VALIDATION_MESSAGES_AR,
  getB1ServiceConfig,
  type B1CanonicalCode,
} from "@/lib/student-requests/b1-ui";
import { B1ServiceHeader } from "@/components/student-requests/b1/B1ServiceHeader";

const APPROVED_FEE_NEGATION = "لا تسجّل البوابة مبلغًا أو عملة";
const FORBIDDEN_FINANCIAL =
  /\b(amount|currency|invoice|gateway|wallet|balance|payment_url|transaction)\b|فاتورة|محفظة|رصيد|بوابة دفع|مبلغ|عملة/i;
/** True when text carries financial vocabulary outside the approved negation copy. */
const hasForbiddenFinancial = (text: string) =>
  FORBIDDEN_FINANCIAL.test(text.split(APPROVED_FEE_NEGATION).join(" "));
const TECHNICAL_LEAK =
  /\b(select|insert|update|delete)\s+.+\b(from|into)\b|rpc|supabase|postgres|storage_object|storage_bucket|objectPath|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const REQUIRED_FIELDS: Record<B1CanonicalCode, readonly string[]> = {
  enrollment_suspension: [
    "target_academic_year",
    "target_semester",
    "suspension_reason",
    "suspension_duration_type",
    "terms_acknowledgment",
  ],
  excused_absence: ["absence_date", "reason_type", "absence_reason_detail", "course_section_id"],
  department_transfer: ["target_department_id", "target_program_id", "transfer_reason"],
  final_chance: ["target_academic_year", "target_semester", "reason"],
  file_withdrawal: ["withdrawal_reason", "impact_acknowledgment"],
};

const REQUIRED_ATTACHMENTS: Record<B1CanonicalCode, readonly string[]> = {
  enrollment_suspension: [],
  excused_absence: ["excuse_documents"],
  department_transfer: ["secondary_certificate"],
  final_chance: [],
  file_withdrawal: [],
};

const REQUIRED_ACKNOWLEDGMENT: Record<B1CanonicalCode, string | null> = {
  enrollment_suspension: "terms_acknowledgment",
  excused_absence: null,
  department_transfer: null,
  final_chance: null,
  file_withdrawal: "impact_acknowledgment",
};

const HAS_WARNING: Record<B1CanonicalCode, boolean> = {
  enrollment_suspension: true,
  excused_absence: true,
  department_transfer: false,
  final_chance: true,
  file_withdrawal: false,
};

describe("five-service content matrix", () => {
  it("covers exactly the five canonical services with Arabic titles/descriptions", () => {
    expect(B1_CANONICAL_CODES).toEqual([
      "enrollment_suspension",
      "excused_absence",
      "department_transfer",
      "final_chance",
      "file_withdrawal",
    ]);
    for (const code of B1_CANONICAL_CODES) {
      const config = getB1ServiceConfig(code)!;
      expect(config.titleAr).toBeTruthy();
      expect(config.descriptionAr).toBeTruthy();
      expect(/[\u0600-\u06FF]/.test(config.titleAr)).toBe(true);
      expect(/[\u0600-\u06FF]/.test(config.descriptionAr)).toBe(true);
    }
  });

  it("pins required fields, attachments, acknowledgments and warnings per service", () => {
    for (const code of B1_CANONICAL_CODES) {
      const definition = getStudentRequestFormDefinition(code)!;
      const requiredFieldNames = definition.sections
        .flatMap((section) => section.fields)
        .filter((field) => field.required && field.type !== "file")
        .map((field) => field.name);
      expect(requiredFieldNames, `${code} required fields`).toEqual(REQUIRED_FIELDS[code]);
      expect(
        (definition.requiredAttachments ?? []).map((attachment) => attachment.key),
        `${code} required attachments`,
      ).toEqual(REQUIRED_ATTACHMENTS[code]);

      const acknowledgment = definition.sections
        .flatMap((section) => section.fields)
        .find((field) => field.type === "checkbox" && field.required);
      expect(acknowledgment?.name ?? null, `${code} acknowledgment`).toBe(
        REQUIRED_ACKNOWLEDGMENT[code],
      );
      expect((definition.warnings ?? []).length > 0, `${code} warnings`).toBe(HAS_WARNING[code]);

      // Every user-facing string in the definition is Arabic-capable text.
      for (const section of definition.sections) {
        for (const field of section.fields) {
          expect(field.labelAr.length, `${code}.${field.name} label`).toBeGreaterThan(0);
          expect(hasForbiddenFinancial(field.labelAr)).toBe(false);
        }
      }
    }
  });

  it("labels every workflow step in Arabic (no raw step keys leak to the UI)", () => {
    for (const config of B1_UI_SERVICES) {
      expect(config.workflowSteps.length).toBeGreaterThan(0);
      for (const step of config.workflowSteps) {
        expect(B1_STEP_LABELS_AR[step.key], `${config.code}.${step.key}`).toBeTruthy();
        expect(step.labelAr).toBe(B1_STEP_LABELS_AR[step.key]);
        expect(/[\u0600-\u06FF]/.test(step.labelAr)).toBe(true);
      }
    }
  });

  it("keeps fee notes financial-vocabulary free while pointing to the external system", () => {
    for (const config of B1_UI_SERVICES) {
      expect(config.feePolicyLabelAr).toBe(B1_FEE_POLICY_LABELS_AR[config.feePolicy]);
      expect(hasForbiddenFinancial(config.feePolicyLabelAr)).toBe(false);
    }
    expect(B1_FEE_POLICY_LABELS_AR.EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION).toContain(
      "النظام الجامعي الرئيسي",
    );
  });

  it("keeps every validation and adapter message Arabic and non-technical", () => {
    for (const [key, message] of Object.entries(B1_VALIDATION_MESSAGES_AR)) {
      expect(/[\u0600-\u06FF]/.test(message), `validation message ${key}`).toBe(true);
      expect(TECHNICAL_LEAK.test(message), `validation message ${key}`).toBe(false);
      expect(hasForbiddenFinancial(message), `validation message ${key}`).toBe(false);
    }
    for (const code of [
      "NETWORK_ERROR",
      "PERMISSION_DENIED",
      "STALE_VERSION",
      "VALIDATION_ERROR",
      "NOT_FOUND",
      "ACTIVATION_BLOCKED",
      "BACKEND_CONTRACT_PENDING",
    ] as const) {
      const message = b1AdapterErrorMessageAr(new B1AdapterError(code, "raw-technical-detail"));
      expect(/[\u0600-\u06FF]/.test(message), `adapter message ${code}`).toBe(true);
      expect(TECHNICAL_LEAK.test(message), `adapter message ${code}`).toBe(false);
      expect(message).not.toContain("raw-technical-detail");
    }
  });

  it("renders definition warnings and fee note through the service header", () => {
    for (const code of B1_CANONICAL_CODES) {
      const definition = getStudentRequestFormDefinition(code)!;
      const config = getB1ServiceConfig(code)!;
      const html = renderToStaticMarkup(
        createElement(B1ServiceHeader, {
          titleAr: config.titleAr,
          descriptionAr: config.descriptionAr,
          requirementsAlertAr: definition.warnings?.join(" "),
          feePolicyNoteAr: config.feePolicyLabelAr,
        }),
      );
      expect(html).toContain(config.titleAr);
      expect(html).toContain(config.feePolicyLabelAr);
      if (definition.warnings?.length) {
        expect(html).toContain('role="alert"');
        expect(html).toContain(definition.warnings[0]);
      }
    }
  });
});
