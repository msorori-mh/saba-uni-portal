/**
 * Non-destructive workflow save versioning policy (01A remediation).
 * Pure helpers documenting RPC rules for unit tests — no DB access.
 */

export type WorkflowVersionFingerprintStep = {
  step_key: string;
  step_order: number;
  action_type: string;
  processing_unit_id: string | null;
  processing_role_id: string | null;
};

export type WorkflowVersionFingerprintTransition = {
  from_step_key: string | null;
  to_step_key: string | null;
  action_result: string;
  is_default: boolean;
};

export type WorkflowVersionFingerprint = {
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

export function normalizeWorkflowVersionFingerprint(
  fp: WorkflowVersionFingerprint,
): WorkflowVersionFingerprint {
  const steps = [...fp.steps]
    .map((s) => ({
      step_key: s.step_key.trim(),
      step_order: s.step_order,
      action_type: (s.action_type || "review").trim(),
      processing_unit_id: s.processing_unit_id || null,
      processing_role_id: s.processing_role_id || null,
    }))
    .sort((a, b) => a.step_order - b.step_order);

  const transitions = [...fp.transitions]
    .map((t) => ({
      from_step_key: t.from_step_key || null,
      to_step_key: t.to_step_key || null,
      action_result: (t.action_result || "approve").trim(),
      is_default: Boolean(t.is_default),
    }))
    .sort((a, b) => {
      const fk = `${a.from_step_key ?? ""}\0${a.to_step_key ?? ""}\0${a.action_result}`;
      const tk = `${b.from_step_key ?? ""}\0${b.to_step_key ?? ""}\0${b.action_result}`;
      return fk.localeCompare(tk);
    });

  return { steps, transitions };
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
