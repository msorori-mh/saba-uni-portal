/**
 * Student-facing label for «الجهة الحالية».
 * Read contract today: `student_requests.current_role_key` only (no processing-unit name).
 * HOLD — CURRENT_PROCESSING_UNIT_READ_CONTRACT_GAP until workflow unit is exposed by RPC.
 */

import {
  CENTRAL_SIGNATORY_LABELS_AR,
  STAFF_ROLE_LABELS_AR,
} from "@/lib/student-requests/staff-inbox-ui";

/** Overrides for clearer student portal wording (display only). */
const STUDENT_FACING_ROLE_LABELS_AR: Readonly<Record<string, string>> = {
  dean: "عمادة الكلية",
  archive_officer: "الأرشيف",
  student_affairs: "شؤون الطلاب",
  registrar: "مسجل الكلية",
  registrar_general: "مسجل الكلية",
};

export const CURRENT_PROCESSING_UNIT_UNSET_LABEL_AR = "لم تُحدد بعد";

export const CURRENT_PROCESSING_UNIT_READ_CONTRACT_GAP =
  "HOLD — CURRENT_PROCESSING_UNIT_READ_CONTRACT_GAP" as const;

/**
 * Prefer role → Arabic label. Never return a bare em-dash for null.
 * Does not invent unit names when role key is missing.
 */
export function formatStudentCurrentProcessingUnitLabel(
  currentRoleKey: string | null | undefined,
): string {
  const k = (currentRoleKey ?? "").trim();
  if (!k) return CURRENT_PROCESSING_UNIT_UNSET_LABEL_AR;
  return (
    STUDENT_FACING_ROLE_LABELS_AR[k] ??
    STAFF_ROLE_LABELS_AR[k] ??
    CENTRAL_SIGNATORY_LABELS_AR[k] ??
    // Unknown technical keys: still avoid showing UUID-like noise; fall back to key only if
    // it looks like a human slug (no UUID pattern).
    (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(k) ? CURRENT_PROCESSING_UNIT_UNSET_LABEL_AR : k)
  );
}
