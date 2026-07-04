// Faculty portal functions for academic councils.
// Uses user session (context.supabase) — no service role.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { CouncilLinkMemberRole } from "@/lib/admin-councils.functions";

type FacultySupabase = SupabaseClient<Database>;

const RLS_DENIED_MESSAGE =
  "تعذّر تنفيذ العملية بسبب قيود الصلاحيات الحالية.";
const VIEWER_SUBMIT_DENIED_MESSAGE =
  "دور المطّلع لا يسمح بتقديم موضوعات للمجلس.";
const NOT_ACTIVE_MEMBER_MESSAGE =
  "لا يمكن تقديم موضوع لمجلس لست عضواً فعّالاً فيه بدور يسمح بالتقديم.";

const TOPIC_SUBMIT_ROLES = new Set<string>(["chair", "secretary", "member", "vice_chair"]);

// ============================================================================
// TYPES — legacy (unchanged shape for existing UI)
// ============================================================================

export type MyAcademicCouncilMembership = {
  membership_id: string;
  council_id: string;
  council_name: string;
  council_type: "college" | "department" | string;
  member_role: CouncilLinkMemberRole | string;
  is_active: boolean;
  active_from: string;
};

// ============================================================================
// TYPES — V2+ (for upcoming UI)
// ============================================================================

export type MyCouncilMembershipV2 = {
  membership_id: string;
  council_id: string;
  council_name: string;
  council_type: "college" | "department" | string;
  department_name: string | null;
  role: CouncilLinkMemberRole | string;
  is_active: boolean;
  active_from: string;
  active_to: string | null;
  created_at: string;
};

export type MyAcademicCouncilMembershipsV2Result = {
  currentMemberships: MyCouncilMembershipV2[];
  previousMemberships: MyCouncilMembershipV2[];
};

export type MyCouncilMeetingItem = {
  meeting_id: string;
  council_id: string;
  council_name: string;
  meeting_title: string;
  meeting_date: string;
  status: string;
  location: string | null;
  agenda_summary: string | null;
  minutes_summary: string | null;
  user_membership_role: string | null;
};

export type MyCouncilMeetingsResult = {
  upcomingMeetings: MyCouncilMeetingItem[];
  previousMeetings: MyCouncilMeetingItem[];
};

export type MyCouncilTopicItem = {
  topic_id: string;
  council_id: string;
  council_name: string;
  meeting_id: string | null;
  title: string;
  description: string;
  status: string;
  submitted_by: string;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  admin_notes: string | null;
  agenda_order: number | null;
};

export type MyCouncilTopicsResult = {
  mySubmittedTopics: MyCouncilTopicItem[];
  councilVisibleTopics: MyCouncilTopicItem[];
};

export type SubmitCouncilTopicResult = {
  ok: true;
  topic_id: string;
  status: "submitted";
};

// ============================================================================
// SHARED HELPERS
// ============================================================================

function throwDbError(error: { code?: string; message: string }): never {
  const msg = error.message.toLowerCase();
  if (
    error.code === "42501" ||
    msg.includes("policy") ||
    msg.includes("permission denied") ||
    msg.includes("row-level security")
  ) {
    throw new Error(RLS_DENIED_MESSAGE);
  }
  throw new Error(error.message);
}

function isActiveMembership(row: { is_active: boolean; active_to: string | null }): boolean {
  return row.is_active && row.active_to === null;
}

function unwrapCouncil<T extends { name: string }>(
  council: T | T[] | null,
): T | null {
  if (!council) return null;
  return Array.isArray(council) ? council[0] ?? null : council;
}

function truncateSummary(text: string, max = 160): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

function buildAgendaSummary(
  items: Array<{ title: string; order_index: number }>,
): string | null {
  if (items.length === 0) return null;
  const sorted = [...items].sort((a, b) => a.order_index - b.order_index);
  const titles = sorted.map((i) => i.title);
  if (titles.length <= 3) return titles.join(" · ");
  return `${titles.length} بنود: ${titles.slice(0, 2).join("، ")}…`;
}

type MembershipRoleRow = {
  council_id: string;
  member_role: string;
  active_from: string;
  active_to: string | null;
  is_active: boolean;
};

function membershipRoleAt(
  memberships: MembershipRoleRow[],
  councilId: string,
  atIso: string,
): string | null {
  const atDate = atIso.slice(0, 10);
  const match = memberships.find(
    (m) =>
      m.council_id === councilId &&
      m.active_from <= atDate &&
      (m.active_to === null || m.active_to >= atDate),
  );
  return match?.member_role ?? null;
}

