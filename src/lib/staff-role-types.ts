import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

export type StaffRoleTypeOption = {
  value: string;
  label: string;
  /** Maps to `user_roles.role` when creating/updating login accounts. */
  appRole: AppRole;
};

/** Approved role options for add/edit staff (excludes dean / department_head). */
export const STAFF_ROLE_TYPES: readonly StaffRoleTypeOption[] = [
  { value: "registrar", label: "المسجل العام", appRole: "registrar" },
  { value: "student_affairs_manager", label: "مدير إدارة شؤون الطلاب", appRole: "student_affairs" },
  { value: "student_affairs_specialist", label: "مختص شؤون الطلاب", appRole: "student_affairs" },
  { value: "graduate_affairs_manager", label: "مدير شؤون الخريجين", appRole: "student_affairs" },
  { value: "graduate_affairs_specialist", label: "مختص شؤون الخريجين", appRole: "student_affairs" },
  { value: "archive_officer", label: "مسؤول الإرشيف", appRole: "student_affairs" },
  { value: "finance_officer", label: "موظف الإيرادات والمالية", appRole: "finance_officer" },
  { value: "library_officer", label: "مسؤول المكتبة", appRole: "student_affairs" },
  { value: "lab_manager", label: "مسؤول المعامل", appRole: "student_affairs" },
  { value: "lab_keeper", label: "أمين معمل", appRole: "student_affairs" },
] as const;

export const ALLOWED_STAFF_ROLE_TYPES = STAFF_ROLE_TYPES.map((r) => r.value) as [
  typeof STAFF_ROLE_TYPES[number]["value"],
  ...typeof STAFF_ROLE_TYPES[number]["value"][],
];

/** Legacy values still accepted on update until profiles are migrated. */
export const LEGACY_STAFF_ROLE_TYPES = ["student_affairs", "hr_officer"] as const;

export const ALLOWED_STAFF_ROLE_TYPES_UPDATE = [
  ...ALLOWED_STAFF_ROLE_TYPES,
  ...LEGACY_STAFF_ROLE_TYPES,
] as const;

/** Legacy values kept for list/filter/display of existing profiles. */
export const LEGACY_STAFF_ROLE_LABELS: Record<string, string> = {
  student_affairs: "موظف شؤون الطلاب",
  hr_officer: "موظف الموارد البشرية",
};

export const LEGACY_STAFF_ROLE_FILTER_OPTIONS: readonly StaffRoleTypeOption[] = [
  { value: "student_affairs", label: LEGACY_STAFF_ROLE_LABELS.student_affairs, appRole: "student_affairs" },
  { value: "hr_officer", label: LEGACY_STAFF_ROLE_LABELS.hr_officer, appRole: "hr_officer" },
] as const;

export function staffRoleTypeLabel(roleType: string): string {
  return (
    STAFF_ROLE_TYPES.find((r) => r.value === roleType)?.label
    ?? LEGACY_STAFF_ROLE_LABELS[roleType]
    ?? roleType
  );
}

/** Resolves stored `staff_profiles.role_type` to an `app_role` for `user_roles`. */
export function staffRoleToAppRole(roleType: string): AppRole {
  const mapped = STAFF_ROLE_TYPES.find((r) => r.value === roleType)?.appRole;
  if (mapped) return mapped;
  if (roleType === "student_affairs") return "student_affairs";
  if (roleType === "hr_officer") return "hr_officer";
  if (roleType === "registrar") return "registrar";
  if (roleType === "finance_officer") return "finance_officer";
  return "student_affairs";
}

export function staffRoleOptionsForForm(currentRoleType?: string): StaffRoleTypeOption[] {
  const opts = [...STAFF_ROLE_TYPES];
  if (
    currentRoleType
    && !opts.some((o) => o.value === currentRoleType)
    && (LEGACY_STAFF_ROLE_LABELS[currentRoleType] || currentRoleType)
  ) {
    opts.unshift({
      value: currentRoleType,
      label: staffRoleTypeLabel(currentRoleType),
      appRole: staffRoleToAppRole(currentRoleType),
    });
  }
  return opts;
}

export const STAFF_ROLE_FILTER_OPTIONS: readonly StaffRoleTypeOption[] = [
  ...STAFF_ROLE_TYPES,
  ...LEGACY_STAFF_ROLE_FILTER_OPTIONS,
];
