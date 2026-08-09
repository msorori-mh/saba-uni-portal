/**
 * Map portal app_role tokens → canonical report beneficiaries.
 * Fail-closed: unknown roles map to nothing.
 *
 * Dual-role users receive the UNION of explicitly granted beneficiaries —
 * never a universal bypass.
 */

import type { ReportBeneficiary } from "../catalog/types";

/** Role → beneficiary facets (a role may grant more than one facet). */
export const ROLE_TO_BENEFICIARIES: Readonly<
  Record<string, readonly ReportBeneficiary[]>
> = {
  student: ["student"],
  graduate: ["student"],
  faculty_member: ["faculty_supervisor"],
  department_head: ["dept_head_coordinator", "faculty_supervisor"],
  // Operational staff (role-gated university ops; unit scope enforced separately).
  registrar: ["operational_units_staff", "academic_affairs"],
  student_affairs: ["operational_units_staff", "vp_student_affairs"],
  finance_officer: ["operational_units_staff"],
  hr_officer: ["operational_units_staff"],
  // Leadership / academic authority.
  dean: ["dean", "academic_affairs"],
  admin: [
    "dean",
    "academic_affairs",
    "operational_units_staff",
    "vp_student_affairs",
    "vp_academic_affairs",
    "university_presidency_council",
    "alumni_quality",
  ],
  system_admin: [
    "dean",
    "academic_affairs",
    "operational_units_staff",
    "vp_student_affairs",
    "vp_academic_affairs",
    "university_presidency_council",
    "alumni_quality",
  ],
};

/**
 * Resolve the union of beneficiaries for a role list.
 * Empty / unknown roles ⇒ empty list (fail-closed).
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

/** True when the viewer holds at least one of the required beneficiaries. */
export function hasAnyBeneficiary(
  viewerBeneficiaries: readonly ReportBeneficiary[],
  required: readonly ReportBeneficiary[],
): boolean {
  if (viewerBeneficiaries.length === 0 || required.length === 0) return false;
  const set = new Set(viewerBeneficiaries);
  return required.some((b) => set.has(b));
}
