// Server functions for the Academic Councils portal.
// Overview reads may use supabaseAdmin (server-only). Membership writes use context.supabase (RLS).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const COUNCILS_READ_ROLES = ["system_admin", "admin", "dean"] as const;

/** Roles allowed to manage council memberships at the application layer. */
export const COUNCILS_MEMBERSHIP_WRITE_ROLES = COUNCILS_READ_ROLES;

/** Council member roles assignable via admin membership functions (MVP). */
export const COUNCIL_LINK_MEMBER_ROLES = [
  "chair",
  "secretary",
  "member",
  "viewer",
] as const;

export type CouncilLinkMemberRole = (typeof COUNCIL_LINK_MEMBER_ROLES)[number];

const RLS_DENIED_MESSAGE =
  "تعذّر تنفيذ العملية. تحقق من صلاحياتك على هذا المجلس.";

const councilIdSchema = z.string().uuid("معرّف المجلس غير صالح");
const membershipIdSchema = z.string().uuid("معرّف العضوية غير صالح");
const facultyProfileIdSchema = z.string().uuid("معرّف ملف العضو غير صالح");

const linkRoleSchema = z.enum(COUNCIL_LINK_MEMBER_ROLES, {
  message: "دور العضوية غير مسموح",
});

async function assertCouncilsReader(userId: string) {
  await assertAnyRole(
    userId,
    COUNCILS_READ_ROLES,
    "ليس لديك صلاحية الاطلاع على بوابة المجالس الأكاديمية",
  );
}

async function assertCouncilsMembershipManager(userId: string) {
  await assertAnyRole(
    userId,
    COUNCILS_MEMBERSHIP_WRITE_ROLES,
    "ليس لديك صلاحية إدارة عضويات المجالس الأكاديمية",
  );
}

function sanitizeIlikeTerm(raw: string): string {
  return raw.trim().replace(/[%_\\]/g, "\\$&");
}

function isActiveMembership(row: { is_active: boolean; active_to: string | null }): boolean {
  return row.is_active && row.active_to === null;
}

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

type FacultyProfileRow = Pick<
  Database["public"]["Tables"]["faculty_profiles"]["Row"],
  "id" | "user_id" | "employee_number" | "full_name_ar" | "status"
>;

async function loadFacultyProfilesByUserIds(
  sb: SupabaseClient<Database>,
  userIds: string[],
): Promise<Map<string, FacultyProfileRow & { email: string | null }>> {
  const map = new Map<string, FacultyProfileRow & { email: string | null }>();
  if (userIds.length === 0) return map;

  const { data, error } = await sb
    .from("faculty_profiles")
    .select("id, user_id, employee_number, full_name_ar, status, faculty:faculty_id(email)")
    .in("user_id", userIds);
  if (error) throwDbError(error);

  for (const row of data ?? []) {
    const userId = row.user_id as string | null;
    if (!userId) continue;
    const faculty = row.faculty as { email: string | null } | { email: string | null }[] | null;
    const email = Array.isArray(faculty) ? faculty[0]?.email ?? null : faculty?.email ?? null;
    map.set(userId, {
      id: row.id as string,
      user_id: userId,
      employee_number: (row.employee_number as string | null) ?? null,
      full_name_ar: row.full_name_ar as string,
      status: row.status as string,
      email,
    });
  }
  return map;
}

export type CouncilMembershipItem = {
  id: string;
  council_id: string;
  user_id: string;
  faculty_profile_id: string | null;
  name: string;
  email: string | null;
  employee_number: string | null;
  member_role: CouncilLinkMemberRole | string;
  is_active: boolean;
  active_from: string;
  active_to: string | null;
  created_at: string;
  updated_at: string;
};

export type AcademicLinkCandidate = {
  faculty_profile_id: string;
  user_id: string;
  name: string;
  email: string | null;
  employee_number: string | null;
  status: string;
};

export type CouncilsOverviewItem = {
  id: string;
  name: string;
  council_type: "college" | "department" | string;
  department_id: string | null;
  is_active: boolean;
  members_count: number;
  next_meeting_at: string | null;
  last_meeting_at: string | null;
};

export type CouncilsSummary = {
  councils: CouncilsOverviewItem[];
  kpis: {
    upcoming_meetings: number;
    submitted_topics: number;
    open_decisions: number;
    overdue_decisions: number;
  };
  agenda_stages: {
    draft: number;
    under_review: number;
    approved: number;
    deferred: number;
  };
  upcoming_meetings: Array<{
    id: string;
    title: string;
    scheduled_at: string;
    location: string | null;
    council_name: string;
  }>;
};

