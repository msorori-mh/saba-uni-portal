/**
 * TEST_ONLY_ASSURANCE_02 — fixture definitions.
 *
 * Exactly ten NEW identities in a dedicated namespace. No existing account is
 * ever reused, renamed, relinked or reset by this module.
 *
 * `student_affairs` is a privileged role and is NEVER used as the generic
 * unprivileged staff principal. A generic unprivileged staff principal is a
 * staff_profile with no privileged role grant — no new `app_role` enum value is
 * required. It is simply out of scope of this ten-account phase.
 */

import { ASSURANCE_02_NAMESPACE } from "./target-guard";

/** Namespace-scoped email domain — never a real deliverable domain. */
export const FIXTURE_EMAIL_DOMAIN = "assurance02.test.invalid";
/** Prefix stamped on every identifier this phase creates. */
export const FIXTURE_PREFIX = "a02";

export type FixtureKey =
  | "studentA"
  | "studentB"
  | "faculty_member"
  | "department_head"
  | "student_affairs"
  | "registrar"
  | "dean"
  | "hr_officer"
  | "finance_officer"
  | "admin";

export type ProfileKind = "student" | "faculty" | "staff" | "none";

export interface FixtureSpec {
  key: FixtureKey;
  /** Value of the `app_role` enum assigned in user_roles. */
  appRole:
    | "student"
    | "faculty_member"
    | "department_head"
    | "student_affairs"
    | "registrar"
    | "dean"
    | "hr_officer"
    | "finance_officer"
    | "admin";
  email: string;
  profileKind: ProfileKind;
  /** Stable business identifier (academic/employee number) for collision checks. */
  identifier: string;
  /** Public-directory `faculty.employee_id` for the two faculty identities. */
  facultyEmployeeId?: string;
  fullNameAr: string;
  privileged: boolean;
}

function email(local: string): string {
  return `${FIXTURE_PREFIX}-${local}@${FIXTURE_EMAIL_DOMAIN}`;
}

export const ASSURANCE_02_FIXTURES: readonly FixtureSpec[] = [
  {
    key: "studentA",
    appRole: "student",
    email: email("student-a"),
    profileKind: "student",
    identifier: "A02-STU-0001",
    fullNameAr: "طالب اختبار أ (A02)",
    privileged: false,
  },
  {
    key: "studentB",
    appRole: "student",
    email: email("student-b"),
    profileKind: "student",
    identifier: "A02-STU-0002",
    fullNameAr: "طالب اختبار ب (A02)",
    privileged: false,
  },
  {
    key: "faculty_member",
    appRole: "faculty_member",
    email: email("faculty"),
    profileKind: "faculty",
    identifier: "A02-FAC-0001",
    facultyEmployeeId: "A02-FACREC-0001",
    fullNameAr: "عضو هيئة تدريس اختبار (A02)",
    privileged: false,
  },
  {
    key: "department_head",
    appRole: "department_head",
    email: email("department-head"),
    profileKind: "faculty",
    identifier: "A02-FAC-0002",
    facultyEmployeeId: "A02-FACREC-0002",
    fullNameAr: "رئيس قسم اختبار (A02)",
    privileged: true,
  },
  {
    key: "student_affairs",
    appRole: "student_affairs",
    email: email("student-affairs"),
    profileKind: "staff",
    identifier: "A02-STF-0001",
    fullNameAr: "شؤون طلاب اختبار (A02)",
    privileged: true,
  },
  {
    key: "registrar",
    appRole: "registrar",
    email: email("registrar"),
    profileKind: "staff",
    identifier: "A02-STF-0002",
    fullNameAr: "مسجل اختبار (A02)",
    privileged: true,
  },
  {
    key: "dean",
    appRole: "dean",
    email: email("dean"),
    profileKind: "staff",
    identifier: "A02-STF-0003",
    fullNameAr: "عميد اختبار (A02)",
    privileged: true,
  },
  {
    key: "hr_officer",
    appRole: "hr_officer",
    email: email("hr-officer"),
    profileKind: "staff",
    identifier: "A02-STF-0004",
    fullNameAr: "موظف موارد بشرية اختبار (A02)",
    privileged: true,
  },
  {
    key: "finance_officer",
    appRole: "finance_officer",
    email: email("finance-officer"),
    profileKind: "staff",
    identifier: "A02-STF-0005",
    fullNameAr: "موظف مالية اختبار (A02)",
    privileged: true,
  },
  {
    key: "admin",
    appRole: "admin",
    email: email("admin"),
    profileKind: "staff",
    identifier: "A02-STF-0006",
    fullNameAr: "مسؤول اختبار (A02)",
    privileged: true,
  },
] as const;

/** Namespace tag written into free-text columns the schema actually exposes. */
export function fixtureTag(spec: FixtureSpec): string {
  return `${ASSURANCE_02_NAMESPACE}:${spec.identifier}`;
}

/** Metadata stamped on every auth user and profile row created in this phase. */
export function fixtureMetadata(spec: FixtureSpec): Record<string, string> {
  return {
    fixture_namespace: ASSURANCE_02_NAMESPACE,
    fixture_key: spec.key,
    fixture_identifier: spec.identifier,
    test_only: "true",
  };
}

/**
 * Reference data explicitly marked synthetic in this backend (label-verified,
 * never inferred from UUID shape). Read-only usage; never mutated.
 */
export const MARKED_SYNTHETIC_REFERENCES = {
  departmentId: "00000000-0000-4000-8000-04b000000001",
  departmentLabel: "قسم الاختبار المعزول 04B",
  programId: "00000000-0000-4000-8000-04b000000002",
  programLabel: "برنامج الاختبار المعزول 04B",
  academicYearId: "00000000-0000-4000-8000-04b000000003",
  academicYearLabel: "TEST_ONLY 2026-2027 (04B)",
  semesterId: "00000000-0000-4000-8000-04b000000004",
  semesterLabel: "الفصل التجريبي 04B",
} as const;

/** Coverage the owner must be told is not satisfied by this fixture set. */
export const KNOWN_COVERAGE_GAPS = [
  "generic unprivileged staff principal — modelled by the older harness as a staff_profile with NO privileged role grant (no new app_role enum value is needed); deliberately out of scope of this ten-account phase",
  "document/certificate fixtures (this phase creates no documents by design)",
] as const;
