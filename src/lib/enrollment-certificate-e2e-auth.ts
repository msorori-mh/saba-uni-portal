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

/** Advisory lock key for draft create — marker must NOT be included. */
export function enrollmentCertificateE2EDraftLockKey(studentUserId: string): string {
  return `enrollment_cert_e2e_draft:${studentUserId}:enrollment_certificate`;
}

export const ENROLLMENT_CERTIFICATE_E2E_REQUIRED_ASSIGNMENTS = [
  { unitCode: "student_affairs", roleCode: "student_affairs_manager" },
  { unitCode: "student_affairs", roleCode: "student_affairs_specialist" },
  { unitCode: "finance", roleCode: "revenue_finance_officer" },
  { unitCode: "registrar", roleCode: "registrar_general" },
  { unitCode: "dean", roleCode: "dean" },
  { unitCode: "archive", roleCode: "archive_officer" },
] as const;

export const ENROLLMENT_CERTIFICATE_E2E_TERMINAL_STATUSES = [
  "approved",
  "rejected",
  "cancelled",
  "completed",
] as const;

export type E2EAssignmentUnit = {
  id: string;
  code: string;
  is_active: boolean;
};

export type E2EAssignmentRole = {
  id: string;
  code: string;
  unit_id: string;
  is_active: boolean;
};

export type E2EAssignmentRow = {
  id: string;
  unit_id: string;
  role_id: string;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  resolved_user_id: string | null;
};

function isCurrentlyEffectiveAssignment(
  row: E2EAssignmentRow,
  nowMs: number,
): boolean {
  if (!row.is_active) return false;
  if (row.starts_at && Date.parse(row.starts_at) > nowMs) return false;
  if (row.ends_at && Date.parse(row.ends_at) <= nowMs) return false;
  return true;
}

export function evaluateEnrollmentCertificateE2EAssignmentReadiness(input: {
  units: E2EAssignmentUnit[];
  roles: E2EAssignmentRole[];
  assignments: E2EAssignmentRow[];
  knownUserIds?: ReadonlySet<string>;
  now?: Date;
}): { ok: boolean; reasons: string[] } {
  const nowMs = (input.now ?? new Date()).getTime();
  const reasons: string[] = [];
  const knownUsers = input.knownUserIds;

  for (const required of ENROLLMENT_CERTIFICATE_E2E_REQUIRED_ASSIGNMENTS) {
    const unit = input.units.find((u) => u.code === required.unitCode);
    if (!unit || !unit.is_active) {
      reasons.push(`missing_or_inactive_unit:${required.unitCode}`);
      continue;
    }

    const role = input.roles.find(
      (r) => r.code === required.roleCode && r.unit_id === unit.id,
    );
    if (!role || !role.is_active) {
      reasons.push(`missing_or_inactive_role:${required.roleCode}`);
      continue;
    }

    const active = input.assignments.filter(
      (a) =>
        a.role_id === role.id &&
        a.unit_id === unit.id &&
        isCurrentlyEffectiveAssignment(a, nowMs),
    );

    if (active.length === 0) {
      reasons.push(`missing_active_assignment:${required.roleCode}`);
      continue;
    }
    if (active.length > 1) {
      reasons.push(`duplicate_active_assignment:${required.roleCode}`);
      continue;
    }

    const resolved = active[0]?.resolved_user_id ?? null;
    if (!resolved || (knownUsers && !knownUsers.has(resolved))) {
      reasons.push(`unresolvable_assignment:${required.roleCode}`);
    }
  }

  return { ok: reasons.length === 0, reasons };
}

export type E2ESubmitWindowRequest = {
  id: string;
  status: string;
  e2e_marker: string | null;
  internal_e2e: boolean;
  e2e_scenario: string | null;
};

export function evaluateEnrollmentCertificateE2ESubmitWindowOpen(input: {
  marker: string;
  requests: E2ESubmitWindowRequest[];
}): { ok: boolean; reason: string | null; matchingDraftId: string | null } {
  const matchingDrafts = input.requests.filter(
    (r) =>
      r.status === "draft" &&
      r.internal_e2e === true &&
      r.e2e_scenario === "zero_fee" &&
      r.e2e_marker === input.marker,
  );

  if (matchingDrafts.length === 0) {
    return { ok: false, reason: "missing_matching_draft", matchingDraftId: null };
  }
  if (matchingDrafts.length > 1) {
    return { ok: false, reason: "duplicate_matching_drafts", matchingDraftId: null };
  }

  const match = matchingDrafts[0]!;
  const openOther = input.requests.filter(
    (r) =>
      r.id !== match.id &&
      !ENROLLMENT_CERTIFICATE_E2E_TERMINAL_STATUSES.includes(
        r.status as (typeof ENROLLMENT_CERTIFICATE_E2E_TERMINAL_STATUSES)[number],
      ),
  );

  if (openOther.length > 0) {
    return { ok: false, reason: "other_nonterminal_exists", matchingDraftId: match.id };
  }

  return { ok: true, reason: null, matchingDraftId: match.id };
}
