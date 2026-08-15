/**
 * UI-only eligibility / availability guards for student requests (P5).
 * Does NOT enforce final eligibility — RPC/migrations handle that later.
 */

import { hasStudentRequestFormDefinition } from "@/lib/student-requests/request-form-registry";
import {
  getStudentRequestTypeDefinition,
  isCanonicalStudentRequestTypeCode,
  normalizeStudentRequestTypeCode,
  type IneligibleDisplayMode,
  type StudentRequestAudience,
} from "@/lib/student-requests/request-type-registry";

export type UiEligibilityBadge = "available" | "needs_verification" | "blocked" | "unsupported";

export type StudentUiContext = {
  studentStatus?: string | null;
  isGraduate?: boolean;
  isActiveStudent?: boolean;
  /** When available from profile/import fields (optional). */
  studentStudyStatus?: "new" | "repeat" | null;
  isFirstLevel?: boolean | null;
  transferredCurrentYear?: boolean | null;
  previousSuspensionSemestersCount?: number | null;
  consecutiveSuspensionYearsCount?: number | null;
  /** Canonical numeric academic level order (never Arabic display text). */
  academicLevelOrder?: number | null;
  /** Authoritative remaining required courses (server-computed). */
  remainingRequiredCoursesCount?: number | null;
  /** Open replacement-card service statuses for this student. */
  openReplacementCardStatuses?: readonly string[] | null;
};

export type ServiceWindowAvailability = {
  /** Whether a window check was attempted. */
  checked: boolean;
  isOpen?: boolean;
  message?: string | null;
};

export type RequestTypePickerState = {
  is_eligible?: boolean;
  is_disabled?: boolean;
  disabled_reason?: string | null;
  request_audience?: string | null;
  ineligible_display_mode?: string | null;
};

export type FormValidationState = {
  valid: boolean;
  missingLabels?: string[];
};

export type StudentRequestUiEligibilityInput = {
  requestTypeCode: string;
  studentContext?: StudentUiContext | null;
  typePickerState?: RequestTypePickerState | null;
  formValidation?: FormValidationState | null;
  serviceWindow?: ServiceWindowAvailability | null;
  formSupported?: boolean;
  hasSubject?: boolean;
};

export type StudentRequestUiEligibility = {
  badge: UiEligibilityBadge;
  blockedReasons: string[];
  warnings: string[];
  notices: string[];
  canSubmit: boolean;
  canSaveDraft: boolean;
  rpcNoticeAr: string;
};

const RPC_NOTICE =
  "التحقق النهائي من الأهلية وتوفر الخدمة يتم عند المعالجة النظامية (RPC) وليس من هذه الواجهة فقط.";

const ACADEMIC_BLOCK_MSG = "لا يمكن تقديم هذا الطلب حالياً بسبب حالة القيد الأكاديمية.";

const ACADEMIC_STATUS_UNCHECKED_MSG = "لم يُتحقق بعد من حالة القيد الأكاديمي في الواجهة.";

const SERVICE_WINDOW_NEEDS_MSG = "تحتاج هذه الخدمة إلى فترة تفعيل من الإدارة.";

const SERVICE_WINDOW_UNCHECKED_MSG = "لم يتم التحقق من فترة التفعيل بعد.";

const UNSUPPORTED_MSG = "هذا النوع من الطلب غير مدعوم حالياً في النموذج الجديد.";

const SERVICE_WINDOW_TYPES = new Set([
  "enrollment_suspension",
  "excused_absence",
  "grade_appeal",
  "october_exam_entry_form",
]);

const BADGE_LABELS: Record<UiEligibilityBadge, string> = {
  available: "متاح",
  needs_verification: "يحتاج تحقق",
  blocked: "غير متاح",
  unsupported: "غير مدعوم",
};

export function getStudentRequestAvailabilityBadge(badge: UiEligibilityBadge): {
  badge: UiEligibilityBadge;
  labelAr: string;
} {
  return { badge, labelAr: BADGE_LABELS[badge] };
}

function audienceFromInput(input: StudentRequestUiEligibilityInput): StudentRequestAudience {
  const fromPicker = input.typePickerState?.request_audience;
  if (fromPicker === "active_student" || fromPicker === "graduate" || fromPicker === "both") {
    return fromPicker;
  }
  const def = getStudentRequestTypeDefinition(input.requestTypeCode);
  return def?.audience ?? "active_student";
}

function ineligibleModeFromInput(input: StudentRequestUiEligibilityInput): IneligibleDisplayMode {
  const fromPicker = input.typePickerState?.ineligible_display_mode;
  if (fromPicker === "hidden" || fromPicker === "disabled") return fromPicker;
  const def = getStudentRequestTypeDefinition(input.requestTypeCode);
  return def?.ineligibleDisplayMode ?? "hidden";
}