export const getCouncilsSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CouncilsSummary> => {
    await assertCouncilsReader(context.userId);

    const nowIso = new Date().toISOString();
    const todayIso = new Date().toISOString().slice(0, 10);

    const [
      councilsRes,
      membersRes,
      upcomingCountRes,
      submittedTopicsRes,
      openDecisionsRes,
      overdueDecisionsRes,
      draftRes,
      underReviewRes,
      approvedRes,
      deferredRes,
      upcomingListRes,
    ] = await Promise.all([
      supabaseAdmin
        .from("academic_councils")
        .select("id, name, council_type, department_id, is_active")
        .order("council_type", { ascending: true })
        .order("name", { ascending: true }),
      supabaseAdmin
        .from("academic_council_members")
        .select("council_id")
        .is("active_to", null as never),
      supabaseAdmin
        .from("academic_council_meetings")
        .select("id", { count: "exact", head: true })
        .gte("scheduled_at", nowIso)
        .in("status", ["scheduled", "intake_open", "intake_closed"] as never),
      supabaseAdmin
        .from("academic_council_topics")
        .select("id", { count: "exact", head: true })
        .in("status", ["submitted", "under_review"] as never),
      supabaseAdmin
        .from("academic_council_decisions")
        .select("id", { count: "exact", head: true })
        .in("status", ["issued", "in_progress"] as never),
      supabaseAdmin
        .from("academic_council_decisions")
        .select("id", { count: "exact", head: true })
        .in("status", ["issued", "in_progress"] as never)
        .lt("due_date", todayIso),
      supabaseAdmin
        .from("academic_council_topics")
        .select("id", { count: "exact", head: true })
        .eq("status", "draft" as never),
      supabaseAdmin
        .from("academic_council_topics")
        .select("id", { count: "exact", head: true })
        .eq("status", "under_review" as never),
      supabaseAdmin
        .from("academic_council_topics")
        .select("id", { count: "exact", head: true })
        .eq("status", "accepted_for_agenda" as never),
      supabaseAdmin
        .from("academic_council_topics")
        .select("id", { count: "exact", head: true })
        .eq("status", "deferred" as never),
      supabaseAdmin
        .from("academic_council_meetings")
        .select("id, title, scheduled_at, location, council_id, academic_councils!inner(name)")
        .gte("scheduled_at", nowIso)
        .order("scheduled_at", { ascending: true })
        .limit(5),
    ]);

    for (const r of [
      councilsRes,
      membersRes,
      upcomingCountRes,
      submittedTopicsRes,
      openDecisionsRes,
      overdueDecisionsRes,
      draftRes,
      underReviewRes,
      approvedRes,
      deferredRes,
      upcomingListRes,
    ]) {
      if (r.error) throw new Error(r.error.message);
    }

    const memberCounts = new Map<string, number>();
    for (const m of (membersRes.data ?? []) as Array<{ council_id: string }>) {
      memberCounts.set(m.council_id, (memberCounts.get(m.council_id) ?? 0) + 1);
    }

    // Fetch last/next meeting per council in bulk.
    const councilIds = (councilsRes.data ?? []).map((c) => c.id as string);
    const nextByCouncil = new Map<string, string>();
    const lastByCouncil = new Map<string, string>();
    if (councilIds.length > 0) {
      const [nextRes, lastRes] = await Promise.all([
        supabaseAdmin
          .from("academic_council_meetings")
          .select("council_id, scheduled_at")
          .in("council_id", councilIds)
          .gte("scheduled_at", nowIso)
          .order("scheduled_at", { ascending: true }),
        supabaseAdmin
          .from("academic_council_meetings")
          .select("council_id, scheduled_at")
          .in("council_id", councilIds)
          .lt("scheduled_at", nowIso)
          .order("scheduled_at", { ascending: false }),
      ]);
      if (nextRes.error) throw new Error(nextRes.error.message);
      if (lastRes.error) throw new Error(lastRes.error.message);
      for (const r of (nextRes.data ?? []) as Array<{ council_id: string; scheduled_at: string }>) {
        if (!nextByCouncil.has(r.council_id)) nextByCouncil.set(r.council_id, r.scheduled_at);
      }
      for (const r of (lastRes.data ?? []) as Array<{ council_id: string; scheduled_at: string }>) {
        if (!lastByCouncil.has(r.council_id)) lastByCouncil.set(r.council_id, r.scheduled_at);
      }
    }

    const councils: CouncilsOverviewItem[] = (councilsRes.data ?? []).map((c) => ({
      id: c.id as string,
      name: c.name as string,
      council_type: c.council_type as string,
      department_id: (c.department_id as string | null) ?? null,
      is_active: Boolean(c.is_active),
      members_count: memberCounts.get(c.id as string) ?? 0,
      next_meeting_at: nextByCouncil.get(c.id as string) ?? null,
      last_meeting_at: lastByCouncil.get(c.id as string) ?? null,
    }));

    const upcoming_meetings = ((upcomingListRes.data ?? []) as Array<{
      id: string;
      title: string;
      scheduled_at: string;
      location: string | null;
      academic_councils: { name: string } | { name: string }[] | null;
    }>).map((m) => ({
      id: m.id,
      title: m.title,
      scheduled_at: m.scheduled_at,
      location: m.location,
      council_name: Array.isArray(m.academic_councils)
        ? m.academic_councils[0]?.name ?? ""
        : m.academic_councils?.name ?? "",
    }));

    return {
      councils,
      kpis: {
        upcoming_meetings: upcomingCountRes.count ?? 0,
        submitted_topics: submittedTopicsRes.count ?? 0,
        open_decisions: openDecisionsRes.count ?? 0,
        overdue_decisions: overdueDecisionsRes.count ?? 0,
      },
      agenda_stages: {
        draft: draftRes.count ?? 0,
        under_review: underReviewRes.count ?? 0,
        approved: approvedRes.count ?? 0,
        deferred: deferredRes.count ?? 0,
      },
      upcoming_meetings,
    };
  });

// ============================================================================
// MEMBERSHIP — read / search / link / deactivate (user session + RLS for writes)
// ============================================================================

export const getCouncilMemberships = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ councilId: councilIdSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<CouncilMembershipItem[]> => {
    await assertCouncilsMembershipManager(context.userId);
    const sb = context.supabase;

    const { data: rows, error } = await sb
      .from("academic_council_members")
      .select(
        "id, council_id, user_id, member_role, is_active, active_from, active_to, created_at, updated_at",
      )
      .eq("council_id", data.councilId)
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throwDbError(error);

    const userIds = Array.from(
      new Set((rows ?? []).map((r) => r.user_id as string)),
    );
    const profileByUser = await loadFacultyProfilesByUserIds(sb, userIds);

    return (rows ?? []).map((row) => {
      const userId = row.user_id as string;
      const profile = profileByUser.get(userId);
      return {
        id: row.id as string,
        council_id: row.council_id as string,
        user_id: userId,
        faculty_profile_id: profile?.id ?? null,
        name: profile?.full_name_ar ?? "—",
        email: profile?.email ?? null,
        employee_number: profile?.employee_number ?? null,
        member_role: row.member_role as string,
        is_active: isActiveMembership({
          is_active: Boolean(row.is_active),
          active_to: (row.active_to as string | null) ?? null,
        }),
        active_from: row.active_from as string,
        active_to: (row.active_to as string | null) ?? null,
        created_at: row.created_at as string,
        updated_at: row.updated_at as string,
      };
    });
  });

export const searchAcademicsForCouncilLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        query: z.string().trim().min(2, "أدخل حرفين على الأقل للبحث"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AcademicLinkCandidate[]> => {
    await assertCouncilsMembershipManager(context.userId);
    const sb = context.supabase;
    const term = sanitizeIlikeTerm(data.query);
    const pattern = `%${term}%`;

    const profileSelect =
      "id, user_id, employee_number, full_name_ar, status, faculty:faculty_id(email)";

    const { data: byProfile, error: profileErr } = await sb
      .from("faculty_profiles")
      .select(profileSelect)
      .not("user_id", "is", null)
      .eq("status", "active")
      .or(
        `employee_number.ilike.${pattern},full_name_ar.ilike.${pattern},full_name_en.ilike.${pattern}`,
      )
      .order("full_name_ar")
      .limit(25);
    if (profileErr) throwDbError(profileErr);

    const seen = new Set<string>();
    const candidates: AcademicLinkCandidate[] = [];

    const pushRow = (row: {
      id: string;
      user_id: string | null;
      employee_number: string | null;
      full_name_ar: string;
      status: string;
      faculty: { email: string | null } | { email: string | null }[] | null;
    }) => {
      const userId = row.user_id;
      if (!userId || seen.has(userId)) return;
      seen.add(userId);
      const faculty = row.faculty;
      const email = Array.isArray(faculty)
        ? faculty[0]?.email ?? null
        : faculty?.email ?? null;
      candidates.push({
        faculty_profile_id: row.id,
        user_id: userId,
        name: row.full_name_ar,
        email,
        employee_number: row.employee_number,
        status: row.status,
      });
    };

    for (const row of byProfile ?? []) {
      pushRow(row as Parameters<typeof pushRow>[0]);
    }

    if (candidates.length < 25) {
      const { data: facultyHits, error: facultyErr } = await sb
        .from("faculty")
        .select("id, email")
        .ilike("email", pattern)
        .limit(25);
      if (facultyErr) throwDbError(facultyErr);

      const facultyIds = (facultyHits ?? []).map((f) => f.id as string);
      if (facultyIds.length > 0) {
        const { data: byEmail, error: emailErr } = await sb
          .from("faculty_profiles")
          .select(profileSelect)
          .not("user_id", "is", null)
          .eq("status", "active")
          .in("faculty_id", facultyIds)
          .limit(25);
        if (emailErr) throwDbError(emailErr);
        for (const row of byEmail ?? []) {
          pushRow(row as Parameters<typeof pushRow>[0]);
          if (candidates.length >= 25) break;
        }
      }
    }

    return candidates.slice(0, 25);
  });

