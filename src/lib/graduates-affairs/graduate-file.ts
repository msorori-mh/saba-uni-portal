import {
  evaluateGraduateRecordReadiness,
  type GraduationDecisionState,
  type GraduateConsent,
  type OfficialGraduationDecision,
} from "./foundation";
import { listActiveConsentPurposes, type GraduateConsentPurpose } from "./consents";
import {
  resolveCurrentEmploymentStatus,
  type GraduateEmploymentEvent,
} from "./employment";
import type { GraduateContactPointView, GraduateFollowUp } from "./communications";

/**
 * The comprehensive graduate file: one consistent, fail-closed view over the
 * graduate record and every purpose-scoped fact attached to it.
 *
 * A file can be assembled only for a record that satisfies the official
 * graduation decision gate (foundation), and every attached part must belong
 * to that record. Contact point values stay protected — the file carries
 * channel/purpose/verification state, never the raw value.
 */

export interface GraduateRecordView {
  recordId: string;
  officialDecisionId: string;
  studentProfileId: string;
  effectiveGraduationDate: string;
  programId: string;
  departmentId: string;
  recordState: GraduationDecisionState;
  version: number;
}

export type GraduateProfileVisibility = "private" | "graduates_affairs" | "public_opt_in";

export interface GraduateProfileView {
  graduateRecordId: string;
  publicDisplayName: string | null;
  preferredContactChannel: "email" | "phone" | "none" | null;
  careerSummary: string | null;
  visibility: GraduateProfileVisibility;
}

export interface GraduateFile {
  record: GraduateRecordView;
  profile: GraduateProfileView | null;
  contactPoints: readonly GraduateContactPointView[];
  consents: readonly GraduateConsent[];
  employmentEvents: readonly GraduateEmploymentEvent[];
  followUps: readonly GraduateFollowUp[];
}

export type GraduateFileAssembly = { ok: true; file: GraduateFile } | { ok: false; reason: string };

/**
 * Assembles the graduate file fail-closed: the official decision must pass
 * the foundation gate and the record must match it exactly (same rule as the
 * SQL guard GRADUATE_RECORD_MUST_MATCH_OFFICIAL_DECISION). Any part pointing
 * at a different record rejects the whole file.
 */
export function buildGraduateFile(input: {
  decision: OfficialGraduationDecision;
  record: GraduateRecordView;
  profile: GraduateProfileView | null;
  contactPoints: readonly GraduateContactPointView[];
  consents: readonly GraduateConsent[];
  employmentEvents: readonly GraduateEmploymentEvent[];
  followUps: readonly GraduateFollowUp[];
}): GraduateFileAssembly {
  const readiness = evaluateGraduateRecordReadiness(input.decision);
  if (!readiness.ok) {
    return { ok: false, reason: readiness.reason };
  }
  const { record, decision } = input;
  if (record.officialDecisionId !== decision.decisionId) {
    return { ok: false, reason: "record_decision_mismatch" };
  }
  if (
    record.studentProfileId !== decision.studentProfileId ||
    record.effectiveGraduationDate !== decision.effectiveGraduationDate ||
    record.programId !== decision.programId ||
    record.departmentId !== decision.departmentId
  ) {
    return { ok: false, reason: "record_fact_mismatch_official_decision" };
  }
  if (input.profile !== null && input.profile.graduateRecordId !== record.recordId) {
    return { ok: false, reason: "profile_record_mismatch" };
  }
  if (input.contactPoints.some((point) => point.graduateRecordId !== record.recordId)) {
    return { ok: false, reason: "contact_point_record_mismatch" };
  }
  if (input.employmentEvents.some((event) => event.graduateRecordId !== record.recordId)) {
    return { ok: false, reason: "employment_event_record_mismatch" };
  }
  if (input.followUps.some((followUp) => followUp.graduateRecordId !== record.recordId)) {
    return { ok: false, reason: "followup_record_mismatch" };
  }
  return {
    ok: true,
    file: {
      record,
      profile: input.profile,
      contactPoints: input.contactPoints,
      consents: input.consents,
      employmentEvents: input.employmentEvents,
      followUps: input.followUps,
    },
  };
}

export interface GraduateFileSummary {
  recordState: GraduationDecisionState;
  version: number;
  hasProfile: boolean;
  profileVisibility: GraduateProfileVisibility | null;
  usableContactChannels: readonly ("email" | "phone")[];
  activeConsentPurposes: readonly GraduateConsentPurpose[];
  currentEmploymentStatus: GraduateEmploymentEvent["status"] | null;
  currentEmploymentVerified: boolean;
  openFollowUps: number;
}

/** Aggregate, non-identifying summary used by staff UI cards and reports. */
export function summarizeGraduateFile(file: GraduateFile): GraduateFileSummary {
  const usableChannels = [
    ...new Set(
      file.contactPoints
        .filter((point) => point.verified && !point.revoked)
        .map((point) => point.channelType),
    ),
  ].toSorted();
  const currentEmployment = resolveCurrentEmploymentStatus(
    file.record.recordId,
    file.employmentEvents,
  );
  return {
    recordState: file.record.recordState,
    version: file.record.version,
    hasProfile: file.profile !== null,
    profileVisibility: file.profile?.visibility ?? null,
    usableContactChannels: usableChannels,
    activeConsentPurposes: listActiveConsentPurposes(file.consents),
    currentEmploymentStatus: currentEmployment?.status ?? null,
    currentEmploymentVerified: currentEmployment?.verificationState === "verified",
    openFollowUps: file.followUps.filter(
      (followUp) => followUp.state === "open" || followUp.state === "in_progress",
    ).length,
  };
}
