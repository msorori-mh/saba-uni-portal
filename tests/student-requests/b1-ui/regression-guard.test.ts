/**
 * Regression guards for the five-service UI.
 *
 * Each guard fails the moment a forbidden pattern re-enters the owned UI
 * surface (components + the two routes) or a required safeguard is removed.
 */

import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getStudentRequestFormDefinition } from "@/lib/student-requests/request-form-registry";
import { validateB1FormValues, getB1ServiceConfig } from "@/lib/student-requests/b1-ui";

const root = process.cwd();
const componentsDir = join(root, "src/components/student-requests/b1");
const uiSources: Record<string, string> = {};
for (const file of readdirSync(componentsDir)) {
  if (file.endsWith(".tsx") || file.endsWith(".ts")) {
    uiSources[`src/components/student-requests/b1/${file}`] = readFileSync(
      join(componentsDir, file),
      "utf8",
    );
  }
}
for (const route of [
  "src/routes/student.requests.b1.$service.tsx",
  "src/routes/staff.b1-requests.tsx",
]) {
  uiSources[route] = readFileSync(join(root, route), "utf8");
}
const formSource = uiSources["src/components/student-requests/b1/B1StudentRequestForm.tsx"];
const allSources = Object.entries(uiSources);

describe("regression guards — financial vocabulary", () => {
  it("no amount/currency/invoice/payment-gateway vocabulary in the services UI", () => {
    const forbidden =
      /\b(amount|currency|invoice|gateway|wallet|balance|payment_url|transaction_id)\b|فاتورة|محفظة|رصيد|بوابة دفع|رقم عملية/i;
    for (const [path, source] of allSources) {
      expect(forbidden.test(source), path).toBe(false);
    }
  });
});

describe("regression guards — reference data shown as Arabic names", () => {
  it("department/program/year/semester values render via label resolution, never raw ids", () => {
    // The form feeds resolved options into the summary formatter and the
    // readonly current-department/program labels — a raw-id render would
    // bypass resolveOptions/displayValue.
    expect(formSource).toContain("resolveOptions(field, values, options)");
    expect(formSource).toContain("displayValue(field, values, options)");
    expect(formSource).toContain("currentDepartmentLabelAr");
    expect(formSource).not.toMatch(/valueAr:\s*String\(values\[/);
  });
});

describe("regression guards — service warnings and fee note", () => {
  it("the service header always receives definition warnings", () => {
    expect(formSource).toContain('requirementsAlertAr={definition.warnings?.join(" ")}');
    for (const code of ["enrollment_suspension", "excused_absence", "final_chance"] as const) {
      expect(
        getStudentRequestFormDefinition(code)?.warnings?.length,
        `${code} warning must exist`,
      ).toBeGreaterThan(0);
    }
  });

  it("the fee-policy note is always rendered for every service", () => {
    expect(formSource).toContain("feePolicyNoteAr={config.feePolicyLabelAr}");
    for (const code of [
      "enrollment_suspension",
      "excused_absence",
      "department_transfer",
      "final_chance",
      "file_withdrawal",
    ] as const) {
      expect(getB1ServiceConfig(code)?.feePolicyLabelAr).toBeTruthy();
    }
  });
});

describe("regression guards — withdrawal acknowledgment", () => {
  it("the mandatory withdrawal acknowledgment exists and reaches review + confirmation", () => {
    const definition = getStudentRequestFormDefinition("file_withdrawal")!;
    const acknowledgment = definition.sections
      .flatMap((section) => section.fields)
      .find((field) => field.name === "impact_acknowledgment");
    expect(acknowledgment?.required).toBe(true);
    expect(formSource).toContain("acknowledgmentsAr={acknowledgmentsAr}");
    expect(formSource).toContain("requireAcknowledgment={Boolean(requiredAcknowledgment)}");
    expect(
      validateB1FormValues("file_withdrawal", { withdrawal_reason: "سبب موثق لسحب الملف" }).valid,
    ).toBe(false);
  });
});

describe("regression guards — transfer target guard", () => {
  it("selecting the current department as the target stays blocked", () => {
    const result = validateB1FormValues("department_transfer", {
      current_department_id: "dept-cs",
      target_department_id: "dept-cs",
      target_program_id: "prog-cs",
      transfer_reason: "سبب التحويل موثق",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.target_department_id).toBe("same_department");
  });
});

describe("regression guards — no incomplete submissions", () => {
  it("review gates on validation errors for every service", () => {
    expect(formSource).toContain("validateB1FormValues(serviceCode, validationValues)");
    // setReviewing(true) is only reachable when the error map is empty.
    expect(formSource).toContain("if (errorNames.length === 0)");
    for (const code of [
      "enrollment_suspension",
      "excused_absence",
      "department_transfer",
      "final_chance",
      "file_withdrawal",
    ] as const) {
      expect(validateB1FormValues(code, {}).valid, code).toBe(false);
    }
  });
});

describe("regression guards — payment action isolation", () => {
  it("confirm_payment never becomes a generic action-panel button", () => {
    const panelSource = uiSources["src/components/student-requests/b1/B1EmployeeActionPanel.tsx"];
    expect(panelSource).toContain('Exclude<B1StaffAction, "confirm_payment">');
    expect(panelSource).toContain('if (allowedAction === "confirm_payment")');
    expect(panelSource).not.toContain("confirmB1RevenueReceipt");
  });
});

describe("regression guards — no optimistic status", () => {
  it("staff actions re-read from the adapter instead of mutating local state", () => {
    const workspaceSource = uiSources["src/components/student-requests/b1/B1StaffWorkspace.tsx"];
    expect(workspaceSource).toContain("refreshAfterAction");
    expect(workspaceSource).not.toMatch(/setDetails\(\s*\{[^}]*allowedAction/);
    const panelSource = uiSources["src/components/student-requests/b1/B1EmployeeActionPanel.tsx"];
    expect(panelSource.indexOf("await onAct")).toBeLessThan(panelSource.indexOf("toast.success"));
  });
});

describe("regression guards — storage internals", () => {
  it("no storage buckets/paths/urls leak into the UI layer", () => {
    const forbidden =
      /storage_bucket|storage_object_path|objectPath|createSignedUrl|\.storage\.from/i;
    for (const [path, source] of allSources) {
      expect(forbidden.test(source), path).toBe(false);
    }
  });
});

describe("regression guards — integration seam", () => {
  it("components and routes never import Supabase directly", () => {
    for (const [path, source] of allSources) {
      expect(/from\s+["'][^"']*supabase/i.test(source), path).toBe(false);
    }
  });

  it("the mock adapter is reachable only through the dev-flagged selector", () => {
    for (const [path, source] of allSources) {
      expect(source).not.toMatch(/adapter\.mock/, path);
    }
    const selector = readFileSync(join(root, "src/lib/student-requests/b1-ui/index.ts"), "utf8");
    expect(selector).toContain('dev && mockFlag === "1"');
  });

  it("runtimeAvailable is never hardcoded in the UI layer", () => {
    for (const [path, source] of allSources) {
      expect(source).not.toMatch(/runtimeAvailable:\s*true/, path);
      expect(source).not.toMatch(/runtimeAvailable\s*=\s*true/, path);
    }
  });
});
