import { hasActivePurposeConsent, type GraduateConsent } from "./foundation";
import { isGraduateConsentPurpose } from "./consents";

/**
 * Graduate communication and staff follow-up contracts.
 *
 * Communication is purpose-scoped and consent-gated: a message may be drafted
 * only for a purpose with an active matching consent, through a verified,
 * non-revoked contact point registered for the same purpose. The UI never
 * decides authorization; these evaluators mirror the SQL guards
 * (`GRADUATE_COMMUNICATION_CONSENT_REQUIRED`, `GRADUATE_CONTACT_POINT_NOT_USABLE`).
 */

export type CommunicationChannel = "email" | "phone";

export interface GraduateContactPointView {
  contactPointId: string;
  graduateRecordId: string;
  channelType: CommunicationChannel;
  purposeCode: string;
  verified: boolean;
  revoked: boolean;
}

export interface GraduateCommunicationRequest {
  graduateRecordId: string;
  purposeCode: string;
  noticeVersion: string;
  channel: CommunicationChannel;
  contactPointId: string;
  templateCode: string;
}

export type CommunicationEligibility = { ok: true } | { ok: false; reason: string };

export function evaluateCommunicationEligibility(input: {
  request: GraduateCommunicationRequest;
  consents: readonly GraduateConsent[];
  contactPoints: readonly GraduateContactPointView[];
}): CommunicationEligibility {
  const { request, consents, contactPoints } = input;
  if (!isGraduateConsentPurpose(request.purposeCode)) {
    return { ok: false, reason: "unknown_communication_purpose" };
  }
  if (!request.noticeVersion.trim()) {
    return { ok: false, reason: "missing_notice_version" };
  }
  if (!request.templateCode.trim()) {
    return { ok: false, reason: "missing_communication_template" };
  }
  const contactPoint = contactPoints.find(
    (point) => point.contactPointId === request.contactPointId,
  );
  if (!contactPoint || contactPoint.graduateRecordId !== request.graduateRecordId) {
    return { ok: false, reason: "unknown_contact_point" };
  }
  if (contactPoint.channelType !== request.channel) {
    return { ok: false, reason: "contact_point_channel_mismatch" };
  }
  if (contactPoint.purposeCode !== request.purposeCode) {
    return { ok: false, reason: "contact_point_purpose_mismatch" };
  }
  if (contactPoint.revoked) {
    return { ok: false, reason: "contact_point_revoked" };
  }
  if (!contactPoint.verified) {
    return { ok: false, reason: "contact_point_not_verified" };
  }
  if (!hasActivePurposeConsent(consents, request.purposeCode, request.noticeVersion)) {
    return { ok: false, reason: "missing_active_purpose_consent" };
  }
  return { ok: true };
}

import {
  canTransitionFollowup as canTransitionFollowUp,
  type FollowupState as FollowUpState,
} from "./authorization";

/** Canonical follow-up lifecycle — re-exported from authorization (no local duplicate). */
export type { FollowUpState };
export { canTransitionFollowUp };

export interface GraduateFollowUp {
  followUpId: string;
  graduateRecordId: string;
  assigneeUserId: string;
  purposeCode: string;
  state: FollowUpState;
  nextActionAt: string | null;
}

export type FollowUpAssignmentCheck = { ok: true } | { ok: false; reason: string };

/**
 * Mirrors the partial unique index in the SQL draft: at most one active
 * (non-terminal) follow-up assignment per graduate record.
 */
export function assertSingleActiveFollowUp(
  followUps: readonly GraduateFollowUp[],
): FollowUpAssignmentCheck {
  const activeByGraduate = new Map<string, string>();
  for (const followUp of followUps) {
    if (followUp.state === "completed" || followUp.state === "cancelled") {
      continue;
    }
    const existing = activeByGraduate.get(followUp.graduateRecordId);
    if (existing !== undefined && existing !== followUp.followUpId) {
      return { ok: false, reason: "multiple_active_followups_for_graduate" };
    }
    activeByGraduate.set(followUp.graduateRecordId, followUp.followUpId);
  }
  return { ok: true };
}
