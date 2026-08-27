import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCommunicationsAdmin, primaryActorRole } from "@/lib/authz.server";
import {
  MESSAGE_SEND_DENIED_AR,
  assertCanSendMessageTo,
  facultyTaughtStudentProfileIds,
  resolveMessagingCapability,
} from "@/lib/messaging-authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ---------- helpers ----------
async function logAudit(input: {
  actor_user_id: string;
  entity_id: string | null;
  action_type: string;
  notes?: string;
  old_values?: any;
  new_values?: any;
}) {
  const role = await primaryActorRole(input.actor_user_id);
  await supabaseAdmin.from("audit_logs").insert({
    actor_user_id: input.actor_user_id,
    actor_role: role,
    entity_type: "communication",
    entity_id: input.entity_id,
    action_type: input.action_type,
    notes: input.notes ?? null,
    old_values: input.old_values ?? null,
    new_values: input.new_values ?? null,
  } as any);
}

// Sender-role allow list lives in @/lib/messaging-authz.server (MESSAGE_SENDER_ROLES).

// ===================== ANNOUNCEMENTS =====================

const audienceEnum = z.enum(["all","students","faculty","staff","admins"]);
const typeEnum = z.enum(["general","academic","finance","urgent"]);

const announcementInput = z.object({
  title_ar: z.string().trim().min(1).max(200),
  content_ar: z.string().trim().min(1).max(5000),
  announcement_type: typeEnum.default("general"),
  target_audience: audienceEnum.default("all"),
  target_program_ids: z.array(z.string().uuid()).max(50).default([]),
  target_department_ids: z.array(z.string().uuid()).max(50).default([]),
  target_level_ids: z.array(z.string().uuid()).max(50).default([]),
  publish_at: z.string().datetime().optional(),
  expires_at: z.string().datetime().nullable().optional(),
  is_active: z.boolean().default(true),
});

export const listAnnouncementsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      search: z.string().trim().max(200).optional(),
      status: z.enum(["all","active","inactive","archived","scheduled","expired"]).default("all"),
      type: typeEnum.optional(),
      audience: audienceEnum.optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(50).default(20),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCommunicationsAdmin(context.userId);
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    let q = supabaseAdmin
      .from("announcements")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (data.search) q = q.or(`title_ar.ilike.%${data.search}%,content_ar.ilike.%${data.search}%`);
    if (data.type) q = q.eq("announcement_type", data.type);
    if (data.audience) q = q.eq("target_audience", data.audience);
    const nowIso = new Date().toISOString();
    if (data.status === "active") q = q.eq("is_active", true).eq("is_archived", false).lte("publish_at", nowIso);
    if (data.status === "inactive") q = q.eq("is_active", false);
    if (data.status === "archived") q = q.eq("is_archived", true);
    if (data.status === "scheduled") q = q.gt("publish_at", nowIso);
    if (data.status === "expired") q = q.lt("expires_at", nowIso);

    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

export const createAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => announcementInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertCommunicationsAdmin(context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("announcements")
      .insert({ ...data, created_by: context.userId } as any)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await logAudit({
      actor_user_id: context.userId,
      entity_id: row!.id,
      action_type: "announcement_created",
      new_values: { title_ar: row!.title_ar, target_audience: row!.target_audience, announcement_type: row!.announcement_type },
    });
    return row;
  });

export const updateAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), patch: announcementInput.partial() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCommunicationsAdmin(context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("announcements")
      .update(data.patch as any)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await logAudit({
      actor_user_id: context.userId,
      entity_id: data.id,
      action_type: "announcement_updated",
      new_values: data.patch,
    });
    return row;
  });

export const setAnnouncementActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCommunicationsAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("announcements")
      .update({ is_active: data.is_active } as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAudit({
      actor_user_id: context.userId,
      entity_id: data.id,
      action_type: data.is_active ? "announcement_published" : "announcement_updated",
      new_values: { is_active: data.is_active },
    });
    return { ok: true };
  });

