import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/councils/request-auth.server";

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
      agenda_item_id: string;
      title: string;
      body: string;
      responsible_user_id?: string;
      responsible_unit?: string;
      due_date?: string;
    }) => {
      if (!d.meeting_id?.trim()) {
        throw new Error("COUNCIL_MEETING_ID_REQUIRED");
      }
      if (!d.agenda_item_id?.trim()) {
        throw new Error("اختر بند جدول الأعمال المرتبط بالقرار.");
      }
      if (!d.title?.trim()) {
        throw new Error("COUNCIL_DECISION_TITLE_REQUIRED");
      }
      if (!d.body?.trim()) {
        throw new Error("COUNCIL_DECISION_BODY_REQUIRED");
      }
      return {
        meeting_id: d.meeting_id.trim(),
        agenda_item_id: d.agenda_item_id.trim(),
        title: d.title.trim(),
        body: d.body.trim(),
        responsible_user_id: d.responsible_user_id,
        responsible_unit: d.responsible_unit,
        due_date: d.due_date,
      };
    },
  )
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("issue_council_decision", {
      p_meeting_id: data.meeting_id,
      p_agenda_item_id: data.agenda_item_id,
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

export const getCouncilVoteResultFn = createServerFn({ method: "GET" })
  .validator((d: { agenda_item_id: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("get_council_vote_result", {
      p_agenda_item_id: data.agenda_item_id,
    });
    if (error) throw new Error(error.message);
    return res;
  });

export const getCouncilAttendanceQuorumSummaryFn = createServerFn({ method: "GET" })
  .validator((d: { meeting_id: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: res, error } = await supabase.rpc("get_council_attendance_quorum_summary", {
      p_meeting_id: data.meeting_id,
    });
    if (error) throw new Error(error.message);
    return res;
  });

export const exportApprovedCouncilMinutesPdfFn = createServerFn({ method: "POST" })
  .validator((d: { meeting_id: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);

    const { data: minutes, error: minutesError } = await supabase
      .from("academic_council_minutes")
      .select("body, status, is_locked, locked_at, approved_at, fingerprint")
      .eq("meeting_id", data.meeting_id)
      .maybeSingle();
    if (minutesError) throw new Error(minutesError.message);
    if (!minutes) throw new Error("COUNCIL_MINUTES_NOT_FOUND");
    if (!minutes.is_locked && minutes.status !== "minutes_locked") {
      throw new Error("COUNCIL_MINUTES_NOT_APPROVED");
    }

    const { data: meeting, error: meetingError } = await supabase
      .from("academic_council_meetings")
      .select("meeting_number, title, scheduled_at, location, council_id")
      .eq("id", data.meeting_id)
      .maybeSingle();
    if (meetingError) throw new Error(meetingError.message);
    if (!meeting) throw new Error("COUNCIL_MEETING_NOT_FOUND");

    const { data: council } = await supabase
      .from("academic_councils")
      .select("name")
      .eq("id", meeting.council_id)
      .maybeSingle();

    const { buildCouncilMinutesPdf } = await import(
      "@/lib/documents/council-minutes-pdf.server"
    );
    const pdfBytes = await buildCouncilMinutesPdf({
      councilName: council?.name ?? "—",
      meetingTitle: meeting.title,
      meetingNumber: meeting.meeting_number,
      scheduledAt: meeting.scheduled_at,
      location: meeting.location,
      approvedAt: minutes.approved_at,
      lockedAt: minutes.locked_at,
      body: minutes.body ?? "",
      fingerprint: minutes.fingerprint,
    });

    let binary = "";
    for (let i = 0; i < pdfBytes.length; i++) binary += String.fromCharCode(pdfBytes[i]!);
    return {
      fileName: `council-minutes-${meeting.meeting_number}-${data.meeting_id.slice(0, 8)}.pdf`,
      base64: btoa(binary),
    };
  });

/**
 * Server-backed "did I already vote on this agenda item?".
 * Reads the caller's own row from academic_council_votes under RLS
 * (policy allows `voter_user_id = auth.uid()`), so the member's vote
 * survives a page reload instead of living only in local state.
 */
export const getMyCouncilVoteFn = createServerFn({ method: "GET" })
  .validator((d: { agenda_item_id: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase, userId } = await requireSupabaseAuth(request);
    const { data: row, error } = await supabase
      .from("academic_council_votes")
      .select("vote_value, cast_at")
      .eq("agenda_item_id", data.agenda_item_id)
      .eq("voter_user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      has_voted: Boolean(row),
      vote_value: (row?.vote_value as "yes" | "no" | "abstain" | undefined) ?? null,
      cast_at: (row?.cast_at as string | undefined) ?? null,
    };
  });

/**
 * Live vote progress for an agenda item: how many eligible voters exist,
 * how many have cast, and whether the chair may close yet.
 * Never returns an individual vote direction.
 * Backed by RPC get_agenda_item_vote_progress
 * (draft: docs/migration-drafts/COUNCILS-VOTE-COMPLETION-GUARD-04.sql).
 */
export const getAgendaItemVoteProgressFn = createServerFn({ method: "GET" })
  .validator((d: { agenda_item_id: string }) => d)
  .handler(async ({ data, request }) => {
    const { supabase } = await requireSupabaseAuth(request);
    const { data: row, error } = await (supabase as any).rpc("get_agenda_item_vote_progress", {
      p_agenda_item_id: data.agenda_item_id,
    });
    if (error) {
      // The guard migration may not be applied yet: degrade to "unknown"
      // instead of breaking the live session UI.
      return null;
    }
    const p = (row ?? {}) as Record<string, unknown>;
    return {
      eligible: Number(p["eligible"] ?? 0),
      cast: Number(p["cast"] ?? 0),
      pending: Number(p["pending"] ?? 0),
      can_close: Boolean(p["can_close"]),
      viewer_is_eligible: Boolean(p["viewer_is_eligible"]),
      viewer_has_voted: Boolean(p["viewer_has_voted"]),
    };
  });
