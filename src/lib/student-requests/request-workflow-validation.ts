/**
 * Pure validation for draft workflow config vs canonical preview (P7).
 * No DB access — compares local editor state to request-workflow-preview-registry.
 */

import type {
  DraftWorkflowStep,
  DraftWorkflowTransition,
} from "@/lib/admin-request-workflow-rpc";
import {
  CANONICAL_WORKFLOW_PREVIEW_CODES,
  getCanonicalWorkflowPreview,
  getPreviewStepActorLabel,
  hasCanonicalWorkflowPreview,
  OFFICIAL_WORKFLOW_PREVIEW_CODES,
  type CanonicalWorkflowStepDef,
} from "@/lib/student-requests/request-workflow-preview-registry";
import {
  isLegacyStudentRequestTypeAlias,
  normalizeStudentRequestTypeCode,
} from "@/lib/student-requests/request-type-registry";

export type WorkflowValidationSeverity = "error" | "warning" | "info";

export type WorkflowValidationIssue = {
  severity: WorkflowValidationSeverity;
  code: string;
  messageAr: string;
  stepKey?: string;
};

export type WorkflowValidationResult = {
  valid: boolean;
  requestTypeCode: string | null;
  hasCanonicalPreview: boolean;
  canonicalStepCount: number;
  draftStepCount: number;
  matchedStepCount: number;
  issues: WorkflowValidationIssue[];
};

function pushIssue(
  issues: WorkflowValidationIssue[],
  issue: WorkflowValidationIssue,
): void {
  issues.push(issue);
}

