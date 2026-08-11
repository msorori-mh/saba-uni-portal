// Faculty portal functions for academic councils.
// Uses user session (context.supabase) — no service role.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type {
  CouncilAgendaItem,
  CouncilLinkMemberRole,
  GetAgendaItemsForMeetingResult,
} from "@/lib/admin-councils.functions";
import {
  getExt,
  safeFileName,
  validateUploadMetadata,
} from "@/lib/storage-validation";
import {
  INTAKE_ERRORS,
  getIntakeValidationError,
} from "@/lib/council-topic-lifecycle";

type FacultySupabase = SupabaseClient<Database>;

const RLS_DENIED_MESSAGE =
  "تعذّر تنفيذ العملية بسبب قيود الصلاحيات الحالية.";
const VIEWER_SUBMIT_DENIED_MESSAGE =
  "دور المطّلع لا يسمح بتقديم موضوعات للمجلس.";
const NOT_ACTIVE_MEMBER_MESSAGE =
  "لا يمكن تقديم موضوع لمجلس لست عضواً فعّالاً فيه بدور يسمح بالتقديم.";

const VIEWER_UPLOAD_DENIED_MESSAGE =
  "لا تملك صلاحية رفع مرفقات لهذا الموضوع.";
const ATTACHMENT_READ_DENIED_MESSAGE =
  "لا تملك صلاحية فتح هذا المرفق.";
const MAX_TOPIC_ATTACHMENTS = 5;
const COUNCIL_TOPIC_ATTACHMENTS_BUCKET = "council-topic-attachments";
const SIGNED_URL_EXPIRES_SECONDS = 300;

const TOPIC_ATTACHMENT_UPLOAD_STATUSES = new Set([
  "draft",
  "needs_completion",
  "submitted",
]);

const TOPIC_SUBMIT_ROLES = new Set([
  "chair",
  "vice_chair",
  "secretary",
  "member",
]);

const MEETINGS_LOAD_FAILED_MESSAGE = "تعذر تحميل الاجتماعات.";
const AGENDA_LOAD_FAILED_MESSAGE = "تعذر تحميل جدول الأعمال.";
const SESSION_EXPIRED_MESSAGE =
  "انتهت جلسة تسجيل الدخول، يرجى تسجيل الدخول مرة أخرى.";

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

export type CouncilMeetingV2Item = {
  meeting_id: string;
  council_id: string;
  council_name: string;
  meeting_number: number;
  meeting_title: string;
  scheduled_at: string;
  status: string;
  location: string | null;
  intake_opens_at: string | null;
  intake_closes_at: string | null;
  notes: string | null;
  agenda_summary: string | null;
  minutes_summary: string | null;
  user_membership_role: string | null;
  created_at: string;
  updated_at: string;
};

export type MyCouncilMeetingsV2Result = {
  upcomingMeetings: CouncilMeetingV2Item[];
  previousMeetings: CouncilMeetingV2Item[];
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

export type EditCouncilTopicResult = {
  ok: true;
  topic_id: string;
  status: string;
};

export type ResubmitCouncilTopicResult = {
  ok: true;
  topic_id: string;
  status: "submitted";
};

export type CouncilTopicReviewQueueItem = MyCouncilTopicItem & {
  submitted_by_name: string | null;
};

export type GetCouncilTopicReviewQueueResult = {
  queue: CouncilTopicReviewQueueItem[];
};

export type OpenIntakeMeetingItem = {
  meeting_id: string;
  council_id: string;
  council_name: string;
  meeting_title: string;
  scheduled_at: string;
  intake_opens_at: string | null;
  intake_closes_at: string | null;
};

export type CouncilTopicAttachmentItem = {
  id: string;
  topic_id: string;
  council_id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  file_ext: string;
  created_at: string;
  uploaded_by: string;
};

export type PrepareCouncilTopicAttachmentUploadResult = {
  attachment_id: string;
  bucket: string;
  file_path: string;
};

export type CouncilTopicAttachmentSignedUrlResult = {
  signedUrl: string;
  expiresIn: number;
  fileName: string;
  mimeType: string;
};

export type CouncilAttendanceRollMember = {
  attendance_id: string;
  membership_id: string;
  user_id: string;
  member_role: string;
  attendance_state: string;
  recorded_at: string | null;
  recorded_by: string | null;
};

export type CouncilAttendanceRollResult = {
  roll_id: string | null;
  status: string | null;
  eligible_member_count: number;
  finalized_at: string | null;
  finalized_by: string | null;
  members: CouncilAttendanceRollMember[];
  latest_evaluation: {
    evaluation_id: string;
    eligible_member_count: number;
    present_member_count: number;
    required_member_count: number;
    quorum_met: boolean;
    evaluated_at: string;
    policy_version: number;
    is_final: boolean;
  } | null;
};

export type CouncilQuorumPolicyResult = {
  policy_id: string;
  policy_version: number;
  threshold_kind: string;
  absolute_count: number | null;
  ratio_numerator: number | null;
  ratio_denominator: number | null;
};

// ============================================================================
// SHARED HELPERS
// ============================================================================

function throwDbError(error: { code?: string; message: string }): never {
  const msg = error.message;
  const lower = msg.toLowerCase();
  if (msg.includes("COUNCIL_TOPIC_INTAKE_DENIED")) {
    throw new Error(INTAKE_ERRORS.NOT_INTAKE_OPEN);
  }
  if (msg.includes("COUNCIL_TOPIC_OWNER_DENIED")) {
    throw new Error("لا يمكن تعديل موضوع لم تقم أنت بتقديمه.");
  }
  if (msg.includes("COUNCIL_TOPIC_NOT_EDITABLE")) {
    throw new Error("لا يمكن تعديل الموضوع في حالته الحالية.");
  }
  if (msg.includes("COUNCIL_TOPIC_NOT_RESUBMITTABLE")) {
    throw new Error("لا يمكن إعادة تقديم هذا الموضوع في حالته الحالية.");
  }
  if (
    error.code === "42501" ||
    lower.includes("policy") ||
    lower.includes("permission denied") ||
    lower.includes("row-level security") ||
    lower.includes("council_")
  ) {
    throw new Error(RLS_DENIED_MESSAGE);
  }
  throw new Error(error.message);
}

export function isActiveMembership(
  row: { is_active: boolean; active_to: string | null },
  todayDate: string = new Date().toISOString().slice(0, 10),
): boolean {
  if (!row.is_active) return false;
  if (row.active_to === null) return true;
  const activeToDate = row.active_to.slice(0, 10);
  return activeToDate >= todayDate;
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

function isSessionExpiredError(error: { code?: string; message: string }): boolean {
  const msg = error.message.toLowerCase();
  return (
    error.code === "PGRST301" ||
    msg.includes("jwt expired") ||
    msg.includes("invalid jwt") ||
    msg.includes("token is expired")
  );
}

function throwMeetingsLoadError(error: { code?: string; message: string }): never {
  if (isSessionExpiredError(error)) {
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }
  throw new Error(MEETINGS_LOAD_FAILED_MESSAGE);
}

type MeetingRow = {
  id: string;
  council_id: string;
  title: string;
  scheduled_at: string;
  status: string;
  location: string | null;
  meeting_number: number;
  intake_opens_at: string | null;
  intake_closes_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  council: { name: string } | { name: string }[] | null;
};

async function loadMeetingAgendaAndMinutes(
  sb: FacultySupabase,
  meetingIds: string[],
): Promise<{
  agendaByMeeting: Map<string, Array<{ title: string; order_index: number }>>;
  minutesByMeeting: Map<string, string>;
}> {
  const agendaByMeeting = new Map<string, Array<{ title: string; order_index: number }>>();
  const minutesByMeeting = new Map<string, string>();

  if (meetingIds.length === 0) {
    return { agendaByMeeting, minutesByMeeting };
  }

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

  if (agendaRes.error) throwMeetingsLoadError(agendaRes.error);
  if (minutesRes.error) throwMeetingsLoadError(minutesRes.error);

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

  return { agendaByMeeting, minutesByMeeting };
}

function splitMeetingsBySchedule<T extends { scheduled_at: string }>(
  items: T[],
  nowIso: string,
): { upcomingMeetings: T[]; previousMeetings: T[] } {
  const upcomingMeetings = items
    .filter((m) => m.scheduled_at >= nowIso)
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const previousMeetings = items
    .filter((m) => m.scheduled_at < nowIso)
    .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));
  return { upcomingMeetings, previousMeetings };
}

