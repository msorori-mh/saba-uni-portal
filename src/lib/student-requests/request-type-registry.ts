/**
 * Canonical student request type registry (P2 code normalization).
 * DB may still store legacy codes — normalize on read/compare; never rename rows here.
 */

export type StudentRequestAudience = "active_student" | "graduate" | "both";
export type IneligibleDisplayMode = "hidden" | "disabled";

export type StudentRequestTypeDefinition = {
  code: string;
  nameAr: string;
  audience: StudentRequestAudience;
  ineligibleDisplayMode: IneligibleDisplayMode;
  requiresAttachment: boolean;
  requiresServiceWindow: boolean;
  requiresFee: boolean;
  producesDocument: boolean;
  requiresArchive: boolean;
  legacyAliases: readonly string[];
};

/** Legacy alias → canonical code (DB codes unchanged). */
const LEGACY_ALIAS_TO_CANONICAL: Readonly<Record<string, string>> = {
  absence_excuse: "excused_absence",
  transfer: "department_transfer",
  extra_chance: "final_chance",
  reenrollment: "enrollment_reinstatement",
};

const CANONICAL_TO_STORED_WRITE_CODE: Readonly<Record<string, string>> = {
  final_chance: "extra_chance",
  department_transfer: "transfer",
};

/** Approved canonical request types (spec scope). */
export const CANONICAL_STUDENT_REQUEST_TYPES: readonly StudentRequestTypeDefinition[] = [
  {
    code: "enrollment_suspension",
    nameAr: "وقف القيد",
    audience: "active_student",
    ineligibleDisplayMode: "hidden",
    requiresAttachment: false,
    requiresServiceWindow: true,
    requiresFee: false,
    producesDocument: false,
    requiresArchive: false,
    legacyAliases: [],
  },
  {
    code: "grade_statement_non_graduate",
    nameAr: "شهادة تقديرات لغير الخريجين",
    audience: "active_student",
    ineligibleDisplayMode: "hidden",
    requiresAttachment: false,
    requiresFee: true,
    producesDocument: true,
    requiresArchive: true,
    legacyAliases: [],
  },
  {
    code: "enrollment_certificate",
    nameAr: "شهادة قيد",
    audience: "active_student",
    ineligibleDisplayMode: "hidden",
    requiresAttachment: false,
    requiresFee: true,
    producesDocument: true,
    requiresArchive: true,
    legacyAliases: [],
  },
  {
    code: "file_withdrawal",
    nameAr: "سحب ملف",
    audience: "active_student",
    ineligibleDisplayMode: "hidden",
    requiresAttachment: false,
    requiresFee: false,
    producesDocument: false,
    requiresArchive: true,
    legacyAliases: [],
  },
  {
    code: "excused_absence",
    nameAr: "غياب بعذر",
    audience: "active_student",
    ineligibleDisplayMode: "hidden",
    requiresAttachment: true,
    requiresServiceWindow: true,
    requiresFee: false,
    producesDocument: false,
    requiresArchive: false,
    legacyAliases: ["absence_excuse"],
  },
  {
    code: "grade_appeal",
    nameAr: "تظلم",
    audience: "active_student",
    ineligibleDisplayMode: "hidden",
    requiresAttachment: false,
    requiresServiceWindow: true,
    requiresFee: true,
    producesDocument: true,
    requiresArchive: true,
    legacyAliases: [],
  },
  {
    code: "department_transfer",
    nameAr: "تحويل من قسم إلى قسم",
    audience: "active_student",
    ineligibleDisplayMode: "hidden",
    requiresAttachment: true,
    requiresFee: true,
    producesDocument: false,
    requiresArchive: false,
    legacyAliases: ["transfer"],
  },
  {
    code: "final_chance",
    nameAr: "فرصة نهائية",
    audience: "active_student",
    ineligibleDisplayMode: "hidden",
    requiresAttachment: false,
    requiresFee: true,
    producesDocument: false,
    requiresArchive: false,
    legacyAliases: ["extra_chance"],
  },
  {
    code: "october_exam_entry_form",
    nameAr: "استمارة دخول دور أكتوبر",
    audience: "active_student",
    ineligibleDisplayMode: "hidden",
    requiresAttachment: false,
    requiresServiceWindow: true,
    requiresFee: true,
    producesDocument: true,
    requiresArchive: true,
    legacyAliases: [],
  },
  {
    code: "replacement_student_card",
    nameAr: "بطاقة طالب بدل فاقد",
    audience: "active_student",
    ineligibleDisplayMode: "hidden",
    requiresAttachment: false,
    requiresServiceWindow: false,
    requiresFee: true,
    producesDocument: false,
    requiresArchive: false,
    legacyAliases: [],
  },
] as const;