function appendTypeSpecificNotices(
  code: string,
  notices: string[],
  warnings: string[],
  blockedReasons: string[],
  ctx: StudentUiContext | null | undefined,
): void {
  switch (code) {
    case "enrollment_suspension":
      notices.push(
        "وقف القيد: لا يُقبل للمستوى الأول، ولا للطالب الجديد (مستجد)، ولا للمحوّل في نفس العام، ولا عند تجاوز حد فترات الإيقاف.",
      );
      if (ctx?.isFirstLevel === true) {
        blockedReasons.push("وقف القيد غير متاح للمستوى الأول.");
      }
      if (ctx?.studentStudyStatus === "new") {
        blockedReasons.push("وقف القيد غير متاح للطالب الجديد (مستجد).");
      }
      if (ctx?.transferredCurrentYear === true) {
        blockedReasons.push("وقف القيد غير متاح للطالب المحوّل في نفس العام الدراسي.");
      }
      if (
        ctx?.previousSuspensionSemestersCount != null &&
        ctx.previousSuspensionSemestersCount >= 4
      ) {
        blockedReasons.push("تم تجاوز الحد المسموح لفترات وقف القيد السابقة.");
      }
      if (
        ctx?.consecutiveSuspensionYearsCount != null &&
        ctx.consecutiveSuspensionYearsCount >= 2
      ) {
        blockedReasons.push("تم تجاوز الحد المسموح لسنوات وقف القيد المتتالية.");
      }
      break;
    case "grade_statement_non_graduate":
    case "enrollment_certificate":
      notices.push("هذا الطلب مخصص لطلاب غير الخريجين.");
      if (code === "enrollment_certificate") {
        notices.push("شهادة القيد خدمة داخلية للكلية ولا تحتاج توقيعات مركزية.");
      }
      break;
    case "file_withdrawal":
      notices.push(
        "سحب الملف يتطلب لاحقاً إخلاء طرف من: الشؤون المالية، المكتبة، المعامل، والأنشطة.",
      );
      break;
    case "excused_absence":
      notices.push("غياب بعذر يتطلب فترة تفعيل من الإدارة ومرفقات العذر.");
      break;
    case "grade_appeal":
      notices.push(
        `التظلم على النتيجة النهائية متاح خلال ${FINAL_RESULT_APPEAL_WINDOW_DAYS} أيام من تاريخ إعلان النتيجة رسمياً.`,
      );
      break;
    case "department_transfer": {
      notices.push("التحويل يتطلب مراجعة رئيس القسم ومعادلة مقررات لاحقة.");
      const levelGuard = evaluateDepartmentTransferLevelGuard(ctx?.academicLevelOrder ?? null);
      if (!levelGuard.ok && levelGuard.denyCode === DEPARTMENT_TRANSFER_LEVEL1_DENY_CODE) {
        blockedReasons.push(levelGuard.messageAr);
      }
      break;
    }
    case "october_exam_entry_form": {
      notices.push(
        `استمارة دور أكتوبر متاحة لطلاب المستوى الرابع بحد أقصى ${OCTOBER_MAX_REMAINING_COURSES} مقررات متبقية.`,
      );
      if (ctx?.academicLevelOrder != null && ctx.academicLevelOrder !== OCTOBER_REQUIRED_LEVEL) {
        blockedReasons.push(OCTOBER_DENY_MESSAGES_AR[OCTOBER_DENY_REASONS.NOT_LEVEL_4]);
      }
      if (
        ctx?.remainingRequiredCoursesCount != null
        && ctx.remainingRequiredCoursesCount > OCTOBER_MAX_REMAINING_COURSES
      ) {
        blockedReasons.push(OCTOBER_DENY_MESSAGES_AR[OCTOBER_DENY_REASONS.TOO_MANY_REMAINING]);
      }
      break;
    }
    case "replacement_student_card": {
      notices.push("تُصدر البطاقة البديلة من شؤون الطلاب بعد تأكيد الإيرادات باستلام السداد.");
      const cardEligibility = evaluateReplacementCardEligibility({
        studentStatus: ctx?.studentStatus ?? null,
        existingRequestStatuses: ctx?.openReplacementCardStatuses ?? [],
      });
      if (
        !cardEligibility.eligible
        && cardEligibility.denyReason === REPLACEMENT_CARD_DENY_REASONS.DUPLICATE_OPEN_REQUEST
      ) {
        blockedReasons.push(cardEligibility.messageAr as string);
      }
      break;
    }
    default:
      break;
  }
}