type MembershipRoleRow = {
  council_id: string;
  member_role: string;
  active_from: string;
  active_to: string | null;
  is_active: boolean;
};

const ROLE_RANK: Record<string, number> = {
  chair: 5,
  vice_chair: 4,
  secretary: 3,
  member: 2,
  viewer: 1,
};

export function membershipRoleAt(
  memberships: MembershipRoleRow[],
  councilId: string,
  atIso: string,
): string | null {
  const atDate = atIso.slice(0, 10);
  const activeMatches = memberships.filter(
    (m) =>
      Boolean(m.is_active) &&
      m.council_id === councilId &&
      m.active_from <= atDate &&
      (m.active_to === null || m.active_to >= atDate),
  );

  if (activeMatches.length === 0) return null;

  activeMatches.sort((a, b) => {
    const rankA = ROLE_RANK[a.member_role] ?? 0;
    const rankB = ROLE_RANK[b.member_role] ?? 0;
    if (rankA !== rankB) return rankB - rankA;
    return b.active_from.localeCompare(a.active_from);
  });

  return activeMatches[0]!.member_role;
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
        .order("active_from", { ascending: false })
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
    .order("active_from", { ascending: false })
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

function mapAttachmentDbError(error: { code?: string; message: string }): never {
  const msg = error.message.toLowerCase();
  if (
    msg.includes("maximum 5 active attachments") ||
    msg.includes("maximum 5 attachments")
  ) {
    throw new Error("لا يمكن إرفاق أكثر من 5 ملفات لكل موضوع.");
  }
  if (msg.includes("topic status does not allow attachments")) {
    throw new Error("لا يمكن إرفاق ملفات لهذا الموضوع في حالته الحالية.");
  }
  if (msg.includes("uploaded_by must match topic submitted_by")) {
    throw new Error(VIEWER_UPLOAD_DENIED_MESSAGE);
  }
  return throwDbError(error);
}

async function assertCanUploadCouncilTopicAttachment(
  sb: FacultySupabase,
  userId: string,
  topicId: string,
  councilId: string,
): Promise<void> {
  const { data: rpcAllowed, error: rpcErr } = await sb.rpc(
    "can_upload_council_topic_attachment" as never,
    { _user: userId, _topic_id: topicId, _council_id: councilId } as never,
  );

  if (!rpcErr && typeof rpcAllowed === "boolean") {
    if (!rpcAllowed) {
      const { data: membership } = await sb
        .from("academic_council_members")
        .select("member_role")
        .eq("user_id", userId)
        .eq("council_id", councilId)
        .eq("is_active", true)
        .order("active_from", { ascending: false })
        .maybeSingle();

      if (membership?.member_role === "viewer") {
        throw new Error(VIEWER_UPLOAD_DENIED_MESSAGE);
      }
      throw new Error(VIEWER_UPLOAD_DENIED_MESSAGE);
    }
    return;
  }

  const { data: topic, error: topicErr } = await sb
    .from("academic_council_topics")
    .select("id, council_id, submitted_by, status")
    .eq("id", topicId)
    .maybeSingle();
  if (topicErr) throwDbError(topicErr);
  if (!topic || topic.council_id !== councilId) {
    throw new Error(VIEWER_UPLOAD_DENIED_MESSAGE);
  }
  if (topic.submitted_by !== userId) {
    throw new Error(VIEWER_UPLOAD_DENIED_MESSAGE);
  }
  if (!TOPIC_ATTACHMENT_UPLOAD_STATUSES.has(topic.status as string)) {
    throw new Error("لا يمكن إرفاق ملفات لهذا الموضوع في حالته الحالية.");
  }

  await assertCanSubmitCouncilTopic(sb, userId, councilId);
}

function buildCouncilTopicAttachmentPath(
  councilId: string,
  topicId: string,
  attachmentId: string,
  originalFileName: string,
): string {
  const safeName = safeFileName(originalFileName);
  return `council-topics/${councilId}/${topicId}/${attachmentId}-${safeName}`;
}

const topicIdSchema = z.object({
  topic_id: z.string().uuid("معرّف الموضوع غير صالح"),
});

const attachmentIdSchema = z.object({
  attachment_id: z.string().uuid("معرّف المرفق غير صالح"),
});

const prepareCouncilTopicAttachmentUploadSchema = z.object({
  topic_id: z.string().uuid("معرّف الموضوع غير صالح"),
  council_id: z.string().uuid("معرّف المجلس غير صالح"),
  file_name: z.string().trim().min(1, "اسم الملف مطلوب").max(255, "اسم الملف طويل جداً"),
  file_size: z
    .number()
    .int("حجم الملف يجب أن يكون عدداً صحيحاً")
    .positive("حجم الملف غير صالح")
    .max(10 * 1024 * 1024, "حجم الملف أكبر من 10 م.ب"),
  mime_type: z.string().trim().min(1, "نوع الملف مطلوب"),
  file_ext: z.string().trim().min(1, "امتداد الملف مطلوب").max(10),
});

const submitCouncilTopicSchema = z.object({
  meeting_id: z.string().uuid("معرّف الاجتماع غير صالح"),
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

const editCouncilTopicSchema = z.object({
  topic_id: z.string().uuid("معرّف الموضوع غير صالح"),
  title: z
    .string()
    .trim()
    .min(5, "عنوان الموضوع يجب أن لا يقل عن 5 أحرف")
    .max(500, "عنوان الموضوع طويل جداً")
    .optional(),
  description: z
    .string()
    .trim()
    .max(8000, "وصف الموضوع طويل جداً")
    .optional(),
});

type MeetingIntakeContext = {
  meeting_id: string;
  council_id: string;
  status: string;
  intake_opens_at: string | null;
  intake_closes_at: string | null;
};

async function loadMeetingIntakeContext(
  sb: FacultySupabase,
  meetingId: string,
): Promise<MeetingIntakeContext | null> {
  const { data, error } = await sb
    .from("academic_council_meetings")
    .select("id, council_id, status, intake_opens_at, intake_closes_at")
    .eq("id", meetingId)
    .maybeSingle();
  if (error) throwDbError(error);
  if (!data) return null;
  return {
    meeting_id: data.id as string,
    council_id: data.council_id as string,
    status: data.status as string,
    intake_opens_at: (data.intake_opens_at as string | null) ?? null,
    intake_closes_at: (data.intake_closes_at as string | null) ?? null,
  };
}

async function assertCanSubmitToMeetingIntake(
  sb: FacultySupabase,
  userId: string,
  meetingId: string,
): Promise<MeetingIntakeContext> {
  const meeting = await loadMeetingIntakeContext(sb, meetingId);
  if (!meeting) throw new Error(INTAKE_ERRORS.NOT_ACTIVE_MEMBER);

  const { data: membership, error: membershipErr } = await sb
    .from("academic_council_members")
    .select("member_role, is_active, active_to")
    .eq("user_id", userId)
    .eq("council_id", meeting.council_id)
    .eq("is_active", true)
    .order("active_from", { ascending: false })
    .maybeSingle();
  if (membershipErr) throwDbError(membershipErr);

  const isActive =
    Boolean(membership) &&
    isActiveMembership({
      is_active: Boolean(membership?.is_active),
      active_to: (membership?.active_to as string | null) ?? null,
    });

  const error = getIntakeValidationError({
    meetingStatus: meeting.status,
    intakeOpensAt: meeting.intake_opens_at,
    intakeClosesAt: meeting.intake_closes_at,
    nowIso: new Date().toISOString(),
    memberRole: (membership?.member_role as string | null) ?? null,
    isActiveMember: isActive,
  });
  if (error) throw new Error(error);

  return meeting;
}

// ============================================================================
// LEGACY — active memberships only (used by current faculty UI)
// ============================================================================

export const getMyAcademicCouncilMemberships = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyAcademicCouncilMembership[]> => {
    const sb = context.supabase;
    await assertActiveFacultyProfile(sb, context.userId);

    const todayDate = new Date().toISOString().slice(0, 10);
    const { data: rows, error } = await sb
      .from("academic_council_members")
      .select(
        "id, member_role, is_active, active_from, active_to, council:academic_councils(id, name, council_type, is_active)",
      )
      .eq("user_id", context.userId)
      .eq("is_active", true)
      .order("active_from", { ascending: false });
    if (error) throw new Error("تعذّر تحميل عضويات المجالس");

    return (rows ?? [])
      .filter((row) =>
        isActiveMembership(
          {
            is_active: Boolean(row.is_active),
            active_to: (row.active_to as string | null) ?? null,
          },
          todayDate,
        ),
      )
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

    const todayDate = new Date().toISOString().slice(0, 10);
    const currentMemberships = mapped.filter((m) =>
      isActiveMembership({ is_active: m.is_active, active_to: m.active_to }, todayDate),
    );
    const previousMemberships = mapped.filter(
      (m) => !isActiveMembership({ is_active: m.is_active, active_to: m.active_to }, todayDate),
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

    if (meetingsRes.error) throwMeetingsLoadError(meetingsRes.error);

    const meetings = meetingsRes.data ?? [];
    const meetingIds = meetings.map((m) => m.id as string);
    const { agendaByMeeting, minutesByMeeting } = await loadMeetingAgendaAndMinutes(
      sb,
      meetingIds,
    );

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

export const getMyCouncilMeetingsV2 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyCouncilMeetingsV2Result> => {
    const sb = context.supabase;
    await assertActiveFacultyProfile(sb, context.userId);

    const [membershipRows, meetingsRes] = await Promise.all([
      loadMembershipRoleRows(sb, context.userId),
      sb
        .from("academic_council_meetings")
        .select(
          "id, council_id, meeting_number, title, scheduled_at, status, location, intake_opens_at, intake_closes_at, notes, created_at, updated_at, council:academic_councils(name)",
        )
        .order("scheduled_at", { ascending: false }),
    ]);

    if (meetingsRes.error) throwMeetingsLoadError(meetingsRes.error);

    const meetings = (meetingsRes.data ?? []) as MeetingRow[];
    const meetingIds = meetings.map((m) => m.id);
    const { agendaByMeeting, minutesByMeeting } = await loadMeetingAgendaAndMinutes(
      sb,
      meetingIds,
    );

    const nowIso = new Date().toISOString();
    const items: CouncilMeetingV2Item[] = meetings.map((row) => {
      const council = unwrapCouncil(row.council);
      const scheduledAt = row.scheduled_at;
      return {
        meeting_id: row.id,
        council_id: row.council_id,
        council_name: council?.name ?? "",
        meeting_number: row.meeting_number,
        meeting_title: row.title,
        scheduled_at: scheduledAt,
        status: row.status,
        location: row.location,
        intake_opens_at: row.intake_opens_at,
        intake_closes_at: row.intake_closes_at,
        notes: row.notes,
        agenda_summary: buildAgendaSummary(agendaByMeeting.get(row.id) ?? []),
        minutes_summary: minutesByMeeting.get(row.id) ?? null,
        user_membership_role: membershipRoleAt(
          membershipRows,
          row.council_id,
          scheduledAt,
        ),
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    });

    return splitMeetingsBySchedule(items, nowIso);
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
// SUBMIT / EDIT / RESUBMIT TOPIC — RPC-only write path (C2 intake-aware)
// ============================================================================

export const submitCouncilTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const parsed = submitCouncilTopicSchema.parse(input);
    if (typeof input === "object" && input !== null) {
      const raw = input as Record<string, unknown>;
      if (
        "council_id" in raw ||
        "status" in raw ||
        "admin_notes" in raw ||
        "review_note" in raw ||
        "reviewed_by" in raw ||
        "submitted_by" in raw ||
        "submitted_at" in raw
      ) {
        throw new Error(
          "لا يمكن تمرير council_id أو status أو حقول المراجعة أو الإرسال من الواجهة",
        );
      }
    }
    return parsed;
  })
  .handler(async ({ data, context }): Promise<SubmitCouncilTopicResult> => {
    const sb = context.supabase;
    await assertActiveFacultyProfile(sb, context.userId);
    const meeting = await assertCanSubmitToMeetingIntake(
      sb,
      context.userId,
      data.meeting_id,
    );

    const body = data.description?.trim() || data.title;

    const { data: insertedRpc, error } = await sb.rpc(
      "council_submit_topic" as never,
      {
        p_council_id: meeting.council_id,
        p_meeting_id: data.meeting_id,
        p_title: data.title,
        p_body: body,
        p_category: null,
      } as never,
    );

    if (error) throwDbError(error);
    if (!insertedRpc || typeof insertedRpc !== "object") {
      throw new Error(RLS_DENIED_MESSAGE);
    }
    const payload = insertedRpc as Record<string, unknown>;
    if (!payload.ok || typeof payload.topic_id !== "string") {
      throw new Error(RLS_DENIED_MESSAGE);
    }

    return {
      ok: true,
      topic_id: payload.topic_id,
      status: "submitted",
    };
  });

export const editCouncilTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const parsed = editCouncilTopicSchema.parse(input);
    if (typeof input === "object" && input !== null) {
      const raw = input as Record<string, unknown>;
      if (
        "council_id" in raw ||
        "meeting_id" in raw ||
        "status" in raw ||
        "review_note" in raw ||
        "reviewed_by" in raw ||
        "submitted_by" in raw ||
        "submitted_at" in raw
      ) {
        throw new Error(
          "لا يمكن تعديل معرّف المجلس أو الاجتماع أو الحالة أو حقول المراجعة",
        );
      }
    }
    return parsed;
  })
  .handler(async ({ data, context }): Promise<EditCouncilTopicResult> => {
    const sb = context.supabase;
    await assertActiveFacultyProfile(sb, context.userId);

    const { data: updatedRpc, error } = await sb.rpc(
      "council_update_own_topic_draft" as never,
      {
        p_topic_id: data.topic_id,
        p_title: data.title ?? null,
        p_body: data.description ?? null,
        p_category: null,
      } as never,
    );

    if (error) throwDbError(error);
    const payload = (updatedRpc ?? {}) as Record<string, unknown>;
    if (!payload.ok || typeof payload.topic_id !== "string") {
      throw new Error(RLS_DENIED_MESSAGE);
    }

    return {
      ok: true,
      topic_id: payload.topic_id,
      status: (payload.status as string) ?? "draft",
    };
  });

export const resubmitCouncilTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => topicIdSchema.parse(input))
  .handler(async ({ data, context }): Promise<ResubmitCouncilTopicResult> => {
    const sb = context.supabase;
    await assertActiveFacultyProfile(sb, context.userId);

    const { data: rpcResult, error } = await sb.rpc(
      "council_resubmit_topic" as never,
      { p_topic_id: data.topic_id } as never,
    );

    if (error) throwDbError(error);
    const payload = (rpcResult ?? {}) as Record<string, unknown>;
    if (!payload.ok || typeof payload.topic_id !== "string") {
      throw new Error(RLS_DENIED_MESSAGE);
    }

    return {
      ok: true,
      topic_id: payload.topic_id,
      status: "submitted",
    };
  });

export const getOpenIntakeMeetingsForMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OpenIntakeMeetingItem[]> => {
    const sb = context.supabase;
    await assertActiveFacultyProfile(sb, context.userId);

    const nowIso = new Date().toISOString();

    const { data: membershipRows, error: membershipErr } = await sb
      .from("academic_council_members")
      .select("council_id, member_role")
      .eq("user_id", context.userId)
      .eq("is_active", true)
      .is("active_to", null);
    if (membershipErr) throwDbError(membershipErr);

    const eligibleCouncilIds = (membershipRows ?? [])
      .filter((m) => {
        const role = m.member_role as string;
        return role !== "viewer" && TOPIC_SUBMIT_ROLES.has(role);
      })
      .map((m) => m.council_id as string);

    if (eligibleCouncilIds.length === 0) return [];

    const { data: rows, error } = await sb
      .from("academic_council_meetings")
      .select(
        "id, council_id, title, scheduled_at, intake_opens_at, intake_closes_at, council:academic_councils(name)",
      )
      .in("council_id", eligibleCouncilIds)
      .eq("status", "intake_open")
      .order("scheduled_at", { ascending: true });
    if (error) throwDbError(error);

    return (rows ?? [])
      .filter((row) => {
        const opens = (row.intake_opens_at as string | null) ?? null;
        const closes = (row.intake_closes_at as string | null) ?? null;
        if (opens && opens > nowIso) return false;
        if (closes && closes < nowIso) return false;
        return true;
      })
      .map((row) => {
        const council = unwrapCouncil(
          row.council as { name: string } | { name: string }[] | null,
        );
        return {
          meeting_id: row.id as string,
          council_id: row.council_id as string,
          council_name: council?.name ?? "",
          meeting_title: row.title as string,
          scheduled_at: row.scheduled_at as string,
          intake_opens_at: (row.intake_opens_at as string | null) ?? null,
          intake_closes_at: (row.intake_closes_at as string | null) ?? null,
        };
      });
  });

export const getCouncilTopicReviewQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GetCouncilTopicReviewQueueResult> => {
    const sb = context.supabase;
    await assertActiveFacultyProfile(sb, context.userId);

    const { data: membershipRows, error: membershipErr } = await sb
      .from("academic_council_members")
      .select("council_id, member_role")
      .eq("user_id", context.userId)
      .eq("is_active", true)
      .is("active_to", null);
    if (membershipErr) throwDbError(membershipErr);

    const reviewableCouncilIds = (membershipRows ?? [])
      .filter((m) => {
        const role = m.member_role as string;
        return role === "chair" || role === "secretary";
      })
      .map((m) => m.council_id as string);

    if (reviewableCouncilIds.length === 0) {
      return { queue: [] };
    }

    const { data: rows, error } = await sb
      .from("academic_council_topics")
      .select(
        "id, council_id, meeting_id, title, body, status, submitted_by, submitted_at, created_at, updated_at, review_note, council:academic_councils(name)",
      )
      .in("council_id", reviewableCouncilIds)
      .in("status", [
        "submitted",
        "under_review",
        "needs_completion",
        "accepted_for_agenda",
        "rejected",
      ])
      .order("submitted_at", { ascending: false });
    if (error) throwDbError(error);

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

    const submitterIds = Array.from(
      new Set((rows ?? []).map((r) => r.submitted_by as string)),
    );
    const profileByUser = new Map<string, string>();
    if (submitterIds.length > 0) {
      const { data: profiles, error: profileErr } = await sb
        .from("faculty_profiles")
        .select("user_id, full_name_ar")
        .in("user_id", submitterIds);
      if (profileErr) throwDbError(profileErr);
      for (const p of profiles ?? []) {
        profileByUser.set(p.user_id as string, p.full_name_ar as string);
      }
    }

    const queue: CouncilTopicReviewQueueItem[] = (rows ?? []).map((row) => {
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
        submitted_by_name: profileByUser.get(row.submitted_by as string) ?? null,
        submitted_at: (row.submitted_at as string | null) ?? null,
        created_at: row.created_at as string,
        updated_at: row.updated_at as string,
        admin_notes: (row.review_note as string | null) ?? null,
        agenda_order: agendaOrderByTopic.get(topicId) ?? null,
      };
    });

    return { queue };
  });