const DEFINITION_BY_CANONICAL = new Map<string, StudentRequestTypeDefinition>(
  CANONICAL_STUDENT_REQUEST_TYPES.map((d) => [d.code, d]),
);

const ALL_LEGACY_ALIASES = new Set(Object.keys(LEGACY_ALIAS_TO_CANONICAL));

/** Out-of-scope types still in DB/UI (not deleted). */
const OUT_OF_SCOPE_LABELS: Readonly<Record<string, string>> = {
  enrollment_reinstatement: "إعادة قيد",
  equivalency: "معادلة مقررات",
  official_transcript: "سجل أكاديمي رسمي",
};

/**
 * Maps a stored or input code to its canonical equivalent.
 * Unknown codes pass through unchanged (safe no-op).
 */
export function normalizeStudentRequestTypeCode(code: string | null | undefined): string {
  const trimmed = (code ?? "").trim();
  if (!trimmed) return "";
  return LEGACY_ALIAS_TO_CANONICAL[trimmed] ?? trimmed;
}

/** Strict canonicalization for write/configuration boundaries. Unknown codes fail closed. */
export function requireCanonicalStudentRequestTypeCode(code: string | null | undefined): string {
  const normalized = normalizeStudentRequestTypeCode(code);
  if (!normalized || !DEFINITION_BY_CANONICAL.has(normalized)) {
    throw new Error("UNKNOWN_STUDENT_REQUEST_TYPE_CODE");
  }
  return normalized;
}

/** Historical DB write code. The client never invents or selects this mapping. */
export function getStoredWriteCodeForRequestType(code: string | null | undefined): string {
  const canonical = requireCanonicalStudentRequestTypeCode(code);
  return CANONICAL_TO_STORED_WRITE_CODE[canonical] ?? canonical;
}

export function isLegacyStudentRequestTypeAlias(code: string | null | undefined): boolean {
  const trimmed = (code ?? "").trim();
  return trimmed !== "" && ALL_LEGACY_ALIASES.has(trimmed);
}

export function isCanonicalStudentRequestTypeCode(code: string | null | undefined): boolean {
  const normalized = normalizeStudentRequestTypeCode(code);
  return normalized !== "" && DEFINITION_BY_CANONICAL.has(normalized);
}

export function getStudentRequestTypeDefinition(
  code: string | null | undefined,
): StudentRequestTypeDefinition | undefined {
  const normalized = normalizeStudentRequestTypeCode(code);
  if (!normalized) return undefined;
  return DEFINITION_BY_CANONICAL.get(normalized);
}

export function getStudentRequestTypeDisplayName(
  code: string | null | undefined,
  fallbackNameAr?: string | null,
): string {
  if (fallbackNameAr?.trim()) return fallbackNameAr.trim();
  const def = getStudentRequestTypeDefinition(code);
  if (def) return def.nameAr;
  const raw = (code ?? "").trim();
  if (raw && OUT_OF_SCOPE_LABELS[raw]) return OUT_OF_SCOPE_LABELS[raw];
  return raw || "—";
}

/** Compare stored DB code against expected canonical code. */
export function matchesStudentRequestTypeCode(
  storedCode: string | null | undefined,
  expectedCanonical: string,
): boolean {
  return normalizeStudentRequestTypeCode(storedCode) === expectedCanonical;
}

/**
 * DB filter expansion: canonical picker value matches legacy stored codes too.
 */
export function getDbCodesForRequestTypeFilter(code: string | null | undefined): string[] {
  const trimmed = (code ?? "").trim();
  if (!trimmed) return [];
  const normalized = normalizeStudentRequestTypeCode(trimmed);
  const def = DEFINITION_BY_CANONICAL.get(normalized);
  if (def) {
    const codes = new Set<string>([normalized, ...def.legacyAliases]);
    if (trimmed !== normalized) codes.add(trimmed);
    return [...codes];
  }
  if (isLegacyStudentRequestTypeAlias(trimmed)) {
    return [trimmed, normalized];
  }
  return [trimmed];
}

/** Hide legacy aliases and normalize Arabic labels for admin/student lists. */
export function enrichRequestTypesForDisplay<T extends { code: string; name_ar: string }>(
  types: T[],
): T[] {
  const codes = types.map((t) => t.code);
  return types
    .filter((t) => !shouldHideLegacyTypeInPicker(codes, t.code))
    .map((t) => ({
      ...t,
      name_ar: getStudentRequestTypeDisplayName(t.code, t.name_ar),
    }));
}

/**
 * Hide legacy alias rows in pickers when the canonical type is also listed.
 */