export const archiveAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCommunicationsAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("announcements")
      .update({ is_archived: true, is_active: false } as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAudit({
      actor_user_id: context.userId,
      entity_id: data.id,
      action_type: "announcement_archived",
    });
    return { ok: true };
  });

export const getAnnouncementStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCommunicationsAdmin(context.userId);
    const { data: ann, error } = await supabaseAdmin
      .from("announcements")
      .select("target_audience, target_program_ids, target_department_ids, target_level_ids")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);

    // estimate recipients by audience
    let recipients = 0;
    const t = ann!.target_audience as string;
    if (t === "all" || t === "students") {
      let q: any = supabaseAdmin.from("student_profiles").select("id", { count: "exact", head: true });
      const dep = (ann!.target_department_ids ?? []) as string[];
      const prog = (ann!.target_program_ids ?? []) as string[];
      if (dep.length) q = q.in("department_id", dep);
      if (prog.length) q = q.in("program_id", prog);
      const { count } = await q;
      recipients += count ?? 0;
    }
    if (t === "all" || t === "faculty") {
      let q: any = supabaseAdmin.from("faculty_profiles").select("id", { count: "exact", head: true });
      const dep = (ann!.target_department_ids ?? []) as string[];
      const prog = (ann!.target_program_ids ?? []) as string[];
      if (dep.length) q = q.in("department_id", dep);
      if (prog.length) q = q.in("program_id", prog);
      const { count } = await q;
      recipients += count ?? 0;
    }
    if (t === "all" || t === "staff") {
      const { count } = await supabaseAdmin.from("staff_profiles").select("id", { count: "exact", head: true });
      recipients += count ?? 0;
    }
    if (t === "admins") {
      const { count } = await supabaseAdmin.from("user_roles").select("user_id", { count: "exact", head: true })
        .in("role", ["admin","system_admin","dean","registrar","student_affairs","finance_officer"]);
      recipients += count ?? 0;
    }

    const { count: viewed } = await supabaseAdmin
      .from("announcement_reads").select("id", { count: "exact", head: true }).eq("announcement_id", data.id);
    const v = viewed ?? 0;
    return {
      total_recipients: recipients,
      viewed: v,
      unread: Math.max(0, recipients - v),
      percentage: recipients > 0 ? Math.round((v / recipients) * 100) : 0,
    };
  });

// User-side: visible announcements (RLS-filtered) + unread flag
export const listMyAnnouncements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      limit: z.number().int().min(1).max(50).default(10),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("announcements")
      .select("id, title_ar, content_ar, announcement_type, target_audience, publish_at, expires_at, created_at")
      .eq("is_active", true)
      .eq("is_archived", false)
      .lte("publish_at", new Date().toISOString())
      .order("publish_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    const ids = (rows ?? []).map((r) => r.id);
    let readSet = new Set<string>();
    if (ids.length) {
      const { data: reads } = await supabase
        .from("announcement_reads").select("announcement_id").in("announcement_id", ids).eq("user_id", userId);
      readSet = new Set((reads ?? []).map((r) => r.announcement_id as string));
    }
    return (rows ?? []).map((r) => ({ ...r, is_read: readSet.has(r.id) }));
  });

export const markAnnouncementViewed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ announcement_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase.from("announcement_reads").insert({
      announcement_id: data.announcement_id,
      user_id: userId,
    } as any);
    return { ok: true };
  });

// ===================== MESSAGES =====================