// ============================================================================
// TOPIC ATTACHMENTS — read + prepare upload + signed URL (context.supabase only)
// ============================================================================

export const getCouncilTopicAttachments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => topicIdSchema.parse(input))
  .handler(async ({ data, context }): Promise<CouncilTopicAttachmentItem[]> => {
    const sb = context.supabase;
    await assertActiveFacultyProfile(sb, context.userId);

    const { data: rows, error } = await sb
      .from("academic_council_topic_attachments")
      .select(
        "id, topic_id, council_id, file_name, file_size, mime_type, file_ext, created_at, uploaded_by",
      )
      .eq("topic_id", data.topic_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) throwDbError(error);

    return (rows ?? []).map((row) => ({
      id: row.id as string,
      topic_id: row.topic_id as string,
      council_id: row.council_id as string,
      file_name: row.file_name as string,
      file_size: row.file_size as number,
      mime_type: row.mime_type as string,
      file_ext: row.file_ext as string,
      created_at: row.created_at as string,
      uploaded_by: row.uploaded_by as string,
    }));
  });

export const getCouncilTopicAttachmentSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => attachmentIdSchema.parse(input))
  .handler(async ({ data, context }): Promise<CouncilTopicAttachmentSignedUrlResult> => {
    const sb = context.supabase;
    await assertActiveFacultyProfile(sb, context.userId);

    const { data: row, error } = await sb
      .from("academic_council_topic_attachments")
      .select("id, file_name, file_path, mime_type, storage_bucket")
      .eq("id", data.attachment_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throwDbError(error);
    if (!row) throw new Error(ATTACHMENT_READ_DENIED_MESSAGE);

    const bucket = row.storage_bucket as string;
    const filePath = row.file_path as string;

    const { data: signed, error: signErr } = await sb.storage
      .from(bucket)
      .createSignedUrl(filePath, SIGNED_URL_EXPIRES_SECONDS);

    if (signErr || !signed?.signedUrl) {
      throw new Error(ATTACHMENT_READ_DENIED_MESSAGE);
    }

    return {
      signedUrl: signed.signedUrl,
      expiresIn: SIGNED_URL_EXPIRES_SECONDS,
      fileName: row.file_name as string,
      mimeType: row.mime_type as string,
    };
  });

export const prepareCouncilTopicAttachmentUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const parsed = prepareCouncilTopicAttachmentUploadSchema.parse(input);
    if (typeof input === "object" && input !== null) {
      const raw = input as Record<string, unknown>;
      if ("file_path" in raw || "attachment_id" in raw || "storage_bucket" in raw) {
        throw new Error("لا يمكن تمرير مسار التخزين أو معرّف المرفق من الواجهة");
      }
    }
    return parsed;
  })
  .handler(async ({ data, context }): Promise<PrepareCouncilTopicAttachmentUploadResult> => {
    const sb = context.supabase;
    await assertActiveFacultyProfile(sb, context.userId);
    await assertCanUploadCouncilTopicAttachment(
      sb,
      context.userId,
      data.topic_id,
      data.council_id,
    );

    const extFromName = getExt(data.file_name);
    const normalizedExt = data.file_ext.trim().toLowerCase();
    if (!extFromName || extFromName !== normalizedExt) {
      throw new Error("امتداد الملف لا يطابق اسم الملف المرفوع.");
    }

    const validation = validateUploadMetadata(
      {
        fileName: data.file_name,
        fileSize: data.file_size,
        mimeType: data.mime_type,
      },
      "council_topic_attachment",
    );
    if (!validation.ok) throw new Error(validation.message);

    const { count, error: countErr } = await sb
      .from("academic_council_topic_attachments")
      .select("id", { count: "exact", head: true })
      .eq("topic_id", data.topic_id)
      .is("deleted_at", null);
    if (countErr) throwDbError(countErr);
    if ((count ?? 0) >= MAX_TOPIC_ATTACHMENTS) {
      throw new Error("لا يمكن إرفاق أكثر من 5 ملفات لكل موضوع.");
    }

    const attachmentId = crypto.randomUUID();
    const filePath = buildCouncilTopicAttachmentPath(
      data.council_id,
      data.topic_id,
      attachmentId,
      data.file_name,
    );

    const { data: inserted, error: insertErr } = await sb
      .from("academic_council_topic_attachments")
      .insert({
        id: attachmentId,
        topic_id: data.topic_id,
        council_id: data.council_id,
        uploaded_by: context.userId,
        file_name: data.file_name,
        file_path: filePath,
        file_size: data.file_size,
        mime_type: data.mime_type,
        file_ext: normalizedExt,
        storage_bucket: COUNCIL_TOPIC_ATTACHMENTS_BUCKET,
      })
      .select("id, file_path, storage_bucket")
      .maybeSingle();

    if (insertErr) mapAttachmentDbError(insertErr);
    if (!inserted) throw new Error(RLS_DENIED_MESSAGE);

    return {
      attachment_id: inserted.id as string,
      bucket: inserted.storage_bucket as string,
      file_path: inserted.file_path as string,
    };
  });