export function shouldHideLegacyTypeInPicker(allCodes: readonly string[], code: string): boolean {
  if (!isLegacyStudentRequestTypeAlias(code)) return false;
  const canonical = normalizeStudentRequestTypeCode(code);
  return allCodes.some((c) => c === canonical);
}

export type RequestTypePickerRow = {
  id: string;
  code: string;
  name_ar: string;
  description_ar: string | null;
  requires_attachment: boolean;
  is_eligible: boolean;
  is_disabled: boolean;
  disabled_reason: string | null;
};

/** Normalize labels and drop duplicate legacy entries when canonical exists. */
export function filterStudentRequestTypesForDisplay<T extends RequestTypePickerRow>(
  types: T[],
): T[] {
  const codes = types.map((t) => t.code);
  return types
    .filter((t) => !shouldHideLegacyTypeInPicker(codes, t.code))
    .map((t) => ({
      ...t,
      name_ar: getStudentRequestTypeDisplayName(t.code, t.name_ar),
    }));
}

export function buildCanonicalReportTypeOptions(): Array<{ value: string; label: string }> {
  return CANONICAL_STUDENT_REQUEST_TYPES.map((t) => ({
    value: t.code,
    label: t.nameAr,
  }));
}

export function buildExtendedReportTypeOptions(): Array<{ value: string; label: string }> {
  const canonical = buildCanonicalReportTypeOptions();
  const extra = Object.entries(OUT_OF_SCOPE_LABELS).map(([value, label]) => ({ value, label }));
  return [...canonical, ...extra];
}

export function resolveEffectLabelForRequestType(code: string | null | undefined): string | undefined {
  const normalized = normalizeStudentRequestTypeCode(code);
  const EFFECT_BY_CANONICAL: Readonly<Record<string, string>> = {
    excused_absence: "تم تسجيل العذر في سجل الغياب",
    grade_appeal: "تم اعتماد الدرجة بعد التظلم",
  };
  if (EFFECT_BY_CANONICAL[normalized]) return EFFECT_BY_CANONICAL[normalized];
  const raw = (code ?? "").trim();
  const LEGACY_EFFECT: Readonly<Record<string, string>> = {
    extra_chance: "تم تسجيل الفرصة في السجل الأكاديمي",
    equivalency: "تم تطبيق ساعات المعادلة",
    official_transcript: "تم إصدار السجل الأكاديمي الرسمي",
  };
  return LEGACY_EFFECT[raw];
}

/** Arabic labels for admin request-type config UI. */
export const REQUEST_AUDIENCE_LABELS_AR: Readonly<Record<StudentRequestAudience, string>> = {
  active_student: "طلاب غير خريجين",
  graduate: "خريجون",
  both: "طلاب وخريجون",
};

export const INELIGIBLE_DISPLAY_MODE_LABELS_AR: Readonly<Record<IneligibleDisplayMode, string>> = {
  hidden: "مخفي",
  disabled: "باهت (معطّل)",
};

export type AdminRequestTypeFormDefaults = {
  code: string;
  name_ar: string;
  description_ar: string;
  request_audience: StudentRequestAudience;
  ineligible_display_mode: IneligibleDisplayMode;
  student_visible: boolean;
  requires_attachment: boolean;
  requires_service_window: boolean;
  requires_fee: boolean;
  produces_document: boolean;
  requires_archive: boolean;
};

/** Suggested defaults from registry when admin picks a canonical code. */
export function getRegistryDefaultsForAdminForm(
  code: string | null | undefined,
): AdminRequestTypeFormDefaults | undefined {
  const def = getStudentRequestTypeDefinition(code);
  if (!def) return undefined;
  return {
    code: def.code,
    name_ar: def.nameAr,
    description_ar: "",
    request_audience: def.audience,
    ineligible_display_mode: def.ineligibleDisplayMode,
    student_visible: true,
    requires_attachment: def.requiresAttachment,
    requires_service_window: def.requiresServiceWindow,
    requires_fee: def.requiresFee,
    produces_document: def.producesDocument,
    requires_archive: def.requiresArchive,
  };
}

/** Canonical codes available for new admin create (excludes legacy aliases + existing). */
export function buildAdminCreateTypeOptions(
  existingDbCodes: readonly string[],
): Array<{ value: string; label: string }> {
  const existingNormalized = new Set(
    existingDbCodes.map((c) => normalizeStudentRequestTypeCode(c)),
  );
  return CANONICAL_STUDENT_REQUEST_TYPES.filter((t) => !existingNormalized.has(t.code)).map(
    (t) => ({
      value: t.code,
      label: `${t.nameAr} (${t.code})`,
    }),
  );
}

export function isLegacyAliasCode(code: string | null | undefined): boolean {
  return isLegacyStudentRequestTypeAlias(code);
}
