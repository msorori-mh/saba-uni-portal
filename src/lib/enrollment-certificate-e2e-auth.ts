/** Authorization matrix for enrollment_certificate hidden E2E admin RPCs (01S-B2). */
export const ENROLLMENT_CERTIFICATE_E2E_ADMIN_ROLES = [
  "admin",
  "system_admin",
] as const;

export type EnrollmentCertificateE2EAdminRole =
  (typeof ENROLLMENT_CERTIFICATE_E2E_ADMIN_ROLES)[number];

const ALLOWED = new Set<string>(ENROLLMENT_CERTIFICATE_E2E_ADMIN_ROLES);

export function canRoleManageEnrollmentCertificateE2E(
  role: string | null | undefined,
): boolean {
  if (!role) return false;
  return ALLOWED.has(role);
}

export function canAnyRoleManageEnrollmentCertificateE2E(
  roles: readonly string[] | null | undefined,
): boolean {
  if (!roles || roles.length === 0) return false;
  return roles.some((role) => canRoleManageEnrollmentCertificateE2E(role));
}

export const ENROLLMENT_CERTIFICATE_E2E_DENIED_ROLES = [
  "registrar",
  "student_affairs",
  "finance_officer",
  "dean",
  "faculty_member",
  "student",
  "graduate",
] as const;

export const ENROLLMENT_CERTIFICATE_E2E_MARKER_PATTERN =
  /^[A-Z0-9][A-Z0-9_-]{7,99}$/;

export function isValidEnrollmentCertificateE2EMarker(marker: string): boolean {
  const trimmed = marker.trim();
  if (trimmed.length < 8 || trimmed.length > 100) return false;
  return ENROLLMENT_CERTIFICATE_E2E_MARKER_PATTERN.test(trimmed);
}

/** Catalog exposure rule mirrored from get_available_request_types_for_current_student. */
export function isRequestTypeListedForStudents(input: {
  is_active: boolean;
  student_visible: boolean;
}): boolean {
  return input.is_active === true && input.student_visible === true;
}

/** create_student_request type gates. */
export function canCreateStudentRequestForType(input: {
  is_active: boolean;
  student_visible: boolean;
}): boolean {
  return input.is_active === true && input.student_visible === true;
}

/** submit_student_request type gate (does not re-check student_visible). */
export function canSubmitStudentRequestForType(input: {
  is_active: boolean;
  student_visible: boolean;
}): boolean {
  return input.is_active === true;
}

/** Temporary E2E window state: active for submit, hidden from catalog/create. */
export function isSafeHiddenSubmitWindowState(input: {
  is_active: boolean;
  student_visible: boolean;
}): boolean {
  return input.is_active === true && input.student_visible === false;
}
