/**
 * Pure staff deletion / deactivation policy (01O).
 * No DB access — callers supply dependency counts and identity facts.
 */

export type StaffDeletionDependencyCounts = {
  processingAssignments: number | null;
  workflowStepsAssigned: number | null;
  staffProfileDepartments: number | null;
  positionAssignments: number | null;
  notifications: number | null;
  auditLogs: number | null;
  otherStaffWithSameUserId: number | null;
  facultyProfilesWithUserId: number | null;
  studentProfilesWithUserId: number | null;
  /** True when any dependency query failed (must block hard delete). */
  queryFailures: string[];
};

export type StaffDeletionIdentity = {
  staffProfileId: string;
  fullNameAr: string;
  employeeNumber: string;
  email: string | null;
  userId: string | null;
  status: string;
  roleType: string | null;
  appRoles: string[];
  actorUserId: string;
  hasFacultyProfile: boolean;
};

export type StaffDeletionPreflightResult = {
  staff_profile_id: string;
  full_name_ar: string;
  employee_number: string;
  email: string | null;
  user_id: string | null;
  status: string;
  role_type: string | null;
  user_roles: string[];
  isCurrentUser: boolean;
  isAdmin: boolean;
  isSystemAdmin: boolean;
  hasFacultyProfile: boolean;
  processingAssignmentsCount: number | null;
  workflowStepsAssignedCount: number | null;
  staffProfileDepartmentsCount: number | null;
  positionAssignmentsCount: number | null;
  notificationsCount: number | null;
  auditLogsCount: number | null;
  dependency_count: number;
  canHardDelete: boolean;
  canDeactivate: boolean;
  blockingReasons: string[];
  queryFailures: string[];
};

export function evaluateStaffDeletionPreflight(
  identity: StaffDeletionIdentity,
  deps: StaffDeletionDependencyCounts,
): StaffDeletionPreflightResult {
  const blockingReasons: string[] = [];
  const isCurrentUser = Boolean(identity.userId && identity.userId === identity.actorUserId);
  const isAdmin = identity.appRoles.includes("admin");
  const isSystemAdmin = identity.appRoles.includes("system_admin");

  if (isCurrentUser) {
    blockingReasons.push("لا يمكن حذف حسابك الحالي.");
  }
  if (isAdmin || isSystemAdmin) {
    blockingReasons.push("لا يمكن حذف موظف بصلاحية admin أو system_admin من هذه الصفحة.");
  }
  if (identity.hasFacultyProfile) {
    blockingReasons.push("الموظف مرتبط بملف أعضاء هيئة التدريس.");
  }

  const countable = [
    deps.processingAssignments,
    deps.workflowStepsAssigned,
    deps.staffProfileDepartments,
    deps.positionAssignments,
    deps.notifications,
    deps.auditLogs,
  ];

  if (deps.queryFailures.length > 0) {
    blockingReasons.push(
      `تعذر التحقق من الجداول التابعة: ${deps.queryFailures.join("، ")}. فُشل الفحص يمنع الحذف.`,
    );
  }

  let dependency_count = 0;
  for (const n of countable) {
    if (n == null) {
      // already covered by queryFailures ideally
      continue;
    }
    dependency_count += n;
  }

  // Owned junction rows (staff_profile_departments) are counted for visibility and
  // cascaded during hard delete — they alone do not block. Operational/historical links do.
  if ((deps.processingAssignments ?? 0) > 0) {
    blockingReasons.push("توجد تكليفات معالجة طلبات مرتبطة بالموظف.");
  }
  if ((deps.workflowStepsAssigned ?? 0) > 0) {
    blockingReasons.push("توجد خطوات طلبات مسندة إلى هذا الموظف.");
  }
  if ((deps.positionAssignments ?? 0) > 0) {
    blockingReasons.push("توجد تكليفات مناصب مرتبطة بحساب الموظف.");
  }
  if ((deps.notifications ?? 0) > 0) {
    blockingReasons.push("توجد إشعارات مرتبطة بحساب الموظف.");
  }
  if ((deps.auditLogs ?? 0) > 0) {
    blockingReasons.push("توجد سجلات تدقيق مرتبطة بالموظف أو حسابه (بيانات تاريخية).");
  }

  const hardBlockingCount =
    (deps.processingAssignments ?? 0) +
    (deps.workflowStepsAssigned ?? 0) +
    (deps.positionAssignments ?? 0) +
    (deps.notifications ?? 0) +
    (deps.auditLogs ?? 0);

  if (hardBlockingCount > 0 && blockingReasons.length === 0) {
    blockingReasons.push("توجد بيانات مرتبطة تمنع الحذف النهائي.");
  }

  const canHardDelete = blockingReasons.length === 0 && deps.queryFailures.length === 0;
  const canDeactivate =
    !isCurrentUser &&
    !isAdmin &&
    !isSystemAdmin &&
    identity.status !== "inactive";

  return {
    staff_profile_id: identity.staffProfileId,
    full_name_ar: identity.fullNameAr,
    employee_number: identity.employeeNumber,
    email: identity.email,
    user_id: identity.userId,
    status: identity.status,
    role_type: identity.roleType,
    user_roles: identity.appRoles,
    isCurrentUser,
    isAdmin,
    isSystemAdmin,
    hasFacultyProfile: identity.hasFacultyProfile,
    processingAssignmentsCount: deps.processingAssignments,
    workflowStepsAssignedCount: deps.workflowStepsAssigned,
    staffProfileDepartmentsCount: deps.staffProfileDepartments,
    positionAssignmentsCount: deps.positionAssignments,
    notificationsCount: deps.notifications,
    auditLogsCount: deps.auditLogs,
    dependency_count,
    canHardDelete,
    canDeactivate,
    blockingReasons,
    queryFailures: deps.queryFailures,
  };
}

