/**
 * Pure scope decision helpers — no I/O.
 * Server resolvers load actor facts then call these.
 *
 * HARDENING-02: college / university VP / presidency / operational levels
 * require explicit bindings — role alone is not enough.
 */

import type { ReportBeneficiary } from "../catalog/types";
import { beneficiariesForRolesAndBindings } from "./beneficiary-roles";
import type { ExplicitOrgBindings } from "./org-identity";
import { emptyOrgBindings } from "./org-identity";
import type {
  OrganizationalScopeLevel,
  ReportActorScope,
  ReportOrgBindingFlags,
} from "./types";

export interface ActorScopeFacts {
  readonly userId: string;
  readonly roles: readonly string[];
  readonly departmentId: string | null;
  readonly facultyProfileId: string | null;
  readonly studentProfileId: string | null;
  /** @deprecated Prefer bindings.operationalUnitCodes */
  readonly operationalUnitCode: string | null;
  readonly bindings: ExplicitOrgBindings;
}

const LEVEL_PRIORITY: readonly OrganizationalScopeLevel[] = [
  "university_strategic",
  "university_academic",
  "university_student_affairs",
  "college",
  "operational_unit",
  "department",
  "assigned",
  "self",
];

function pickWidestLevel(
  levels: readonly OrganizationalScopeLevel[],
): OrganizationalScopeLevel | null {
  for (const level of LEVEL_PRIORITY) {
    if (levels.includes(level)) return level;
  }
  return null;
}

function toBindingFlags(b: ExplicitOrgBindings): ReportOrgBindingFlags {
  return {
    vpStudentAffairsBound: b.vpStudentAffairsBound,
    vpAcademicAffairsBound: b.vpAcademicAffairsBound,
    universityPresidencyBound: b.universityPresidencyBound,
    deanIdentityBound: b.deanIdentityBound,
    collegeId: b.collegeId,
    collegeScopeConfigured: b.collegeScopeConfigured,
    operationalUnitCodes: b.operationalUnitCodes,
  };
}

/**
 * Derive organizational levels from roles + explicit bindings.
 * VP / presidency levels require binding flags — never ordinary staff roles.
 */
export function levelsGrantedByRoles(
  roles: readonly string[],
  bindings: ExplicitOrgBindings = emptyOrgBindings(),
): OrganizationalScopeLevel[] {
  const levels = new Set<OrganizationalScopeLevel>();
  const roleSet = new Set(roles);

  if (roleSet.has("system_admin") || roleSet.has("admin")) {
    levels.add("college");
    levels.add("operational_unit");
    levels.add("university_academic");
    // Strategic / VP university levels still require explicit bindings below.
  }

  if (bindings.universityPresidencyBound) {
    levels.add("university_strategic");
  }
  if (bindings.vpAcademicAffairsBound) {
    levels.add("university_academic");
  }
  if (bindings.vpStudentAffairsBound) {
    levels.add("university_student_affairs");
  }

  if (bindings.deanIdentityBound && bindings.collegeScopeConfigured) {
    levels.add("college");
  } else if (bindings.deanIdentityBound || roleSet.has("dean")) {
    // Dean identity without college_id: do NOT grant college level for
    // LIVE college-isolation claims. Academic affairs at department aggregate
    // remains available via academic_affairs role path when configured.
  }

  if (roleSet.has("registrar")) {
    levels.add("operational_unit");
    // academic_affairs beneficiary remains; university_academic level only via VP binding
  }
  if (roleSet.has("student_affairs")) {
    levels.add("operational_unit");
  }
  if (roleSet.has("finance_officer") || roleSet.has("hr_officer")) {
    levels.add("operational_unit");
  }
  if (roleSet.has("department_head")) {
    levels.add("department");
    levels.add("assigned");
  }
  if (roleSet.has("faculty_member")) {
    levels.add("assigned");
    levels.add("self");
  }
  if (roleSet.has("student") || roleSet.has("graduate")) {
    levels.add("self");
  }

  // Admin academic oversight (not VP): allow university_academic for admin family only
  if (roleSet.has("system_admin") || roleSet.has("admin")) {
    levels.add("university_academic");
  }

  return [...levels];
}

