import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

export type StaffScopeType = "college" | "departments" | "none";

export type StaffFunctionalRole = {
  key: string;
  labelAr: string;
  unitKey: string;
  unitLabelAr: string;
  scopeType: StaffScopeType;
  requiresLogin: boolean;
  /** Nearest existing `user_roles.role`; null when no safe mapping exists yet. */
  appRoleFallback: AppRole | null;
  expansionNote?: string;
};

/** Approved functional roles — single source of truth for staff create/edit UI. */
export const STAFF_FUNCTIONAL_ROLES: readonly StaffFunctionalRole[] = [
  {
    key: "registrar_general",
    labelAr: "مسجل الكلية",
    unitKey: "registrar",
    unitLabelAr: "مسجل الكلية",
    scopeType: "college",
    requiresLogin: true,
    appRoleFallback: "registrar",
  },
  {
    key: "student_affairs_manager",
    labelAr: "مدير إدارة شؤون الطلاب",
    unitKey: "student_affairs",
    unitLabelAr: "إدارة شؤون الطلاب",
    scopeType: "college",
    requiresLogin: true,
    appRoleFallback: "student_affairs",
  },
  {
    key: "student_affairs_specialist",
    labelAr: "مختص شؤون الطلاب",
    unitKey: "student_affairs",
    unitLabelAr: "إدارة شؤون الطلاب",
    scopeType: "departments",
    requiresLogin: true,
    appRoleFallback: "student_affairs",
  },
  {
    key: "graduate_affairs_manager",
    labelAr: "مدير شؤون الخريجين",
    unitKey: "graduate_affairs",
    unitLabelAr: "شؤون الخريجين",
    scopeType: "college",
    requiresLogin: true,
    appRoleFallback: "student_affairs",
    expansionNote: "قد يحتاج app_role مخصص لشؤون الخريجين لاحقاً",
  },
  {
    key: "graduate_affairs_specialist",
    labelAr: "مختص شؤون الخريجين",
    unitKey: "graduate_affairs",
    unitLabelAr: "شؤون الخريجين",
    scopeType: "departments",
    requiresLogin: true,
    appRoleFallback: "student_affairs",
    expansionNote: "قد يحتاج app_role مخصص لشؤون الخريجين لاحقاً",
  },
  {
    key: "archive_officer",
    labelAr: "مسؤول الإرشيف",
    unitKey: "archive",
    unitLabelAr: "الإرشيف",
    scopeType: "college",
    requiresLogin: true,
    appRoleFallback: "student_affairs",
    expansionNote: "صلاحيات الإرشيف تحتاج توسيع app_role لاحقاً",
  },
  {
    key: "revenue_finance_officer",
    labelAr: "موظف الإيرادات والمالية",
    unitKey: "finance",
    unitLabelAr: "الإيرادات والمالية",
    scopeType: "college",
    requiresLogin: true,
    appRoleFallback: "finance_officer",
  },
  {
    key: "library_officer",
    labelAr: "مسؤول المكتبة",
    unitKey: "library",
    unitLabelAr: "المكتبة",
    scopeType: "none",
    requiresLogin: true,
    appRoleFallback: null,
    expansionNote: "لا يوجد app_role للمكتبة حالياً — يحتاج توسيع enum قبل إنشاء حساب دخول",
  },
  {
    key: "labs_manager",
    labelAr: "مسؤول المعامل",
    unitKey: "labs",
    unitLabelAr: "المعامل",
    scopeType: "college",
    requiresLogin: true,
    appRoleFallback: null,
    expansionNote: "لا يوجد app_role للمعامل حالياً — يحتاج توسيع enum قبل إنشاء حساب دخول",
  },
  {
    key: "lab_custodian",
    labelAr: "أمين معمل",
    unitKey: "labs",
    unitLabelAr: "المعامل",
    scopeType: "departments",
    requiresLogin: true,
    appRoleFallback: null,
    expansionNote: "لا يوجد app_role للمعامل حالياً — يحتاج توسيع enum قبل إنشاء حساب دخول",
  },
] as const;