export const linkAcademicToCouncil = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        councilId: councilIdSchema,
        facultyProfileId: facultyProfileIdSchema,
        role: linkRoleSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCouncilsMembershipManager(context.userId);
    const sb = context.supabase;

    const { data: council, error: councilErr } = await sb
      .from("academic_councils")
      .select("id, is_active")
      .eq("id", data.councilId)
      .maybeSingle();
    if (councilErr) throwDbError(councilErr);
    if (!council) throw new Error("المجلس غير موجود");
    if (!council.is_active) throw new Error("المجلس غير فعّال");

    const { data: profile, error: profileErr } = await sb
      .from("faculty_profiles")
      .select("id, user_id, full_name_ar, status")
      .eq("id", data.facultyProfileId)
      .maybeSingle();
    if (profileErr) throwDbError(profileErr);
    if (!profile) throw new Error("ملف العضو غير موجود");
    if (profile.status !== "active") throw new Error("ملف العضو غير فعّال");
    const targetUserId = profile.user_id as string | null;
    if (!targetUserId) {
      throw new Error("لا يوجد حساب دخول مرتبط بهذا العضو. أنشئ الربط من بوابة حسابات هيئة التدريس أولاً.");
    }

    const { data: existingRows, error: existingErr } = await sb
      .from("academic_council_members")
      .select("id, member_role, is_active, active_to, active_from")
      .eq("council_id", data.councilId)
      .eq("user_id", targetUserId)
      .order("created_at", { ascending: false });
    if (existingErr) throwDbError(existingErr);

    const activeRow = (existingRows ?? []).find((r) =>
      isActiveMembership({
        is_active: Boolean(r.is_active),
        active_to: (r.active_to as string | null) ?? null,
      }),
    );
    if (activeRow) {
      throw new Error("يوجد عضوية فعّالة لهذا العضو في المجلس بالفعل");
    }

    const inactiveRow = (existingRows ?? []).find(
      (r) =>
        !isActiveMembership({
          is_active: Boolean(r.is_active),
          active_to: (r.active_to as string | null) ?? null,
        }),
    );

    if (inactiveRow) {
      const { data: reactivated, error: updateErr } = await sb
        .from("academic_council_members")
        .update({
          is_active: true,
          active_to: null,
          member_role: data.role,
          updated_by: context.userId,
        } as Database["public"]["Tables"]["academic_council_members"]["Update"])
        .eq("id", inactiveRow.id as string)
        .select("id")
        .maybeSingle();
      if (updateErr) throwDbError(updateErr);
      if (!reactivated) throw new Error(RLS_DENIED_MESSAGE);
      return {
        ok: true as const,
        membershipId: reactivated.id as string,
        reactivated: true as const,
      };
    }

    const { data: inserted, error: insertErr } = await sb
      .from("academic_council_members")
      .insert({
        council_id: data.councilId,
        user_id: targetUserId,
        member_role: data.role,
        is_active: true,
        created_by: context.userId,
        updated_by: context.userId,
      } as Database["public"]["Tables"]["academic_council_members"]["Insert"])
      .select("id")
      .maybeSingle();
    if (insertErr) throwDbError(insertErr);
    if (!inserted) throw new Error(RLS_DENIED_MESSAGE);

    return {
      ok: true as const,
      membershipId: inserted.id as string,
      reactivated: false as const,
    };
  });

export const deactivateCouncilMembership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ membershipId: membershipIdSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCouncilsMembershipManager(context.userId);
    const sb = context.supabase;
    const today = new Date().toISOString().slice(0, 10);

    const { data: membership, error: readErr } = await sb
      .from("academic_council_members")
      .select("id, is_active, active_to")
      .eq("id", data.membershipId)
      .maybeSingle();
    if (readErr) throwDbError(readErr);
    if (!membership) throw new Error("العضوية غير موجودة");
    if (
      !isActiveMembership({
        is_active: Boolean(membership.is_active),
        active_to: (membership.active_to as string | null) ?? null,
      })
    ) {
      throw new Error("العضوية معطّلة مسبقاً");
    }

    const { data: updated, error: updateErr } = await sb
      .from("academic_council_members")
      .update({
        is_active: false,
        active_to: today,
        updated_by: context.userId,
      } as Database["public"]["Tables"]["academic_council_members"]["Update"])
      .eq("id", data.membershipId)
      .select("id")
      .maybeSingle();
    if (updateErr) throwDbError(updateErr);
    if (!updated) throw new Error(RLS_DENIED_MESSAGE);

    return { ok: true as const, membershipId: updated.id as string };
  });

// ============================================================================
// MEETINGS — read / schedule / update (context.supabase + RLS; no service role)
// ============================================================================

const MEETING_SCHEDULE_DENIED_MESSAGE =
  "لا تملك صلاحية جدولة اجتماع لهذا المجلس.";
const MEETING_UPDATE_DENIED_MESSAGE =
  "لا تملك صلاحية تعديل هذا الاجتماع.";
const SESSION_EXPIRED_MESSAGE =
  "انتهت جلسة تسجيل الدخول، يرجى تسجيل الدخول مرة أخرى.";
const MEETINGS_LOAD_FAILED_MESSAGE = "تعذر تحميل الاجتماعات.";
const MEETING_SAVE_FAILED_MESSAGE = "تعذر حفظ الاجتماع.";

const MEETING_STATUS_VALUES = [
  "scheduled",
  "intake_open",
  "intake_closed",
  "agenda_ready",
  "in_session",
  "minutes_draft",
  "minutes_locked",
  "archived",
  "cancelled",
] as const;

type MeetingStatus = (typeof MEETING_STATUS_VALUES)[number];

const scheduleCouncilMeetingSchema = z.object({
  councilId: councilIdSchema,
  title: z
    .string()
    .trim()
    .min(3, "عنوان الاجتماع قصير جداً")
    .max(500, "عنوان الاجتماع طويل جداً"),
  scheduledAt: z.string().datetime({ message: "موعد الاجتماع غير صالح" }),
  location: z.string().trim().max(500).optional(),
  intakeOpensAt: z.string().datetime({ message: "موعد فتح الاستقبال غير صالح" }).optional(),
  intakeClosesAt: z.string().datetime({ message: "موعد إغلاق الاستقبال غير صالح" }).optional(),
  notes: z.string().trim().max(4000).optional(),
});

