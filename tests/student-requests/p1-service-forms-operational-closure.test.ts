import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getEmptyFormValues,
  getStudentRequestFormDefinition,
  validateStudentRequestFormValues,
} from "../../src/lib/student-requests/request-form-registry";

const ROOT = join(import.meta.dir, "../..");

describe("P1-STUDENT-SERVICE-FORMS-OPERATIONAL-CLOSURE-01", () => {
  it("grade appeal contains one authoritative result picker and a clear reason", () => {
    const form = getStudentRequestFormDefinition("grade_appeal");
    expect(form).toBeDefined();
    const fields = form!.sections.flatMap((section) => section.fields);

    expect(fields.map((field) => field.name)).toEqual([
      "final_result_id",
      "appeal_reason",
      "results_note",
    ]);
    expect(fields[0]?.referenceResolverKey).toBe("published_final_results");
    expect(fields[0]?.required).toBe(true);
    expect(fields[1]?.required).toBe(true);
  });

  it("replacement card asks only for actionable loss data", () => {
    const form = getStudentRequestFormDefinition("replacement_student_card");
    expect(form).toBeDefined();
    const fields = form!.sections.flatMap((section) => section.fields);
    const names = fields.map((field) => field.name);

    expect(names).toEqual([
      "loss_reason",
      "loss_incident_date",
      "previous_card_serial",
      "loss_declaration_ack",
      "issuance_note",
    ]);
    expect(names).not.toContain("student_name_display");
    expect(names).not.toContain("student_number_display");
    expect(names).not.toContain("department_display");
    expect(names).not.toContain("loss_supporting_document");
    expect(form!.requiredAttachments).toBeUndefined();

    const empty = getEmptyFormValues(form!);
    expect(validateStudentRequestFormValues(form!, empty).missingFields).toEqual([
      "loss_reason",
      "loss_incident_date",
      "loss_declaration_ack",
    ]);
  });

  it("loads and fail-closes both P1 reference sources", () => {
    const server = readFileSync(join(ROOT, "src/lib/student-affairs.functions.ts"), "utf8");
    const screen = readFileSync(
      join(ROOT, "src/components/student-requests/NewStudentRequestScreen.tsx"),
      "utf8",
    );

    expect(server).toContain('"p1_october_remaining_requirements"');
    expect(server).toContain('"p1_assert_final_result_appeal_eligibility"');
    expect(server).toContain('.eq("student_profile_id", profile.id)');
    expect(screen).toContain("formReferenceKeys.every");
    expect(screen).toContain("october_remaining_required_courses:");
    expect(screen).toContain("published_final_results:");
  });
});