// ============================================================================
// AGENDA — read-only for faculty council members (context.supabase + RLS)
// ============================================================================

const meetingIdSchema = z.string().uuid("معرّف الاجتماع غير صالح");

function mapFacultyAgendaLoadError(error: { code?: string; message: string }): never {
  if (isSessionExpiredError(error)) {
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }
  throw new Error(AGENDA_LOAD_FAILED_MESSAGE);
}

function mapFacultyAgendaItemRow(row: Record<string, unknown>): CouncilAgendaItem {
  const topicRaw = row.topic as Record<string, unknown> | Record<string, unknown>[] | null;
  const topicRow = Array.isArray(topicRaw) ? topicRaw[0] ?? null : topicRaw;

  return {
    id: row.id as string,
    meeting_id: row.meeting_id as string,
    topic_id: (row.topic_id as string | null) ?? null,
    title: row.title as string,
    order_index: row.order_index as number,
    notes: (row.notes as string | null) ?? null,
    is_approved: Boolean(row.is_approved),
    approved_by: (row.approved_by as string | null) ?? null,
    approved_at: (row.approved_at as string | null) ?? null,
    created_by: row.created_by as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    updated_by: (row.updated_by as string | null) ?? null,
    session_status: (row.session_status as string | null) ?? null,
    resolution: (row.resolution as string | null) ?? null,
    topic: topicRow
      ? {
          id: topicRow.id as string,
          title: topicRow.title as string,
          status: topicRow.status as string,
          submitted_by: topicRow.submitted_by as string,
          submitted_at: (topicRow.submitted_at as string | null) ?? null,
          review_note: (topicRow.review_note as string | null) ?? null,
        }
      : null,
  };
}

