import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ------------ Helpers ------------

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "system_admin"]);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error("ليس لديك صلاحية");
  }
}

async function actorRole(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (!data || data.length === 0) return null;
  const priority = [
    "system_admin", "admin", "dean", "registrar", "student_affairs",
    "finance_officer", "department_head", "faculty_member", "graduate", "student",
  ];
  for (const p of priority) if (data.some((r: any) => r.role === p)) return p;
  return data[0].role as string;
}

async function logAudit(input: {
  actor_user_id: string;
  action_type: string;
  entity_id: string | null;
  notes?: string;
  old_values?: any;
  new_values?: any;
}) {
  const role = await actorRole(input.actor_user_id);
  await supabaseAdmin.from("audit_logs").insert({
    actor_user_id: input.actor_user_id,
    actor_role: role,
    entity_type: "user",
    entity_id: input.entity_id,
    action_type: input.action_type,
    notes: input.notes ?? null,
    old_values: input.old_values ?? null,
    new_values: input.new_values ?? null,
  } as any);
}

type AccountKind = "student" | "faculty" | "staff";

function emailFor(kind: AccountKind, identifier: string): string {
  switch (kind) {
    case "student":
      return `${identifier}@students.usr.edu.ye`;
    case "faculty":
      return `${identifier}@faculty.usr.edu.ye`;
    case "staff":
      return `${identifier}@staff.usr.edu.ye`;
  }
}

// Map staff role_type to app_role
function staffRoleFor(roleType: string | null | undefined): string {
  switch (roleType) {
    case "registrar": return "registrar";
    case "student_affairs": return "student_affairs";
    case "finance": return "finance_officer";
    case "dean": return "dean";
    case "admin": return "admin";
    default: return "registrar";
  }
}

// ------------ List Users ------------

export const listUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { kind: AccountKind; search?: string; status?: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    if (data.kind === "student") {
      let q = supabaseAdmin
        .from("student_profiles")
        .select("id, user_id, academic_number, full_name_ar, status, must_change_password, department_id")
        .order("academic_number");
      if (data.search) {
        q = q.or(`academic_number.ilike.%${data.search}%,full_name_ar.ilike.%${data.search}%`);
      }
      if (data.status && data.status !== "all") q = q.eq("status", data.status);
      const { data: rows, error } = await q.limit(500);
      if (error) throw new Error(error.message);
      const userIds = (rows ?? []).filter((r) => r.user_id).map((r) => r.user_id as string);
      const { data: roles } = userIds.length
        ? await supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", userIds)
        : { data: [] as any[] };
      return (rows ?? []).map((r) => ({
        ...r,
        identifier: r.academic_number,
        email: r.user_id ? emailFor("student", r.academic_number) : null,
        roles: (roles ?? []).filter((x: any) => x.user_id === r.user_id).map((x: any) => x.role),
      }));
    }

    if (data.kind === "faculty") {
      let q = supabaseAdmin
        .from("faculty_profiles")
        .select("id, user_id, employee_number, full_name_ar, status, must_change_password, department_id, academic_rank")
        .order("employee_number");
      if (data.search) {
        q = q.or(`employee_number.ilike.%${data.search}%,full_name_ar.ilike.%${data.search}%`);
      }
      if (data.status && data.status !== "all") q = q.eq("status", data.status);
      const { data: rows, error } = await q.limit(500);
      if (error) throw new Error(error.message);
      const userIds = (rows ?? []).filter((r) => r.user_id).map((r) => r.user_id as string);
      const { data: roles } = userIds.length
        ? await supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", userIds)
        : { data: [] as any[] };
      return (rows ?? []).map((r) => ({
        ...r,
        identifier: r.employee_number ?? "",
        email: r.user_id && r.employee_number ? emailFor("faculty", r.employee_number) : null,
        roles: (roles ?? []).filter((x: any) => x.user_id === r.user_id).map((x: any) => x.role),
      }));
    }

    // staff
    let q = supabaseAdmin
      .from("staff_profiles")
      .select("id, user_id, employee_number, full_name_ar, status, must_change_password, department_id, role_type, job_title")
      .order("employee_number");
    if (data.search) {
      q = q.or(`employee_number.ilike.%${data.search}%,full_name_ar.ilike.%${data.search}%`);
    }
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q.limit(500);
    if (error) throw new Error(error.message);
    const userIds = (rows ?? []).filter((r) => r.user_id).map((r) => r.user_id as string);
    const { data: roles } = userIds.length
      ? await supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", userIds)
      : { data: [] as any[] };
    return (rows ?? []).map((r) => ({
      ...r,
      identifier: r.employee_number ?? "",
      email: r.user_id && r.employee_number ? emailFor("staff", r.employee_number) : null,
      roles: (roles ?? []).filter((x: any) => x.user_id === r.user_id).map((x: any) => x.role),
    }));
  });

