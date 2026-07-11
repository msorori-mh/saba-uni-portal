/**
 * Non-destructive workflow save versioning policy (01A remediation round 2).
 * Pure helpers documenting RPC fingerprint rules for unit tests — no DB access.
 */

export type WorkflowVersionFingerprintStep = {
  step_key: string;
  step_name_ar: string;
  step_order: number;
  processing_unit_id: string | null;
  processing_role_id: string | null;
  action_type: string;
  is_required: boolean;
  visible_to_student: boolean;
  notify_on_enter: boolean;
  notify_on_complete: boolean;
  can_return_to_student: boolean;
  can_reject: boolean;
  can_skip: boolean;
  requires_payment: boolean;
  produces_document: boolean;
  assignment_strategy: string;
};

export type WorkflowVersionFingerprintTransition = {
  from_step_key: string | null;
  to_step_key: string | null;
  action_result: string;
  label_ar: string | null;
  is_default: boolean;
  condition_config: Record<string, unknown>;
};

export type WorkflowVersionFingerprintMeta = {
  code: string;
  name_ar: string;
  name_en: string;
  description_ar: string;
};

export type WorkflowVersionFingerprint = {
  workflow: WorkflowVersionFingerprintMeta;
  steps: WorkflowVersionFingerprintStep[];
  transitions: WorkflowVersionFingerprintTransition[];
};

/** Role must belong to unit when both are present (mirrors SQL EXISTS check). */
export function isProcessingRoleUnitCompatible(
  roleUnitId: string | null | undefined,
  stepUnitId: string | null | undefined,
): boolean {
  if (!roleUnitId || !stepUnitId) return true;
  return roleUnitId === stepUnitId;
}

export function validateDraftRoleUnitPairs(
  steps: Array<{
    step_key: string;
    processing_unit_id: string | null;
    processing_role_id: string | null;
    role_unit_id?: string | null;
  }>,
): { valid: boolean; mismatches: string[] } {
  const mismatches: string[] = [];
  for (const step of steps) {
    if (!step.processing_role_id || !step.processing_unit_id) continue;
    if (step.role_unit_id == null) continue;
    if (!isProcessingRoleUnitCompatible(step.role_unit_id, step.processing_unit_id)) {
      mismatches.push(step.step_key);
    }
  }
  return { valid: mismatches.length === 0, mismatches };
}

function normalizeConditionConfig(
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

export function normalizeWorkflowVersionFingerprint(
  fp: WorkflowVersionFingerprint,
): WorkflowVersionFingerprint {
  const workflow: WorkflowVersionFingerprintMeta = {
    code: (fp.workflow?.code ?? "").trim(),
    name_ar: (fp.workflow?.name_ar ?? "").trim(),
    name_en: (fp.workflow?.name_en ?? "").trim(),
    description_ar: (fp.workflow?.description_ar ?? "").trim(),
  };

  const steps = [...fp.steps]
    .map((s) => {
      const actionType = (s.action_type || "review").trim();
      return {
        step_key: s.step_key.trim(),
        step_name_ar: (s.step_name_ar || s.step_key).trim(),
        step_order: s.step_order,
        processing_unit_id: s.processing_unit_id || null,
        processing_role_id: s.processing_role_id || null,
        action_type: actionType,
        is_required: s.is_required !== false,
        visible_to_student: s.visible_to_student !== false,
        notify_on_enter: s.notify_on_enter !== false,
        notify_on_complete: s.notify_on_complete !== false,
        can_return_to_student: s.can_return_to_student !== false,
        can_reject: s.can_reject !== false,
        can_skip: Boolean(s.can_skip),
        requires_payment:
          s.requires_payment === true ||
          actionType === "request_payment" ||
          actionType === "assess_fee",
        produces_document: s.produces_document === true || actionType === "issue_document",
        assignment_strategy: (s.assignment_strategy || "role_pool").trim() || "role_pool",
      };
    })
    .sort((a, b) => a.step_order - b.step_order);

  const transitions = [...fp.transitions]
    .map((t) => ({
      from_step_key: t.from_step_key || null,
      to_step_key: t.to_step_key || null,
      action_result: (t.action_result || "approve").trim(),
      label_ar: t.label_ar?.trim() ? t.label_ar.trim() : null,
      is_default: Boolean(t.is_default),
      condition_config: normalizeConditionConfig(t.condition_config),
    }))
    .sort((a, b) => {
      const fk = `${a.from_step_key ?? ""}\0${a.to_step_key ?? ""}\0${a.action_result}`;
      const tk = `${b.from_step_key ?? ""}\0${b.to_step_key ?? ""}\0${b.action_result}`;
      return fk.localeCompare(tk);
    });

  return { workflow, steps, transitions };
}

export function fingerprintsEqual(
  a: WorkflowVersionFingerprint,
  b: WorkflowVersionFingerprint,
): boolean {
  return (
    JSON.stringify(normalizeWorkflowVersionFingerprint(a)) ===
    JSON.stringify(normalizeWorkflowVersionFingerprint(b))
  );
}

/**
 * Decide whether save should reuse an identical latest draft or create a new version.
 * Never mutates an existing workflow's steps/transitions in place.
 */
export function decideWorkflowSaveVersionAction(input: {
  latestDraftFingerprint: WorkflowVersionFingerprint | null;
  payloadFingerprint: WorkflowVersionFingerprint;
  activate: boolean;
}): {
  action: "reuse_draft" | "create_new_version";
  willActivate: boolean;
  mutatesExistingSteps: false;
} {
  const identical =
    input.latestDraftFingerprint != null &&
    fingerprintsEqual(input.latestDraftFingerprint, input.payloadFingerprint);

  return {
    action: identical ? "reuse_draft" : "create_new_version",
    willActivate: input.activate,
    mutatesExistingSteps: false,
  };
}

/** Activation retires previous active then activates the target version. */
export function describeActivationSideEffects(): {
  retirePreviousActive: true;
  setTargetActive: true;
  atMostOneActivePerRequestType: true;
} {
  return {
    retirePreviousActive: true,
    setTargetActive: true,
    atMostOneActivePerRequestType: true,
  };
}

/** Minimal fingerprint factory for tests. */
export function buildMinimalWorkflowFingerprint(
  overrides?: Partial<{
    workflow: Partial<WorkflowVersionFingerprintMeta>;
    step: Partial<WorkflowVersionFingerprintStep>;
    transition: Partial<WorkflowVersionFingerprintTransition> | null;
  }>,
): WorkflowVersionFingerprint {
  const step: WorkflowVersionFingerprintStep = {
    step_key: "a",
    step_name_ar: "خطوة أ",
    step_order: 1,
    action_type: "review",
    processing_unit_id: null,
    processing_role_id: null,
    is_required: true,
    visible_to_student: true,
    notify_on_enter: true,
    notify_on_complete: true,
    can_return_to_student: true,
    can_reject: true,
    can_skip: false,
    requires_payment: false,
    produces_document: false,
    assignment_strategy: "role_pool",
    ...overrides?.step,
  };

  const transitions: WorkflowVersionFingerprintTransition[] =
    overrides?.transition === null
      ? []
      : [
          {
            from_step_key: null,
            to_step_key: "a",
            action_result: "submit",
            label_ar: "تقديم",
            is_default: true,
            condition_config: {},
            ...(overrides?.transition ?? {}),
          },
        ];

  return {
    workflow: {
      code: "enrollment_certificate",
      name_ar: "إفادة قيد",
      name_en: "Enrollment certificate",
      description_ar: "",
      ...overrides?.workflow,
    },
    steps: [step],
    transitions,
  };
}