export const getAgendaItemsForMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ meetingId: meetingIdSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<GetAgendaItemsForMeetingResult> => {
    const sb = context.supabase;
    await assertActiveFacultyProfile(sb, context.userId);

    const { data: meetingRow, error: meetingErr } = await sb
      .from("academic_council_meetings")
      .select(
        "id, council_id, title, scheduled_at, status, council:academic_councils(name, council_type)",
      )
      .eq("id", data.meetingId)
      .maybeSingle();
    if (meetingErr) mapFacultyAgendaLoadError(meetingErr);
    if (!meetingRow) throw new Error(AGENDA_LOAD_FAILED_MESSAGE);

    const council = unwrapCouncil(
      meetingRow.council as { name: string; council_type: string } | { name: string; council_type: string }[] | null,
    );

    const { data: rows, error } = await sb
      .from("academic_council_agenda_items")
      .select(
        "id, meeting_id, topic_id, title, order_index, notes, is_approved, approved_by, approved_at, created_by, created_at, updated_at, updated_by, session_status, resolution, topic:academic_council_topics(id, title, status, submitted_by, submitted_at, review_note)",
      )
      .eq("meeting_id", data.meetingId)
      .order("order_index", { ascending: true });
    if (error) mapFacultyAgendaLoadError(error);

    return {
      meeting: {
        id: meetingRow.id as string,
        council_id: meetingRow.council_id as string,
        title: meetingRow.title as string,
        scheduled_at: meetingRow.scheduled_at as string,
        status: meetingRow.status as string,
        council_name: council?.name ?? "",
        council_type: council?.council_type ?? "",
      },
      items: (rows ?? []).map((row) => mapFacultyAgendaItemRow(row as Record<string, unknown>)),
    };
  });

