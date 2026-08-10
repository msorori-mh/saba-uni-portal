/**
 * Explicit organizational identity contracts for beneficiary reports.
 * Pure TypeScript — no I/O. Fail-closed: missing binding ⇒ no grant.
 *
 * Task: PORTAL-REPORTS-BENEFICIARY-AUTHZ-SCOPE-HARDENING-02
 *
 * IMPORTANT:
 * - University VP / presidency MUST NOT be inferred from ordinary staff roles
 *   (student_affairs, registrar, dean).
 * - College isolation requires a college key; the portal has no college_id today.
 * - Operational unit comes from staff.role_type / processing assignments — never
 *   university-wide fallback for ordinary ops staff.
 */

/** Position codes that would prove university VP Student Affairs (none seeded yet). */
export const UNIVERSITY_VP_STUDENT_POSITION_CODES = [
  "university_vp_student_affairs",
  "vice_president_student_affairs",
] as const;

/** Position codes that would prove university VP Academic Affairs (none seeded yet). */
export const UNIVERSITY_VP_ACADEMIC_POSITION_CODES = [
  "university_vp_academic_affairs",
  "vice_president_academic_affairs",
] as const;

/** Position codes that would prove university presidency / council (none seeded yet). */
export const UNIVERSITY_PRESIDENCY_POSITION_CODES = [
  "university_president",
  "university_council",
  "university_presidency_council",
] as const;

/**
 * College dean org-position code (seeded under college_council).
 * This proves dean *identity*, not multi-college isolation.
 */
export const COLLEGE_DEAN_POSITION_CODES = ["dean"] as const;

/**
 * Dependency notes when bindings are absent in the current schema/seed.
 * Documented for catalog blockers — no migration in this task.
 */
export const ORG_BINDING_DEPENDENCIES = {
  vp_student_affairs:
    "يتطلب منصباً تنظيمياً صريحاً (مثل university_vp_student_affairs) أو دور app_role مخصص — غير موجود حالياً. لا يُستنتج من student_affairs.",
  vp_academic_affairs:
    "يتطلب منصباً تنظيمياً صريحاً (مثل university_vp_academic_affairs) أو دور app_role مخصص — غير موجود حالياً. لا يُستنتج من dean/registrar.",
  university_presidency_council:
    "يتطلب منصب رئاسة/مجلس جامعة صريحاً — غير موجود في app_role أو organizational_positions الجامعية. لا يُستنتج من dean/registrar/EXEC_ROLES.",
  dean_college:
    "هوية العميد عبر app_role=dean أو position_assignments→dean متاحة، لكن لا يوجد college_id لعزل كلية A عن كلية B. بدون ربط كلية موثوق لا يُصنَّف المركز LIVE.",
  operational_unit:
    "الوحدة التشغيلية تُستمد من staff_profiles.role_type→unitKey و/أو request_processing_assignments→request_processing_units.code. بلا مصدر موثوق ⇒ DENY.",
} as const;

export type ExplicitOrgBindings = {
  readonly positionCodes: readonly string[];
  /** True when an active position_assignment matches a VP-student position code. */
  readonly vpStudentAffairsBound: boolean;
  readonly vpAcademicAffairsBound: boolean;
  readonly universityPresidencyBound: boolean;
  /** Dean identity (role or college dean position) — not college isolation. */
  readonly deanIdentityBound: boolean;
  /**
   * Reliable college key for isolation. Null in current schema
   * (no college_id / multi-college FK).
   */
  readonly collegeId: string | null;
  /** True only when collegeId is present (multi-college-safe). */
  readonly collegeScopeConfigured: boolean;
  /** Operational processing unit codes bound to the actor (may be empty). */
  readonly operationalUnitCodes: readonly string[];
};

export function emptyOrgBindings(
  overrides: Partial<ExplicitOrgBindings> = {},
): ExplicitOrgBindings {
  return {
    positionCodes: [],
    vpStudentAffairsBound: false,
    vpAcademicAffairsBound: false,
    universityPresidencyBound: false,
    deanIdentityBound: false,
    collegeId: null,
    collegeScopeConfigured: false,
    operationalUnitCodes: [],
    ...overrides,
  };
}

export function hasPositionCode(
  positionCodes: readonly string[],
  allowed: readonly string[],
): boolean {
  if (positionCodes.length === 0 || allowed.length === 0) return false;
  const set = new Set(positionCodes);
  return allowed.some((code) => set.has(code));
}

/**
 * Resolve VP / presidency / dean identity flags from role tokens + position codes.
 * Ordinary staff roles never set VP/presidency flags.
 */
