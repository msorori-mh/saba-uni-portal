/**
 * Typed client for Graduates Affairs AUTH-04 RPC surface
 * (docs/migration-drafts/GRADUATES-AFFAIRS-AUTHORIZATION-04.sql).
 *
 * All writes and sensitive reads flow through SECURITY DEFINER RPCs.
 * This module never touches graduates-affairs tables directly.
 */

import { isApprovedAuth04Rpc } from "./runtime-gate";

export const GRADUATES_AFFAIRS_SERVICE_UPDATING_MSG =
  "خدمة شؤون الخريجين قيد التحديث حالياً. حاول لاحقاً.";

type RpcErrorLike = { message?: string; code?: string };

type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: RpcErrorLike | null }>;
};

export type GraduateAffairsRecordState = "pending" | "approved" | "corrected" | "revoked";

export type GraduateEmploymentStatus =
  | "employed"
  | "self_employed"
  | "seeking_work";

export type GraduateSpecializationRelationship =
  | "directly_related"
  | "partially_related"
  | "not_related";

export interface GraduateAffairsAssignableStaff {
  user_id: string;
  full_name: string;
  role_code: string;
}

export interface GraduateSelfConsent {
  id: string;
  purpose_code: string;
  notice_version: string;
  consent_state: "granted" | "withdrawn";
  affirmative_action_at: string;
  withdrawn_at: string | null;
}

export interface GraduateSurveyQuestion {
  key: string;
  kind: "single_choice" | "multi_choice" | "free_text" | "number";
  required?: boolean;
  options?: string[];
  maxLength?: number;
  label?: string;
}

export interface GraduateSelfSurvey {
  survey_version_id: string;
  survey_id: string;
  title: string;
  purpose_code: string;
  notice_version: string;
  questions: GraduateSurveyQuestion[];
  consent_id: string | null;
  already_responded: boolean;
}

export interface GraduateAffairsSearchRecord {
  id: string;
  program_id: string;
  department_id: string;
  graduation_year: number;
  record_state: GraduateAffairsRecordState;
}

export interface GraduateAffairsFileProjection {
  record: GraduateAffairsSearchRecord & { version: number };
  profile: Record<string, unknown> | null;
  counts: {
    employment_events: number;
    consents: number;
    followups: number;
  };
  contact_points: Array<{
    id: string;
    channel_type: string;
    purpose_code: string;
    is_verified: boolean;
    is_revoked: boolean;
  }>;
  followups: Array<{
    id: string;
    state: string;
    assignee_user_id: string;
    purpose_code: string;
    next_action_at: string | null;
    followup_type_id?: string | null;
    type_label_ar?: string | null;
    workflow_id?: string | null;
    workflow_version?: number | null;
    workflow_pinned_at?: string | null;
    workflow_pin_source?: string | null;
    states?: string[];
    transitions?: Array<{ from: string; to: string }>;
    terminal_states?: string[];
    require_outcome_on_complete?: boolean;
  }>;
}

export class GraduatesAffairsRpcError extends Error {
  readonly code: string;
  readonly unavailable: boolean;

  constructor(message: string, code = "", unavailable = false) {
    super(message);
    this.name = "GraduatesAffairsRpcError";
    this.code = code;
    this.unavailable = unavailable;
  }
}

export const ERROR_LABELS: Record<string, string> = {
  GRADUATE_AFFAIRS_NOT_AUTHENTICATED: "يجب تسجيل الدخول للمتابعة.",
  GRADUATE_AFFAIRS_ACCESS_DENIED: "ليس لديك صلاحية لتنفيذ هذا الإجراء.",
  GRADUATE_RECORD_NOT_CURRENT: "سجل الخريج غير معتمد أو غير سارٍ.",
  GRADUATE_PROFILE_FIELD_NOT_MUTABLE: "حقل الملف غير قابل للتعديل.",
  // Canonical SQL exception from graduate_update_own_profile.
  GRADUATE_PROFILE_VERSION_CONFLICT: "تم تحديث الملف من جهة أخرى. أعد المحاولة.",
  // Compatibility alias only — not emitted by AUTH-04 SQL; retained if older
  // client/server paths still surface this token in error text.
  GRADUATE_PROFILE_STALE_VERSION: "تم تحديث الملف من جهة أخرى. أعد المحاولة.",
};

export function isGraduatesAffairsRpcUnavailable(error: RpcErrorLike | null | undefined): boolean {
  if (!error) return false;
  const msg = error.message ?? "";
  const code = error.code ?? "";
  return (
    code === "42883" ||
    /function .* does not exist/i.test(msg) ||
    /could not find the function/i.test(msg) ||
    /schema cache/i.test(msg)
  );
}

