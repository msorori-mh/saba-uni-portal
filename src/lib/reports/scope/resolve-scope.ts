/**
 * Pure scope decision helpers — no I/O.
 * Server resolvers load actor facts then call these.
 */

import type { ReportBeneficiary } from "../catalog/types";
import { beneficiariesForRoles } from "./beneficiary-roles";
import type {
  OrganizationalScopeLevel,
  ReportActorScope,
} from "./types";

export interface ActorScopeFacts {
  readonly userId: string;
  readonly roles: readonly string[];
  readonly departmentId: string | null;
  readonly facultyProfileId: string | null;
  readonly studentProfileId: string | null;
  readonly operationalUnitCode: string | null;
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

/**
 * Derive the primary organizational level from roles.
 * Does NOT invent missing department/student ids — caller must supply facts.
 */
export function levelsGrantedByRoles(
  roles: readonly string[],
): OrganizationalScopeLevel[] {
  const levels = new Set<OrganizationalScopeLevel>();
  for (const role of roles) {
    switch (role) {
      case "system_admin":
      case "admin":
        levels.add("university_strategic");
        levels.add("university_academic");
        levels.add("university_student_affairs");
        levels.add("college");
        levels.add("operational_unit");
        break;
      case "dean":
        levels.add("college");
        break;
      case "registrar":
        levels.add("university_academic");
        levels.add("operational_unit");
        break;
      case "student_affairs":
        levels.add("university_student_affairs");
        levels.add("operational_unit");
        break;
      case "finance_officer":
      case "hr_officer":
        levels.add("operational_unit");
        break;
      case "department_head":
        levels.add("department");
        levels.add("assigned");
        break;
      case "faculty_member":
        levels.add("assigned");
        levels.add("self");
        break;
      case "student":
      case "graduate":
        levels.add("self");
        break;
      default:
        break;
    }
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
  const beneficiaries = beneficiariesForRoles(roles);
  const levels = levelsGrantedByRoles(roles);
  const level = pickWidestLevel(levels);

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
      scopeLabelAr: "مرفوض",
      denied: true,
      denyReasonAr: "لا دور تقارير معروف أو النطاق غير محدد",
    };
  }

  // Self: must have student profile when student/graduate is the only grant.
  if (level === "self") {
    if (!facts.studentProfileId && !facts.facultyProfileId) {
      return deny(facts, beneficiaries, level, "تعذر تحديد هوية الذات للنطاق الذاتي");
    }
    return allow(facts, beneficiaries, level);
  }

  // Assigned faculty: need faculty profile.
  if (level === "assigned") {
    if (!facts.facultyProfileId) {
      return deny(facts, beneficiaries, level, "لا يوجد ملف هيئة تدريس للنطاق المسند");
    }
    return allow(facts, beneficiaries, level);
  }

  // Department: need department id (and typically faculty profile).
  if (level === "department") {
    if (!facts.departmentId) {
      return deny(
        facts,
        beneficiaries,
        level,
        "رئيس القسم بلا قسم مرتبط — يُرفض النطاق",
      );
    }
    return allow(facts, beneficiaries, level);
  }

  // College / university / operational: role alone is enough (aggregate).
  return allow(facts, beneficiaries, level);
}

function allow(
  facts: ActorScopeFacts,
  beneficiaries: readonly ReportBeneficiary[],
  level: OrganizationalScopeLevel,
): ReportActorScope {
  return {
    userId: facts.userId,
    roles: facts.roles,
    beneficiaries,
    level,
    departmentId:
      level === "department" || level === "assigned" ? facts.departmentId : facts.departmentId,
    facultyProfileId: facts.facultyProfileId,
    studentProfileId: facts.studentProfileId,
    operationalUnitCode: facts.operationalUnitCode,
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
  return {
    userId: facts.userId,
    roles: facts.roles,
    beneficiaries,
    level,
    departmentId: null,
    facultyProfileId: facts.facultyProfileId,
    studentProfileId: facts.studentProfileId,
    operationalUnitCode: null,
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
}): { readonly departmentId: string | null; readonly denied: boolean; readonly reasonAr: string | null } {
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
        level === "department"
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
