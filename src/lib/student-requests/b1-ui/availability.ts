/**
 * Maps backend available-request-type rows onto B1ServiceAvailability.
 *
 * studentVisible comes only from backend inclusion and its authoritative
 * is_eligible/is_disabled decision. runtimeAvailable is NEVER hardcoded true — it follows
 * secure-read capability readiness (available + service listed + create_draft open).
 */

import type { B1CanonicalCode } from "@/lib/student-requests/request-service-adapter";
import { normalizeStudentRequestTypeCode } from "@/lib/student-requests/request-type-registry";
import { B1_UI_SERVICES, isB1ServiceCode } from "./service-config";
import type { B1RuntimeCapability, B1ServiceAvailability } from "./adapter.types";

export type BackendAvailableRequestTypeRow = {
  code: string;
  name_ar?: string;
  description_ar?: string | null;
  is_eligible?: boolean;
  is_disabled?: boolean;
  disabled_reason?: string | null;
};

/** Fail-closed when capability is missing/unavailable — never invent true. */
export function resolveB1RuntimeAvailable(
  code: B1CanonicalCode,
  capability: B1RuntimeCapability | null | undefined,
): boolean {
  if (!capability || capability.available !== true) return false;
  if (!capability.services.includes(code)) return false;
  if (!capability.writesAvailable.includes("create_draft")) return false;
  if (capability.writesFailClosed.includes("create_draft")) return false;
  return true;
}

export function mapBackendRowsToB1Availability(
  rows: readonly BackendAvailableRequestTypeRow[],
  capability?: B1RuntimeCapability | null,
): readonly B1ServiceAvailability[] {
  const visibleCodes = new Set<B1CanonicalCode>();
  for (const row of rows) {
    const normalized = normalizeStudentRequestTypeCode(row.code);
    if (
      isB1ServiceCode(normalized) &&
      row.is_eligible !== false &&
      row.is_disabled !== true
    ) {
      visibleCodes.add(normalized);
    }
  }

  return B1_UI_SERVICES.map((service) => {
    const studentVisible = visibleCodes.has(service.code);
    const runtimeAvailable =
      studentVisible &&
      resolveB1RuntimeAvailable(service.code, capability) &&
      !service.activationBlockedReason;
    return {
      code: service.code,
      titleAr: service.titleAr,
      descriptionAr: service.descriptionAr,
      feePolicy: service.feePolicy,
      studentVisible,
      runtimeAvailable,
      ...(service.activationBlockedReason
        ? { activationBlockedReason: service.activationBlockedReason }
        : {}),
    };
  });
}
