import {
  hasActivePurposeConsent,
  type ConsentState,
  type GraduateConsent,
} from "./foundation";

/**
 * Purpose registry for graduate consents. Every purpose-scoped guard in the
 * SQL draft (surveys, events, communications) binds consent by
 * (purpose_code, notice_version); the registry keeps source and draft aligned.
 */
export const GRADUATE_CONSENT_PURPOSES = [
  "career_followup",
  "communications",
  "surveys",
  "events",
  "employment_quality",
] as const;

export type GraduateConsentPurpose = (typeof GRADUATE_CONSENT_PURPOSES)[number];

export function isGraduateConsentPurpose(purposeCode: string): purposeCode is GraduateConsentPurpose {
  return (GRADUATE_CONSENT_PURPOSES as readonly string[]).includes(purposeCode);
}

export type ResolvedConsentState = "active" | "withdrawn" | "never_granted";

/**
 * Resolves the current consent state for one purpose/version pair. Mirrors
 * the SQL consent guards: only the latest event for the exact pair decides,
 * and malformed timestamps fail closed to `withdrawn`.
 */
export function resolveConsentState(
  consents: readonly GraduateConsent[],
  purposeCode: string,
  noticeVersion: string,
): ResolvedConsentState {
  const matching = consents.filter(
    (consent) => consent.purposeCode === purposeCode && consent.noticeVersion === noticeVersion,
  );
  if (matching.length === 0) {
    return "never_granted";
  }
  return hasActivePurposeConsent(consents, purposeCode, noticeVersion) ? "active" : "withdrawn";
}

export function listActiveConsentPurposes(
  consents: readonly GraduateConsent[],
): GraduateConsentPurpose[] {
  const pairs = new Set<string>();
  for (const consent of consents) {
    if (
      isGraduateConsentPurpose(consent.purposeCode) &&
      hasActivePurposeConsent(consents, consent.purposeCode, consent.noticeVersion)
    ) {
      pairs.add(consent.purposeCode);
    }
  }
  return GRADUATE_CONSENT_PURPOSES.filter((purpose) => pairs.has(purpose));
}

export type ConsentIntent =
  | { action: "grant"; purposeCode: string; noticeVersion: string; at: string }
  | { action: "withdraw"; purposeCode: string; noticeVersion: string; at: string };

export type ConsentTransition =
  | { ok: true; event: GraduateConsent }
  | { ok: false; reason: string };

/**
 * Builds the next consent event for a purpose/version pair without mutating
 * prior history. Withdrawal is prospective-only and never rewrites a granted
 * row, matching the append-style consent ledger in the SQL draft.
 */
export function buildConsentTransition(
  existing: readonly GraduateConsent[],
  intent: ConsentIntent,
): ConsentTransition {
  if (!isGraduateConsentPurpose(intent.purposeCode)) {
    return { ok: false, reason: "unknown_consent_purpose" };
  }
  if (!intent.noticeVersion.trim()) {
    return { ok: false, reason: "missing_notice_version" };
  }
  if (!Number.isFinite(Date.parse(intent.at))) {
    return { ok: false, reason: "invalid_consent_timestamp" };
  }
  const state = resolveConsentState(existing, intent.purposeCode, intent.noticeVersion);
  if (intent.action === "grant") {
    if (state === "active") {
      return { ok: false, reason: "consent_already_active" };
    }
    const event: GraduateConsent = {
      purposeCode: intent.purposeCode,
      noticeVersion: intent.noticeVersion,
      state: "granted" satisfies ConsentState,
      grantedAt: intent.at,
      withdrawnAt: null,
    };
    return { ok: true, event };
  }
  if (state !== "active") {
    return { ok: false, reason: "no_active_consent_to_withdraw" };
  }
  const event: GraduateConsent = {
    purposeCode: intent.purposeCode,
    noticeVersion: intent.noticeVersion,
    state: "withdrawn" satisfies ConsentState,
    grantedAt: intent.at,
    withdrawnAt: intent.at,
  };
  return { ok: true, event };
}