export const listMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      box: z.enum(["inbox","sent","unread"]).default("inbox"),
      search: z.string().trim().max(200).optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(50).default(20),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    let q = supabase
      .from("internal_messages")
      .select("*", { count: "exact" })
      .order("sent_at", { ascending: false })
      .range(from, to);

    if (data.box === "inbox") q = q.eq("recipient_user_id", userId);
    else if (data.box === "sent") q = q.eq("sender_user_id", userId);
    else if (data.box === "unread") q = q.eq("recipient_user_id", userId).eq("is_read", false);

    if (data.search) q = q.or(`subject.ilike.%${data.search}%,message_body.ilike.%${data.search}%`);

    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);

    // resolve sender/recipient display names via admin client
    const userIds = Array.from(new Set((rows ?? []).flatMap((r: any) => [r.sender_user_id, r.recipient_user_id])));
    let names = new Map<string, string>();
    if (userIds.length) {
      const [stud, fac, staf] = await Promise.all([
        supabaseAdmin.from("student_profiles").select("user_id, full_name_ar, academic_number").in("user_id", userIds),
        supabaseAdmin.from("faculty_profiles").select("user_id, full_name_ar, employee_number").in("user_id", userIds),
        supabaseAdmin.from("staff_profiles").select("user_id, full_name_ar, employee_number").in("user_id", userIds),
      ]);
      for (const r of stud.data ?? []) names.set(r.user_id as string, `${r.full_name_ar} (${r.academic_number})`);
      for (const r of fac.data ?? []) names.set(r.user_id as string, `${r.full_name_ar} (${r.employee_number ?? "—"})`);
      for (const r of staf.data ?? []) names.set(r.user_id as string, `${r.full_name_ar} (${r.employee_number ?? "—"})`);
    }
    return {
      rows: (rows ?? []).map((r: any) => ({
        ...r,
        sender_name: names.get(r.sender_user_id) ?? "—",
        recipient_name: names.get(r.recipient_user_id) ?? "—",
      })),
      total: count ?? 0,
    };
  });

export const searchMessageRecipients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      query: z.string().trim().max(120).default(""),
      limit: z.number().int().min(1).max(50).default(20),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const capability = await resolveMessagingCapability(context.userId);

    const q = data.query;
    const out: { user_id: string; label: string; group: string }[] = [];

    if (capability.kind === "admin") {
      const [stud, fac, staf] = await Promise.all([
        supabaseAdmin.from("student_profiles").select("user_id, full_name_ar, academic_number")
          .not("user_id","is",null)
          .ilike("full_name_ar", q ? `%${q}%` : "%").limit(data.limit),
        supabaseAdmin.from("faculty_profiles").select("user_id, full_name_ar, employee_number")
          .not("user_id","is",null)
          .ilike("full_name_ar", q ? `%${q}%` : "%").limit(data.limit),
        supabaseAdmin.from("staff_profiles").select("user_id, full_name_ar, employee_number")
          .not("user_id","is",null)
          .ilike("full_name_ar", q ? `%${q}%` : "%").limit(data.limit),
      ]);
      if (stud.error || fac.error || staf.error) {
        throw new Error(MESSAGE_SEND_DENIED_AR);
      }
      for (const r of stud.data ?? []) out.push({ user_id: r.user_id as string, label: `${r.full_name_ar} — ${r.academic_number}`, group: "طلاب" });
      for (const r of fac.data ?? []) out.push({ user_id: r.user_id as string, label: `${r.full_name_ar} — ${r.employee_number ?? ""}`, group: "هيئة تدريس" });
      for (const r of staf.data ?? []) out.push({ user_id: r.user_id as string, label: `${r.full_name_ar} — ${r.employee_number ?? ""}`, group: "موظفون" });
      return out.slice(0, data.limit * 3);
    }

    if (capability.kind === "faculty") {
      // only students enrolled in sections taught by this faculty
      const sids = await facultyTaughtStudentProfileIds(capability.facultyProfileId);
      if (!sids.length) return [];
      let sq = supabaseAdmin.from("student_profiles")
        .select("user_id, full_name_ar, academic_number")
        .in("id", sids).not("user_id","is",null).limit(data.limit);
      if (q) sq = sq.ilike("full_name_ar", `%${q}%`);
      const { data: stud, error } = await sq;
      if (error) throw new Error(MESSAGE_SEND_DENIED_AR);
      for (const r of stud ?? []) out.push({ user_id: r.user_id as string, label: `${r.full_name_ar} — ${r.academic_number}`, group: "طلابي" });
      return out;
    }
    return [];
  });