// ============================================================================
// ATTENDANCE + QUORUM
// ============================================================================

const ATTENDANCE_STATE_OPTIONS: Array<{
  value: string;
  label: string;
}> = [
  { value: "present", label: "حاضر" },
  { value: "present_remote", label: "حاضر عن بُعد" },
  { value: "excused", label: "معذور" },
  { value: "absent", label: "غائب" },
];

function mapAttendanceRpcError(message: string): string {
  const msg = message ?? "";
  if (msg.includes("COUNCIL_QUORUM_POLICY_CHAIR_REQUIRED")) {
    return "رئيس المجلس فقط من يمكنه اعتماد سياسة النصاب.";
  }
  if (msg.includes("COUNCIL_ATTENDANCE_SECRETARY_REQUIRED")) {
    return "أمين سر المجلس فقط من يمكنه تسجيل الحضور.";
  }
  if (msg.includes("COUNCIL_ATTENDANCE_FINALIZE_CHAIR_REQUIRED")) {
    return "رئيس المجلس فقط من يمكنه اعتماد سجل الحضور.";
  }
  if (msg.includes("COUNCIL_ATTENDANCE_LOCKED")) {
    return "سجل الحضور مغلق ولا يمكن تعديله.";
  }
  if (msg.includes("COUNCIL_ATTENDANCE_MEMBER_NOT_IN_SNAPSHOT")) {
    return "أحد الأعضاء المحددين غير موجود في لقطة الحضور.";
  }
  if (msg.includes("COUNCIL_QUORUM_POLICY_REQUIRED")) {
    return "لا توجد سياسة نصاب معتمدة لهذا المجلس.";
  }
  if (msg.includes("COUNCIL_QUORUM_FAIL_CLOSED")) {
    return "فشل تقييم النصاب؛ تأكد من وجود أعضاء مؤهلين وسياسة صالحة.";
  }
  if (msg.includes("COUNCIL_INVALID_ATTENDANCE_STATE")) {
    return "حالة حضور غير صالحة.";
  }
  if (msg.includes("COUNCIL_ATTENDANCE_ENTRIES_REQUIRED")) {
    return "يجب تحديد حالة حضور واحدة على الأقل.";
  }
  return RLS_DENIED_MESSAGE;
}

