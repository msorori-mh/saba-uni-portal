/**
 * D-13 — Graduate account continuity policy (NEEDS_USER_INPUT).
 *
 * The product decision for post-graduation account continuity is still open.
 * This module therefore ships a configurable, fail-closed contract instead of
 * a hard-coded behavior:
 *
 * - The default policy is `undecided`, which denies every capability.
 * - Nothing here creates, extends, or revokes any account; it only evaluates
 *   whether a requested capability is allowed by an explicitly approved and
 *   in-force policy.
 * - The graduate record source itself never depends on this evaluation, so
 *   the unresolved decision does not block the registry (source stays open,
 *   account continuity stays closed).
 */

export const GRADUATE_ACCOUNT_CAPABILITIES = [
  "portal_sign_in",
  "university_email_reuse",
  "profile_self_service",
  "survey_participation",
] as const;

export type GraduateAccountCapability = (typeof GRADUATE_ACCOUNT_CAPABILITIES)[number];

export type AccountContinuityPolicyState = "undecided" | "approved" | "rejected";

export interface AccountContinuityPolicy {
  policyCode: string;
  state: AccountContinuityPolicyState;
  allowPortalSignIn: boolean;
  allowUniversityEmailReuse: boolean;
  allowedCapabilities: readonly GraduateAccountCapability[];
  validFrom: string | null;
  expiresAt: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
}

/** Fail-closed default while D-13 awaits a product decision. */
export const ACCOUNT_CONTINUITY_POLICY_UNDECIDED: AccountContinuityPolicy = {
  policyCode: "graduate-account-continuity",
  state: "undecided",
  allowPortalSignIn: false,
  allowUniversityEmailReuse: false,
  allowedCapabilities: [],
  validFrom: null,
  expiresAt: null,
  decidedBy: null,
  decidedAt: null,
};

export type AccountContinuityEvaluation = { ok: true } | { ok: false; reason: string };

function isFiniteTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

/**
 * Pure, non-mutating evaluation. Fails closed on every ambiguity: undecided,
 * rejected, or unrecognized policy state, missing decision provenance, policy
 * outside its validity window, or a capability that is not explicitly listed
 * (with the sensitive portal sign-in and email-reuse capabilities additionally
 * requiring their dedicated flags).
 */
export function evaluateAccountContinuityAccess(
  policy: AccountContinuityPolicy,
  capability: GraduateAccountCapability,
  at: string,
): AccountContinuityEvaluation {
  if (!isFiniteTimestamp(at)) {
    return { ok: false, reason: "invalid_evaluation_timestamp" };
  }
  if (policy.state === "undecided") {
    return { ok: false, reason: "account_continuity_policy_undecided" };
  }
  if (policy.state === "rejected") {
    return { ok: false, reason: "account_continuity_policy_rejected" };
  }
  if (policy.state !== "approved") {
    return { ok: false, reason: "account_continuity_policy_unknown_state" };
  }
  if (!policy.decidedBy || !policy.decidedAt || !isFiniteTimestamp(policy.decidedAt)) {
    return { ok: false, reason: "missing_policy_decision_provenance" };
  }
  const atTime = Date.parse(at);
  if (policy.validFrom !== null) {
    if (!isFiniteTimestamp(policy.validFrom) || Date.parse(policy.validFrom) > atTime) {
      return { ok: false, reason: "account_continuity_policy_not_in_force" };
    }
  }
  if (policy.expiresAt !== null) {
    if (!isFiniteTimestamp(policy.expiresAt) || Date.parse(policy.expiresAt) <= atTime) {
      return { ok: false, reason: "account_continuity_policy_not_in_force" };
    }
  }
  if (!policy.allowedCapabilities.includes(capability)) {
    return { ok: false, reason: "account_continuity_capability_not_allowed" };
  }
  if (capability === "portal_sign_in" && !policy.allowPortalSignIn) {
    return { ok: false, reason: "account_continuity_capability_not_allowed" };
  }
  if (capability === "university_email_reuse" && !policy.allowUniversityEmailReuse) {
    return { ok: false, reason: "account_continuity_capability_not_allowed" };
  }
  return { ok: true };
}