async function assertActiveFacultyProfile(sb: FacultySupabase, userId: string) {
  const { data: profile, error: profileErr } = await sb
    .from("faculty_profiles")
    .select("id, status")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileErr) throw new Error("تعذّر تحميل بيانات العضو");
  if (!profile) throw new Error("حساب عضو هيئة التدريس غير متاح");
  if (profile.status !== "active") {
    throw new Error("حساب عضو هيئة التدريس غير فعّال");
  }
}

async function loadMembershipRoleRows(
  sb: FacultySupabase,
  userId: string,
): Promise<MembershipRoleRow[]> {
  const { data, error } = await sb
    .from("academic_council_members")
    .select("council_id, member_role, active_from, active_to, is_active")
    .eq("user_id", userId);
  if (error) throw new Error("تعذّر تحميل عضويات المجالس");
  return (data ?? []).map((row) => ({
    council_id: row.council_id as string,
    member_role: row.member_role as string,
    active_from: row.active_from as string,
    active_to: (row.active_to as string | null) ?? null,
    is_active: Boolean(row.is_active),
  }));
}

function mapMembershipV2Row(row: {
  id: string;
  member_role: string;
  is_active: boolean;
  active_from: string;
  active_to: string | null;
  created_at: string;
  council: unknown;
}): MyCouncilMembershipV2 | null {
  const council = unwrapCouncil(
    row.council as
      | {
          id: string;
          name: string;
          council_type: string;
          department: { name_ar: string } | { name_ar: string }[] | null;
        }
      | null,
  );
  if (!council) return null;
  const dept = council.department;
  const department = Array.isArray(dept) ? dept[0] : dept;
  return {
    membership_id: row.id,
    council_id: council.id,
    council_name: council.name,
    council_type: council.council_type,
    department_name: department?.name_ar ?? null,
    role: row.member_role,
    is_active: Boolean(row.is_active),
    active_from: row.active_from,
    active_to: row.active_to,
    created_at: row.created_at,
  };
}

async function assertCanSubmitCouncilTopic(
  sb: FacultySupabase,
  userId: string,
  councilId: string,
): Promise<void> {
  const { data: rpcAllowed, error: rpcErr } = await sb.rpc(
    "can_submit_council_topic" as never,
    { _user: userId, _council: councilId } as never,
  );

  if (!rpcErr && typeof rpcAllowed === "boolean") {
    if (!rpcAllowed) {
      const { data: membership } = await sb
        .from("academic_council_members")
        .select("member_role, is_active, active_to")
        .eq("user_id", userId)
        .eq("council_id", councilId)
        .eq("is_active", true)
        .is("active_to", null)
        .maybeSingle();

      if (membership?.member_role === "viewer") {
        throw new Error(VIEWER_SUBMIT_DENIED_MESSAGE);
      }
      throw new Error(NOT_ACTIVE_MEMBER_MESSAGE);
    }
    return;
  }

  const { data: membership, error: membershipErr } = await sb
    .from("academic_council_members")
    .select("member_role, is_active, active_to")
    .eq("user_id", userId)
    .eq("council_id", councilId)
    .eq("is_active", true)
    .is("active_to", null)
    .maybeSingle();
  if (membershipErr) throwDbError(membershipErr);

  if (!membership || !isActiveMembership({
    is_active: Boolean(membership.is_active),
    active_to: (membership.active_to as string | null) ?? null,
  })) {
    throw new Error(NOT_ACTIVE_MEMBER_MESSAGE);
  }

  const role = membership.member_role as string;
  if (role === "viewer" || !TOPIC_SUBMIT_ROLES.has(role)) {
    throw new Error(VIEWER_SUBMIT_DENIED_MESSAGE);
  }
}

const submitCouncilTopicSchema = z.object({
  council_id: z.string().uuid("معرّف المجلس غير صالح"),
  title: z
    .string()
    .trim()
    .min(5, "عنوان الموضوع يجب أن لا يقل عن 5 أحرف")
    .max(500, "عنوان الموضوع طويل جداً"),
  description: z
    .string()
    .trim()
    .max(8000, "وصف الموضوع طويل جداً")
    .optional(),
});

// ============================================================================
// LEGACY — active memberships only (used by current faculty UI)
// ============================================================================