export const getCouncilAttendanceRoll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ meetingId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;

    const { data: rollRows, error: rollError } = await sb
      .from("academic_council_meeting_attendance_rolls")
      .select("id, status, eligible_member_count, finalized_at, finalized_by")
      .eq("meeting_id", data.meetingId)
      .maybeSingle();

    if (rollError) throw new Error(MEETINGS_LOAD_FAILED_MESSAGE);

    let members: CouncilAttendanceRollMember[] = [];
    if (rollRows?.id) {
      const { data: memberRows, error: memberError } = await sb
        .from("academic_council_meeting_attendance")
        .select(
          "id, membership_id, user_id, member_role, attendance_state, recorded_at, recorded_by",
        )
        .eq("meeting_id", data.meetingId)
        .order("member_role", { ascending: false });

      if (memberError) throw new Error(MEETINGS_LOAD_FAILED_MESSAGE);

      members = (memberRows ?? []).map((m) => ({
        attendance_id: m.id,
        membership_id: m.membership_id,
        user_id: m.user_id,
        member_role: m.member_role,
        attendance_state: m.attendance_state,
        recorded_at: m.recorded_at,
        recorded_by: m.recorded_by,
      }));
    } else {
      // No roll yet: show the eligible membership snapshot so the secretary can
      // record the first attendance states (the RPC creates the roll on save).
      const { data: meetingRow } = await sb
        .from("academic_council_meetings")
        .select("council_id")
        .eq("id", data.meetingId)
        .maybeSingle();

      if (meetingRow?.council_id) {
        const today = new Date().toISOString().slice(0, 10);
        const { data: eligibleRows } = await sb
          .from("academic_council_members")
          .select("id, user_id, member_role, active_to")
          .eq("council_id", meetingRow.council_id)
          .eq("is_active", true)
          .in("member_role", ["chair", "vice_chair", "secretary", "member"])
          .order("member_role", { ascending: false });

        members = (eligibleRows ?? [])
          .filter((m) => !m.active_to || (m.active_to as string) > today)
          .map((m) => ({
            attendance_id: "",
            membership_id: m.id as string,
            user_id: m.user_id as string,
            member_role: m.member_role as string,
            attendance_state: "absent",
            recorded_at: null,
            recorded_by: null,
          }));
      }
    }


    let latestEvaluation: CouncilAttendanceRollResult["latest_evaluation"] = null;
    const { data: evalRows, error: evalError } = await sb
      .from("academic_council_meeting_quorum_evaluations")
      .select(
        "id, eligible_member_count, present_member_count, required_member_count, quorum_met, evaluated_at, policy_version, is_final",
      )
      .eq("meeting_id", data.meetingId)
      .order("evaluated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!evalError && evalRows) {
      latestEvaluation = {
        evaluation_id: evalRows.id,
        eligible_member_count: evalRows.eligible_member_count,
        present_member_count: evalRows.present_member_count,
        required_member_count: evalRows.required_member_count,
        quorum_met: evalRows.quorum_met,
        evaluated_at: evalRows.evaluated_at,
        policy_version: evalRows.policy_version,
        is_final: evalRows.is_final,
      };
    }

    return {
      roll_id: rollRows?.id ?? null,
      status: rollRows?.status ?? null,
      eligible_member_count: rollRows?.eligible_member_count ?? members.length,
      finalized_at: rollRows?.finalized_at ?? null,
      finalized_by: rollRows?.finalized_by ?? null,
      members,
      latest_evaluation: latestEvaluation,
    } satisfies CouncilAttendanceRollResult;
  });

export const getCouncilCurrentQuorumPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ councilId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: policyRows, error } = await sb
      .from("academic_council_quorum_policies")
      .select(
        "id, policy_version, threshold_kind, absolute_count, ratio_numerator, ratio_denominator",
      )
      .eq("council_id", data.councilId)
      .eq("status", "approved")
      .order("policy_version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(MEETINGS_LOAD_FAILED_MESSAGE);
    if (!policyRows) return null;
    return {
      policy_id: policyRows.id,
      policy_version: policyRows.policy_version,
      threshold_kind: policyRows.threshold_kind,
      absolute_count: policyRows.absolute_count,
      ratio_numerator: policyRows.ratio_numerator,
      ratio_denominator: policyRows.ratio_denominator,
    } satisfies CouncilQuorumPolicyResult;
  });

export const approveCouncilQuorumPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        councilId: z.string().uuid(),
        thresholdKind: z.enum(["absolute", "ratio"]),
        absoluteCount: z.number().int().positive().nullable().optional(),
        ratioNumerator: z.number().int().positive().nullable().optional(),
        ratioDenominator: z.number().int().positive().nullable().optional(),
      })
      .refine(
        (v) => {
          if (v.thresholdKind === "absolute") {
            return typeof v.absoluteCount === "number" && v.absoluteCount > 0;
          }
          return (
            typeof v.ratioNumerator === "number" &&
            typeof v.ratioDenominator === "number" &&
            v.ratioNumerator > 0 &&
            v.ratioDenominator > 0 &&
            v.ratioNumerator <= v.ratioDenominator
          );
        },
        { message: "بيانات سياسة النصاب غير صالحة." },
      )
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    await assertActiveFacultyProfile(sb, context.userId);

    const { data: rpc, error } = await sb.rpc("council_approve_quorum_policy" as never, {
      p_council_id: data.councilId,
      p_threshold_kind: data.thresholdKind,
      p_absolute_count: data.thresholdKind === "absolute" ? data.absoluteCount : null,
      p_ratio_numerator: data.thresholdKind === "ratio" ? data.ratioNumerator : null,
      p_ratio_denominator: data.thresholdKind === "ratio" ? data.ratioDenominator : null,
    } as never);

    if (error) {
      throw new Error(mapAttendanceRpcError(error.message));
    }

    const payload = (rpc ?? {}) as Record<string, unknown>;
    return {
      ok: payload.ok === true,
      policy_id: String(payload.policy_id ?? ""),
      policy_version: Number(payload.policy_version ?? 0),
    };
  });

export const recordCouncilAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        meetingId: z.string().uuid(),
        entries: z.array(
          z.object({
            membership_id: z.string().uuid(),
            attendance_state: z.enum(["present", "present_remote", "excused", "absent"]),
          }),
        ),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    await assertActiveFacultyProfile(sb, context.userId);

    const { data: rpc, error } = await sb.rpc("record_council_meeting_attendance" as never, {
      p_meeting_id: data.meetingId,
      p_entries: data.entries.map((e) => ({
        membership_id: e.membership_id,
        attendance_state: e.attendance_state,
      })),
    } as never);

    if (error) {
      throw new Error(mapAttendanceRpcError(error.message));
    }

    const payload = (rpc ?? {}) as Record<string, unknown>;
    return {
      ok: payload.ok === true,
      updated_count: Number(payload.updated_count ?? 0),
      eligible_member_count: Number(payload.eligible_member_count ?? 0),
    };
  });

export const evaluateCouncilMeetingQuorum = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ meetingId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    await assertActiveFacultyProfile(sb, context.userId);

    const { data: rpc, error } = await sb.rpc("evaluate_council_meeting_quorum" as never, {
      p_meeting_id: data.meetingId,
    } as never);

    if (error) {
      throw new Error(mapAttendanceRpcError(error.message));
    }

    const payload = (rpc ?? {}) as Record<string, unknown>;
    return {
      ok: payload.ok === true,
      eligible_member_count: Number(payload.eligible_member_count ?? 0),
      present_member_count: Number(payload.present_member_count ?? 0),
      required_member_count: Number(payload.required_member_count ?? 0),
      quorum_met: Boolean(payload.quorum_met),
      policy_version: Number(payload.policy_version ?? 0),
    };
  });

