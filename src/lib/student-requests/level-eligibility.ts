import { normalizeStudentRequestTypeCode } from "./request-type-registry";

export const LEVEL_ONE_RESTRICTED_REQUEST_TYPES = [
  "enrollment_suspension",
  "department_transfer",
] as const;

export const OCTOBER_EXAM_LEVEL_DISABLED_REASON =
  "استمارة دور أكتوبر متاحة لطلاب المستوى الرابع فقط.";

export const LEVEL_ONE_REQUEST_DISABLED_REASONS: Record<
  (typeof LEVEL_ONE_RESTRICTED_REQUEST_TYPES)[number],
  string
> = {
  enrollment_suspension: "وقف القيد غير متاح لطلاب المستوى الأول.",
  department_transfer: "التحويل بين الأقسام غير متاح لطلاب المستوى الأول.",
};

type AvailabilityRow = {
  code: string;
  is_eligible: boolean;
  is_disabled: boolean;
  disabled_reason: string | null;
};

export function applyLevelOneRequestTypeRestrictions<T extends AvailabilityRow>(
  rows: readonly T[],
  levelNumber: number | null,
): T[] {
  return rows.map((row) => {
    const code = normalizeStudentRequestTypeCode(row.code);

    if (code === "october_exam_entry_form" && levelNumber !== 4) {
      return {
        ...row,
        is_eligible: false,
        is_disabled: true,
        disabled_reason: OCTOBER_EXAM_LEVEL_DISABLED_REASON,
      };
    }

    if (
      levelNumber !== 1 ||
      !(LEVEL_ONE_RESTRICTED_REQUEST_TYPES as readonly string[]).includes(code)
    ) {
      return row;
    }

    return {
      ...row,
      is_eligible: false,
      is_disabled: true,
      disabled_reason:
        LEVEL_ONE_REQUEST_DISABLED_REASONS[
          code as (typeof LEVEL_ONE_RESTRICTED_REQUEST_TYPES)[number]
        ],
    };
  });
}
