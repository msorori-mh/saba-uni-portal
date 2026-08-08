// Academic Councils C9 — notifications, reports, dashboards, operational UX.
// All heavy lifting is performed by security-definer RPCs in the C9 migration.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ========================================================================
// NOTIFICATIONS
// ========================================================================

export type CouncilNotificationItem = {
  notification_id: string;
  event_type: string;
  council_id: string;
  meeting_id: string | null;
  entity_type: string;
  entity_id: string | null;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
};

export type MyCouncilNotificationsResult = {
  notifications: CouncilNotificationItem[];
  unread_count: number;
};

export const getMyCouncilNotificationsFn = createServerFn({ method: "GET" })
  .validator((d: { unread_only?: boolean; limit?: number }) => d)
  .handler(async ({ data, request }): Promise<MyCouncilNotificationsResult> => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("get_my_council_notifications", {
      p_unread_only: data.unread_only ?? false,
      p_limit: data.limit ?? 50,
    });
    if (error) throw new Error(error.message);
    return (res as MyCouncilNotificationsResult) ?? { notifications: [], unread_count: 0 };
  });

export const markCouncilNotificationReadFn = createServerFn({ method: "POST" })
  .validator((d: { notification_id: string; is_read?: boolean }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("mark_council_notification_read", {
      p_notification_id: data.notification_id,
      p_is_read: data.is_read ?? true,
    });
    if (error) throw new Error(error.message);
    return res;
  });

export const processCouncilNotificationOutboxFn = createServerFn({ method: "POST" })
  .validator((d: { batch_size?: number }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("process_council_notification_outbox", {
      p_outbox_id: null,
      p_batch_size: data.batch_size ?? 100,
    });
    if (error) throw new Error(error.message);
    return res;
  });

export const notifyCouncilDecisionDueDatesFn = createServerFn({ method: "POST" })
  .validator((d: { approach_days?: number }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("notify_council_decision_due_dates", {
      p_approach_days: data.approach_days ?? 3,
    });
    if (error) throw new Error(error.message);
    return res;
  });

// ========================================================================
// REPORTS
// ========================================================================

export type CouncilReportMeetingSummary = {
  council_id: string;
  period_from: string | null;
  period_to: string | null;
  total_meetings: number;
  by_status: Record<string, number>;
  meetings: Array<{
    meeting_id: string;
    meeting_number: number;
    title: string;
    scheduled_at: string;
    status: string;
  }>;
};

export const getCouncilReportMeetingSummaryFn = createServerFn({ method: "GET" })
  .validator((d: { council_id: string; from?: string; to?: string }) => d)
  .handler(async ({ data, request }): Promise<CouncilReportMeetingSummary> => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("get_council_report_meeting_summary", {
      p_council_id: data.council_id,
      p_from: data.from ?? null,
      p_to: data.to ?? null,
    });
    if (error) throw new Error(error.message);
    return res as CouncilReportMeetingSummary;
  });

export type CouncilReportAttendanceRate = {
  council_id: string;
  total_evaluated_sessions: number;
  average_attendance_rate: number;
  meetings: Array<{
    meeting_id: string;
    meeting_number: number;
    scheduled_at: string;
    eligible: number;
    present: number;
    rate: number;
  }>;
};

export const getCouncilReportAttendanceRateFn = createServerFn({ method: "GET" })
  .validator((d: { council_id: string }) => d)
  .handler(async ({ data, request }): Promise<CouncilReportAttendanceRate> => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("get_council_report_attendance_rate", {
      p_council_id: data.council_id,
    });
    if (error) throw new Error(error.message);
    return res as CouncilReportAttendanceRate;
  });

export const getCouncilReportQuorumHistoryFn = createServerFn({ method: "GET" })
  .validator((d: { council_id: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("get_council_report_quorum_history", {
      p_council_id: data.council_id,
    });
    if (error) throw new Error(error.message);
    return res;
  });

export type CouncilReportTopicDisposition = {
  council_id: string;
  total_topics: number;
  by_status: Record<string, number>;
  topics: Array<{
    topic_id: string;
    title: string;
    status: string;
    submitted_at: string | null;
    submitted_by: string;
  }>;
};

export const getCouncilReportTopicDispositionFn = createServerFn({ method: "GET" })
  .validator((d: { council_id: string; from?: string; to?: string }) => d)
  .handler(async ({ data, request }): Promise<CouncilReportTopicDisposition> => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("get_council_report_topic_disposition", {
      p_council_id: data.council_id,
      p_from: data.from ?? null,
      p_to: data.to ?? null,
    });
    if (error) throw new Error(error.message);
    return res as CouncilReportTopicDisposition;
  });

export const getCouncilReportAgendaCompletionFn = createServerFn({ method: "GET" })
  .validator((d: { council_id: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("get_council_report_agenda_completion", {
      p_council_id: data.council_id,
    });
    if (error) throw new Error(error.message);
    return res;
  });

export const getCouncilReportVotingSummaryFn = createServerFn({ method: "GET" })
  .validator((d: { council_id: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("get_council_report_voting_summary", {
      p_council_id: data.council_id,
    });
    if (error) throw new Error(error.message);
    return res;
  });

export const getCouncilReportDecisionStatusFn = createServerFn({ method: "GET" })
  .validator((d: { council_id: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("get_council_report_decision_status", {
      p_council_id: data.council_id,
    });
    if (error) throw new Error(error.message);
    return res;
  });

export const getCouncilReportDecisionOverdueFn = createServerFn({ method: "GET" })
  .validator((d: { council_id: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("get_council_report_decision_overdue", {
      p_council_id: data.council_id,
    });
    if (error) throw new Error(error.message);
    return res;
  });

export const getCouncilReportMeetingArchiveFn = createServerFn({ method: "GET" })
  .validator((d: { council_id: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("get_council_report_meeting_archive", {
      p_council_id: data.council_id,
    });
    if (error) throw new Error(error.message);
    return res;
  });

export const getCouncilActivityPeriodFn = createServerFn({ method: "GET" })
  .validator((d: { council_id: string; from?: string; to?: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("get_council_activity_period", {
      p_council_id: data.council_id,
      p_from: data.from ?? null,
      p_to: data.to ?? null,
    });
    if (error) throw new Error(error.message);
    return res;
  });

// ========================================================================
// DASHBOARDS
// ========================================================================

export const getCouncilChairDashboardFn = createServerFn({ method: "GET" })
  .validator((d: { council_id: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("get_council_chair_dashboard", {
      p_council_id: data.council_id,
    });
    if (error) throw new Error(error.message);
    return res;
  });

export const getCouncilSecretaryDashboardFn = createServerFn({ method: "GET" })
  .validator((d: { council_id: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("get_council_secretary_dashboard", {
      p_council_id: data.council_id,
    });
    if (error) throw new Error(error.message);
    return res;
  });

export const getCouncilMemberDashboardFn = createServerFn({ method: "GET" })
  .validator((d: { council_id: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("get_council_member_dashboard", {
      p_council_id: data.council_id,
    });
    if (error) throw new Error(error.message);
    return res;
  });

export const getCouncilAdminOperationalDashboardFn = createServerFn({ method: "GET" })
  .validator((d: { council_id: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("get_council_admin_operational_dashboard", {
      p_council_id: data.council_id,
    });
    if (error) throw new Error(error.message);
    return res;
  });