export type StaffFunctionalRoleKey = (typeof STAFF_FUNCTIONAL_ROLES)[number]["key"];

const ROLE_BY_KEY = new Map(STAFF_FUNCTIONAL_ROLES.map((r) => [r.key, r]));

/** Pre-rebuild keys still stored on legacy profiles — never offered on create. */
export const LEGACY_STAFF_ROLE_KEYS = [
  "registrar",
  "student_affairs",
  "finance_officer",
  "hr_officer",
  "lab_manager",
  "lab_keeper",
] as const;

export type LegacyStaffRoleKey = (typeof LEGACY_STAFF_ROLE_KEYS)[number];

/** Display-only metadata for legacy stored values (not selectable on create). */
export const LEGACY_STAFF_ROLE_META: Record<
  LegacyStaffRoleKey,
  { legacyLabelAr: string; suggestedKey?: StaffFunctionalRoleKey }
> = {
  registrar: { legacyLabelAr: "موظف القبول والتسجيل", suggestedKey: "registrar_general" },
  student_affairs: { legacyLabelAr: "موظف شؤون الطلاب", suggestedKey: "student_affairs_specialist" },
  finance_officer: { legacyLabelAr: "موظف الشؤون المالية", suggestedKey: "revenue_finance_officer" },
  hr_officer: { legacyLabelAr: "موظف الموارد البشرية" },
  lab_manager: { legacyLabelAr: "مسؤول المعامل", suggestedKey: "labs_manager" },
  lab_keeper: { legacyLabelAr: "أمين معمل", suggestedKey: "lab_custodian" },
};

const LEGACY_APP_ROLE_MAP: Record<LegacyStaffRoleKey, AppRole> = {
  registrar: "registrar",
  student_affairs: "student_affairs",
  finance_officer: "finance_officer",
  hr_officer: "hr_officer",
  lab_manager: "student_affairs",
  lab_keeper: "student_affairs",
};

/** Legacy stored keys / aliases → user-facing functional label (never app_role labels). */
const LEGACY_ROLE_DISPLAY_ALIASES: Record<string, string> = {
  registrar: "مسجل الكلية",
  admissions_registration: "مسجل الكلية",
};

export const STAFF_FUNCTIONAL_ROLE_KEYS = STAFF_FUNCTIONAL_ROLES.map((r) => r.key) as [
  StaffFunctionalRoleKey,
  ...StaffFunctionalRoleKey[],
];

export const ALLOWED_STAFF_ROLE_TYPES_CREATE = STAFF_FUNCTIONAL_ROLE_KEYS;

export const ALLOWED_STAFF_ROLE_TYPES_UPDATE = [
  ...STAFF_FUNCTIONAL_ROLE_KEYS,
  ...LEGACY_STAFF_ROLE_KEYS,
] as const;

export type StaffRoleFormOption = {
  value: string;
  label: string;
  appRole: AppRole | null;
  isLegacy?: boolean;
};

export function isApprovedStaffFunctionalRoleKey(key: string): key is StaffFunctionalRoleKey {
  return ROLE_BY_KEY.has(key);
}

export function isLegacyStaffRoleKey(key: string): key is LegacyStaffRoleKey {
  return (LEGACY_STAFF_ROLE_KEYS as readonly string[]).includes(key);
}

export function staffFunctionalRoleByKey(key: string): StaffFunctionalRole | undefined {
  return ROLE_BY_KEY.get(key);
}

export function staffFunctionalRoleDisplayLabel(roleType: string | null | undefined): string {
  const key = String(roleType ?? "").trim();
  if (!key) return "—";

  const alias = LEGACY_ROLE_DISPLAY_ALIASES[key];
  if (alias) return alias;

  const approved = ROLE_BY_KEY.get(key);
  if (approved) return approved.labelAr;

  const legacy = LEGACY_STAFF_ROLE_META[key as LegacyStaffRoleKey];
  if (legacy?.suggestedKey) {
    return ROLE_BY_KEY.get(legacy.suggestedKey)?.labelAr ?? key;
  }

  return key;
}