export function validateStaffDeleteConfirmation(input: {
  preflight: StaffDeletionPreflightResult;
  expectedFullName: string;
  expectedEmployeeNumber: string;
  confirmationText: string;
  deleteAuthUser: boolean;
}): { ok: true } | { ok: false; messageAr: string } {
  const { preflight } = input;
  if (!preflight.canHardDelete) {
    return {
      ok: false,
      messageAr: preflight.blockingReasons[0] ?? "الحذف النهائي غير مسموح.",
    };
  }
  if (input.expectedFullName.trim() !== preflight.full_name_ar.trim()) {
    return { ok: false, messageAr: "الاسم الكامل تغيّر منذ فتح نافذة التأكيد." };
  }
  if (input.expectedEmployeeNumber.trim() !== preflight.employee_number.trim()) {
    return { ok: false, messageAr: "الرقم الوظيفي تغيّر منذ فتح نافذة التأكيد." };
  }
  if (input.confirmationText.trim() !== preflight.full_name_ar.trim()) {
    return { ok: false, messageAr: "يجب كتابة الاسم الكامل للموظف تمامًا للتأكيد." };
  }
  if (preflight.user_id && !input.deleteAuthUser) {
    return {
      ok: false,
      messageAr: "يجب تأكيد حذف حساب الدخول مع ملف الموظف.",
    };
  }
  return { ok: true };
}

export function interpretStaffDeleteOutcome(r: {
  authUserDeleted: boolean;
  staffProfileDeleted: boolean;
}): { partialFailure: boolean; severity: "ok" | "partial" | "failed" } {
  if (r.staffProfileDeleted) {
    return { partialFailure: false, severity: "ok" };
  }
  if (r.authUserDeleted) {
    return { partialFailure: true, severity: "partial" };
  }
  return { partialFailure: false, severity: "failed" };
}

export const PROCESSING_ROLE_CODE_RE = /^[a-z][a-z0-9_]*$/;

export const ENROLLMENT_CERTIFICATE_PROTECTED_ROLE_CODES = [
  "student_affairs_manager",
  "student_affairs_specialist",
  "revenue_finance_officer",
  "registrar_general",
  "dean",
  "archive_officer",
] as const;

export type ProcessingRoleUsageCounts = {
  workflowStepsCount: number | null;
  assignmentsCount: number | null;
  positionMappingsCount: number | null;
  queryFailures: string[];
  activeWorkflowStepsCount?: number | null;
  draftWorkflowStepsCount?: number | null;
};

export function evaluateProcessingRoleMutationSafety(input: {
  code: string;
  usage: ProcessingRoleUsageCounts;
  action: "delete" | "deactivate" | "change_unit";
}): { allowed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (input.usage.queryFailures.length > 0) {
    reasons.push(
      `تعذر التحقق من الاستخدام: ${input.usage.queryFailures.join("، ")}.`,
    );
  }
  const steps = input.usage.workflowStepsCount ?? 0;
  const assignments = input.usage.assignmentsCount ?? 0;
  const positions = input.usage.positionMappingsCount ?? 0;

  if (input.action === "delete" || input.action === "change_unit") {
    if (steps > 0) reasons.push(`الدور مستخدم في ${steps} خطوة من دورات الحياة.`);
    if (assignments > 0) reasons.push(`الدور مرتبط بـ ${assignments} تكليف معالجة.`);
    if (positions > 0) reasons.push(`الدور مرتبط بـ ${positions} تعيين منصب.`);
  }

  if (input.action === "deactivate") {
    if (steps > 0) {
      const activeSteps = input.usage.activeWorkflowStepsCount ?? null;
      const draftSteps = input.usage.draftWorkflowStepsCount ?? null;
      if (activeSteps != null || draftSteps != null) {
        reasons.push(
          `لا يمكن تعطيل الدور «${input.code}» لأنه مستخدم في ${activeSteps ?? 0} خطوة دورة حياة نشطة و${draftSteps ?? 0} خطوة مسودة.`,
        );
      } else {
        reasons.push(
          `لا يمكن تعطيل الدور «${input.code}» لأنه مستخدم في ${steps} خطوة workflow (بما فيها المسودات).`,
        );
      }
    }
    if (assignments > 0) {
      reasons.push(`لا يمكن تعطيل الدور لوجود ${assignments} تكليف نشط/مسجّل.`);
    }
  }

  return { allowed: reasons.length === 0, reasons };
}
