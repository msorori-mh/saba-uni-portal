/**
 * Maps backend available-request-type rows onto B1ServiceAvailability.
 *
 * studentVisible comes only from backend inclusion (get_available filters
 * student_visible=true). runtimeAvailable is NEVER hardcoded true — it follows
 * adapter.submit.runtimeAvailable and activation blockers (currently always false).
 */

import {
  B1_SERVICE_ADAPTERS,
  type B1CanonicalCode,
} from "@/lib/student-requests/request-service-adapter";
import { normalizeStudentRequestTypeCode } from "@/lib/student-requests/request-type-registry";
import { B1_UI_SERVICES, isB1ServiceCode } from "./service-config";
import type { B1ServiceAvailability } from "./adapter.types";

export type BackendAvailableRequestTypeRow = {
  code: string;
  name_ar?: string;
  description_ar?: string | null;
};

export function resolveB1RuntimeAvailable(code: B1CanonicalCode): boolean {
  const adapter = B1_SERVICE_ADAPTERS[code];
  // submit.runtimeAvailable is a false literal until post-apply activation evidence.
  return adapter.submit.runtimeAvailable === true && !adapter.activationBlockedReason;
}

export function mapBackendRowsToB1Availability(
  rows: readonly BackendAvailableRequestTypeRow[],
): readonly B1ServiceAvailability[] {
  const visibleCodes = new Set<B1CanonicalCode>();
  for (const row of rows) {
    const normalized = normalizeStudentRequestTypeCode(row.code);
    if (isB1ServiceCode(normalized)) visibleCodes.add(normalized);
  }

  return B1_UI_SERVICES.map((service) => {
    const studentVisible = visibleCodes.has(service.code);
    const runtimeAvailable = resolveB1RuntimeAvailable(service.code);
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