export const getMyAcademicCouncilMemberships = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyAcademicCouncilMembership[]> => {
    const sb = context.supabase;
    await assertActiveFacultyProfile(sb, context.userId);

    const { data: rows, error } = await sb
      .from("academic_council_members")
      .select(
        "id, member_role, is_active, active_from, council:academic_councils(id, name, council_type, is_active)",
      )
      .eq("user_id", context.userId)
      .eq("is_active", true)
      .is("active_to", null)
      .order("active_from", { ascending: false });
    if (error) throw new Error("تعذّر تحميل عضويات المجالس");

    return (rows ?? [])
      .map((row) => {
        const council = unwrapCouncil(
          row.council as
            | { id: string; name: string; council_type: string; is_active: boolean }
            | null,
        );
        if (!council) return null;
        return {
          membership_id: row.id as string,
          council_id: council.id,
          council_name: council.name,
          council_type: council.council_type,
          member_role: row.member_role as string,
          is_active: Boolean(row.is_active),
          active_from: row.active_from as string,
        };
      })
      .filter((r): r is MyAcademicCouncilMembership => r !== null);
  });

// ============================================================================
// V2 — current + previous memberships
// ============================================================================

export const getMyAcademicCouncilMembershipsV2 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyAcademicCouncilMembershipsV2Result> => {
    const sb = context.supabase;
    await assertActiveFacultyProfile(sb, context.userId);

    const { data: rows, error } = await sb
      .from("academic_council_members")
      .select(
        "id, member_role, is_active, active_from, active_to, created_at, council:academic_councils(id, name, council_type, department:departments(name_ar))",
      )
      .eq("user_id", context.userId)
      .order("active_from", { ascending: false });
    if (error) throw new Error("تعذّر تحميل عضويات المجالس");

    const mapped = (rows ?? [])
      .map((row) =>
        mapMembershipV2Row({
          id: row.id as string,
          member_role: row.member_role as string,
          is_active: Boolean(row.is_active),
          active_from: row.active_from as string,
          active_to: (row.active_to as string | null) ?? null,
          created_at: row.created_at as string,
          council: row.council,
        }),
      )
      .filter((r): r is MyCouncilMembershipV2 => r !== null);

    const currentMemberships = mapped.filter((m) =>
      isActiveMembership({ is_active: m.is_active, active_to: m.active_to }),
    );
    const previousMemberships = mapped.filter(
      (m) => !isActiveMembership({ is_active: m.is_active, active_to: m.active_to }),
    );

    return { currentMemberships, previousMemberships };
  });

// ============================================================================
// MEETINGS — upcoming + previous (RLS-scoped)
// ============================================================================

export const getMyCouncilMeetings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyCouncilMeetingsResult> => {
    const sb = context.supabase;
    await assertActiveFacultyProfile(sb, context.userId);

    const [membershipRows, meetingsRes] = await Promise.all([
      loadMembershipRoleRows(sb, context.userId),
      sb
        .from("academic_council_meetings")
        .select(
          "id, council_id, title, scheduled_at, status, location, council:academic_councils(name)",
        )
        .order("scheduled_at", { ascending: false }),
    ]);

    if (meetingsRes.error) throw new Error("تعذّر تحميل اجتماعات المجالس");

    const meetings = meetingsRes.data ?? [];
    const meetingIds = meetings.map((m) => m.id as string);

    const agendaByMeeting = new Map<string, Array<{ title: string; order_index: number }>>();
    const minutesByMeeting = new Map<string, string>();

    if (meetingIds.length > 0) {
      const [agendaRes, minutesRes] = await Promise.all([
        sb
          .from("academic_council_agenda_items")
          .select("meeting_id, title, order_index")
          .in("meeting_id", meetingIds),
        sb
          .from("academic_council_minutes")
          .select("meeting_id, body")
          .in("meeting_id", meetingIds),
      ]);

      if (agendaRes.error) throwDbError(agendaRes.error);
      if (minutesRes.error) throwDbError(minutesRes.error);

      for (const item of agendaRes.data ?? []) {
        const mid = item.meeting_id as string;
        const list = agendaByMeeting.get(mid) ?? [];
        list.push({
          title: item.title as string,
          order_index: item.order_index as number,
        });
        agendaByMeeting.set(mid, list);
      }

      for (const minute of minutesRes.data ?? []) {
        const body = (minute.body as string) ?? "";
        if (body.trim()) {
          minutesByMeeting.set(minute.meeting_id as string, truncateSummary(body));
        }
      }
    }

    const nowIso = new Date().toISOString();
    const items: MyCouncilMeetingItem[] = meetings.map((row) => {
      const council = unwrapCouncil(
        row.council as { name: string } | { name: string }[] | null,
      );
      const meetingId = row.id as string;
      const scheduledAt = row.scheduled_at as string;
      return {
        meeting_id: meetingId,
        council_id: row.council_id as string,
        council_name: council?.name ?? "",
        meeting_title: row.title as string,
        meeting_date: scheduledAt,
        status: row.status as string,
        location: (row.location as string | null) ?? null,
        agenda_summary: buildAgendaSummary(agendaByMeeting.get(meetingId) ?? []),
        minutes_summary: minutesByMeeting.get(meetingId) ?? null,
        user_membership_role: membershipRoleAt(
          membershipRows,
          row.council_id as string,
          scheduledAt,
        ),
      };
    });

    const upcomingMeetings = items
      .filter((m) => m.meeting_date >= nowIso)
      .sort((a, b) => a.meeting_date.localeCompare(b.meeting_date));
    const previousMeetings = items
      .filter((m) => m.meeting_date < nowIso)
      .sort((a, b) => b.meeting_date.localeCompare(a.meeting_date));

    return { upcomingMeetings, previousMeetings };
  });

