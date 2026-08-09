/**
 * Graduate account continuity policy evaluator.
 *
 * Product decision CLOSED by:
 * `docs/alumni/ALUMNI-P0-ACCOUNT-CONTINUITY-CONTRACT-01.md` (D-AUTH-01..10 APPROVED).
 *
 * This module is a pure, non-mutating fail-closed evaluator:
 * - It never creates, merges, disables, or rebinds Auth users.
 * - It never grants capabilities from `app_role` or profile status alone.
 * - `ACCOUNT_CONTINUITY_POLICY_UNDECIDED` remains the safe default until an
 *   in-force approved policy is supplied by a later runtime/wiring mission.
 * - `ACCOUNT_CONTINUITY_POLICY_APPROVED_BASELINE` encodes the closed product
 *   content (sign-in allowed; university email reuse denied; allow-list per §6.1).
 */

export const GRADUATE_ACCOUNT_CAPABILITIES = [
  "portal_sign_in",
  "password_recovery",
  "university_email_reuse",
  "profile_self_service",
  "profile_self_service_non_academic",
  "request_audience_graduate",
  "request_audience_both_as_graduate",
  "official_document_download_issued_archived",
  "graduate_profile_self_service",
  "survey_participation",
  "graduate_survey_participation",
  "graduate_opportunity_view_eligible",
  "notification_receive_non_sensitive",
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

/** Fail-closed default until an in-force approved policy row/object is supplied. */
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

/**
 * Closed product baseline (D-AUTH-04..07). Not auto-applied at runtime —
 * callers/wiring missions must load an equivalent in-force policy with
 * real decidedBy/decidedAt/validFrom provenance before granting access.
 */
export const ACCOUNT_CONTINUITY_POLICY_APPROVED_BASELINE: AccountContinuityPolicy = {
  policyCode: "graduate-account-continuity",
  state: "approved",
  allowPortalSignIn: true,
  allowUniversityEmailReuse: false,
  allowedCapabilities: [
    "portal_sign_in",
    "password_recovery",
    "profile_self_service",
    "profile_self_service_non_academic",
    "request_audience_graduate",
    "request_audience_both_as_graduate",
    "official_document_download_issued_archived",
    "graduate_profile_self_service",
    "survey_participation",
    "graduate_survey_participation",
    "graduate_opportunity_view_eligible",
    "notification_receive_non_sensitive",
  ],
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
