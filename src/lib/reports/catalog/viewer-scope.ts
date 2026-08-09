/**
 * Catalog viewer facts — full ActorScope contract for advertisement.
 * A LIVE/openable card must only appear when the actor could open the
 * corresponding server report (role + organizational binding + identity).
 *
 * Task: PORTAL-REPORTS-BENEFICIARY-AUTHZ-SCOPE-HARDENING-03
 */

import type { ExplicitOrgBindings } from "../scope/org-identity";
import { emptyOrgBindings } from "../scope/org-identity";
import type { ReportActorScope } from "../scope/types";
import type { ReportEntry } from "./types";

/**
 * Minimal viewer facts needed to project the catalog.
 * Prefer building from ReportActorScope via `catalogViewerFromActorScope`.
 */
export type CatalogViewerFacts = {
  readonly roles: readonly string[];
  readonly bindings: ExplicitOrgBindings;
  readonly studentProfileId: string | null;
  readonly facultyProfileId: string | null;
  readonly departmentId: string | null;
  /** When true, still allow reports that do not depend on the denied binding. */
  readonly denied: boolean;
  readonly denyReasonAr: string | null;
};

export function catalogViewerFromActorScope(
  scope: ReportActorScope,
): CatalogViewerFacts {
  return {
    roles: scope.roles,
    bindings: {
      positionCodes: [],
      vpStudentAffairsBound: scope.bindings.vpStudentAffairsBound,
      vpAcademicAffairsBound: scope.bindings.vpAcademicAffairsBound,
      universityPresidencyBound: scope.bindings.universityPresidencyBound,
      deanIdentityBound: scope.bindings.deanIdentityBound,
      collegeId: scope.bindings.collegeId,
      collegeScopeConfigured: scope.bindings.collegeScopeConfigured,
      operationalUnitCodes: scope.bindings.operationalUnitCodes,
    },
    studentProfileId: scope.studentProfileId,
    facultyProfileId: scope.facultyProfileId,
    departmentId: scope.departmentId,
    denied: scope.denied,
    denyReasonAr: scope.denyReasonAr,
  };
}

export function emptyCatalogViewer(
  overrides: Partial<CatalogViewerFacts> = {},
): CatalogViewerFacts {
  return {
    roles: [],
    bindings: emptyOrgBindings(),
    studentProfileId: null,
    facultyProfileId: null,
    departmentId: null,
    denied: true,
    denyReasonAr: "لا نطاق",
    ...overrides,
  };
}

function isPrivileged(roles: readonly string[]): boolean {
  return roles.some((r) => r === "admin" || r === "system_admin");
}

function isDeptHeadOnly(roles: readonly string[]): boolean {
  return (
    roles.includes("department_head") &&
    !isPrivileged(roles) &&
    !roles.includes("dean") &&
    !roles.includes("registrar")
  );
}

function tokenizeDataScope(dataScope: string): Set<string> {
  return new Set(
    dataScope
      .toLowerCase()
      .split(/[\/,\s]+/)
      .map((t) => t.trim())
      .filter(Boolean),
  );
}

/**
 * Whether this catalog entry depends on a given organizational gate.
 * Derived from data_scope (+ beneficiaries) — not a hard-coded hub list.
 *
 * Compound scopes (e.g. self/assigned/department/college) are handled by
 * `actorSatisfiesReportScope` multi-path logic — exclusive tokens here.
 */
export function entryDependsOnGate(
  entry: ReportEntry,
  gate:
    | "student_identity"
    | "faculty_identity"
    | "department"
    | "college"
    | "operational_unit"
    | "vp_student"
    | "vp_academic"
    | "presidency",
): boolean {
  const tokens = tokenizeDataScope(entry.data_scope);
  const beneficiaries = new Set(entry.beneficiaries);
  const exclusive =
    tokens.size === 1
      ? [...tokens][0]
      : tokens.size === 2 && tokens.has("aggregate")
        ? [...tokens].find((t) => t !== "aggregate")
        : null;

  switch (gate) {
    case "student_identity":
      return (
        (exclusive === "self" || (tokens.has("self") && !tokens.has("assigned"))) &&
        beneficiaries.has("student")
      );
    case "faculty_identity":
      return (
        exclusive === "assigned" ||
        (tokens.has("assigned") && !tokens.has("department") && !tokens.has("college"))
      );
    case "department":
      return exclusive === "department";
    case "college":
      return exclusive === "college";
    case "operational_unit":
      return tokens.has("operational_unit");
    case "vp_student":
      return tokens.has("university_student_affairs");
    case "vp_academic":
      return tokens.has("university_academic");
    case "presidency":
      return tokens.has("university_strategic");
    default:
      return false;
  }
}

/**
 * Actor may open this report given role match already succeeded.
 * Fail-closed on missing identity/bindings required by the entry's scope.
 */
export function actorSatisfiesReportScope(
  entry: ReportEntry,
  viewer: CatalogViewerFacts,
): boolean {
  const roles = viewer.roles;
  const privileged = isPrivileged(roles);

  if (entryDependsOnGate(entry, "student_identity")) {
    const studentActor =
      roles.includes("student") || roles.includes("graduate");
    if (studentActor && !viewer.studentProfileId) return false;
  }

  if (entryDependsOnGate(entry, "faculty_identity")) {
    const facultyActor =
      roles.includes("faculty_member") ||
      roles.includes("department_head") ||
      (roles.includes("dean") && !privileged);
    if (facultyActor && !viewer.facultyProfileId && !privileged) return false;
  }

  if (entryDependsOnGate(entry, "department")) {
    if (isDeptHeadOnly(roles) && !viewer.departmentId) return false;
    if (
      roles.includes("dean") &&
      !privileged &&
      !viewer.bindings.collegeScopeConfigured &&
      !viewer.departmentId
    ) {
      return false;
    }
  }

  if (entryDependsOnGate(entry, "college")) {
    if (!viewer.bindings.collegeScopeConfigured) return false;
    if (
      !privileged &&
      !viewer.bindings.deanIdentityBound &&
      !roles.includes("dean")
    ) {
      return false;
    }
  }

  if (entryDependsOnGate(entry, "operational_unit")) {
    if (viewer.bindings.operationalUnitCodes.length === 0) return false;
  }

  if (entryDependsOnGate(entry, "vp_student")) {
    if (!viewer.bindings.vpStudentAffairsBound) return false;
  }

  if (entryDependsOnGate(entry, "vp_academic")) {
    if (!viewer.bindings.vpAcademicAffairsBound && !privileged) return false;
  }

  if (entryDependsOnGate(entry, "presidency")) {
    if (!viewer.bindings.universityPresidencyBound) return false;
  }

  // Multi-mode teaching/materials: at least one openable path must exist.
  const tokens = tokenizeDataScope(entry.data_scope);
  if (
    tokens.has("self") &&
    tokens.has("assigned") &&
    (tokens.has("department") || tokens.has("college"))
  ) {
    const canSelf = Boolean(viewer.facultyProfileId);
    const canDept =
      Boolean(viewer.departmentId) &&
      (roles.includes("department_head") || privileged || roles.includes("dean"));
    const canCollege =
      viewer.bindings.collegeScopeConfigured &&
      (viewer.bindings.deanIdentityBound || privileged);
    const canAdminCollege = privileged; // college mode without dept filter
    if (!canSelf && !canDept && !canCollege && !canAdminCollege) return false;
  }

  return true;
}