export const finalizeCouncilAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ meetingId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    await assertActiveFacultyProfile(sb, context.userId);

    const { data: rpc, error } = await sb.rpc("finalize_council_meeting_attendance" as never, {
      p_meeting_id: data.meetingId,
    } as never);

    if (error) {
      throw new Error(mapAttendanceRpcError(error.message));
    }

    const payload = (rpc ?? {}) as Record<string, unknown>;
    return {
      ok: payload.ok === true,
      roll_id: String(payload.roll_id ?? ""),
      evaluation_id: String(payload.evaluation_id ?? ""),
      eligible_member_count: Number(payload.eligible_member_count ?? 0),
      present_member_count: Number(payload.present_member_count ?? 0),
      required_member_count: Number(payload.required_member_count ?? 0),
      quorum_met: Boolean(payload.quorum_met),
    };
  });

/**
 * Chair-scoped meeting status transition for the faculty portal.
 * Authorization is enforced by the `council_transition_meeting` RPC
 * (exact council chair only); this wrapper adds no bypass.
 */
export const transitionMyCouncilMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        meetingId: z.string().uuid(),
        expectedStatus: z.string().min(1),
        toStatus: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    await assertActiveFacultyProfile(sb, context.userId);

    const { data: rpc, error } = await sb.rpc("council_transition_meeting" as never, {
      p_meeting_id: data.meetingId,
      p_expected_status: data.expectedStatus,
      p_to_status: data.toStatus,
      p_evidence: {},
    } as never);

    if (error) {
      const msg = `${error.message ?? ""}`;
      if (msg.includes("COUNCIL_TRANSITION_DENIED")) {
        throw new Error("لا تملك صلاحية تغيير حالة هذا الاجتماع (رئيس المجلس فقط).");
      }
      if (msg.includes("COUNCIL_MEETING_STALE_STATE")) {
        throw new Error("تغيّرت حالة الاجتماع، يرجى تحديث الصفحة ثم إعادة المحاولة.");
      }
      if (msg.includes("COUNCIL_TRANSITION_ILLEGAL")) {
        throw new Error("الانتقال المطلوب غير مسموح من الحالة الحالية.");
      }
      if (msg.includes("COUNCIL_TRANSITION_PREREQ_UNMET")) {
        throw new Error("متطلبات هذا الانتقال غير مكتملة بعد.");
      }
      if (msg.includes("COUNCIL_QUORUM_NOT_MET")) {
        throw new Error("النصاب غير مكتمل لبدء الجلسة.");
      }
      throw new Error(RLS_DENIED_MESSAGE);
    }

    const payload = (rpc ?? {}) as Record<string, unknown>;
    return {
      ok: payload.ok === true,
      meeting_id: String(payload.meeting_id ?? data.meetingId),
      to_status: String(payload.to_status ?? data.toStatus),
    };
  });

// ============================================================================
// ARCHIVED MEETINGS — archive page with council/decision-date/approval filters
// ============================================================================

export type ArchivedCouncilMeetingItem = CouncilMeetingV2Item & {
  minutes_approved_at: string | null;
  last_decision_at: string | null;
  decisions_count: number;
};

export const getMyArchivedCouncilMeetings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ meetings: ArchivedCouncilMeetingItem[] }> => {
    const sb = context.supabase;
    await assertActiveFacultyProfile(sb, context.userId);

    const [membershipRows, meetingsRes] = await Promise.all([
      loadMembershipRoleRows(sb, context.userId),
      sb
        .from("academic_council_meetings")
        .select(
          "id, council_id, meeting_number, title, scheduled_at, status, location, intake_opens_at, intake_closes_at, notes, created_at, updated_at, council:academic_councils(name)",
        )
        .eq("status", "archived")
        .order("scheduled_at", { ascending: false }),
    ]);

    if (meetingsRes.error) throwMeetingsLoadError(meetingsRes.error);

    const meetings = (meetingsRes.data ?? []) as MeetingRow[];
    const meetingIds = meetings.map((m) => m.id);

    const [{ agendaByMeeting, minutesByMeeting }, minutesMetaRes, decisionsRes] =
      await Promise.all([
        loadMeetingAgendaAndMinutes(sb, meetingIds),
        meetingIds.length
          ? sb
              .from("academic_council_minutes")
              .select("meeting_id, approved_at, locked_at")
              .in("meeting_id", meetingIds)
          : Promise.resolve({ data: [], error: null } as const),
        meetingIds.length
          ? sb
              .from("academic_council_decisions")
              .select("meeting_id, created_at")
              .in("meeting_id", meetingIds)
          : Promise.resolve({ data: [], error: null } as const),
      ]);

    if (minutesMetaRes.error) throwMeetingsLoadError(minutesMetaRes.error);
    if (decisionsRes.error) throwMeetingsLoadError(decisionsRes.error);

    const approvedByMeeting = new Map<string, string>();
    for (const row of minutesMetaRes.data ?? []) {
      const at = (row.approved_at as string | null) ?? (row.locked_at as string | null);
      if (!at) continue;
      const mid = row.meeting_id as string;
      const current = approvedByMeeting.get(mid);
      if (!current || at > current) approvedByMeeting.set(mid, at);
    }

    const decisionStats = new Map<string, { count: number; last: string }>();
    for (const row of decisionsRes.data ?? []) {
      const mid = row.meeting_id as string | null;
      if (!mid) continue;
      const at = row.created_at as string;
      const prev = decisionStats.get(mid);
      decisionStats.set(mid, {
        count: (prev?.count ?? 0) + 1,
        last: prev && prev.last > at ? prev.last : at,
      });
    }

    const items: ArchivedCouncilMeetingItem[] = meetings.map((row) => {
      const council = unwrapCouncil(row.council);
      const stats = decisionStats.get(row.id);
      return {
        meeting_id: row.id,
        council_id: row.council_id,
        council_name: council?.name ?? "",
        meeting_number: row.meeting_number,
        meeting_title: row.title,
        scheduled_at: row.scheduled_at,
        status: row.status,
        location: row.location,
        intake_opens_at: row.intake_opens_at,
        intake_closes_at: row.intake_closes_at,
        notes: row.notes,
        agenda_summary: buildAgendaSummary(agendaByMeeting.get(row.id) ?? []),
        minutes_summary: minutesByMeeting.get(row.id) ?? null,
        user_membership_role: membershipRoleAt(
          membershipRows,
          row.council_id,
          row.scheduled_at,
        ),
        created_at: row.created_at,
        updated_at: row.updated_at,
        minutes_approved_at: approvedByMeeting.get(row.id) ?? null,
        last_decision_at: stats?.last ?? null,
        decisions_count: stats?.count ?? 0,
      };
    });

    return { meetings: items };
  });