// ------------ Create Account ------------

export const createAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { kind: AccountKind; profile_id: string }) =>
    z.object({
      kind: z.enum(["student", "faculty", "staff"]),
      profile_id: z.string().uuid(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const table =
      data.kind === "student" ? "student_profiles"
      : data.kind === "faculty" ? "faculty_profiles"
      : "staff_profiles";

    const { data: profile, error: pErr } = await supabaseAdmin
      .from(table)
      .select("*")
      .eq("id", data.profile_id)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!profile) throw new Error("الحساب غير موجود");
    if ((profile as any).user_id) throw new Error("الحساب مفعّل مسبقاً");

    const identifier =
      data.kind === "student"
        ? (profile as any).academic_number
        : (profile as any).employee_number;
    if (!identifier) throw new Error("الرقم الأكاديمي/الوظيفي مفقود");

    const email = emailFor(data.kind, identifier);
    const password = identifier;

    const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name_ar: (profile as any).full_name_ar, kind: data.kind },
    });
    if (cErr || !created.user) throw new Error(cErr?.message ?? "تعذّر إنشاء الحساب");

    const newUserId = created.user.id;

    // Link profile
    const { error: uErr } = await supabaseAdmin
      .from(table)
      .update({ user_id: newUserId, must_change_password: true, status: "active" } as any)
      .eq("id", data.profile_id);
    if (uErr) {
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      throw new Error(uErr.message);
    }

    // Assign role
    const role =
      data.kind === "student" ? "student"
      : data.kind === "faculty" ? "faculty_member"
      : staffRoleFor((profile as any).role_type);
    await supabaseAdmin.from("user_roles").insert({ user_id: newUserId, role: role as any });

    await logAudit({
      actor_user_id: context.userId,
      action_type: "user_created",
      entity_id: newUserId,
      notes: `إنشاء حساب ${data.kind} للمستخدم ${email}`,
      new_values: { email, kind: data.kind, profile_id: data.profile_id, role },
    });

    return { user_id: newUserId, email };
  });

// ------------ Reset Password ------------

export const resetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { kind: AccountKind; profile_id: string }) =>
    z.object({
      kind: z.enum(["student", "faculty", "staff"]),
      profile_id: z.string().uuid(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const table =
      data.kind === "student" ? "student_profiles"
      : data.kind === "faculty" ? "faculty_profiles"
      : "staff_profiles";

    const { data: profile } = await supabaseAdmin
      .from(table).select("*").eq("id", data.profile_id).maybeSingle();
    if (!profile || !(profile as any).user_id) throw new Error("الحساب غير موجود");

    const identifier =
      data.kind === "student"
        ? (profile as any).academic_number
        : (profile as any).employee_number;
    const password = identifier;

    const { error: aErr } = await supabaseAdmin.auth.admin.updateUserById(
      (profile as any).user_id,
      { password }
    );
    if (aErr) throw new Error(aErr.message);

    await supabaseAdmin
      .from(table)
      .update({ must_change_password: true } as any)
      .eq("id", data.profile_id);

    await logAudit({
      actor_user_id: context.userId,
      action_type: "password_reset",
      entity_id: (profile as any).user_id,
      notes: `إعادة تعيين كلمة المرور لـ ${identifier}`,
    });

    return { ok: true };
  });

// ------------ Activate / Deactivate ------------

export const setActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { kind: AccountKind; profile_id: string; active: boolean }) =>
    z.object({
      kind: z.enum(["student", "faculty", "staff"]),
      profile_id: z.string().uuid(),
      active: z.boolean(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const table =
      data.kind === "student" ? "student_profiles"
      : data.kind === "faculty" ? "faculty_profiles"
      : "staff_profiles";

    const { data: profile } = await supabaseAdmin
      .from(table).select("*").eq("id", data.profile_id).maybeSingle();
    if (!profile) throw new Error("الحساب غير موجود");
    const targetUserId = (profile as any).user_id as string | null;

    // Protect last admin
    if (!data.active && targetUserId) {
      const { data: adminRoles } = await supabaseAdmin
        .from("user_roles").select("user_id").eq("role", "admin");
      const admins = adminRoles ?? [];
      const isAdmin = admins.some((r: any) => r.user_id === targetUserId);
      if (isAdmin && admins.length <= 1) {
        throw new Error("لا يمكن تعطيل آخر حساب مدير في النظام");
      }
    }

    await supabaseAdmin
      .from(table)
      .update({ status: data.active ? "active" : "inactive" } as any)
      .eq("id", data.profile_id);

    if (targetUserId) {
      await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
        ban_duration: data.active ? "none" : "876000h", // ~100 years
      } as any);
    }

    await logAudit({
      actor_user_id: context.userId,
      action_type: data.active ? "user_activated" : "user_deactivated",
      entity_id: targetUserId,
      notes: data.active ? "تفعيل الحساب" : "تعطيل الحساب",
      new_values: { status: data.active ? "active" : "inactive" },
    });

    return { ok: true };
  });