const updateCouncilMeetingSchema = z.object({
  meetingId: z.string().uuid("معرّف الاجتماع غير صالح"),
  title: z.string().trim().min(3).max(500).optional(),
  scheduledAt: z.string().datetime({ message: "موعد الاجتماع غير صالح" }).optional(),
  location: z.string().trim().max(500).nullable().optional(),
  intakeOpensAt: z.string().datetime({ message: "موعد فتح الاستقبال غير صالح" }).nullable().optional(),
  intakeClosesAt: z.string().datetime({ message: "موعد إغلاق الاستقبال غير صالح" }).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  status: z.enum(MEETING_STATUS_VALUES).optional(),
});

function isSessionExpiredError(error: { code?: string; message: string }): boolean {
  const msg = error.message.toLowerCase();
  return (
    error.code === "PGRST301" ||
    msg.includes("jwt expired") ||
    msg.includes("invalid jwt") ||
    msg.includes("token is expired")
  );
}

function mapMeetingDbError(
  error: { code?: string; message: string },
  mode: "schedule" | "update" | "load",
): never {
  if (isSessionExpiredError(error)) {
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }

  const msg = error.message.toLowerCase();
  if (
    error.code === "42501" ||
    msg.includes("policy") ||
    msg.includes("permission denied") ||
    msg.includes("row-level security")
  ) {
    if (mode === "schedule") throw new Error(MEETING_SCHEDULE_DENIED_MESSAGE);
    if (mode === "update") throw new Error(MEETING_UPDATE_DENIED_MESSAGE);
    throw new Error(RLS_DENIED_MESSAGE);
  }

  if (mode === "load") throw new Error(MEETINGS_LOAD_FAILED_MESSAGE);
  throw new Error(MEETING_SAVE_FAILED_MESSAGE);
}

function rejectMeetingClientOverrides(input: unknown, blockedKeys: string[]) {
  if (typeof input !== "object" || input === null) return;
  const raw = input as Record<string, unknown>;
  for (const key of blockedKeys) {
    if (key in raw) {
      throw new Error(`لا يمكن تمرير ${key} من الواجهة`);
    }
  }
}

async function assertCanScheduleCouncilMeeting(
  sb: SupabaseClient<Database>,
  userId: string,
  councilId: string,
): Promise<void> {
  const { data: rpcAllowed, error: rpcErr } = await sb.rpc(
    "can_schedule_council_meeting" as never,
    { _user: userId, _council: councilId } as never,
  );

  if (!rpcErr && typeof rpcAllowed === "boolean") {
    if (!rpcAllowed) throw new Error(MEETING_SCHEDULE_DENIED_MESSAGE);
    return;
  }

  const [adminRes, chairRes] = await Promise.all([
    sb.rpc("is_council_admin", { _user: userId }),
    sb.rpc("has_council_role", {
      _user: userId,
      _council: councilId,
      _role: "chair" as Database["public"]["Enums"]["academic_council_member_role"],
    }),
  ]);

  if (adminRes.error) mapMeetingDbError(adminRes.error, "schedule");
  if (chairRes.error) mapMeetingDbError(chairRes.error, "schedule");

  if (adminRes.data === true || chairRes.data === true) return;

  throw new Error(MEETING_SCHEDULE_DENIED_MESSAGE);
}

async function resolveNextMeetingNumber(
  sb: SupabaseClient<Database>,
  councilId: string,
): Promise<number> {
  const { data, error } = await sb
    .from("academic_council_meetings")
    .select("meeting_number")
    .eq("council_id", councilId)
    .order("meeting_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) mapMeetingDbError(error, "load");
  return ((data?.meeting_number as number | undefined) ?? 0) + 1;
}

function unwrapCouncilName(
  council: { name: string; council_type: string } | { name: string; council_type: string }[] | null,
): { name: string; council_type: string } | null {
  if (!council) return null;
  return Array.isArray(council) ? council[0] ?? null : council;
}

export type AdminCouncilMeetingItem = {
  meeting_id: string;
  council_id: string;
  council_name: string;
  council_type: string;
  meeting_number: number;
  title: string;
  scheduled_at: string;
  status: MeetingStatus | string;
  location: string | null;
  intake_opens_at: string | null;
  intake_closes_at: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type GetCouncilMeetingsForAdminResult = {
  upcomingMeetings: AdminCouncilMeetingItem[];
  previousMeetings: AdminCouncilMeetingItem[];
};

export type ScheduleCouncilMeetingResult = {
  ok: true;
  meeting_id: string;
  meeting_number: number;
  status: MeetingStatus;
};

export type UpdateCouncilMeetingResult = {
  ok: true;
  meeting_id: string;
  status: MeetingStatus | string;
};

export const getCouncilMeetingsForAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        councilId: councilIdSchema.optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<GetCouncilMeetingsForAdminResult> => {
    await assertCouncilsReader(context.userId);
    const sb = context.supabase;

    let query = sb
      .from("academic_council_meetings")
      .select(
        "id, council_id, meeting_number, title, scheduled_at, status, location, intake_opens_at, intake_closes_at, notes, created_by, created_at, updated_at, council:academic_councils(name, council_type)",
      )
      .order("scheduled_at", { ascending: false });

    if (data.councilId) {
      query = query.eq("council_id", data.councilId);
    }

    const { data: rows, error } = await query;
    if (error) mapMeetingDbError(error, "load");

    const nowIso = new Date().toISOString();
    const items: AdminCouncilMeetingItem[] = (rows ?? []).map((row) => {
      const council = unwrapCouncilName(
        row.council as
          | { name: string; council_type: string }
          | { name: string; council_type: string }[]
          | null,
      );
      return {
        meeting_id: row.id as string,
        council_id: row.council_id as string,
        council_name: council?.name ?? "",
        council_type: council?.council_type ?? "",
        meeting_number: row.meeting_number as number,
        title: row.title as string,
        scheduled_at: row.scheduled_at as string,
        status: row.status as string,
        location: (row.location as string | null) ?? null,
        intake_opens_at: (row.intake_opens_at as string | null) ?? null,
        intake_closes_at: (row.intake_closes_at as string | null) ?? null,
        notes: (row.notes as string | null) ?? null,
        created_by: row.created_by as string,
        created_at: row.created_at as string,
        updated_at: row.updated_at as string,
      };
    });

    const upcomingMeetings = items
      .filter((m) => m.scheduled_at >= nowIso)
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
    const previousMeetings = items
      .filter((m) => m.scheduled_at < nowIso)
      .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));

    return { upcomingMeetings, previousMeetings };
  });