function scopeLabelAr(level: OrganizationalScopeLevel): string {
  switch (level) {
    case "self":
      return "ذاتي فقط";
    case "assigned":
      return "المقررات/المجموعات المسندة فقط";
    case "department":
      return "قسم محدد";
    case "college":
      return "الكلية فقط";
    case "university_student_affairs":
      return "نطاق جامعي — شؤون الطلاب";
    case "university_academic":
      return "نطاق جامعي — الشؤون الأكاديمية";
    case "university_strategic":
      return "مؤشرات استراتيجية مجمعة";
    case "operational_unit":
      return "وحدة تشغيلية مختصة";
    default:
      return "محدود";
  }
}

/**
 * Build a fail-closed actor scope from preloaded facts.
 * Missing required identifiers for the granted level ⇒ denied.
 */
export function buildActorScope(facts: ActorScopeFacts): ReportActorScope {
  const roles = facts.roles;
  const bindings = facts.bindings ?? emptyOrgBindings();
  const beneficiaries = beneficiariesForRolesAndBindings(roles, bindings);
  const levels = levelsGrantedByRoles(roles, bindings);
  const level = pickWidestLevel(levels);
  const flags = toBindingFlags(bindings);
  const primaryUnit =
    bindings.operationalUnitCodes[0] ?? facts.operationalUnitCode ?? null;

  if (!level || beneficiaries.length === 0) {
    return {
      userId: facts.userId,
      roles,
      beneficiaries,
      level: "self",
      departmentId: null,
      facultyProfileId: facts.facultyProfileId,
      studentProfileId: facts.studentProfileId,
      operationalUnitCode: null,
      bindings: flags,
      scopeLabelAr: "مرفوض",
      denied: true,
      denyReasonAr: "لا دور تقارير معروف أو النطاق غير محدد",
    };
  }

  if (level === "self") {
    if (!facts.studentProfileId && !facts.facultyProfileId) {
      return deny(facts, beneficiaries, level, "تعذر تحديد هوية الذات للنطاق الذاتي");
    }
    return allow(facts, beneficiaries, level, flags, primaryUnit);
  }

  if (level === "assigned") {
    if (!facts.facultyProfileId) {
      return deny(facts, beneficiaries, level, "لا يوجد ملف هيئة تدريس للنطاق المسند");
    }
    return allow(facts, beneficiaries, level, flags, primaryUnit);
  }

  if (level === "department") {
    if (!facts.departmentId) {
      return deny(
        facts,
        beneficiaries,
        level,
        "رئيس القسم بلا قسم مرتبط — يُرفض النطاق",
      );
    }
    return allow(facts, beneficiaries, level, flags, primaryUnit);
  }

  if (level === "college") {
    if (!bindings.collegeScopeConfigured) {
      return deny(
        facts,
        beneficiaries,
        level,
        "نطاق الكلية غير مكوّن — لا يوجد college_id موثوق",
      );
    }
    return allow(facts, beneficiaries, level, flags, primaryUnit);
  }

  if (level === "operational_unit") {
    if (bindings.operationalUnitCodes.length === 0) {
      return deny(
        facts,
        beneficiaries,
        level,
        "ربط الوحدة التشغيلية مفقود — يُرفض النطاق الجامعي العام",
      );
    }
    return allow(facts, beneficiaries, level, flags, primaryUnit);
  }

  if (level === "university_student_affairs" && !bindings.vpStudentAffairsBound) {
    return deny(
      facts,
      beneficiaries,
      level,
      "لا يوجد ربط صريح لنائب رئيس الجامعة لشؤون الطلاب",
    );
  }
  if (level === "university_academic" && !bindings.vpAcademicAffairsBound) {
    // Admin family may hold university_academic without VP binding.
    const isAdmin = roles.some((r) => r === "admin" || r === "system_admin");
    if (!isAdmin) {
      return deny(
        facts,
        beneficiaries,
        level,
        "لا يوجد ربط صريح لنائب رئيس الجامعة للشؤون الأكاديمية",
      );
    }
  }
  if (level === "university_strategic" && !bindings.universityPresidencyBound) {
    return deny(
      facts,
      beneficiaries,
      level,
      "لا يوجد ربط صريح لرئاسة/مجلس الجامعة",
    );
  }

  return allow(facts, beneficiaries, level, flags, primaryUnit);
}