export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      recipient_user_id: z.string().uuid(),
      subject: z.string().trim().min(1).max(200),
      message_body: z.string().trim().min(1).max(5000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Server-side authorization BEFORE any insert — mirrors searchMessageRecipients.
    await assertCanSendMessageTo(userId, data.recipient_user_id);
    const { data: row, error } = await supabase
      .from("internal_messages")
      .insert({
        sender_user_id: userId,
        recipient_user_id: data.recipient_user_id,
        subject: data.subject,
        message_body: data.message_body,
      } as any)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await logAudit({
      actor_user_id: userId,
      entity_id: row!.id,
      action_type: "message_sent",
      new_values: { recipient_user_id: data.recipient_user_id, subject: data.subject },
    });
    // Notification fan-out (best effort, via admin)
    await supabaseAdmin.from("notifications").insert({
      user_id: data.recipient_user_id,
      title: "رسالة داخلية جديدة",
      message: data.subject,
      notification_type: "system",
      reference_type: "internal_message",
      reference_id: row!.id,
    } as any);
    return row;
  });

export const markMessageRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("internal_messages")
      .update({ is_read: true } as any)
      .eq("id", data.id)
      .eq("recipient_user_id", userId);
    if (error) throw new Error(error.message);
    await logAudit({
      actor_user_id: userId,
      entity_id: data.id,
      action_type: "message_read",
    });
    return { ok: true };
  });

// ===================== DASHBOARD =====================
export const getCommunicationsDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCommunicationsAdmin(context.userId);

    const { userId } = context;
    const nowIso = new Date().toISOString();
    const startOfToday = new Date(); startOfToday.setHours(0,0,0,0);
    const [
      activeAnn, todayAnn, unreadMsg,
    ] = await Promise.all([
      supabaseAdmin.from("announcements")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true).eq("is_archived", false)
        .lte("publish_at", nowIso),
      supabaseAdmin.from("announcements")
        .select("id", { count: "exact", head: true })
        .gte("publish_at", startOfToday.toISOString()).lte("publish_at", nowIso),
      supabaseAdmin.from("internal_messages")
        .select("id", { count: "exact", head: true })
        .eq("recipient_user_id", userId).eq("is_read", false),
    ]);

    // unread announcements for current user (approximate: visible to user but not in reads)
    const { data: visible } = await supabaseAdmin
      .from("announcements")
      .select("id")
      .eq("is_active", true).eq("is_archived", false)
      .lte("publish_at", nowIso)
      .limit(500);
    let unreadAnn = 0;
    const ids = (visible ?? []).map((v) => v.id);
    if (ids.length) {
      const { data: reads } = await supabaseAdmin
        .from("announcement_reads").select("announcement_id").in("announcement_id", ids).eq("user_id", userId);
      const set = new Set((reads ?? []).map((r) => r.announcement_id));
      unreadAnn = ids.filter((id) => !set.has(id)).length;
    }

    return {
      active_announcements: activeAnn.count ?? 0,
      announcements_today: todayAnn.count ?? 0,
      unread_announcements: unreadAnn,
      unread_messages: unreadMsg.count ?? 0,
    };
  });

export const getCommunicationsTargetLookups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCommunicationsAdmin(context.userId);
    const [depts, progs, levels] = await Promise.all([
      supabaseAdmin.from("departments").select("id, name_ar").eq("is_active", true).order("sort_order"),
      supabaseAdmin.from("programs").select("id, name_ar").eq("is_active", true).order("sort_order"),
      supabaseAdmin.from("academic_levels").select("id, name, level_number").order("level_number"),
    ]);
    if (depts.error) throw new Error(depts.error.message);
    if (progs.error) throw new Error(progs.error.message);
    if (levels.error) throw new Error(levels.error.message);
    return {
      departments: depts.data ?? [],
      programs: progs.data ?? [],
      levels: levels.data ?? [],
    };
  });

export const listCommunicationAuditLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCommunicationsAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("audit_logs")
      .select("id, created_at, actor_role, action_type, entity_id, new_values, notes")
      .eq("entity_type", "communication")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