export const scheduleCouncilMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    rejectMeetingClientOverrides(input, [
      "created_by",
      "createdBy",
      "meeting_number",
      "meetingNumber",
      "status",
      "council_id",
      "updated_by",
      "updatedBy",
    ]);
    return scheduleCouncilMeetingSchema.parse(input);
  })
  .handler(async ({ data, context }): Promise<ScheduleCouncilMeetingResult> => {
    const sb = context.supabase;
    await assertCanScheduleCouncilMeeting(sb, context.userId, data.councilId);

    const meetingNumber = await resolveNextMeetingNumber(sb, data.councilId);

    const { data: inserted, error } = await sb
      .from("academic_council_meetings")
      .insert({
        council_id: data.councilId,
        title: data.title,
        scheduled_at: data.scheduledAt,
        location: data.location?.trim() || null,
        intake_opens_at: data.intakeOpensAt ?? null,
        intake_closes_at: data.intakeClosesAt ?? null,
        notes: data.notes?.trim() || null,
        meeting_number: meetingNumber,
        status: "scheduled",
        created_by: context.userId,
      } as Database["public"]["Tables"]["academic_council_meetings"]["Insert"])
      .select("id, meeting_number, status")
      .maybeSingle();

    if (error) mapMeetingDbError(error, "schedule");
    if (!inserted) throw new Error(MEETING_SCHEDULE_DENIED_MESSAGE);

    return {
      ok: true,
      meeting_id: inserted.id as string,
      meeting_number: inserted.meeting_number as number,
      status: inserted.status as MeetingStatus,
    };
  });

export const updateCouncilMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    rejectMeetingClientOverrides(input, [
      "council_id",
      "councilId",
      "created_by",
      "createdBy",
      "meeting_number",
      "meetingNumber",
      "updated_by",
      "updatedBy",
    ]);
    return updateCouncilMeetingSchema.parse(input);
  })
  .handler(async ({ data, context }): Promise<UpdateCouncilMeetingResult> => {
    const sb = context.supabase;

    const { data: existing, error: readErr } = await sb
      .from("academic_council_meetings")
      .select("id, council_id, status")
      .eq("id", data.meetingId)
      .maybeSingle();
    if (readErr) mapMeetingDbError(readErr, "load");
    if (!existing) throw new Error(MEETING_UPDATE_DENIED_MESSAGE);

    await assertCanScheduleCouncilMeeting(
      sb,
      context.userId,
      existing.council_id as string,
    );

    const patch: Database["public"]["Tables"]["academic_council_meetings"]["Update"] = {
      updated_by: context.userId,
    };

    if (data.title !== undefined) patch.title = data.title;
    if (data.scheduledAt !== undefined) patch.scheduled_at = data.scheduledAt;
    if (data.location !== undefined) patch.location = data.location;
    if (data.intakeOpensAt !== undefined) patch.intake_opens_at = data.intakeOpensAt;
    if (data.intakeClosesAt !== undefined) patch.intake_closes_at = data.intakeClosesAt;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.status !== undefined) patch.status = data.status;

    const { data: updated, error } = await sb
      .from("academic_council_meetings")
      .update(patch)
      .eq("id", data.meetingId)
      .select("id, status")
      .maybeSingle();

    if (error) mapMeetingDbError(error, "update");
    if (!updated) throw new Error(MEETING_UPDATE_DENIED_MESSAGE);

    return {
      ok: true,
      meeting_id: updated.id as string,
      status: updated.status as string,
    };
  });

// ============================================================================
// AGENDA — read / review / write (context.supabase + RLS; no service role)
// ============================================================================

const AGENDA_LOAD_FAILED_MESSAGE = "تعذر تحميل جدول الأعمال.";
const AGENDA_TOPICS_LOAD_FAILED_MESSAGE = "تعذر تحميل الموضوعات المتاحة.";
const AGENDA_WRITE_DENIED_MESSAGE =
  "لا تملك صلاحية إدارة جدول أعمال هذا المجلس.";
const AGENDA_TOPIC_COUNCIL_MISMATCH_MESSAGE =
  "لا يمكن إضافة موضوع من مجلس مختلف.";
const AGENDA_TOPIC_ALREADY_ADDED_MESSAGE =
  "هذا الموضوع مضاف مسبقاً إلى جدول الأعمال.";
const AGENDA_REORDER_FAILED_MESSAGE = "تعذر حفظ ترتيب جدول الأعمال.";
const AGENDA_FINALIZE_DENIED_MESSAGE =
  "لا تملك صلاحية اعتماد جدول الأعمال.";
const AGENDA_SAVE_FAILED_MESSAGE = "تعذر حفظ جدول الأعمال.";
const TOPIC_REVIEW_DENIED_MESSAGE =
  "لا تملك صلاحية مراجعة هذا الموضوع.";

const meetingIdSchema = z.string().uuid("معرّف الاجتماع غير صالح");
const topicIdSchema = z.string().uuid("معرّف الموضوع غير صالح");
const agendaItemIdSchema = z.string().uuid("معرّف بند الأجندة غير صالح");

const TOPIC_REVIEW_STATUS_VALUES = [
  "under_review",
  "needs_completion",
  "accepted_for_agenda",
  "deferred",
  "rejected",
] as const;

const AVAILABLE_TOPIC_STATUS_VALUES = ["accepted_for_agenda"] as const;

type TopicReviewStatus = (typeof TOPIC_REVIEW_STATUS_VALUES)[number];

function mapAgendaDbError(
  error: { code?: string; message: string },
  mode: "load" | "topics_load" | "write" | "reorder" | "finalize" | "review",
): never {
  if (isSessionExpiredError(error)) {
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }

  const msg = error.message.toLowerCase();
  if (
    error.code === "42501" ||
    msg.includes("policy") ||
    msg.includes("permission denied") ||
    msg.includes("row-level security")
  ) {
    if (mode === "finalize") throw new Error(AGENDA_FINALIZE_DENIED_MESSAGE);
    if (mode === "review") throw new Error(TOPIC_REVIEW_DENIED_MESSAGE);
    if (mode === "load") throw new Error(AGENDA_LOAD_FAILED_MESSAGE);
    if (mode === "topics_load") throw new Error(AGENDA_TOPICS_LOAD_FAILED_MESSAGE);
    if (mode === "reorder") throw new Error(AGENDA_REORDER_FAILED_MESSAGE);
    throw new Error(AGENDA_WRITE_DENIED_MESSAGE);
  }

  if (mode === "load") throw new Error(AGENDA_LOAD_FAILED_MESSAGE);
  if (mode === "topics_load") throw new Error(AGENDA_TOPICS_LOAD_FAILED_MESSAGE);
  if (mode === "reorder") throw new Error(AGENDA_REORDER_FAILED_MESSAGE);
  if (mode === "finalize") throw new Error(AGENDA_FINALIZE_DENIED_MESSAGE);
  if (mode === "review") throw new Error(TOPIC_REVIEW_DENIED_MESSAGE);
  throw new Error(AGENDA_SAVE_FAILED_MESSAGE);
}

function rejectAgendaClientOverrides(input: unknown, blockedKeys: string[]) {
  if (typeof input !== "object" || input === null) return;
  const raw = input as Record<string, unknown>;
  for (const key of blockedKeys) {
    if (key in raw) {
      throw new Error(`لا يمكن تمرير ${key} من الواجهة`);
    }
  }
}