function normalizeToken(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function stepMatchesCanonical(
  draft: DraftWorkflowStep,
  canonical: CanonicalWorkflowStepDef,
): boolean {
  const draftKey = normalizeToken(draft.step_key);
  const canonKey = normalizeToken(canonical.key);
  if (draftKey === canonKey || draftKey.includes(canonKey) || canonKey.includes(draftKey)) {
    return true;
  }
  const draftName = normalizeToken(draft.step_name_ar);
  const canonName = normalizeToken(canonical.labelAr);
  if (draftName && canonName && (draftName.includes(canonName) || canonName.includes(draftName))) {
    return true;
  }
  const actor = normalizeToken(getPreviewStepActorLabel(canonical));
  if (draftName && actor && (draftName.includes(actor) || actor.includes(draftName))) {
    return true;
  }
  return false;
}

function validateDraftStructure(
  draftSteps: DraftWorkflowStep[],
  issues: WorkflowValidationIssue[],
): void {
  const keys = new Set<string>();
  for (const step of draftSteps) {
    if (!step.step_name_ar?.trim()) {
      pushIssue(issues, {
        severity: "error",
        code: "empty_step_name",
        messageAr: `الخطوة «${step.step_key}» بلا اسم عربي.`,
        stepKey: step.step_key,
      });
    }
    const nk = normalizeToken(step.step_key);
    if (keys.has(nk)) {
      pushIssue(issues, {
        severity: "error",
        code: "duplicate_step_key",
        messageAr: `مفتاح خطوة مكرر: ${step.step_key}`,
        stepKey: step.step_key,
      });
    }
    keys.add(nk);
  }

  const orders = [...draftSteps].map((s) => s.step_order).sort((a, b) => a - b);
  for (let i = 0; i < orders.length; i++) {
    if (orders[i] !== i + 1) {
      pushIssue(issues, {
        severity: "warning",
        code: "step_order_gap",
        messageAr: "ترتيب الخطوات غير متسلسل — يُفضّل 1، 2، 3…",
      });
      break;
    }
  }
}

function validateTransitions(
  draftSteps: DraftWorkflowStep[],
  draftTransitions: DraftWorkflowTransition[],
  issues: WorkflowValidationIssue[],
): void {
  if (draftSteps.length <= 1) return;
  if (draftTransitions.length === 0) {
    pushIssue(issues, {
      severity: "warning",
      code: "no_transitions",
      messageAr: "لا توجد انتقالات محددة بين الخطوات — يُفضّل تعريف مسار افتراضي.",
    });
    return;
  }

  const stepKeys = new Set(draftSteps.map((s) => normalizeToken(s.step_key)));
  for (const t of draftTransitions) {
    if (t.from_step_key && !stepKeys.has(normalizeToken(t.from_step_key))) {
      pushIssue(issues, {
        severity: "error",
        code: "orphan_transition_from",
        messageAr: `انتقال من خطوة غير موجودة: ${t.from_step_key}`,
      });
    }
    if (t.to_step_key && !stepKeys.has(normalizeToken(t.to_step_key))) {
      pushIssue(issues, {
        severity: "error",
        code: "orphan_transition_to",
        messageAr: `انتقال إلى خطوة غير موجودة: ${t.to_step_key}`,
      });
    }
  }
}

function compareToCanonical(
  requestTypeCode: string,
  draftSteps: DraftWorkflowStep[],
  issues: WorkflowValidationIssue[],
): { canonicalStepCount: number; matchedStepCount: number } {
  const preview = getCanonicalWorkflowPreview(requestTypeCode);
  if (!preview) {
    pushIssue(issues, {
      severity: "info",
      code: "no_canonical_preview",
      messageAr: "لا يوجد مسار مرجعي معتمد لهذا النوع في المواصفة.",
    });
    return { canonicalStepCount: 0, matchedStepCount: 0 };
  }

  const canonical = preview.steps;
  let matched = 0;
  const sortedDraft = [...draftSteps].sort((a, b) => a.step_order - b.step_order);

  for (let i = 0; i < canonical.length; i++) {
    const canon = canonical[i];
    const draft = sortedDraft[i];
    if (!draft) {
      pushIssue(issues, {
        severity: "warning",
        code: "missing_canonical_step",
        messageAr: `خطوة مرجعية مفقودة في المسودة: ${canon.labelAr}`,
        stepKey: canon.key,
      });
      continue;
    }
    if (stepMatchesCanonical(draft, canon)) {
      matched += 1;
    } else {
      pushIssue(issues, {
        severity: "warning",
        code: "step_mismatch",
        messageAr: `الخطوة ${i + 1} في المسودة («${draft.step_name_ar}») لا تطابق المرجع («${canon.labelAr}»).`,
        stepKey: draft.step_key,
      });
    }
    if (canon.isCentralSignatory && draft.processing_role_id) {
      pushIssue(issues, {
        severity: "info",
        code: "central_signatory_role",
        messageAr: `«${canon.labelAr}» جهة مركزية — لا تُربط بدور موظف داخل الكلية.`,
        stepKey: canon.key,
      });
    }
  }

  if (sortedDraft.length > canonical.length) {
    pushIssue(issues, {
      severity: "info",
      code: "extra_draft_steps",
      messageAr: `المسودة تحتوي ${sortedDraft.length - canonical.length} خطوة(ات) إضافية عن المسار المرجعي.`,
    });
  }

  if (sortedDraft.length > 0) {
    const first = sortedDraft[0];
    const firstCanon = canonical[0];
    if (firstCanon?.roleKey === "student" && !stepMatchesCanonical(first, firstCanon)) {
      pushIssue(issues, {
        severity: "warning",
        code: "missing_student_first",
        messageAr: "يُفضّل أن تبدأ دورة الحياة بخطوة الطالب (التقديم).",
        stepKey: first.step_key,
      });
    }
  }

  const lastCanon = canonical[canonical.length - 1];
  const lastDraft = sortedDraft[sortedDraft.length - 1];
  if (
    lastCanon
    && (lastCanon.roleKey === "archive_officer" || lastCanon.key === "archive")
    && lastDraft
    && !stepMatchesCanonical(lastDraft, lastCanon)
  ) {
    pushIssue(issues, {
      severity: "warning",
      code: "missing_archive_step",
      messageAr: "المسار المرجعي ينتهي بالأرشيف — تحقق من الخطوة الأخيرة.",
      stepKey: lastDraft.step_key,
    });
  }

  for (const note of preview.specNotesAr) {
    pushIssue(issues, {
      severity: "info",
      code: "spec_note",
      messageAr: note,
    });
  }

  return { canonicalStepCount: canonical.length, matchedStepCount: matched };
}

export function validateDraftWorkflowAgainstCanonical(
  requestTypeCode: string | null | undefined,
  draftSteps: DraftWorkflowStep[],
  draftTransitions: DraftWorkflowTransition[] = [],
): WorkflowValidationResult {
  const normalized = normalizeStudentRequestTypeCode(requestTypeCode) ?? (requestTypeCode ?? "").trim();
  const issues: WorkflowValidationIssue[] = [];

  if (draftSteps.length === 0) {
    pushIssue(issues, {
      severity: "info",
      code: "empty_draft",
      messageAr: "لا توجد خطوات في المسودة — استخدم المعاينة المرجعية كدليل.",
    });
    return {
      valid: true,
      requestTypeCode: normalized || null,
      hasCanonicalPreview: hasCanonicalWorkflowPreview(normalized),
      canonicalStepCount: getCanonicalWorkflowPreview(normalized)?.steps.length ?? 0,
      draftStepCount: 0,
      matchedStepCount: 0,
      issues,
    };
  }

  validateDraftStructure(draftSteps, issues);
  validateTransitions(draftSteps, draftTransitions, issues);

  const { canonicalStepCount, matchedStepCount } = normalized
    ? compareToCanonical(normalized, draftSteps, issues)
    : { canonicalStepCount: 0, matchedStepCount: 0 };

  if (normalized && !hasCanonicalWorkflowPreview(normalized)) {
    pushIssue(issues, {
      severity: "info",
      code: "unsupported_type",
      messageAr: "نوع الطلب خارج الأنواع الثمانية المعتمدة — لا يوجد مسار مرجعي للمقارنة.",
    });
  }

  const hasErrors = issues.some((i) => i.severity === "error");
  const matchRatio = canonicalStepCount > 0 ? matchedStepCount / canonicalStepCount : 1;
  const valid = !hasErrors && (canonicalStepCount === 0 || matchRatio >= 0.5 || draftSteps.length === 0);

  return {
    valid,
    requestTypeCode: normalized || null,
    hasCanonicalPreview: hasCanonicalWorkflowPreview(normalized),
    canonicalStepCount,
    draftStepCount: draftSteps.length,
    matchedStepCount,
    issues,
  };
}

export function summarizeValidationResult(result: WorkflowValidationResult): string {
  if (!result.hasCanonicalPreview) {
    return "لا يوجد مسار مرجعي معتمد للمقارنة.";
  }
  if (result.draftStepCount === 0) {
    return "المسودة فارغة — راجع المسار المرجعي أدناه.";
  }
  const pct = result.canonicalStepCount > 0
    ? Math.round((result.matchedStepCount / result.canonicalStepCount) * 100)
    : 0;
  const errors = result.issues.filter((i) => i.severity === "error").length;
  const warnings = result.issues.filter((i) => i.severity === "warning").length;
  if (errors > 0) {
    return `تعذر اعتماد المسودة: ${errors} خطأ(أخطاء) و${warnings} تنبيه(ات). التطابق ${pct}%.`;
  }
  if (warnings > 0) {
    return `مسودة قابلة للمراجعة: ${warnings} تنبيه(ات). التطابق مع المرجع ${pct}%.`;
  }
  return `المسودة متوافقة مع المسار المرجعي (${pct}% تطابق).`;
}

/** Expected terminal step pattern per official type (spec §6). */
const EXPECTED_ENDING: Readonly<Record<string, "archive" | "registrar">> = {
  enrollment_suspension: "archive",
  grade_statement_non_graduate: "archive",
  enrollment_certificate: "archive",
  file_withdrawal: "archive",
  excused_absence: "archive",
  grade_appeal: "registrar",
  department_transfer: "archive",
  october_exam_entry_form: "archive",
};

export type RegistryTypeValidation = {
  code: string;
  valid: boolean;
  stepCount: number;
  issues: string[];
};

export type RegistryValidationReport = {
  valid: boolean;
  officialTypeCount: number;
  previewPathCount: number;
  aliasStandalonePaths: number;
  types: RegistryTypeValidation[];
};

function endsWithExpectedTerminal(
  steps: readonly CanonicalWorkflowStepDef[],
  expected: "archive" | "registrar",
): boolean {
  const last = steps[steps.length - 1];
  if (!last) return false;
  if (expected === "archive") {
    return Boolean(last.isArchiveStep || last.actionType === "archive" || last.key === "archive");
  }
  return last.roleKey === "registrar_general" || last.key === "registrar";
}

/** Validates the static preview registry (8 official types, no alias paths). */
export function validateCanonicalPreviewRegistry(): RegistryValidationReport {
  const types: RegistryTypeValidation[] = [];
  const aliasStandalonePaths = CANONICAL_WORKFLOW_PREVIEW_CODES.filter((c) =>
    isLegacyStudentRequestTypeAlias(c),
  ).length;

  for (const code of OFFICIAL_WORKFLOW_PREVIEW_CODES) {
    const issues: string[] = [];
    const preview = getCanonicalWorkflowPreview(code);
    if (!preview) {
      issues.push("مسار preview مفقود");
    } else {
      const steps = preview.steps;
      if (steps.length === 0) issues.push("مسار فارغ");
      const staffFirstTypes = new Set(["enrollment_certificate"]);
      if (steps[0]?.roleKey !== "student" && !staffFirstTypes.has(code)) {
        issues.push("لا يبدأ بخطوة الطالب");
      }
      if (code === "enrollment_certificate" && steps.length !== 7) {
        issues.push(`مسار شهادة القيد: 7 خطوات (الموجود: ${steps.length})`);
      }
      const expectedEnd = EXPECTED_ENDING[code];
      if (expectedEnd && !endsWithExpectedTerminal(steps, expectedEnd)) {
        issues.push(`النهاية المتوقعة: ${expectedEnd === "archive" ? "أرشيف" : "مسجل الكلية"}`);
      }
      if (code === "file_withdrawal") {
        const parallel = steps.filter((s) => s.parallelGroupId === "clearance");
        if (parallel.length < 4) {
          issues.push(`مجموعة التوازي clearance: ${parallel.length}/4`);
        }
      }
      if (code === "grade_statement_non_graduate") {
        const hasUni = steps.some(
          (s) => s.centralSignatoryKey === "university_registrar_general",
        );
        if (!hasUni) issues.push("مسجل الجامعة العام مفقود");
      }
      if (code === "department_transfer") {
        const keys = new Set(steps.map((s) => s.key));
        if (!keys.has("target_dept")) issues.push("رئيس القسم المطلوب مفقود");
        if (!keys.has("current_dept")) issues.push("رئيس القسم الحالي مفقود");
      }
    }
    types.push({
      code,
      valid: issues.length === 0,
      stepCount: preview?.steps.length ?? 0,
      issues,
    });
  }

  const extraKeys = CANONICAL_WORKFLOW_PREVIEW_CODES.filter(
    (c) => !(OFFICIAL_WORKFLOW_PREVIEW_CODES as readonly string[]).includes(c),
  );
  if (extraKeys.length > 0) {
    types.push({
      code: "_extra",
      valid: false,
      stepCount: 0,
      issues: [`مسارات غير رسمية: ${extraKeys.join(", ")}`],
    });
  }

  const aliasCodes = ["absence_excuse", "transfer"] as const;
  for (const alias of aliasCodes) {
    if ((CANONICAL_WORKFLOW_PREVIEW_CODES as readonly string[]).includes(alias)) {
      types.push({
        code: alias,
        valid: false,
        stepCount: 0,
        issues: ["مسار مستقل للـ alias — يجب التطبيع فقط"],
      });
    } else if (!hasCanonicalWorkflowPreview(alias)) {
      types.push({
        code: alias,
        valid: false,
        stepCount: 0,
        issues: ["alias لا يحل إلى مسار canonical"],
      });
    }
  }

  const valid = types.every((t) => t.valid)
    && OFFICIAL_WORKFLOW_PREVIEW_CODES.length === 8
    && CANONICAL_WORKFLOW_PREVIEW_CODES.length === 8
    && aliasStandalonePaths === 0;

  return {
    valid,
    officialTypeCount: OFFICIAL_WORKFLOW_PREVIEW_CODES.length,
    previewPathCount: CANONICAL_WORKFLOW_PREVIEW_CODES.length,
    aliasStandalonePaths,
    types: types.filter((t) => t.code !== "_extra" || !t.valid),
  };
}

export function formatRegistryValidationSummary(report: RegistryValidationReport): string {
  const passed = report.types.filter((t) => t.valid).length;
  return `${passed}/${report.types.length} أنواع — ${report.previewPathCount} مسارات preview`;
}
