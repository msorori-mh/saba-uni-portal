import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const openCouncilSessionFn = createServerFn({ method: "POST" })
  .validator((d: { meeting_id: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("open_council_session", {
      p_meeting_id: data.meeting_id,
    });
    if (error) throw new Error(error.message);
    return res;
  });

export const startAgendaItemDiscussionFn = createServerFn({ method: "POST" })
  .validator((d: { agenda_item_id: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("start_agenda_item_discussion", {
      p_agenda_item_id: data.agenda_item_id,
    });
    if (error) throw new Error(error.message);
    return res;
  });

export const openAgendaItemVoteFn = createServerFn({ method: "POST" })
  .validator((d: { agenda_item_id: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("open_agenda_item_vote", {
      p_agenda_item_id: data.agenda_item_id,
    });
    if (error) throw new Error(error.message);
    return res;
  });

export const castCouncilVoteFn = createServerFn({ method: "POST" })
  .validator((d: { agenda_item_id: string; vote_value: "yes" | "no" | "abstain" }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("cast_council_vote", {
      p_agenda_item_id: data.agenda_item_id,
      p_vote_value: data.vote_value,
    });
    if (error) throw new Error(error.message);
    return res;
  });

export const closeAgendaItemVoteFn = createServerFn({ method: "POST" })
  .validator((d: { agenda_item_id: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("close_agenda_item_vote", {
      p_agenda_item_id: data.agenda_item_id,
    });
    if (error) throw new Error(error.message);
    return res;
  });

export const calculateAgendaItemResultFn = createServerFn({ method: "POST" })
  .validator((d: { agenda_item_id: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("calculate_agenda_item_result", {
      p_agenda_item_id: data.agenda_item_id,
    });
    if (error) throw new Error(error.message);
    return res;
  });

export const resolveAgendaItemFn = createServerFn({ method: "POST" })
  .validator((d: { agenda_item_id: string; resolution?: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("resolve_agenda_item", {
      p_agenda_item_id: data.agenda_item_id,
      p_resolution: data.resolution ?? null,
    });
    if (error) throw new Error(error.message);
    return res;
  });

export const closeCouncilSessionFn = createServerFn({ method: "POST" })
  .validator((d: { meeting_id: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("close_council_session", {
      p_meeting_id: data.meeting_id,
    });
    if (error) throw new Error(error.message);
    return res;
  });

export const draftCouncilMinutesFn = createServerFn({ method: "POST" })
  .validator((d: { meeting_id: string; body: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("draft_council_minutes", {
      p_meeting_id: data.meeting_id,
      p_body: data.body,
    });
    if (error) throw new Error(error.message);
    return res;
  });

export const submitCouncilMinutesForReviewFn = createServerFn({ method: "POST" })
  .validator((d: { meeting_id: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("submit_council_minutes_for_review", {
      p_meeting_id: data.meeting_id,
    });
    if (error) throw new Error(error.message);
    return res;
  });

export const approveAndLockCouncilMinutesFn = createServerFn({ method: "POST" })
  .validator((d: { meeting_id: string; approved_body?: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("approve_and_lock_council_minutes", {
      p_meeting_id: data.meeting_id,
      p_approved_body: data.approved_body ?? null,
    });
    if (error) throw new Error(error.message);
    return res;
  });

export const issueCouncilDecisionFn = createServerFn({ method: "POST" })
  .validator(
    (d: {
      meeting_id: string;
      agenda_item_id?: string;
      title: string;
      body: string;
      responsible_user_id?: string;
      responsible_unit?: string;
      due_date?: string;
    }) => d
  )
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("issue_council_decision", {
      p_meeting_id: data.meeting_id,
      p_agenda_item_id: data.agenda_item_id ?? null,
      p_title: data.title,
      p_body: data.body,
      p_responsible_user_id: data.responsible_user_id ?? null,
      p_responsible_unit: data.responsible_unit ?? null,
      p_due_date: data.due_date ?? null,
    });
    if (error) throw new Error(error.message);
    return res;
  });

export const updateCouncilDecisionFollowupFn = createServerFn({ method: "POST" })
  .validator(
    (d: {
      decision_id: string;
      status: string;
      execution_note?: string;
      evidence_metadata?: any;
    }) => d
  )
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("update_council_decision_followup", {
      p_decision_id: data.decision_id,
      p_status: data.status,
      p_execution_note: data.execution_note ?? null,
      p_evidence_metadata: data.evidence_metadata ?? null,
    });
    if (error) throw new Error(error.message);
    return res;
  });

export const completeCouncilDecisionFn = createServerFn({ method: "POST" })
  .validator(
    (d: {
      decision_id: string;
      execution_note?: string;
      evidence_metadata?: any;
    }) => d
  )
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("complete_council_decision", {
      p_decision_id: data.decision_id,
      p_execution_note: data.execution_note ?? null,
      p_evidence_metadata: data.evidence_metadata ?? null,
    });
    if (error) throw new Error(error.message);
    return res;
  });

export const archiveCouncilMeetingFn = createServerFn({ method: "POST" })
  .validator((d: { meeting_id: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("archive_council_meeting", {
      p_meeting_id: data.meeting_id,
    });
    if (error) throw new Error(error.message);
    return res;
  });

export const getCouncilArchiveSummaryFn = createServerFn({ method: "GET" })
  .validator((d: { council_id: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("get_council_archive_summary", {
      p_council_id: data.council_id,
    });
    if (error) throw new Error(error.message);
    return res;
  });

export const getCouncilDecisionFollowupDashboardFn = createServerFn({ method: "GET" })
  .validator((d: { council_id: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc(
      "get_council_decision_followup_dashboard",
      { p_council_id: data.council_id }
    );
    if (error) throw new Error(error.message);
    return res;
  });

export const getCouncilHistoricalMinutesFn = createServerFn({ method: "GET" })
  .validator((d: { meeting_id: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("get_council_historical_minutes", {
      p_meeting_id: data.meeting_id,
    });
    if (error) throw new Error(error.message);
    return res;
  });