async function assertCanWriteCouncilAgenda(
  sb: SupabaseClient<Database>,
  userId: string,
  councilId: string,
): Promise<void> {
  const { data: rpcAllowed, error: rpcErr } = await sb.rpc(
    "can_write_council_agenda" as never,
    { _user: userId, _council: councilId } as never,
  );

  if (!rpcErr && typeof rpcAllowed === "boolean") {
    if (!rpcAllowed) throw new Error(AGENDA_WRITE_DENIED_MESSAGE);
    return;
  }

  const [adminRes, chairRes, secretaryRes] = await Promise.all([
    sb.rpc("is_council_admin", { _user: userId }),
    sb.rpc("has_council_role", {
      _user: userId,
      _council: councilId,
      _role: "chair" as Database["public"]["Enums"]["academic_council_member_role"],
    }),
    sb.rpc("has_council_role", {
      _user: userId,
      _council: councilId,
      _role: "secretary" as Database["public"]["Enums"]["academic_council_member_role"],
    }),
  ]);

  if (adminRes.error) mapAgendaDbError(adminRes.error, "write");
  if (chairRes.error) mapAgendaDbError(chairRes.error, "write");
  if (secretaryRes.error) mapAgendaDbError(secretaryRes.error, "write");

  if (
    adminRes.data === true ||
    chairRes.data === true ||
    secretaryRes.data === true
  ) {
    return;
  }

  throw new Error(AGENDA_WRITE_DENIED_MESSAGE);
}

type AgendaMeetingContext = {
  id: string;
  council_id: string;
  title: string;
  scheduled_at: string;
  status: string;
  council_name: string;
  council_type: string;
};

async function loadMeetingAgendaContext(
  sb: SupabaseClient<Database>,
  meetingId: string,
): Promise<AgendaMeetingContext> {
  const { data, error } = await sb
    .from("academic_council_meetings")
    .select(
      "id, council_id, title, scheduled_at, status, council:academic_councils(name, council_type)",
    )
    .eq("id", meetingId)
    .maybeSingle();
  if (error) mapAgendaDbError(error, "load");
  if (!data) throw new Error(AGENDA_LOAD_FAILED_MESSAGE);

  const council = unwrapCouncilName(
    data.council as { name: string; council_type: string } | { name: string; council_type: string }[] | null,
  );

  return {
    id: data.id as string,
    council_id: data.council_id as string,
    title: data.title as string,
    scheduled_at: data.scheduled_at as string,
    status: data.status as string,
    council_name: council?.name ?? "",
    council_type: council?.council_type ?? "",
  };
}

async function resolveNextAgendaOrderIndex(
  sb: SupabaseClient<Database>,
  meetingId: string,
): Promise<number> {
  const { data, error } = await sb
    .from("academic_council_agenda_items")
    .select("order_index")
    .eq("meeting_id", meetingId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) mapAgendaDbError(error, "load");
  return ((data?.order_index as number | undefined) ?? 0) + 1;
}

async function assertTopicNotAlreadyInMeetingAgenda(
  sb: SupabaseClient<Database>,
  meetingId: string,
  topicId: string,
): Promise<void> {
  const { data, error } = await sb
    .from("academic_council_agenda_items")
    .select("id")
    .eq("meeting_id", meetingId)
    .eq("topic_id", topicId)
    .limit(1)
    .maybeSingle();
  if (error) mapAgendaDbError(error, "write");
  if (data) throw new Error(AGENDA_TOPIC_ALREADY_ADDED_MESSAGE);
}

export type CouncilAgendaTopicRef = {
  id: string;
  title: string;
  status: string;
  submitted_by: string;
  submitted_at: string | null;
  review_note: string | null;
};

export type CouncilAgendaItem = {
  id: string;
  meeting_id: string;
  topic_id: string | null;
  title: string;
  order_index: number;
  notes: string | null;
  is_approved: boolean;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  topic: CouncilAgendaTopicRef | null;
};

export type GetAgendaItemsForMeetingResult = {
  meeting: AgendaMeetingContext;
  items: CouncilAgendaItem[];
};

export type AvailableTopicForAgenda = {
  topic_id: string;
  council_id: string;
  title: string;
  status: string;
  meeting_id: string | null;
  submitted_by: string;
  submitted_at: string | null;
  review_note: string | null;
};

export type GetAvailableTopicsForAgendaResult = {
  meeting: AgendaMeetingContext;
  topics: AvailableTopicForAgenda[];
};

export type ReviewCouncilTopicResult = {
  ok: true;
  topic_id: string;
  status: TopicReviewStatus;
};

export type AddTopicToAgendaResult = {
  ok: true;
  agenda_item_id: string;
  order_index: number;
};

export type AddManualAgendaItemResult = {
  ok: true;
  agenda_item_id: string;
  order_index: number;
};

export type UpdateAgendaItemResult = {
  ok: true;
  agenda_item_id: string;
};

export type ReorderAgendaItemsResult = {
  ok: true;
  meeting_id: string;
  updated_count: number;
};

export type FinalizeMeetingAgendaResult = {
  ok: true;
  meeting_id: string;
  status: "agenda_ready";
  approved_items_count: number;
};

function mapAgendaItemRow(
  row: Record<string, unknown>,
): CouncilAgendaItem {
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
    await assertCouncilsReader(context.userId);
    const sb = context.supabase;

    const meeting = await loadMeetingAgendaContext(sb, data.meetingId);

    const { data: rows, error } = await sb
      .from("academic_council_agenda_items")
      .select(
        "id, meeting_id, topic_id, title, order_index, notes, is_approved, approved_by, approved_at, created_by, created_at, updated_at, updated_by, topic:academic_council_topics(id, title, status, submitted_by, submitted_at, review_note)",
      )
      .eq("meeting_id", data.meetingId)
      .order("order_index", { ascending: true });
    if (error) mapAgendaDbError(error, "load");

    return {
      meeting,
      items: (rows ?? []).map((row) => mapAgendaItemRow(row as Record<string, unknown>)),
    };
  });

export const getAvailableTopicsForAgenda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ meetingId: meetingIdSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<GetAvailableTopicsForAgendaResult> => {
    const sb = context.supabase;
    const meeting = await loadMeetingAgendaContext(sb, data.meetingId);
    await assertCanWriteCouncilAgenda(sb, context.userId, meeting.council_id);

    const { data: agendaRows, error: agendaErr } = await sb
      .from("academic_council_agenda_items")
      .select("topic_id")
      .eq("meeting_id", data.meetingId)
      .not("topic_id", "is", null);
    if (agendaErr) mapAgendaDbError(agendaErr, "topics_load");

    const alreadyAddedIds = (agendaRows ?? [])
      .map((r) => r.topic_id as string | null)
      .filter((id): id is string => Boolean(id));

    let topicsQuery = sb
      .from("academic_council_topics")
      .select(
        "id, council_id, title, status, meeting_id, submitted_by, submitted_at, review_note",
      )
      .eq("council_id", meeting.council_id)
      .in("status", AVAILABLE_TOPIC_STATUS_VALUES as unknown as string[]);

    if (alreadyAddedIds.length > 0) {
      topicsQuery = topicsQuery.not("id", "in", `(${alreadyAddedIds.join(",")})`);
    }

    const { data: topicRows, error: topicsErr } = await topicsQuery.order("submitted_at", {
      ascending: false,
    });
    if (topicsErr) mapAgendaDbError(topicsErr, "topics_load");

    const topics = (topicRows ?? [])
      .filter((row) => {
        const linkedMeeting = (row.meeting_id as string | null) ?? null;
        return linkedMeeting === null || linkedMeeting === data.meetingId;
      })
      .map((row) => ({
        topic_id: row.id as string,
        council_id: row.council_id as string,
        title: row.title as string,
        status: row.status as string,
        meeting_id: (row.meeting_id as string | null) ?? null,
        submitted_by: row.submitted_by as string,
        submitted_at: (row.submitted_at as string | null) ?? null,
        review_note: (row.review_note as string | null) ?? null,
      }));

    return { meeting, topics };
  });