function allow(
  facts: ActorScopeFacts,
  beneficiaries: readonly ReportBeneficiary[],
  level: OrganizationalScopeLevel,
  bindings: ReportOrgBindingFlags,
  operationalUnitCode: string | null,
): ReportActorScope {
  return {
    userId: facts.userId,
    roles: facts.roles,
    beneficiaries,
    level,
    departmentId: facts.departmentId,
    facultyProfileId: facts.facultyProfileId,
    studentProfileId: facts.studentProfileId,
    operationalUnitCode,
    bindings,
    scopeLabelAr: scopeLabelAr(level),
    denied: false,
    denyReasonAr: null,
  };
}

function deny(
  facts: ActorScopeFacts,
  beneficiaries: readonly ReportBeneficiary[],
  level: OrganizationalScopeLevel,
  reason: string,
): ReportActorScope {
  const bindings = toBindingFlags(facts.bindings ?? emptyOrgBindings());
  return {
    userId: facts.userId,
    roles: facts.roles,
    beneficiaries,
    level,
    departmentId: null,
    facultyProfileId: facts.facultyProfileId,
    studentProfileId: facts.studentProfileId,
    operationalUnitCode: null,
    bindings,
    scopeLabelAr: "مرفوض",
    denied: true,
    denyReasonAr: reason,
  };
}

/**
 * Force a department filter for department-scoped actors.
 * University/college roles keep the requested filter (may be null = all).
 * Department-scoped actors: always their department; requesting another ⇒ DENY.
 */
export function enforceDepartmentFilter(args: {
  readonly scope: ReportActorScope;
  readonly requestedDepartmentId: string | null | undefined;
}): {
  readonly departmentId: string | null;
  readonly denied: boolean;
  readonly reasonAr: string | null;
} {
  const { scope, requestedDepartmentId } = args;
  if (scope.denied) {
    return { departmentId: null, denied: true, reasonAr: scope.denyReasonAr };
  }

  const isDeptOnly =
    scope.level === "department" &&
    !scope.roles.some((r) =>
      ["system_admin", "admin", "dean", "registrar"].includes(r),
    );

  if (!isDeptOnly) {
    return {
      departmentId: requestedDepartmentId ?? null,
      denied: false,
      reasonAr: null,
    };
  }

  if (!scope.departmentId) {
    return {
      departmentId: null,
      denied: true,
      reasonAr: "نطاق القسم مفقود",
    };
  }

  if (
    requestedDepartmentId &&
    requestedDepartmentId !== scope.departmentId
  ) {
    return {
      departmentId: null,
      denied: true,
      reasonAr: "رئيس القسم لا يرى قسماً آخر",
    };
  }

  return {
    departmentId: scope.departmentId,
    denied: false,
    reasonAr: null,
  };
}

/** Whether a beneficiary may access a given organizational level. */
export function beneficiaryMayAccessLevel(
  beneficiary: ReportBeneficiary,
  level: OrganizationalScopeLevel,
): boolean {
  switch (beneficiary) {
    case "student":
      return level === "self";
    case "faculty_supervisor":
      return level === "self" || level === "assigned";
    case "dept_head_coordinator":
      return level === "department" || level === "assigned";
    case "operational_units_staff":
      return level === "operational_unit";
    case "academic_affairs":
      return (
        level === "college" ||
        level === "university_academic" ||
        level === "department" ||
        level === "operational_unit"
      );
    case "alumni_quality":
      return (
        level === "college" ||
        level === "university_academic" ||
        level === "operational_unit"
      );
    case "dean":
      return level === "college";
    case "vp_student_affairs":
      return level === "university_student_affairs";
    case "vp_academic_affairs":
      return level === "university_academic";
    case "university_presidency_council":
      return level === "university_strategic";
    default:
      return false;
  }
}
