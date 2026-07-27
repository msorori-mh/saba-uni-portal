/**
 * Student-facing Arabic form summary built from the request-form registry.
 * No parallel five-service dictionary — labels/options come from form definitions.
 */

import {
  getStudentRequestFormDefinition,
  type RequestFormFieldDefinition,
  type RequestFormFieldOption,
} from "@/lib/student-requests/request-form-registry";
import { B1_KNOWN_VALUE_LABELS_AR, type B1CanonicalCode } from "./service-config";
import type { B1FormOptions } from "./adapter.types";

export type B1FormSummaryItem = { labelAr: string; valueAr: string };

function formatDateAr(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
}

function resolveFieldOptions(
  field: RequestFormFieldDefinition,
  values: Record<string, unknown>,
  options?: B1FormOptions | null,
): readonly RequestFormFieldOption[] | undefined {
  if (!options) return field.options;
  const dependency = String(values[field.referenceDependsOnField ?? ""] ?? "");
  if (field.referenceResolverKey === "academic_years") return options.academicYears;
  if (field.referenceResolverKey === "semesters_for_year")
    return options.semestersByYear[dependency] ?? [];
  if (field.referenceResolverKey === "current_student_enrollments")
    return options.currentEnrollments;
  if (field.referenceResolverKey === "available_departments") return options.availableDepartments;
  if (field.referenceResolverKey === "available_programs")
    return options.programsByDepartment[dependency] ?? [];
  return field.options;
}

function displayFieldValue(
  field: RequestFormFieldDefinition,
  values: Record<string, unknown>,
  options?: B1FormOptions | null,
): unknown {
  const value = values[field.name];
  if (value !== undefined && value !== null && String(value) !== "") return value;
  if (field.name === "current_department")
    return options?.currentDepartmentLabelAr ?? field.defaultValue;
  if (field.name === "current_program")
    return options?.currentProgramLabelAr ?? field.defaultValue;
  return value ?? field.defaultValue;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function knownValueLabelAr(value: unknown): string {
  const raw = String(value ?? "—");
  if (B1_KNOWN_VALUE_LABELS_AR[raw]) return B1_KNOWN_VALUE_LABELS_AR[raw];
  // Never surface raw reference UUIDs to the student when lookup is missing.
  if (UUID_RE.test(raw)) return "قيمة محفوظة";
  return raw;
}

function formatFieldValueAr(
  field: RequestFormFieldDefinition,
  value: unknown,
  fieldOptions?: readonly RequestFormFieldOption[],
): string {
  if (field.type === "checkbox") return value === true ? "نعم" : "لا";
  const resolved = fieldOptions ?? field.options;
  const label = resolved?.find((option) => option.value === value)?.labelAr;
  if (label) return label;
  if (field.type === "date" && typeof value === "string" && value) return formatDateAr(value);
  if (value === null || value === undefined || String(value) === "") return "—";
  return knownValueLabelAr(value);
}

/** Build Arabic summary rows for student tracking / review surfaces. */
export function buildB1StudentFormSummaryItems(input: {
  serviceCode: B1CanonicalCode;
  formData: Record<string, unknown>;
  options?: B1FormOptions | null;
}): readonly B1FormSummaryItem[] {
  const definition = getStudentRequestFormDefinition(input.serviceCode);
  if (!definition) return [];

  return definition.sections.flatMap((section) =>
    section.fields
      .filter((field) => field.type !== "info" && field.type !== "file")
      .map((field) => {
        const value = displayFieldValue(field, input.formData, input.options);
        const fieldOptions = resolveFieldOptions(field, input.formData, input.options);
        return {
          labelAr: field.labelAr,
          valueAr: formatFieldValueAr(field, value, fieldOptions),
        };
      })
      .filter((item) => item.valueAr !== "—" && item.valueAr !== "لا"),
  );
}