export function mapGraduatesAffairsRpcError(error: RpcErrorLike): GraduatesAffairsRpcError {
  if (isGraduatesAffairsRpcUnavailable(error)) {
    return new GraduatesAffairsRpcError(
      GRADUATES_AFFAIRS_SERVICE_UPDATING_MSG,
      error.code ?? "",
      true,
    );
  }
  const msg = error.message ?? "";
  for (const [code, label] of Object.entries(ERROR_LABELS)) {
    if (msg.includes(code)) {
      return new GraduatesAffairsRpcError(label, code);
    }
  }
  return new GraduatesAffairsRpcError(msg || "حدث خطأ غير متوقع", error.code ?? "");
}

export class GraduatesAffairsRpcClient {
  constructor(private readonly client: RpcClient) {}

  private async call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    if (!isApprovedAuth04Rpc(fn)) {
      throw new GraduatesAffairsRpcError(
        "مسار التشغيل غير معتمد لشؤون الخريجين.",
        "graduates_affairs_rpc_not_approved",
      );
    }
    const { data, error } = await this.client.rpc(fn, args);
    if (error) throw mapGraduatesAffairsRpcError(error);
    return data as T;
  }

  updateOwnProfile(input: {
    graduateRecordId: string;
    publicDisplayName: string | null;
    preferredContactChannel: string | null;
    careerSummary: string | null;
    profileVisibility: string | null;
    rowVersion: number;
  }): Promise<unknown> {
    return this.call("graduate_update_own_profile", {
      p_graduate_record_id: input.graduateRecordId,
      p_public_display_name: input.publicDisplayName,
      p_preferred_contact_channel: input.preferredContactChannel,
      p_career_summary: input.careerSummary,
      p_profile_visibility: input.profileVisibility,
      p_expected_row_version: input.rowVersion,
    });
  }

  grantConsent(input: {
    graduateRecordId: string;
    purposeCode: string;
    noticeVersion: string;
  }): Promise<string> {
    return this.call("graduate_grant_consent", {
      p_graduate_record_id: input.graduateRecordId,
      p_purpose_code: input.purposeCode,
      p_notice_version: input.noticeVersion,
    });
  }

  withdrawConsent(consentId: string): Promise<void> {
    return this.call("graduate_withdraw_consent", {
      p_consent_id: consentId,
    });
  }

  addContactPoint(input: {
    graduateRecordId: string;
    channelType: string;
    value: string;
    purposeCode: string;
  }): Promise<string> {
    return this.call("graduate_add_contact_point", {
      p_graduate_record_id: input.graduateRecordId,
      p_channel_type: input.channelType,
      p_value: input.value,
      p_purpose_code: input.purposeCode,
    });
  }

  revokeContactPoint(contactPointId: string): Promise<void> {
    return this.call("graduate_revoke_contact_point", {
      p_contact_point_id: contactPointId,
    });
  }

  reportEmployment(input: {
    graduateRecordId: string;
    employmentStatus: GraduateEmploymentStatus;
    employerNameReported: string | null;
    occupationTitle: string | null;
    specializationRelationship: GraduateSpecializationRelationship;
    startedOn: string | null;
    endedOn: string | null;
  }): Promise<string> {
    return this.call("graduate_report_employment", {
      p_graduate_record_id: input.graduateRecordId,
      p_employment_status: input.employmentStatus,
      p_employer_name_reported: input.employerNameReported,
      p_occupation_title: input.occupationTitle,
      p_specialization_relationship: input.specializationRelationship,
      p_started_on: input.startedOn,
      p_ended_on: input.endedOn,
    });
  }

  submitSurveyResponse(input: {
    surveyVersionId: string;
    graduateRecordId: string;
    consentId: string;
    answers: Record<string, unknown>;
  }): Promise<string> {
    return this.call("graduate_submit_survey_response", {
      p_survey_version_id: input.surveyVersionId,
      p_graduate_record_id: input.graduateRecordId,
      p_consent_id: input.consentId,
      p_answers: input.answers,
    });
  }

  withdrawSurveyResponse(responseId: string): Promise<void> {
    return this.call("graduate_withdraw_survey_response", {
      p_response_id: responseId,
    });
  }

  registerForEvent(input: {
    eventId: string;
    graduateRecordId: string;
    consentId: string;
  }): Promise<string> {
    return this.call("graduate_register_for_event", {
      p_event_id: input.eventId,
      p_graduate_record_id: input.graduateRecordId,
      p_consent_id: input.consentId,
    });
  }

  cancelEventRegistration(registrationId: string): Promise<void> {
    return this.call("graduate_cancel_event_registration", {
      p_registration_id: registrationId,
    });
  }

  myContactPoints(graduateRecordId: string): Promise<unknown> {
    return this.call("graduate_my_contact_points", {
      p_graduate_record_id: graduateRecordId,
    });
  }

  myConsents(graduateRecordId: string): Promise<GraduateSelfConsent[]> {
    return this.call("graduate_my_consents", {
      p_graduate_record_id: graduateRecordId,
    });
  }

  listSelfSurveys(graduateRecordId: string): Promise<GraduateSelfSurvey[]> {
    return this.call("graduate_list_self_surveys", {
      p_graduate_record_id: graduateRecordId,
    });
  }

  listVisibleOpportunities(graduateRecordId: string): Promise<unknown> {
    return this.call("graduate_list_visible_opportunities", {
      p_graduate_record_id: graduateRecordId,
    });
  }

  listVisibleEvents(graduateRecordId: string): Promise<unknown> {
    return this.call("graduate_list_visible_events", {
      p_graduate_record_id: graduateRecordId,
    });
  }

  getGraduateFile(graduateRecordId: string): Promise<GraduateAffairsFileProjection | null> {
    return this.call("graduate_affairs_get_graduate_file", {
      p_graduate_record_id: graduateRecordId,
    });
  }

  listAssignableStaff(): Promise<GraduateAffairsAssignableStaff[]> {
    return this.call("graduate_affairs_list_assignable_staff", {});
  }

  listActiveFollowupTypes(): Promise<Array<{
    id: string;
    code: string;
    label_ar: string;
    description_ar: string | null;
  }>> {
    return this.call("graduate_affairs_list_active_followup_types", {});
  }

  searchRecords(input: {
    programId: string | null;
    departmentId: string | null;
    graduationYear: number | null;
    limit: number;
  }): Promise<GraduateAffairsSearchRecord[]> {
    return this.call("graduate_affairs_search_records", {
      p_program_id: input.programId,
      p_department_id: input.departmentId,
      p_graduation_year: input.graduationYear,
      p_limit: input.limit,
    });
  }

  cohortEmploymentReport(input: {
    programId: string;
    graduationYear: number;
    minimumCellSize: number | null;
  }): Promise<unknown> {
    return this.call("graduate_affairs_cohort_employment_report", {
      p_program_id: input.programId,
      p_graduation_year: input.graduationYear,
      p_minimum_cell_size: input.minimumCellSize,
    });
  }

  createFollowup(input: {
    graduateRecordId: string;
    assigneeUserId: string;
    followupTypeId: string;
    nextActionAt: string | null;
  }): Promise<string> {
    return this.call("graduate_affairs_create_followup", {
      p_graduate_record_id: input.graduateRecordId,
      p_assignee_user_id: input.assigneeUserId,
      p_followup_type_id: input.followupTypeId,
      p_next_action_at: input.nextActionAt,
    });
  }

  // --- GA-1/2/3 Admin RPCs ---

  adminListFollowupTypes(): Promise<unknown[]> {
    return this.call("ga_admin_list_followup_types", {});
  }

  adminSaveFollowupType(input: {
    id: string | null;
    code: string;
    labelAr: string;
    descriptionAr: string | null;
    isActive: boolean;
  }): Promise<string> {
    return this.call("ga_admin_save_followup_type", {
      p_id: input.id,
      p_code: input.code,
      p_label_ar: input.labelAr,
      p_description_ar: input.descriptionAr,
      p_is_active: input.isActive,
    });
  }

  adminListFollowupWorkflows(followupTypeId: string | null): Promise<unknown[]> {
    return this.call("ga_admin_list_followup_workflows", {
      p_followup_type_id: followupTypeId,
    });
  }

  adminSaveWorkflowDraft(payload: Record<string, unknown>): Promise<string> {
    return this.call("ga_admin_save_workflow_draft", {
      p_payload: payload,
    });
  }

  adminPublishWorkflow(workflowId: string): Promise<void> {
    return this.call("ga_admin_publish_workflow", {
      p_workflow_id: workflowId,
    });
  }


  transitionFollowup(input: {
    followupId: string;
    /** Configurable state — validated against the pinned workflow snapshot. */
    targetState: string;
    outcome: string | null;
    nextActionAt: string | null;
  }): Promise<void> {
    return this.call("graduate_affairs_transition_followup", {
      p_followup_id: input.followupId,
      p_target_state: input.targetState,
      p_outcome: input.outcome,
      p_next_action_at: input.nextActionAt,
    });
  }

  /**
   * Server-derived self context. Client may supply capability only;
   * ownership, lifecycle, and continuity are resolved for auth.uid().
   */
  resolveSelfContext(capability: string): Promise<{
    owns_graduate_record: boolean;
    graduate_record_id: string | null;
    graduate_record_state: string;
    continuity_allowed: boolean;
    capability: string;
  }> {
    return this.call("graduate_affairs_resolve_self_context", {
      p_capability: capability,
    });
  }

  /**
   * Server-derived staff record access. Client may supply record id only;
   * assignments, department scope, and follow-up authority are server-side.
   */
  resolveStaffRecordAccess(recordId: string): Promise<{
    allowed: boolean;
    via: string | null;
    reason: string | null;
  }> {
    return this.call("graduate_affairs_resolve_staff_record_access", {
      p_graduate_record_id: recordId,
    });
  }
}