const reviewCouncilTopicSchema = z.object({
  topicId: topicIdSchema,
  status: z.enum(TOPIC_REVIEW_STATUS_VALUES, {
    message: "حالة المراجعة غير مسموحة",
  }),
  reviewNote: z.string().trim().max(4000).optional(),
  meetingId: meetingIdSchema.optional(),
});

export const reviewCouncilTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    rejectAgendaClientOverrides(input, [
      "submitted_by",
      "submittedBy",
      "council_id",
      "councilId",
      "created_by",
      "createdBy",
    ]);
    return reviewCouncilTopicSchema.parse(input);
  })
  .handler(async ({ data, context }): Promise<ReviewCouncilTopicResult> => {
    const sb = context.supabase;

    const { data: existing, error: readErr } = await sb
      .from("academic_council_topics")
      .select("id, council_id, status")
      .eq("id", data.topicId)
      .maybeSingle();
    if (readErr) mapAgendaDbError(readErr, "review");
    if (!existing) throw new Error(TOPIC_REVIEW_DENIED_MESSAGE);

    await assertCanWriteCouncilAgenda(
      sb,
      context.userId,
      existing.council_id as string,
    );

    if (data.meetingId) {
      const meeting = await loadMeetingAgendaContext(sb, data.meetingId);
      if (meeting.council_id !== existing.council_id) {
        throw new Error(AGENDA_TOPIC_COUNCIL_MISMATCH_MESSAGE);
      }
    }

    const patch: Database["public"]["Tables"]["academic_council_topics"]["Update"] = {
      status: data.status,
    };
    if (data.reviewNote !== undefined) {
      patch.review_note = data.reviewNote.trim() || null;
      patch.reviewed_by = context.userId;
    }
    if (data.status === "accepted_for_agenda" && data.meetingId) {
      patch.meeting_id = data.meetingId;
    }

    const { data: updated, error } = await sb
      .from("academic_council_topics")
      .update(patch)
      .eq("id", data.topicId)
      .select("id, status")
      .maybeSingle();

    if (error) mapAgendaDbError(error, "review");
    if (!updated) throw new Error(TOPIC_REVIEW_DENIED_MESSAGE);

    return {
      ok: true,
      topic_id: updated.id as string,
      status: updated.status as TopicReviewStatus,
    };
  });

const addTopicToAgendaSchema = z.object({
  meetingId: meetingIdSchema,
  topicId: topicIdSchema,
  orderIndex: z.number().int().positive().optional(),
  notes: z.string().trim().max(4000).optional(),
});

export const addTopicToAgenda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    rejectAgendaClientOverrides(input, [
      "created_by",
      "createdBy",
      "title",
      "meeting_id",
      "council_id",
      "councilId",
      "is_approved",
      "isApproved",
      "approved_by",
      "approvedBy",
    ]);
    return addTopicToAgendaSchema.parse(input);
  })
  .handler(async ({ data, context }): Promise<AddTopicToAgendaResult> => {
    const sb = context.supabase;
    const meeting = await loadMeetingAgendaContext(sb, data.meetingId);
    await assertCanWriteCouncilAgenda(sb, context.userId, meeting.council_id);

    const { data: topic, error: topicErr } = await sb
      .from("academic_council_topics")
      .select("id, council_id, title, status, meeting_id")
      .eq("id", data.topicId)
      .maybeSingle();
    if (topicErr) mapAgendaDbError(topicErr, "write");
    if (!topic) throw new Error(AGENDA_WRITE_DENIED_MESSAGE);

    if (topic.council_id !== meeting.council_id) {
      throw new Error(AGENDA_TOPIC_COUNCIL_MISMATCH_MESSAGE);
    }

    if (topic.status !== "accepted_for_agenda") {
      throw new Error("الموضوع غير مقبول للإضافة إلى جدول الأعمال.");
    }

    const linkedMeeting = (topic.meeting_id as string | null) ?? null;
    if (linkedMeeting && linkedMeeting !== data.meetingId) {
      throw new Error(AGENDA_TOPIC_COUNCIL_MISMATCH_MESSAGE);
    }

    await assertTopicNotAlreadyInMeetingAgenda(sb, data.meetingId, data.topicId);

    const orderIndex =
      data.orderIndex ?? (await resolveNextAgendaOrderIndex(sb, data.meetingId));

    const { data: inserted, error } = await sb
      .from("academic_council_agenda_items")
      .insert({
        meeting_id: data.meetingId,
        topic_id: data.topicId,
        title: topic.title as string,
        order_index: orderIndex,
        notes: data.notes?.trim() || null,
        created_by: context.userId,
      })
      .select("id, order_index")
      .maybeSingle();

    if (error) mapAgendaDbError(error, "write");
    if (!inserted) throw new Error(AGENDA_WRITE_DENIED_MESSAGE);

    if (!linkedMeeting) {
      const { error: topicLinkErr } = await sb
        .from("academic_council_topics")
        .update({ meeting_id: data.meetingId })
        .eq("id", data.topicId);
      if (topicLinkErr) mapAgendaDbError(topicLinkErr, "write");
    }

    return {
      ok: true,
      agenda_item_id: inserted.id as string,
      order_index: inserted.order_index as number,
    };
  });

const addManualAgendaItemSchema = z.object({
  meetingId: meetingIdSchema,
  title: z
    .string()
    .trim()
    .min(3, "عنوان البند قصير جداً")
    .max(500, "عنوان البند طويل جداً"),
  orderIndex: z.number().int().positive().optional(),
  notes: z.string().trim().max(4000).optional(),
});

export const addManualAgendaItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    rejectAgendaClientOverrides(input, [
      "created_by",
      "createdBy",
      "topic_id",
      "topicId",
      "meeting_id",
      "is_approved",
      "isApproved",
      "approved_by",
      "approvedBy",
    ]);
    return addManualAgendaItemSchema.parse(input);
  })
  .handler(async ({ data, context }): Promise<AddManualAgendaItemResult> => {
    const sb = context.supabase;
    const meeting = await loadMeetingAgendaContext(sb, data.meetingId);
    await assertCanWriteCouncilAgenda(sb, context.userId, meeting.council_id);

    const orderIndex =
      data.orderIndex ?? (await resolveNextAgendaOrderIndex(sb, data.meetingId));

    const { data: inserted, error } = await sb
      .from("academic_council_agenda_items")
      .insert({
        meeting_id: data.meetingId,
        topic_id: null,
        title: data.title,
        order_index: orderIndex,
        notes: data.notes?.trim() || null,
        created_by: context.userId,
      })
      .select("id, order_index")
      .maybeSingle();

    if (error) mapAgendaDbError(error, "write");
    if (!inserted) throw new Error(AGENDA_WRITE_DENIED_MESSAGE);

    return {
      ok: true,
      agenda_item_id: inserted.id as string,
      order_index: inserted.order_index as number,
    };
  });