// ============================================================================
// TOPICS — submitted by user + council-visible (RLS-scoped)
// ============================================================================

export const getMyCouncilTopics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyCouncilTopicsResult> => {
    const sb = context.supabase;
    await assertActiveFacultyProfile(sb, context.userId);

    const { data: rows, error } = await sb
      .from("academic_council_topics")
      .select(
        "id, council_id, meeting_id, title, body, status, submitted_by, submitted_at, created_at, updated_at, review_note, council:academic_councils(name)",
      )
      .order("updated_at", { ascending: false });
    if (error) throw new Error("تعذّر تحميل موضوعات المجالس");

    const topicIds = (rows ?? []).map((r) => r.id as string);
    const agendaOrderByTopic = new Map<string, number>();

    if (topicIds.length > 0) {
      const { data: agendaRows, error: agendaErr } = await sb
        .from("academic_council_agenda_items")
        .select("topic_id, order_index")
        .in("topic_id", topicIds);
      if (agendaErr) throwDbError(agendaErr);

      for (const item of agendaRows ?? []) {
        const topicId = item.topic_id as string | null;
        if (!topicId) continue;
        const order = item.order_index as number;
        const existing = agendaOrderByTopic.get(topicId);
        if (existing === undefined || order < existing) {
          agendaOrderByTopic.set(topicId, order);
        }
      }
    }

    const mapTopic = (row: (typeof rows)[number]): MyCouncilTopicItem => {
      const council = unwrapCouncil(
        row.council as { name: string } | { name: string }[] | null,
      );
      const topicId = row.id as string;
      return {
        topic_id: topicId,
        council_id: row.council_id as string,
        council_name: council?.name ?? "",
        meeting_id: (row.meeting_id as string | null) ?? null,
        title: row.title as string,
        description: row.body as string,
        status: row.status as string,
        submitted_by: row.submitted_by as string,
        submitted_at: (row.submitted_at as string | null) ?? null,
        created_at: row.created_at as string,
        updated_at: row.updated_at as string,
        admin_notes: (row.review_note as string | null) ?? null,
        agenda_order: agendaOrderByTopic.get(topicId) ?? null,
      };
    };

    const all = (rows ?? []).map(mapTopic);
    const mySubmittedTopics = all.filter((t) => t.submitted_by === context.userId);
    const councilVisibleTopics = all.filter((t) => t.submitted_by !== context.userId);

    return { mySubmittedTopics, councilVisibleTopics };
  });

// ============================================================================
// SUBMIT TOPIC — write path (not invoked during this phase)
// ============================================================================

export const submitCouncilTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const parsed = submitCouncilTopicSchema.parse(input);
    if (typeof input === "object" && input !== null) {
      const raw = input as Record<string, unknown>;
      if ("meeting_id" in raw || "status" in raw || "admin_notes" in raw || "review_note" in raw) {
        throw new Error("لا يمكن تمرير meeting_id أو status أو ملاحظات الإدارة من الواجهة");
      }
    }
    return parsed;
  })
  .handler(async ({ data, context }): Promise<SubmitCouncilTopicResult> => {
    const sb = context.supabase;
    await assertActiveFacultyProfile(sb, context.userId);
    await assertCanSubmitCouncilTopic(sb, context.userId, data.council_id);

    const body = data.description?.trim() || data.title;
    const submittedAt = new Date().toISOString();

    const { data: inserted, error } = await sb
      .from("academic_council_topics")
      .insert({
        council_id: data.council_id,
        title: data.title,
        body,
        submitted_by: context.userId,
        status: "submitted",
        submitted_at: submittedAt,
        meeting_id: null,
      })
      .select("id, status")
      .maybeSingle();

    if (error) throwDbError(error);
    if (!inserted) throw new Error(RLS_DENIED_MESSAGE);

    return {
      ok: true,
      topic_id: inserted.id as string,
      status: "submitted",
    };
  });