export function resolveExplicitOrgBindings(args: {
  readonly roles: readonly string[];
  readonly positionCodes: readonly string[];
  readonly operationalUnitCodes: readonly string[];
  readonly collegeId?: string | null;
}): ExplicitOrgBindings {
  const roles = new Set(args.roles);
  const positionCodes = args.positionCodes;
  const deanIdentityBound =
    roles.has("dean") ||
    hasPositionCode(positionCodes, COLLEGE_DEAN_POSITION_CODES);
  const collegeId = args.collegeId ?? null;

  return {
    positionCodes,
    vpStudentAffairsBound: hasPositionCode(
      positionCodes,
      UNIVERSITY_VP_STUDENT_POSITION_CODES,
    ),
    vpAcademicAffairsBound: hasPositionCode(
      positionCodes,
      UNIVERSITY_VP_ACADEMIC_POSITION_CODES,
    ),
    universityPresidencyBound: hasPositionCode(
      positionCodes,
      UNIVERSITY_PRESIDENCY_POSITION_CODES,
    ),
    deanIdentityBound,
    collegeId,
    collegeScopeConfigured: collegeId !== null && collegeId.length > 0,
    operationalUnitCodes: [...new Set(args.operationalUnitCodes.filter(Boolean))],
  };
}

/** Legacy staff_profiles.role_type → processing unit code. */
export const LEGACY_STAFF_ROLE_TO_UNIT: Readonly<Record<string, string>> = {
  registrar: "registrar",
  student_affairs: "student_affairs",
  finance_officer: "finance",
  hr_officer: "hr",
  lab_manager: "labs",
  lab_keeper: "labs",
};

/**
 * Map staff functional / legacy role_type to a processing unit code.
 * Unknown keys ⇒ null (fail-closed — caller must not invent a unit).
 */
export function staffRoleTypeToUnitKey(
  roleType: string | null | undefined,
  approvedUnitByKey: ReadonlyMap<string, string>,
): string | null {
  const key = String(roleType ?? "").trim();
  if (!key) return null;
  const approved = approvedUnitByKey.get(key);
  if (approved) return approved;
  return LEGACY_STAFF_ROLE_TO_UNIT[key] ?? null;
}

/**
 * Catalog / hub codes that require an explicit organizational binding beyond role.
 */
export const BINDING_REQUIRED_REPORT_CODES = {
  vp_student: ["HUB-VP-STUDENT-AFFAIRS"] as const,
  vp_academic: ["HUB-VP-ACADEMIC-AFFAIRS"] as const,
  presidency: ["HUB-UNIVERSITY-STRATEGIC"] as const,
  dean_college: ["HUB-DEAN-COLLEGE"] as const,
  operational: [
    "HUB-OPERATIONAL-UNITS",
    "REQ-PROCESSING-TIME",
    "REQ-OVERDUE-SLA",
    "REQ-DOCUMENTS-ISSUED",
  ] as const,
} as const;

export function actorMayAccessVpStudentHub(bindings: ExplicitOrgBindings): boolean {
  return bindings.vpStudentAffairsBound;
}

export function actorMayAccessVpAcademicHub(bindings: ExplicitOrgBindings): boolean {
  return bindings.vpAcademicAffairsBound;
}

export function actorMayAccessPresidencyHub(bindings: ExplicitOrgBindings): boolean {
  return bindings.universityPresidencyBound;
}

/**
 * Dean college hub is LIVE-safe only when college scope is configured.
 * Identity alone is insufficient for multi-college isolation claims.
 */
export function actorMayAccessDeanCollegeHub(bindings: ExplicitOrgBindings): boolean {
  return bindings.deanIdentityBound && bindings.collegeScopeConfigured;
}

/**
 * Authoritative college → department IDs for dean department-report containment.
 *
 * Returns null when containment cannot be proven. Callers MUST fail closed —
 * never treat a bare collegeId (or dean identity) as permission to accept an
 * arbitrary department_id.
 *
 * Current schema: no college_id / college→departments FK. Mapping is unavailable.
 */
export function provenDepartmentIdsForCollege(
  collegeId: string | null | undefined,
): readonly string[] | null {
  if (!collegeId || collegeId.length === 0) return null;
  // No trustworthy server-side college→department containment relationship.
  void collegeId;
  return null;
}

export function actorMayAccessOperationalHub(
  bindings: ExplicitOrgBindings,
  _roles: readonly string[],
): boolean {
  // Even admin/system_admin must have an explicit unit binding before the
  // catalog advertises operational reports — server denies university-wide fallback.
  void _roles;
  return bindings.operationalUnitCodes.length > 0;
}

/** Whether ordinary (non-admin) operational queries may run. */
export function hasOperationalUnitBinding(bindings: ExplicitOrgBindings): boolean {
  return bindings.operationalUnitCodes.length > 0;
}
