/**
 * Parallel clearance contract foundation (P12).
 * Pure normalization/validation — no DB writes, no clearance execution.
 * Parallel members for file_withdrawal: finance, library, labs, student activities.
 */

import { normalizeStudentRequestTypeCode } from "@/lib/student-requests/request-type-registry";
import { getCanonicalWorkflowPreview } from "@/lib/student-requests/request-workflow-preview-registry";
import { APPROVED_WORKFLOW_ROLE_KEYS } from "@/lib/student-requests/request-workflow-save-contract";

export const CLEARANCE_STATUSES = [
  "pending",
  "in_review",
  "cleared",
  "blocked",
  "waived",
  "rejected",
  "unavailable",
] as const;

export type StudentRequestClearanceStatus = (typeof CLEARANCE_STATUSES)[number];

export type StudentRequestClearanceCapabilityReason =
  | "clearance_schema_unavailable"
  | "execution_disabled"
  | "ready_for_staging_execution";

export type StudentRequestClearanceCapability = {
  available: boolean;
  canValidate: boolean;
  canClearMember: boolean;
  canCompleteGroup: boolean;
  reason: StudentRequestClearanceCapabilityReason;
  messageAr: string;
};

export type StudentRequestClearanceValidationSeverity = "error" | "warning" | "info";

export type StudentRequestClearanceValidationIssue = {
  severity: StudentRequestClearanceValidationSeverity;
  code: string;
  messageAr: string;
  memberKey?: string;
};

export type ClearanceDryRunStatus =
  | "VALID"
  | "VALID_WITH_WARNINGS"
  | "INVALID"
  | "UNAUTHORIZED"
  | "EXECUTION_UNAVAILABLE"
  | "BLOCKED_BY_ROLE";

export type StudentRequestParallelClearanceMember = {
  memberKey: string;
  labelAr: string;
  roleKey: string;
  unitKey?: string | null;
  status: StudentRequestClearanceStatus;
  actedByUserId?: never;
  notes?: string | null;
};

export type StudentRequestParallelClearanceGroup = {
  requestId: string;
  requestTypeCode: string;
  groupKey: string;
  mode: "all_required";
  status: StudentRequestClearanceStatus;
  members: StudentRequestParallelClearanceMember[];
  /** Client must NOT close whole group in one action. */
  closedByUserId?: never;
};

export type StudentRequestClearanceMemberActionInput = {
  requestId: string;
  requestTypeCode: string;
  groupKey: string;
  memberKey: string;
  action: "clear" | "waive" | "reject" | "block";
  note?: string | null;
  actedByUserId?: never;
};

export type StudentRequestClearanceActorContext = {
  userId: string;
  appRoles: readonly string[];
  processingRoleKeys: readonly string[];
  isStaffInboxAuthorized: boolean;
  requestTypeCode: string | null;
  /** Member key the actor is acting on. */
  targetMemberKey: string | null;
  targetRoleKey: string | null;
};

export type StudentRequestClearanceDryRunResult = {
  status: ClearanceDryRunStatus;
  valid: boolean;
  capability: StudentRequestClearanceCapability;
  issues: StudentRequestClearanceValidationIssue[];
  summaryAr: string;
  groupComplete: boolean;
  normalized: StudentRequestParallelClearanceGroup | null;
  executed: false;
};

/** Expected parallel clearance members for file_withdrawal. */
export const FILE_WITHDRAWAL_CLEARANCE_MEMBERS: readonly Omit<
  StudentRequestParallelClearanceMember,
  "status" | "notes"
>[] = [
  {
    memberKey: "finance",
    labelAr: "المالية (تأكيد استلام المبلغ)",
    roleKey: "revenue_finance_officer",
    unitKey: "finance",
  },
  {
    memberKey: "library",
    labelAr: "المكتبة",
    roleKey: "library_officer",
    unitKey: "library",
  },
  {
    memberKey: "labs",
    labelAr: "المعامل",
    roleKey: "labs_manager",
    unitKey: "labs",
  },
  {
    memberKey: "activities",
    labelAr: "الأنشطة الطلابية",
    roleKey: "student_affairs",
    unitKey: "student_activities",
  },
] as const;

const APPROVED_ROLE_SET = new Set<string>(APPROVED_WORKFLOW_ROLE_KEYS);