// ------------ Manage Roles ------------

export const addRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { user_id: string; role: string }) =>
    z.object({ user_id: z.string().uuid(), role: z.string().min(1) }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.user_id, role: data.role as any });
    if (error && !error.message.includes("duplicate")) throw new Error(error.message);

    await logAudit({
      actor_user_id: context.userId,
      action_type: "role_added",
      entity_id: data.user_id,
      notes: `إضافة دور: ${data.role}`,
      new_values: { role: data.role },
    });
    return { ok: true };
  });

export const removeRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { user_id: string; role: string }) =>
    z.object({ user_id: z.string().uuid(), role: z.string().min(1) }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    // Trigger also protects, but check here for nicer error
    if (data.role === "admin") {
      const { count } = await supabaseAdmin
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin");
      if ((count ?? 0) <= 1) throw new Error("لا يمكن إزالة آخر مدير في النظام");
    }

    const { error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.user_id)
      .eq("role", data.role as any);
    if (error) throw new Error(error.message);

    await logAudit({
      actor_user_id: context.userId,
      action_type: "role_removed",
      entity_id: data.user_id,
      notes: `إزالة دور: ${data.role}`,
      old_values: { role: data.role },
    });
    return { ok: true };
  });

// ------------ Active users counts ------------

export const activeUserCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const [s, f, st] = await Promise.all([
      supabaseAdmin.from("student_profiles").select("id", { count: "exact", head: true }).eq("status", "active").not("user_id", "is", null),
      supabaseAdmin.from("faculty_profiles").select("id", { count: "exact", head: true }).eq("status", "active").not("user_id", "is", null),
      supabaseAdmin.from("staff_profiles").select("id", { count: "exact", head: true }).eq("status", "active").not("user_id", "is", null),
    ]);
    return {
      students: s.count ?? 0,
      faculty: f.count ?? 0,
      staff: st.count ?? 0,
    };
  });

// ------------ Admin counts (for hardening dashboard) ------------

export const adminAccountCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const [a, sa] = await Promise.all([
      supabaseAdmin.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "admin"),
      supabaseAdmin.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "system_admin"),
    ]);
    return { admin: a.count ?? 0, system_admin: sa.count ?? 0 };
  });

// ------------ Create Admin / System Admin account (Backup Admin) ------------

export const createAdminAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string; password: string; full_name_ar: string; role: "admin" | "system_admin" }) =>
    z.object({
      email: z.string().email().max(160),
      password: z.string().min(8).max(72),
      full_name_ar: z.string().min(2).max(120),
      role: z.enum(["admin", "system_admin"]),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name_ar: data.full_name_ar, kind: "admin" },
    });
    if (cErr || !created.user) throw new Error(cErr?.message ?? "تعذّر إنشاء الحساب");

    const newUserId = created.user.id;
    const { error: rErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: newUserId, role: data.role as any });
    if (rErr) {
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      throw new Error(rErr.message);
    }

    await logAudit({
      actor_user_id: context.userId,
      action_type: "admin_account_created",
      entity_id: newUserId,
      notes: `إنشاء حساب ${data.role} للبريد ${data.email}`,
      new_values: { email: data.email, role: data.role },
    });

    return { user_id: newUserId, email: data.email };
  });
