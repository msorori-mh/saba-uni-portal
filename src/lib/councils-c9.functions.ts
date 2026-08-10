// C9 server functions: notifications, reports, dashboards, responsible actor workspace.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const councilIdSchema = z.string().uuid("معرّف المجلس غير صالح");

function mapCouncilError(error: { code?: string; message: string }): string {
  const msg = (error.message || "").toLowerCase();
  if (error.code === "42883" || msg.includes("does not exist")) {
    return "لوحة متابعة المجلس غير مكوّنة حالياً في النظام.";
  }
  if (
    error.code === "42501" ||
    msg.includes("council_access_denied") ||
    msg.includes("council_chair_authority_required") ||
    msg.includes("council_secretary_authority_required") ||
    msg.includes("permission") ||
    msg.includes("policy") ||
    msg.includes("row-level security")
  ) {
    return "عفواً، لا تملك الصلاحية الكافية للوصول إلى هذا المحتوى وفق دورك المعتمد في المجلس.";
  }
  if (msg.includes("jwt") || msg.includes("auth") || msg.includes("session")) {
    return "انتهت جلسة تسجيل الدخول، يرجى تسجيل الدخول مرة أخرى.";
  }
  return error.message || "تعذر تنفيذ العملية.";
}

// -----------------------------------------------------------------------------
// NOTIFICATIONS
// -----------------------------------------------------------------------------

export const getMyCouncilNotificationsFn = createServerFn({ method: "GET" })
  .validator((d: { limit?: number }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("get_my_council_notifications", {
      p_limit: data.limit ?? 50,
    });
    if (error) throw new Error(mapCouncilError(error));
    return (res as { notifications: unknown[]; unread_count: number }) ?? { notifications: [], unread_count: 0 };
  });

export const acknowledgeCouncilNotificationFn = createServerFn({ method: "POST" })
  .validator((d: { notification_id: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("acknowledge_council_notification", {
      p_notification_id: data.notification_id,
    });
    if (error) throw new Error(mapCouncilError(error));
    return res;
  });

// -----------------------------------------------------------------------------
// REPORTS
// -----------------------------------------------------------------------------

export const getCouncilReportMeetingsByPeriodFn = createServerFn({ method: "GET" })
  .validator((d: { council_id: string; from?: string | null; to?: string | null }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("get_council_report_meetings_by_period", {
      p_council_id: data.council_id,
      p_from: data.from ?? null,
      p_to: data.to ?? null,
    });
    if (error) throw new Error(mapCouncilError(error));
    return res;
  });

export const getCouncilReportAttendanceRateFn = createServerFn({ method: "GET" })
  .validator((d: { council_id: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("get_council_report_attendance_rate", {
      p_council_id: data.council_id,
    });
    if (error) throw new Error(mapCouncilError(error));
    return res;
  });

export const getCouncilReportQuorumHistoryFn = createServerFn({ method: "GET" })
  .validator((d: { council_id: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("get_council_report_quorum_history", {
      p_council_id: data.council_id,
    });
    if (error) throw new Error(mapCouncilError(error));
    return res;
  });

export const getCouncilReportTopicDispositionFn = createServerFn({ method: "GET" })
  .validator((d: { council_id: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("get_council_report_topic_disposition", {
      p_council_id: data.council_id,
    });
    if (error) throw new Error(mapCouncilError(error));
    return res;
  });

export const getCouncilReportAgendaCompletionFn = createServerFn({ method: "GET" })
  .validator((d: { council_id: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("get_council_report_agenda_completion", {
      p_council_id: data.council_id,
    });
    if (error) throw new Error(mapCouncilError(error));
    return res;
  });

export const getCouncilReportVoteResultSummaryFn = createServerFn({ method: "GET" })
  .validator((d: { council_id: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("get_council_report_vote_result_summary", {
      p_council_id: data.council_id,
    });
    if (error) throw new Error(mapCouncilError(error));
    return res;
  });

export const getCouncilReportDecisionExecutionStatusFn = createServerFn({ method: "GET" })
  .validator((d: { council_id: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("get_council_report_decision_execution_status", {
      p_council_id: data.council_id,
    });
    if (error) throw new Error(mapCouncilError(error));
    return res;
  });

export const getCouncilReportOverdueDecisionsFn = createServerFn({ method: "GET" })
  .validator((d: { council_id: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("get_council_report_overdue_decisions", {
      p_council_id: data.council_id,
    });
    if (error) throw new Error(mapCouncilError(error));
    return res;
  });

export const getCouncilReportMeetingDurationFn = createServerFn({ method: "GET" })
  .validator((d: { council_id: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("get_council_report_meeting_duration", {
      p_council_id: data.council_id,
    });
    if (error) throw new Error(mapCouncilError(error));
    return res;
  });

export const getCouncilReportArchiveStatusFn = createServerFn({ method: "GET" })
  .validator((d: { council_id: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("get_council_report_archive_status", {
      p_council_id: data.council_id,
    });
    if (error) throw new Error(mapCouncilError(error));
    return res;
  });

export const getCouncilReportCouncilActivityFn = createServerFn({ method: "GET" })
  .validator((d: { council_id: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("get_council_report_council_activity", {
      p_council_id: data.council_id,
    });
    if (error) throw new Error(mapCouncilError(error));
    return res;
  });

// -----------------------------------------------------------------------------
// DASHBOARDS
// -----------------------------------------------------------------------------

export const getCouncilChairDashboardFn = createServerFn({ method: "GET" })
  .validator((d: { council_id: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("get_council_chair_dashboard", {
      p_council_id: data.council_id,
    });
    if (error) throw new Error(mapCouncilError(error));
    return res;
  });

export const getCouncilSecretaryDashboardFn = createServerFn({ method: "GET" })
  .validator((d: { council_id: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("get_council_secretary_dashboard", {
      p_council_id: data.council_id,
    });
    if (error) throw new Error(mapCouncilError(error));
    return res;
  });

export const getCouncilMemberWorkspaceFn = createServerFn({ method: "GET" })
  .validator((d: { council_id: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("get_council_member_workspace", {
      p_council_id: data.council_id,
    });
    if (error) throw new Error(mapCouncilError(error));
    return res;
  });

export const getCouncilResponsibleDecisionsFn = createServerFn({ method: "GET" })
  .validator((d: Record<string, unknown>) => d)
  .handler(async ({ request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("get_council_responsible_decisions", {
      p_user_id: null,
    });
    if (error) throw new Error(mapCouncilError(error));
    return (res as unknown[]) ?? [];
  });