const LABS_ROLE_ALTERNATIVES = new Set(["labs_manager", "lab_custodian"]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const CLEARANCE_EXECUTION_UNAVAILABLE_MSG =
  "تسجيل إخلاء الطرف يحتاج تطبيق مخطط طلبات الطلاب على بيئة آمنة أولاً.";

export const CLEARANCE_DRY_RUN_SUCCESS_MSG =
  "تم التحقق فقط. لم يتم تسجيل إخلاء طرف في قاعدة البيانات.";

function pushIssue(
  issues: StudentRequestClearanceValidationIssue[],
  issue: StudentRequestClearanceValidationIssue,
): void {
  issues.push(issue);
}

export function getParallelClearanceRequirementForRequestType(
  requestTypeCode: string | null | undefined,
): {
  parallelClearanceRequired: boolean;
  groupKey: string | null;
  expectedMemberCount: number;
} {
  const normalized = normalizeStudentRequestTypeCode(requestTypeCode);
  if (!normalized) {
    return { parallelClearanceRequired: false, groupKey: null, expectedMemberCount: 0 };
  }

  const preview = getCanonicalWorkflowPreview(normalized);
  const parallelSteps = preview?.steps.filter((s) => s.isParallel && s.parallelGroupId) ?? [];

  if (normalized === "file_withdrawal" || parallelSteps.length >= 2) {
    const groupKey = parallelSteps[0]?.parallelGroupId ?? "clearance";
    return {
      parallelClearanceRequired: true,
      groupKey,
      expectedMemberCount: normalized === "file_withdrawal" ? 4 : parallelSteps.length,
    };
  }

  return { parallelClearanceRequired: false, groupKey: null, expectedMemberCount: 0 };
}

export function buildDefaultClearanceGroup(
  requestId: string,
  requestTypeCode: string,
): StudentRequestParallelClearanceGroup | null {
  const req = getParallelClearanceRequirementForRequestType(requestTypeCode);
  if (!req.parallelClearanceRequired || !req.groupKey) return null;

  const normalized = normalizeStudentRequestTypeCode(requestTypeCode) ?? requestTypeCode;

  if (normalized === "file_withdrawal") {
    return {
      requestId,
      requestTypeCode: normalized,
      groupKey: req.groupKey,
      mode: "all_required",
      status: "pending",
      members: FILE_WITHDRAWAL_CLEARANCE_MEMBERS.map((m) => ({
        ...m,
        status: "pending" as const,
        notes: null,
      })),
    };
  }

  const preview = getCanonicalWorkflowPreview(normalized);
  const parallelSteps = preview?.steps.filter((s) => s.isParallel) ?? [];
  if (parallelSteps.length < 2) return null;

  return {
    requestId,
    requestTypeCode: normalized,
    groupKey: req.groupKey,
    mode: "all_required",
    status: "pending",
    members: parallelSteps.map((s) => ({
      memberKey: s.key,
      labelAr: s.labelAr,
      roleKey: s.roleKey ?? "unknown",
      unitKey: s.processingUnitCode ?? null,
      status: "pending" as const,
      notes: null,
    })),
  };
}

export function validateClearanceCapability(): StudentRequestClearanceCapability {
  return {
    available: false,
    canValidate: true,
    canClearMember: false,
    canCompleteGroup: false,
    reason: "clearance_schema_unavailable",
    messageAr: CLEARANCE_EXECUTION_UNAVAILABLE_MSG,
  };
}

export function normalizeParallelClearanceGroup(
  raw: Partial<StudentRequestParallelClearanceGroup> & { requestId: string },
): StudentRequestParallelClearanceGroup {
  const requestTypeCode =
    normalizeStudentRequestTypeCode(raw.requestTypeCode) ??
    (raw.requestTypeCode ?? "").trim();

  const members = (raw.members ?? []).map((m) => ({
    memberKey: m.memberKey.trim(),
    labelAr: m.labelAr.trim(),
    roleKey: m.roleKey.trim(),
    unitKey: m.unitKey?.trim() || null,
    status: m.status,
    notes: m.notes?.trim() || null,
  }));

  return {
    requestId: (raw.requestId ?? "").trim(),
    requestTypeCode,
    groupKey: (raw.groupKey ?? "clearance").trim(),
    mode: "all_required",
    status: raw.status ?? "pending",
    members,
  };
}

export function isParallelClearanceGroupComplete(
  group: StudentRequestParallelClearanceGroup,
): boolean {
  if (group.members.length === 0) return false;
  return group.members.every(
    (m) => m.status === "cleared" || m.status === "waived",
  );
}

export function validateParallelClearanceGroup(
  raw: Partial<StudentRequestParallelClearanceGroup> & { requestId: string },
  actor: StudentRequestClearanceActorContext,
): StudentRequestClearanceDryRunResult {
  const capability = validateClearanceCapability();
  const issues: StudentRequestClearanceValidationIssue[] = [];
  const normalized = normalizeParallelClearanceGroup(raw);

  if ("closedByUserId" in raw && (raw as { closedByUserId?: unknown }).closedByUserId != null) {
    pushIssue(issues, {
      severity: "error",
      code: "client_group_close_rejected",
      messageAr: "لا يمكن إغلاق المجموعة بالكامل من العميل — عضو واحد لكل إجراء.",
    });
  }

  if (!normalized.requestId || !UUID_RE.test(normalized.requestId)) {
    pushIssue(issues, {
      severity: "error",
      code: "invalid_request_id",
      messageAr: "requestId غير صالح.",
    });
  }

  if (normalized.members.length < 2) {
    pushIssue(issues, {
      severity: "error",
      code: "min_members",
      messageAr: "مجموعة إخلاء الطرف تحتاج عضوين على الأقل.",
    });
  }

  const memberKeys = new Set<string>();
  for (const m of normalized.members) {
    if (!m.memberKey) {
      pushIssue(issues, {
        severity: "error",
        code: "empty_member_key",
        messageAr: "memberKey فارغ.",
      });
      continue;
    }
    if (memberKeys.has(m.memberKey)) {
      pushIssue(issues, {
        severity: "error",
        code: "duplicate_member_key",
        messageAr: `memberKey مكرر: ${m.memberKey}`,
        memberKey: m.memberKey,
      });
    }
    memberKeys.add(m.memberKey);

    if (m.roleKey === "student_affairs" && m.memberKey.includes("activit")) {
      pushIssue(issues, {
        severity: "warning",
        code: "student_activities_role_gap",
        messageAr:
          "الأنشطة الطلابية — لا يوجد app_role مخصص؛ يُستخدم student_affairs كتسمية مؤقتة.",
        memberKey: m.memberKey,
      });
    }

    if (
      m.roleKey !== "student_affairs" &&
      !APPROVED_ROLE_SET.has(m.roleKey) &&
      !LABS_ROLE_ALTERNATIVES.has(m.roleKey)
    ) {
      pushIssue(issues, {
        severity: "error",
        code: "unapproved_member_role",
        messageAr: `دور العضو غير معتمد: ${m.roleKey}`,
        memberKey: m.memberKey,
      });
    }

    if (m.roleKey === "central_signatory") {
      pushIssue(issues, {
        severity: "error",
        code: "central_signatory_not_clearance_member",
        messageAr: "central_signatory ليس عضو إخلاء طرف — يأتي بعد اكتمال المجموعة.",
        memberKey: m.memberKey,
      });
    }
  }

  const req = getParallelClearanceRequirementForRequestType(normalized.requestTypeCode);
  if (req.parallelClearanceRequired && normalized.requestTypeCode === "file_withdrawal") {
    const expectedKeys = new Set(FILE_WITHDRAWAL_CLEARANCE_MEMBERS.map((m) => m.memberKey));
    for (const key of expectedKeys) {
      if (!memberKeys.has(key)) {
        pushIssue(issues, {
          severity: "error",
          code: "missing_required_member",
          messageAr: `عضو إلزامي مفقود: ${key}`,
          memberKey: key,
        });
      }
    }
  }

  if (!actor.isStaffInboxAuthorized) {
    pushIssue(issues, {
      severity: "error",
      code: "inbox_unauthorized",
      messageAr: "المستخدم غير مخول.",
    });
  }

  const groupComplete = isParallelClearanceGroupComplete(normalized);
  if (!groupComplete && normalized.status === "cleared") {
    pushIssue(issues, {
      severity: "error",
      code: "group_incomplete_marked_cleared",
      messageAr: "لا يمكن اعتبار المجموعة مكتملة — ليس جميع الأعضاء cleared/waived.",
    });
  }

  pushIssue(issues, {
    severity: "info",
    code: "registrar_after_clearance",
    messageAr: "لا انتقال إلى مسجل الكلية قبل اكتمال مجموعة إخلاء الطرف.",
  });

  return buildParallelClearanceDryRunResult(
    capability,
    issues,
    normalized,
    groupComplete,
  );
}

function roleMatchesMember(
  actor: StudentRequestClearanceActorContext,
  memberRoleKey: string,
): boolean {
  if (actor.appRoles.includes("admin") || actor.appRoles.includes("system_admin")) {
    return true;
  }
  if (actor.processingRoleKeys.includes(memberRoleKey)) return true;
  if (LABS_ROLE_ALTERNATIVES.has(memberRoleKey)) {
    return [...LABS_ROLE_ALTERNATIVES].some((r) => actor.processingRoleKeys.includes(r));
  }
  if (memberRoleKey === "student_affairs") {
    return (
      actor.processingRoleKeys.includes("student_affairs_manager") ||
      actor.processingRoleKeys.includes("student_affairs_specialist") ||
      actor.appRoles.includes("student_affairs")
    );
  }
  return false;
}

export function validateClearanceMemberAction(
  raw: Partial<StudentRequestClearanceMemberActionInput> & {
    requestId: string;
    action: string;
  },
  group: StudentRequestParallelClearanceGroup,
  actor: StudentRequestClearanceActorContext,
): StudentRequestClearanceDryRunResult {
  const capability = validateClearanceCapability();
  const issues: StudentRequestClearanceValidationIssue[] = [];

  if ("actedByUserId" in raw && (raw as { actedByUserId?: unknown }).actedByUserId != null) {
    pushIssue(issues, {
      severity: "error",
      code: "client_actor_rejected",
      messageAr: "هوية المُنفّذ لا تُقبل من العميل.",
    });
  }

  const memberKey = (raw.memberKey ?? "").trim();
  const action = (raw.action ?? "").trim().toLowerCase();
  const note = raw.note?.trim() || null;

  if (!memberKey) {
    pushIssue(issues, {
      severity: "error",
      code: "missing_member_key",
      messageAr: "memberKey مطلوب.",
    });
  }

  if (!["clear", "waive", "reject", "block"].includes(action)) {
    pushIssue(issues, {
      severity: "error",
      code: "invalid_action",
      messageAr: "إجراء إخلاء طرف غير معتمد.",
    });
  }

  if ((action === "reject" || action === "block") && !note) {
    pushIssue(issues, {
      severity: "error",
      code: "note_required",
      messageAr: "الرفض/الحظر يتطلب ملاحظة.",
    });
  }

  const member = group.members.find((m) => m.memberKey === memberKey);
  if (!member && memberKey) {
    pushIssue(issues, {
      severity: "error",
      code: "member_not_found",
      messageAr: `عضو غير موجود: ${memberKey}`,
      memberKey,
    });
  }

  if (!actor.isStaffInboxAuthorized) {
    pushIssue(issues, {
      severity: "error",
      code: "inbox_unauthorized",
      messageAr: "المستخدم غير مخول.",
    });
  } else if (member && !roleMatchesMember(actor, member.roleKey)) {
    pushIssue(issues, {
      severity: "error",
      code: "member_role_mismatch",
      messageAr: `الموظف غير مخول لعضو «${member.labelAr}» — إجراء role-scoped.`,
      memberKey: member.memberKey,
    });
  }

  pushIssue(issues, {
    severity: "info",
    code: "single_member_action",
    messageAr: "موظف واحد لا يغلق المجموعة بالكامل — إجراء على عضو واحد فقط.",
  });

  if (member?.roleKey === "student_affairs" && member.memberKey === "activities") {
    pushIssue(issues, {
      severity: "warning",
      code: "student_activities_role_gap",
      messageAr:
        "الأنشطة الطلابية — student_activities_role_gap؛ لا app_role جديد في P12.",
      memberKey: member.memberKey,
    });
  }

  const updatedMembers = group.members.map((m) => {
    if (m.memberKey !== memberKey) return m;
    let status: StudentRequestClearanceStatus = m.status;
    if (action === "clear") status = "cleared";
    else if (action === "waive") status = "waived";
    else if (action === "reject") status = "rejected";
    else if (action === "block") status = "blocked";
    return { ...m, status, notes: note ?? m.notes };
  });

  const simulatedGroup: StudentRequestParallelClearanceGroup = {
    ...group,
    members: updatedMembers,
    status: isParallelClearanceGroupComplete({ ...group, members: updatedMembers })
      ? "cleared"
      : group.status,
  };

  const groupComplete = isParallelClearanceGroupComplete(simulatedGroup);

  if (action === "clear" && !groupComplete) {
    pushIssue(issues, {
      severity: "info",
      code: "group_still_incomplete",
      messageAr: "عضو واحد cleared — المجموعة لا تزال غير مكتملة.",
      memberKey,
    });
  }

  return buildParallelClearanceDryRunResult(
    capability,
    issues,
    simulatedGroup,
    groupComplete,
  );
}

export function buildParallelClearanceDryRunResult(
  capability: StudentRequestClearanceCapability,
  issues: StudentRequestClearanceValidationIssue[],
  normalized: StudentRequestParallelClearanceGroup | null,
  groupComplete: boolean,
): StudentRequestClearanceDryRunResult {
  const hasErrors = issues.some((i) => i.severity === "error");
  const hasWarnings = issues.some((i) => i.severity === "warning");
  const unauthorized = issues.some((i) => i.code === "inbox_unauthorized");
  const blockedByRole = issues.some(
    (i) => i.code === "member_role_mismatch",
  );

  let status: ClearanceDryRunStatus;
  if (blockedByRole && hasErrors) {
    status = "BLOCKED_BY_ROLE";
  } else if (unauthorized && hasErrors) {
    status = "UNAUTHORIZED";
  } else if (hasErrors) {
    status = "INVALID";
  } else if (!capability.canClearMember) {
    status = hasWarnings ? "VALID_WITH_WARNINGS" : "EXECUTION_UNAVAILABLE";
  } else if (hasWarnings) {
    status = "VALID_WITH_WARNINGS";
  } else {
    status = "VALID";
  }

  let summaryAr: string;
  if (status === "UNAUTHORIZED" || status === "BLOCKED_BY_ROLE") {
    summaryAr = "غير مصرح — لا يمكن تنفيذ إخلاء الطرف.";
  } else if (status === "INVALID") {
    summaryAr = "إخلاء الطرف غير صالح — راجع الأخطاء.";
  } else {
    summaryAr = `${CLEARANCE_DRY_RUN_SUCCESS_MSG} ${capability.messageAr}`;
  }

  return {
    status,
    valid: !hasErrors && status !== "UNAUTHORIZED" && status !== "BLOCKED_BY_ROLE",
    capability,
    issues,
    summaryAr,
    groupComplete,
    normalized,
    executed: false,
  };
}

export type ClearanceScenarioResult = {
  id: number;
  name: string;
  expected: string;
  actual: ClearanceDryRunStatus;
  valid: boolean;
};

export function runParallelClearanceScenarioMatrix(): ClearanceScenarioResult[] {
  const requestId = "00000000-0000-4000-8000-000000000001";
  const baseGroup = buildDefaultClearanceGroup(requestId, "file_withdrawal")!;

  const financeActor: StudentRequestClearanceActorContext = {
    userId: "server-user",
    appRoles: [],
    processingRoleKeys: ["revenue_finance_officer"],
    isStaffInboxAuthorized: true,
    requestTypeCode: "file_withdrawal",
    targetMemberKey: "finance",
    targetRoleKey: "revenue_finance_officer",
  };

  const libraryActor: StudentRequestClearanceActorContext = {
    ...financeActor,
    processingRoleKeys: ["library_officer"],
    targetMemberKey: "library",
    targetRoleKey: "library_officer",
  };

  const unauthorizedActor: StudentRequestClearanceActorContext = {
    ...financeActor,
    processingRoleKeys: [],
    appRoles: ["dean"],
  };

  const groupActor: StudentRequestClearanceActorContext = {
    userId: "server",
    appRoles: ["admin"],
    processingRoleKeys: [],
    isStaffInboxAuthorized: true,
    requestTypeCode: "file_withdrawal",
    targetMemberKey: null,
    targetRoleKey: null,
  };

  const scenarios: Array<{
    id: number;
    name: string;
    expected: string;
    fn: () => StudentRequestClearanceDryRunResult;
  }> = [
    {
      id: 1,
      name: "مجموعة file_withdrawal صالحة",
      expected: "VALID_WITH_WARNINGS",
      fn: () => validateParallelClearanceGroup(baseGroup, groupActor),
    },
    {
      id: 2,
      name: "عضو واحد فقط — INVALID",
      expected: "INVALID",
      fn: () =>
        validateParallelClearanceGroup(
          { ...baseGroup, members: baseGroup.members.slice(0, 1) },
          groupActor,
        ),
    },
    {
      id: 3,
      name: "memberKey مكرر",
      expected: "INVALID",
      fn: () =>
        validateParallelClearanceGroup(
          {
            ...baseGroup,
            members: [baseGroup.members[0], { ...baseGroup.members[0] }],
          },
          groupActor,
        ),
    },
    {
      id: 4,
      name: "clear finance — role-scoped",
      expected: "EXECUTION_UNAVAILABLE",
      fn: () =>
        validateClearanceMemberAction(
          {
            requestId,
            requestTypeCode: "file_withdrawal",
            groupKey: "clearance",
            memberKey: "finance",
            action: "clear",
          },
          baseGroup,
          financeActor,
        ),
    },
    {
      id: 5,
      name: "clear library بواسطة finance — BLOCKED",
      expected: "BLOCKED_BY_ROLE",
      fn: () =>
        validateClearanceMemberAction(
          {
            requestId,
            requestTypeCode: "file_withdrawal",
            groupKey: "clearance",
            memberKey: "library",
            action: "clear",
          },
          baseGroup,
          financeActor,
        ),
    },
    {
      id: 6,
      name: "reject بلا ملاحظة",
      expected: "INVALID",
      fn: () =>
        validateClearanceMemberAction(
          {
            requestId,
            requestTypeCode: "file_withdrawal",
            groupKey: "clearance",
            memberKey: "library",
            action: "reject",
          },
          baseGroup,
          libraryActor,
        ),
    },
    {
      id: 7,
      name: "activities — role gap warning",
      expected: "VALID_WITH_WARNINGS",
      fn: () =>
        validateClearanceMemberAction(
          {
            requestId,
            requestTypeCode: "file_withdrawal",
            groupKey: "clearance",
            memberKey: "activities",
            action: "clear",
            note: "لا التزامات",
          },
          baseGroup,
          {
            ...financeActor,
            processingRoleKeys: ["student_affairs_manager"],
            targetMemberKey: "activities",
            targetRoleKey: "student_affairs",
          },
        ),
    },
    {
      id: 8,
      name: "مجموعة incomplete — registrar blocked",
      expected: "VALID_WITH_WARNINGS",
      fn: () => {
        const partial = {
          ...baseGroup,
          members: baseGroup.members.map((m, i) => ({
            ...m,
            status: (i === 0 ? "cleared" : "pending") as StudentRequestClearanceStatus,
          })),
        };
        return validateParallelClearanceGroup(partial, groupActor);
      },
    },
    {
      id: 9,
      name: "جميع الأعضاء cleared — group complete",
      expected: "VALID_WITH_WARNINGS",
      fn: () => {
        const complete = {
          ...baseGroup,
          members: baseGroup.members.map((m) => ({
            ...m,
            status: "cleared" as const,
          })),
          status: "cleared" as const,
        };
        return validateParallelClearanceGroup(complete, groupActor);
      },
    },
    {
      id: 10,
      name: "closedByUserId من العميل — INVALID",
      expected: "INVALID",
      fn: () =>
        validateParallelClearanceGroup(
          { ...baseGroup, closedByUserId: "bad" as never },
          groupActor,
        ),
    },
    {
      id: 11,
      name: "actor غير مخول",
      expected: "UNAUTHORIZED",
      fn: () =>
        validateParallelClearanceGroup(
          baseGroup,
          { ...groupActor, isStaffInboxAuthorized: false },
        ),
    },
    {
      id: 12,
      name: "waive عضو labs — lab_custodian",
      expected: "EXECUTION_UNAVAILABLE",
      fn: () =>
        validateClearanceMemberAction(
          {
            requestId,
            requestTypeCode: "file_withdrawal",
            groupKey: "clearance",
            memberKey: "labs",
            action: "waive",
            note: "لا التزامات معامل",
          },
          baseGroup,
          {
            ...financeActor,
            processingRoleKeys: ["lab_custodian"],
            targetMemberKey: "labs",
            targetRoleKey: "labs_manager",
          },
        ),
    },
  ];

  return scenarios.map((s) => {
    const result = s.fn();
    return {
      id: s.id,
      name: s.name,
      expected: s.expected,
      actual: result.status,
      valid: result.status === s.expected,
    };
  });
}