/** Admin/list label — may prefix legacy profiles with a migration hint. */
export function staffFunctionalRoleLabel(roleType: string): string {
  const display = staffFunctionalRoleDisplayLabel(roleType);
  if (ROLE_BY_KEY.has(roleType)) return display;
  if (isLegacyStaffRoleKey(roleType) || LEGACY_ROLE_DISPLAY_ALIASES[roleType]) {
    return `دور قديم — يحتاج تحديث (${display})`;
  }
  return display;
}

/** Maps `staff_profiles.role_type` to `user_roles.role` when creating/updating logins. */
export function staffFunctionalRoleToAppRole(roleType: string): AppRole | null {
  const approved = ROLE_BY_KEY.get(roleType);
  if (approved) return approved.appRoleFallback;
  if (isLegacyStaffRoleKey(roleType)) return LEGACY_APP_ROLE_MAP[roleType];
  return null;
}

export function staffRoleFormOptionsForCreate(): StaffRoleFormOption[] {
  return STAFF_FUNCTIONAL_ROLES.map((r) => ({
    value: r.key,
    label: r.labelAr,
    appRole: r.appRoleFallback,
  }));
}

/** Edit form: approved roles + legacy placeholder for the stored value only. */
export function staffRoleFormOptionsForEdit(currentRoleType?: string): StaffRoleFormOption[] {
  const opts = staffRoleFormOptionsForCreate();
  if (
    currentRoleType
    && !opts.some((o) => o.value === currentRoleType)
    && (isLegacyStaffRoleKey(currentRoleType) || !isApprovedStaffFunctionalRoleKey(currentRoleType))
  ) {
    opts.unshift({
      value: currentRoleType,
      label: staffFunctionalRoleLabel(currentRoleType),
      appRole: staffFunctionalRoleToAppRole(currentRoleType),
      isLegacy: true,
    });
  }
  return opts;
}

/** List filter: approved roles + legacy keys for finding old profiles. */
export function staffRoleFilterOptions(): StaffRoleFormOption[] {
  const legacyFilters: StaffRoleFormOption[] = LEGACY_STAFF_ROLE_KEYS.map((key) => ({
    value: key,
    label: `${staffFunctionalRoleDisplayLabel(key)} (قديم)`,
    appRole: LEGACY_APP_ROLE_MAP[key],
    isLegacy: true,
  }));
  return [...staffRoleFormOptionsForCreate(), ...legacyFilters];
}

const LABEL_TO_KEY = new Map<string, StaffFunctionalRoleKey>(
  STAFF_FUNCTIONAL_ROLES.map((r) => [r.labelAr.trim(), r.key]),
);

/** Resolve import/UI raw role_type (key or Arabic label) to a stored key. */
export function resolveStaffRoleTypeInput(raw: string): {
  key: string | null;
  legacy: boolean;
  error?: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { key: null, legacy: false };

  if (isApprovedStaffFunctionalRoleKey(trimmed)) {
    return { key: trimmed, legacy: false };
  }

  const byLabel = LABEL_TO_KEY.get(trimmed);
  if (byLabel) return { key: byLabel, legacy: false };

  if (isLegacyStaffRoleKey(trimmed)) {
    return {
      key: trimmed,
      legacy: true,
      error: `دور قديم (${LEGACY_STAFF_ROLE_META[trimmed].legacyLabelAr}) — استخدم المفاتيح الجديدة فقط`,
    };
  }

  const legacyByLabel = (LEGACY_STAFF_ROLE_KEYS as readonly string[]).find(
    (k) => LEGACY_STAFF_ROLE_META[k as LegacyStaffRoleKey].legacyLabelAr === trimmed,
  );
  if (legacyByLabel) {
    return {
      key: legacyByLabel,
      legacy: true,
      error: `دور قديم (${trimmed}) — استخدم المفاتيح الجديدة فقط`,
    };
  }

  return { key: null, legacy: false, error: `دور وظيفي غير معتمد: ${trimmed}` };
}

export function staffRoleTypeSupportsLogin(roleType: string): boolean {
  return staffFunctionalRoleToAppRole(roleType) != null;
}
