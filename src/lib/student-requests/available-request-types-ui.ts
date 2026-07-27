/**
 * Catalog filters for student «الخدمات المتاحة» on /student/requests.
 * Source of truth remains get_available_request_types_for_current_student (server RPC).
 */

export type AvailableRequestTypeRow = {
  code: string;
  name_ar: string;
  description_ar: string | null;
  is_eligible: boolean;
  is_disabled: boolean;
  ineligible_display_mode: string;
  sort_order?: number;
};

function isHiddenMode(mode: string | null | undefined): boolean {
  const m = (mode ?? "").trim().toLowerCase();
  return m === "hide" || m === "hidden";
}

/** Codes rendered by the dedicated B1 «الخدمات الأكاديمية» list — not duplicated above. */
const B1_LIST_CODES = new Set([
  "enrollment_suspension",
  "excused_absence",
  "department_transfer",
  "transfer",
  "final_chance",
  "extra_chance",
  "file_withdrawal",
]);

/**
 * Rows the student may see on the requests page.
 * - "hidden" mode hides the row only when the student is INELIGIBLE.
 * - Keeps actionable eligible types.
 * - Keeps officially disabled listings (RPC ineligible + is_disabled).
 * - Skips B1 services, which render in their own section.
 * Inactive / non-visible types never arrive from the RPC.
 */
export function filterAvailableRequestTypesForStudentPage<T extends AvailableRequestTypeRow>(
  rows: T[],
): T[] {
  return [...rows]
    .filter((r) => {
      if (B1_LIST_CODES.has(r.code)) return false;
      if (r.is_eligible && !r.is_disabled) return true;
      if (isHiddenMode(r.ineligible_display_mode)) return false;
      if (!r.is_eligible && r.is_disabled) return true;
      return false;
    })
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}


export function isRequestTypeActionable(
  row: Pick<AvailableRequestTypeRow, "is_eligible" | "is_disabled">,
): boolean {
  return row.is_eligible && !row.is_disabled;
}