function evaluateAudience(
  input: StudentRequestUiEligibilityInput,
  blockedReasons: string[],
  warnings: string[],
): void {
  const audience = audienceFromInput(input);
  const mode = ineligibleModeFromInput(input);
  const ctx = input.studentContext;
  const isGraduate = ctx?.isGraduate === true;
  const isActiveStudent = ctx?.isActiveStudent === true;

  if (ctx?.studentStatus == null) {
    warnings.push("لم يُتحقق بعد من حالة الطالب (نشط/خريج) في الواجهة.");
    return;
  }

  if (audience === "active_student" && isGraduate) {
    const msg = "هذا الطلب مخصص لطلاب غير الخريجين.";
    if (mode === "hidden") blockedReasons.push(msg);
    else warnings.push(`${msg} (معروض باهتاً — التحقق النهائي من RPC).`);
  }

  if (audience === "graduate" && !isGraduate && isActiveStudent) {
    const msg = "هذا الطلب مخصص للخريجين.";
    if (mode === "hidden") blockedReasons.push(msg);
    else warnings.push(`${msg} (معروض باهتاً — التحقق النهائي من RPC).`);
  }
}

function evaluateServiceWindow(
  code: string,
  serviceWindow: ServiceWindowAvailability | null | undefined,
  warnings: string[],
  blockedReasons: string[],
): boolean {
  if (!SERVICE_WINDOW_TYPES.has(code)) return false;

  warnings.push(SERVICE_WINDOW_NEEDS_MSG);

  if (!serviceWindow?.checked) {
    warnings.push(SERVICE_WINDOW_UNCHECKED_MSG);
    return true;
  }

  if (serviceWindow.isOpen === false) {
    blockedReasons.push(serviceWindow.message ?? "فترة تفعيل هذه الخدمة غير مفتوحة حالياً.");
    return false;
  }

  if (serviceWindow.isOpen !== true) {
    warnings.push(SERVICE_WINDOW_UNCHECKED_MSG);
    return true;
  }

  return false;
}

export function getStudentRequestBlockedReasons(input: StudentRequestUiEligibilityInput): string[] {
  return getStudentRequestUiEligibility(input).blockedReasons;
}

export function getStudentRequestUiEligibility(
  input: StudentRequestUiEligibilityInput,
): StudentRequestUiEligibility {
  const normalized = normalizeStudentRequestTypeCode(input.requestTypeCode);
  const blockedReasons: string[] = [];
  const warnings: string[] = [];
  const notices: string[] = [];

  const formSupported =
    input.formSupported ?? hasStudentRequestFormDefinition(input.requestTypeCode);
  const canonical = isCanonicalStudentRequestTypeCode(normalized);

  if (!normalized || (!formSupported && !canonical)) {
    return {
      badge: "unsupported",
      blockedReasons: [UNSUPPORTED_MSG],
      warnings: [],
      notices: [],
      canSubmit: false,
      canSaveDraft: false,
      rpcNoticeAr: RPC_NOTICE,
    };
  }

  if (!formSupported) {
    blockedReasons.push(UNSUPPORTED_MSG);
  }

  const picker = input.typePickerState;
  if (picker?.is_eligible === false) {
    blockedReasons.push(picker.disabled_reason ?? "نوع الطلب غير متاح لحسابك حسب بيانات النظام.");
  }
  if (picker?.is_disabled) {
    blockedReasons.push(picker.disabled_reason ?? "نوع الطلب معطّل حالياً.");
  }

  const status = input.studentContext?.studentStatus?.trim();
  if (status && status !== "active" && status !== "graduated") {
    blockedReasons.push(ACADEMIC_BLOCK_MSG);
  } else if (!status && input.studentContext != null) {
    warnings.push(ACADEMIC_STATUS_UNCHECKED_MSG);
  }

  evaluateAudience(input, blockedReasons, warnings);
  appendTypeSpecificNotices(normalized, notices, warnings, blockedReasons, input.studentContext);

  const needsWindowVerification = evaluateServiceWindow(
    normalized,
    input.serviceWindow,
    warnings,
    blockedReasons,
  );

  // Form completeness is submit readiness, never service eligibility. Missing
  // pristine fields must not produce a red "unavailable" decision.
  const formValidation = input.formValidation;

  const hasHardBlock = blockedReasons.length > 0;
  let badge: UiEligibilityBadge;

  if (!formSupported) {
    badge = "unsupported";
  } else if (hasHardBlock) {
    badge = "blocked";
  } else if (
    needsWindowVerification ||
    warnings.some((w) => w.includes("لم يُتحقق") || w.includes("لم يتم التحقق")) ||
    picker?.is_eligible == null
  ) {
    badge = "needs_verification";
  } else {
    badge = "available";
  }

  const canSubmit =
    formSupported &&
    !hasHardBlock &&
    badge === "available" &&
    formValidation?.valid !== false &&
    input.hasSubject !== false;

  const canSaveDraft = canSubmit;

  return {
    badge,
    blockedReasons,
    warnings,
    notices,
    canSubmit,
    canSaveDraft,
    rpcNoticeAr: RPC_NOTICE,
  };
}

export function canSubmitStudentRequestFromUi(input: StudentRequestUiEligibilityInput): boolean {
  return getStudentRequestUiEligibility(input).canSubmit;
}

export { BADGE_LABELS, RPC_NOTICE, UNSUPPORTED_MSG };