const updateAgendaItemSchema = z.object({
  agendaItemId: agendaItemIdSchema,
  title: z.string().trim().min(3).max(500).optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  orderIndex: z.number().int().positive().optional(),
  isApproved: z.boolean().optional(),
});

export const updateAgendaItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    rejectAgendaClientOverrides(input, [
      "meeting_id",
      "meetingId",
      "topic_id",
      "topicId",
      "created_by",
      "createdBy",
      "approved_by",
      "approvedBy",
      "approved_at",
      "approvedAt",
    ]);
    return updateAgendaItemSchema.parse(input);
  })
  .handler(async ({ data, context }): Promise<UpdateAgendaItemResult> => {
    const sb = context.supabase;

    const { data: existing, error: readErr } = await sb
      .from("academic_council_agenda_items")
      .select("id, meeting_id, meeting:academic_council_meetings(council_id)")
      .eq("id", data.agendaItemId)
      .maybeSingle();
    if (readErr) mapAgendaDbError(readErr, "write");
    if (!existing) throw new Error(AGENDA_WRITE_DENIED_MESSAGE);

    const meetingJoin = existing.meeting as { council_id: string } | { council_id: string }[] | null;
    const councilId = Array.isArray(meetingJoin)
      ? meetingJoin[0]?.council_id
      : meetingJoin?.council_id;
    if (!councilId) throw new Error(AGENDA_WRITE_DENIED_MESSAGE);

    await assertCanWriteCouncilAgenda(sb, context.userId, councilId);

    const patch: Database["public"]["Tables"]["academic_council_agenda_items"]["Update"] = {
      updated_by: context.userId,
    };
    if (data.title !== undefined) patch.title = data.title;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.orderIndex !== undefined) patch.order_index = data.orderIndex;
    if (data.isApproved !== undefined) {
      patch.is_approved = data.isApproved;
      if (data.isApproved) {
        patch.approved_by = context.userId;
        patch.approved_at = new Date().toISOString();
      } else {
        patch.approved_by = null;
        patch.approved_at = null;
      }
    }

    const { data: updated, error } = await sb
      .from("academic_council_agenda_items")
      .update(patch)
      .eq("id", data.agendaItemId)
      .select("id")
      .maybeSingle();

    if (error) mapAgendaDbError(error, "write");
    if (!updated) throw new Error(AGENDA_WRITE_DENIED_MESSAGE);

    return { ok: true, agenda_item_id: updated.id as string };
  });

const reorderAgendaItemsSchema = z.object({
  meetingId: meetingIdSchema,
  items: z
    .array(
      z.object({
        agendaItemId: agendaItemIdSchema,
        orderIndex: z.number().int().positive(),
      }),
    )
    .min(1, "قائمة الترتيب فارغة"),
});

export const reorderAgendaItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reorderAgendaItemsSchema.parse(input))
  .handler(async ({ data, context }): Promise<ReorderAgendaItemsResult> => {
    const sb = context.supabase;
    const meeting = await loadMeetingAgendaContext(sb, data.meetingId);
    await assertCanWriteCouncilAgenda(sb, context.userId, meeting.council_id);

    const { data: existingRows, error: loadErr } = await sb
      .from("academic_council_agenda_items")
      .select("id")
      .eq("meeting_id", data.meetingId);
    if (loadErr) mapAgendaDbError(loadErr, "reorder");

    const existingIds = new Set((existingRows ?? []).map((r) => r.id as string));
    const inputIds = new Set(data.items.map((i) => i.agendaItemId));

    if (existingIds.size !== inputIds.size) {
      throw new Error(AGENDA_REORDER_FAILED_MESSAGE);
    }
    for (const id of inputIds) {
      if (!existingIds.has(id)) {
        throw new Error(AGENDA_REORDER_FAILED_MESSAGE);
      }
    }

    const orderIndexes = data.items.map((i) => i.orderIndex);
    if (new Set(orderIndexes).size !== orderIndexes.length) {
      throw new Error(AGENDA_REORDER_FAILED_MESSAGE);
    }

    const tempBase = 100_000;
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      const { error } = await sb
        .from("academic_council_agenda_items")
        .update({
          order_index: tempBase + i,
          updated_by: context.userId,
        })
        .eq("id", item.agendaItemId)
        .eq("meeting_id", data.meetingId);
      if (error) mapAgendaDbError(error, "reorder");
    }

    for (const item of data.items) {
      const { error } = await sb
        .from("academic_council_agenda_items")
        .update({
          order_index: item.orderIndex,
          updated_by: context.userId,
        })
        .eq("id", item.agendaItemId)
        .eq("meeting_id", data.meetingId);
      if (error) mapAgendaDbError(error, "reorder");
    }

    return {
      ok: true,
      meeting_id: data.meetingId,
      updated_count: data.items.length,
    };
  });

export const finalizeMeetingAgenda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ meetingId: meetingIdSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<FinalizeMeetingAgendaResult> => {
    const sb = context.supabase;
    const meeting = await loadMeetingAgendaContext(sb, data.meetingId);

    await assertCanScheduleCouncilMeeting(sb, context.userId, meeting.council_id);

    const { data: agendaRows, error: loadErr } = await sb
      .from("academic_council_agenda_items")
      .select("id")
      .eq("meeting_id", data.meetingId);
    if (loadErr) mapAgendaDbError(loadErr, "finalize");

    const approvedAt = new Date().toISOString();
    for (const row of agendaRows ?? []) {
      const { error } = await sb
        .from("academic_council_agenda_items")
        .update({
          is_approved: true,
          approved_by: context.userId,
          approved_at: approvedAt,
          updated_by: context.userId,
        })
        .eq("id", row.id as string)
        .eq("meeting_id", data.meetingId);
      if (error) mapAgendaDbError(error, "finalize");
    }

    const { data: updatedMeeting, error: meetingErr } = await sb
      .from("academic_council_meetings")
      .update({
        status: "agenda_ready",
        updated_by: context.userId,
      })
      .eq("id", data.meetingId)
      .select("id, status")
      .maybeSingle();

    if (meetingErr) mapAgendaDbError(meetingErr, "finalize");
    if (!updatedMeeting) throw new Error(AGENDA_FINALIZE_DENIED_MESSAGE);

    return {
      ok: true,
      meeting_id: updatedMeeting.id as string,
      status: "agenda_ready",
      approved_items_count: agendaRows?.length ?? 0,
    };
  });
