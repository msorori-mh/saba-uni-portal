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

  myContactPoints(graduateRecordId: string): Promise<unknown> {
    return this.call("graduate_my_contact_points", {
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
