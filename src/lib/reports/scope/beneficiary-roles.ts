/**
 * Map portal app_role tokens → canonical report beneficiaries.
 * Fail-closed: unknown roles map to nothing.
 *
 * Dual-role users receive the UNION of explicitly granted beneficiaries —
 * never a universal bypass.
 *
 * HARDENING-02: university VP / presidency MUST NOT be inferred from ordinary
 * staff (student_affairs / registrar / dean). Those facets are granted only
 * when explicit org bindings are merged in via `beneficiariesForRolesAndBindings`.
 */

import type { ReportBeneficiary } from "../catalog/types";
import type { ExplicitOrgBindings } from "./org-identity";

/** Role → beneficiary facets (a role may grant more than one facet). */
export const ROLE_TO_BENEFICIARIES: Readonly<
  Record<string, readonly ReportBeneficiary[]>
> = {
  student: ["student"],
  graduate: ["student"],
  faculty_member: ["faculty_supervisor"],
  department_head: ["dept_head_coordinator", "faculty_supervisor"],
  // Operational staff — unit scope enforced separately. Never VP.
  registrar: ["operational_units_staff", "academic_affairs"],
  student_affairs: ["operational_units_staff"],
  finance_officer: ["operational_units_staff"],
  hr_officer: ["operational_units_staff"],
  // College dean — never university VP / presidency.
  dean: ["dean", "academic_affairs"],
  // Platform operators — still do NOT auto-grant VP/presidency without binding.
  // They retain operational + academic + dean oversight for admin tooling.
  admin: [
    "dean",
    "academic_affairs",
    "operational_units_staff",
    "alumni_quality",
  ],
  system_admin: [
    "dean",
    "academic_affairs",
    "operational_units_staff",
    "alumni_quality",
  ],
};

/**
 * Resolve the union of beneficiaries for a role list.
 * Empty / unknown roles ⇒ empty list (fail-closed).
 * Does NOT grant vp_* or university_presidency_council.
 */
export function beneficiariesForRoles(
  roles: readonly string[] | null | undefined,
): ReportBeneficiary[] {
  if (!roles || roles.length === 0) return [];
  const out = new Set<ReportBeneficiary>();
  for (const role of roles) {
    const mapped = ROLE_TO_BENEFICIARIES[role];
    if (!mapped) continue;
    for (const b of mapped) out.add(b);
  }
  return [...out];
}

/**
 * Merge role-based beneficiaries with explicit org-binding facets.
 * VP / presidency appear only when the corresponding binding flag is true.
 */
export function beneficiariesForRolesAndBindings(
  roles: readonly string[] | null | undefined,
  bindings: Pick<
    ExplicitOrgBindings,
    | "vpStudentAffairsBound"
    | "vpAcademicAffairsBound"
    | "universityPresidencyBound"
  > | null | undefined,
): ReportBeneficiary[] {
  const out = new Set(beneficiariesForRoles(roles));
  if (bindings?.vpStudentAffairsBound) out.add("vp_student_affairs");
  if (bindings?.vpAcademicAffairsBound) out.add("vp_academic_affairs");
  if (bindings?.universityPresidencyBound) {
    out.add("university_presidency_council");
  }
  return [...out];
}

/** True when the viewer holds at least one of the required beneficiaries. */
export function hasAnyBeneficiary(
  viewerBeneficiaries: readonly ReportBeneficiary[],
  required: readonly ReportBeneficiary[],
): boolean {
  if (viewerBeneficiaries.length === 0 || required.length === 0) return false;
  const set = new Set(viewerBeneficiaries);
  return required.some((b) => set.has(b));
}
