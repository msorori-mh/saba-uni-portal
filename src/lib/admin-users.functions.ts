import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { assertAdmin, assertAnyRole, primaryActorRole } from "@/lib/authz.server";
import { generateTemporaryPassword } from "@/lib/password.server";
import { enforceRateLimit, SERVER_RATE_LIMIT_POLICIES } from "@/lib/rate-limit.server";

// ------------ Helpers ------------

async function logAudit(input: {
  actor_user_id: string;
  action_type: string;
  entity_id: string | null;
  notes?: string;
  old_values?: any;
  new_values?: any;
}) {
  const role = await primaryActorRole(input.actor_user_id);
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

/** Matches admin-nav route access for list/provision actions per account kind. */
const ACCOUNT_LIST_ROLES: Record<AccountKind, readonly string[]> = {
  student: ["admin", "system_admin", "dean", "registrar", "student_affairs"],
  faculty: ["admin", "system_admin", "dean", "registrar", "hr_officer"],
  staff: ["admin", "system_admin", "dean", "hr_officer"],
};

const ACCOUNT_PROVISION_ROLES: Record<AccountKind, readonly string[]> = {
  student: ["admin", "system_admin", "registrar", "student_affairs"],
  faculty: ["admin", "system_admin", "dean", "registrar", "hr_officer"],
  staff: ["admin", "system_admin", "dean", "hr_officer"],
};

function emailFor(kind: AccountKind, identifier: string): string {
  switch (kind) {
    case "student":
      return `${identifier.toLowerCase()}@students.usr.edu.ye`;
    case "faculty":
      return `${identifier.toLowerCase()}@faculty.usr.edu.ye`;
    case "staff":
      return `${identifier.toLowerCase()}@staff.usr.edu.ye`;
  }
}

async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const { data, error } = await (supabaseAdmin as any).rpc("find_auth_user_id_by_email", {
    p_email: email,
  });
  if (error) throw new Error(`تعذّر التحقق من حساب الدخول — ${error.message}`);
  return data ? (data as string) : null;
}

type ActorSupabase = ReturnType<typeof createClient<Database>>;

/** RPCs that require auth.uid() must use a client bound to the admin Bearer token from this request. */
function actorSupabase(context: { supabase: ActorSupabase }): ActorSupabase {
  const request = getRequest();
  const authHeader = request?.headers?.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "");
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (url && key && token) {
      return createClient<Database>(url, key, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
      });
    }
  }
  return context.supabase;
}

/** Server-safe faculty link (service_role RPC — no caller Authorization header). */
async function linkFacultyProfileToAuth(profileId: string, userId: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc("link_faculty_profile_account", {
    p_profile_id: profileId,
    p_auth_user_id: userId,
  });
  if (error) throw new Error(error.message);
}

/**
 * Relink profile → auth user.
 * Faculty: service_role RPC (PR #14 used context.supabase UPDATE which could fail without JWT).
 * Staff/student: actor JWT via link RPC or admin session UPDATE.
 */
async function relinkProfileUserId(
  context: { supabase: ActorSupabase },
  kind: AccountKind,
  profileId: string,
  userId: string,
): Promise<void> {
  if (kind === "faculty") {
    await linkFacultyProfileToAuth(profileId, userId);
    return;
  }
  if (kind === "student") {
    const { error } = await actorSupabase(context).rpc("link_student_user_account", {
      _profile_id: profileId,
      _target_user_id: userId,
    });
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await actorSupabase(context)
    .from("staff_profiles")
    .update({ user_id: userId, must_change_password: true } as any)
    .eq("id", profileId);
  if (error) throw new Error(error.message);
}

/** Last-resort repair: only touches the auth.users row for the given official email. */
async function repairAuthUserForEmail(
  email: string,
  password: string,
  metadata: { full_name_ar?: string; kind: AccountKind },
): Promise<string> {
  const emailAuthId = await findAuthUserIdByEmail(email);

  if (emailAuthId) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(emailAuthId, { password });
    if (!error) return emailAuthId;
    try {
      await supabaseAdmin.auth.admin.deleteUser(emailAuthId);
    } catch {
      /* corrupt rows may fail delete */
    }
  }

  const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (cErr || !created.user) {
    throw new Error(cErr?.message ?? "تعذّر إنشاء حساب الدخول");
  }
  return created.user.id;
}

async function migrateUserRoles(fromUserId: string, toUserId: string): Promise<void> {
  if (fromUserId === toUserId) return;
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", fromUserId);
  for (const row of roles ?? []) {
    const { data: exists } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", toUserId)
      .eq("role", row.role as any)
      .maybeSingle();
    if (!exists) {
      await supabaseAdmin.from("user_roles").insert({ user_id: toUserId, role: row.role as any });
    }
  }
}

function defaultRoleForProfile(kind: AccountKind, profile: Record<string, unknown>): string {
  if (kind === "student") return "student";
  if (kind === "faculty") return "faculty_member";
  return staffRoleFor(profile.role_type as string | null | undefined);
}

async function ensureProfileRoles(
  kind: AccountKind,
  profile: Record<string, unknown>,
  userId: string,
  preferredRoles?: string[],
): Promise<void> {
  const roles = preferredRoles?.length
    ? preferredRoles
    : [defaultRoleForProfile(kind, profile)];
  for (const role of roles) {
    const { data: exists } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("role", role as any)
      .maybeSingle();
    if (!exists) {
      await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: role as any });
    }
  }
}
function staffRoleFor(roleType: string | null | undefined): string {
  switch (roleType) {
    case "registrar": return "registrar";
    case "student_affairs": return "student_affairs";
    case "finance": return "finance_officer";
    case "finance_officer": return "finance_officer";
    case "hr_officer": return "hr_officer";
    case "dean": return "dean";
    case "admin": return "admin";
    default: return "registrar";
  }
}

/** Map operational app_role (+ staff role_type) to roles_catalog code for user_role_assignments sync. */
function catalogCodeForAccount(
  kind: AccountKind,
  appRole: string,
  staffRoleType?: string | null,
): string | null {
  if (kind === "student") return null;
  if (kind === "faculty") return "faculty_member";
  switch (staffRoleType) {
    case "admin": return "admin";
    case "dean": return "dean";
    case "registrar": return "registrar_officer";
    case "student_affairs": return "student_affairs_officer";
    case "finance": return "finance_officer";
    case "finance_officer": return "finance_officer";
    case "hr_officer": return "hr_officer";
    default: break;
  }
  const fallback: Record<string, string> = {
    admin: "admin",
    system_admin: "system_admin",
    dean: "dean",
    registrar: "registrar_officer",
    student_affairs: "student_affairs_officer",
    finance_officer: "finance_officer",
    department_head: "department_head",
    faculty_member: "faculty_member",
  };
  return fallback[appRole] ?? null;
}

async function syncCatalogRoleAssignment(
  userId: string,
  roleCode: string | null,
  assignedBy: string,
): Promise<void> {
  if (!roleCode) return;
  const { data: cat } = await supabaseAdmin
    .from("roles_catalog")
    .select("code, is_active")
    .eq("code", roleCode)
    .maybeSingle();
  if (!cat || !(cat as { is_active: boolean }).is_active) return;

  const { error } = await supabaseAdmin.from("user_role_assignments").insert({
    user_id: userId,
    role_code: roleCode,
    assigned_by: assignedBy,
    notes: "مزامنة تلقائية عند إنشاء الحساب",
  } as any);
  if (error && !error.message.toLowerCase().includes("duplicate")) {
    /* non-fatal — operational role already assigned */
  }
}

// ------------ List Users ------------

export const listUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { kind: AccountKind; search?: string; status?: string; page?: number; pageSize?: number }) => input)
  .handler(async ({ data, context }) => {
    await assertAnyRole(
      context.userId,
      ACCOUNT_LIST_ROLES[data.kind],
      "ليس لديك صلاحية عرض هذه القائمة",
    );

    // PERFORMANCE-FIX-02A: server-side pagination
    // Backward-compatible: when page/pageSize are omitted, behave as before (one page, up to 500).
    const pageSize = Math.min(Math.max(data.pageSize ?? 500, 1), 500);
    const page = Math.max(data.page ?? 1, 1);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const buildSelect = (
      table: "student_profiles" | "faculty_profiles" | "staff_profiles",
      columns: string,
      identCol: "academic_number" | "employee_number",
    ): any => {
      let q = supabaseAdmin
        .from(table)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select(columns as any, { count: "exact" })
        .order(identCol);
      if (data.search) q = q.or(`${identCol}.ilike.%${data.search}%,full_name_ar.ilike.%${data.search}%`);
      if (data.status && data.status !== "all") q = q.eq("status", data.status);
      return q.range(from, to);
    };

    if (data.kind === "student") {
      const { data: rows, count, error } = await buildSelect(
        "student_profiles",
        "id, user_id, academic_number, full_name_ar, status, must_change_password, department_id",
        "academic_number",
      );
      if (error) throw new Error(error.message);
      const userIds = (rows ?? []).filter((r: any) => r.user_id).map((r: any) => r.user_id as string);
      const { data: roles } = userIds.length
        ? await supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", userIds)
        : { data: [] as any[] };
      const mapped = (rows ?? []).map((r: any) => ({
        ...r,
        identifier: r.academic_number,
        email: r.user_id ? emailFor("student", r.academic_number) : null,
        roles: (roles ?? []).filter((x: any) => x.user_id === r.user_id).map((x: any) => x.role),
      }));
      return Object.assign(mapped, { __total: count ?? mapped.length, __page: page, __pageSize: pageSize });
    }

    if (data.kind === "faculty") {
      const { data: rows, count, error } = await buildSelect(
        "faculty_profiles",
        "id, user_id, employee_number, full_name_ar, status, must_change_password, department_id, academic_rank",
        "employee_number",
      );
      if (error) throw new Error(error.message);
      const userIds = (rows ?? []).filter((r: any) => r.user_id).map((r: any) => r.user_id as string);
      const { data: roles } = userIds.length
        ? await supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", userIds)
        : { data: [] as any[] };
      const mapped = (rows ?? []).map((r: any) => ({
        ...r,
        identifier: r.employee_number ?? "",
        email: r.user_id && r.employee_number ? emailFor("faculty", r.employee_number) : null,
        roles: (roles ?? []).filter((x: any) => x.user_id === r.user_id).map((x: any) => x.role),
      }));
      return Object.assign(mapped, { __total: count ?? mapped.length, __page: page, __pageSize: pageSize });
    }

    // staff
    const { data: rows, count, error } = await buildSelect(
      "staff_profiles",
      "id, user_id, employee_number, full_name_ar, status, must_change_password, department_id, role_type, job_title",
      "employee_number",
    );
    if (error) throw new Error(error.message);
    const userIds = (rows ?? []).filter((r: any) => r.user_id).map((r: any) => r.user_id as string);
    const { data: roles } = userIds.length
      ? await supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", userIds)
      : { data: [] as any[] };
    const mapped = (rows ?? []).map((r: any) => ({
      ...r,
      identifier: r.employee_number ?? "",
      email: r.user_id && r.employee_number ? emailFor("staff", r.employee_number) : null,
      roles: (roles ?? []).filter((x: any) => x.user_id === r.user_id).map((x: any) => x.role),
    }));
    return Object.assign(mapped, { __total: count ?? mapped.length, __page: page, __pageSize: pageSize });
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
    await assertAnyRole(
      context.userId,
      ACCOUNT_PROVISION_ROLES[data.kind],
      "ليس لديك صلاحية إنشاء حسابات الدخول",
    );

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

    // ─── FACULTY-ACCOUNT-REPAIR-02: استعلام مباشر على auth.users بدل listUsers ───
    // listUsers({perPage:200}) يحمّل كل سجلات auth دفعة واحدة وقد يفشل بالكامل
    // بخطأ "Database error loading user" إذا كان أحد السجلات فاسداً.
    let newUserId: string | null = null;
    let linkedExisting = false;
    let temporaryPassword: string | null = null;

    const { data: existingId, error: lookupErr } = await (supabaseAdmin as any)
      .rpc("find_auth_user_id_by_email", { p_email: email });

    if (lookupErr) {
      throw new Error(`تعذّر التحقق من حساب الدخول — ${lookupErr.message}`);
    }
    const existing = existingId ? { id: existingId as string } : null;


    if (existing) {
      const { data: linkedProfile } = await supabaseAdmin
        .from(table)
        .select("id")
        .eq("user_id", (existing as any).id)
        .maybeSingle();

      if (linkedProfile && (linkedProfile as any).id === data.profile_id) {
        throw new Error("الحساب موجود ومربوط مسبقاً بهذا الملف");
      }
      if (linkedProfile && (linkedProfile as any).id !== data.profile_id) {
        throw new Error("البريد الإلكتروني مستخدم بحساب آخر — لا يمكن الربط");
      }
      // Auth موجود لكن غير مربوط → استخدمه للربط بدلاً من الإنشاء
      newUserId = (existing as any).id;
      linkedExisting = true;
    } else {
      temporaryPassword = generateTemporaryPassword();
      const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: { full_name_ar: (profile as any).full_name_ar, kind: data.kind },
      });
      if (cErr || !created.user) {
        throw new Error(
          `تعذّر إنشاء حساب الدخول — ${cErr?.message ?? "خطأ غير معروف"}`,
        );
      }
      newUserId = created.user.id;
    }


    // Link profile. For students, use the SECURITY DEFINER RPC so the
    // protect_student_sensitive_fields trigger does not silently revert user_id
    // (service_role has no auth.uid()). Call as the authenticated admin so the
    // RPC's internal role check passes.
    let uErr: { message: string } | null = null;
    if (data.kind === "student") {
      const { error } = await actorSupabase(context).rpc(
        "link_student_user_account",
        { _profile_id: data.profile_id, _target_user_id: newUserId },
      );
      uErr = error ? { message: error.message } : null;
    } else if (data.kind === "faculty") {
      try {
        await linkFacultyProfileToAuth(data.profile_id, newUserId!);
      } catch (e) {
        uErr = { message: e instanceof Error ? e.message : String(e) };
      }
    } else {
      const { error } = await actorSupabase(context)
        .from(table)
        .update({ user_id: newUserId, must_change_password: true, status: "active" } as any)
        .eq("id", data.profile_id);
      uErr = error ? { message: error.message } : null;
    }
    if (uErr) {
      if (!linkedExisting && newUserId) {
        await supabaseAdmin.auth.admin.deleteUser(newUserId);
      }
      throw new Error(uErr.message);
    }

    // Assign role (idempotent)
    const role =
      data.kind === "student" ? "student"
      : data.kind === "faculty" ? "faculty_member"
      : staffRoleFor((profile as any).role_type);
    const { data: existingRole } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", newUserId!)
      .eq("role", role as any)
      .maybeSingle();
    if (!existingRole) {
      await supabaseAdmin.from("user_roles").insert({ user_id: newUserId!, role: role as any });
    }

    await syncCatalogRoleAssignment(
      newUserId!,
      catalogCodeForAccount(data.kind, role, (profile as any).role_type),
      context.userId,
    );

    await logAudit({
      actor_user_id: context.userId,
      action_type: linkedExisting ? "user_linked_existing_auth" : "user_created",
      entity_id: newUserId,
      notes: linkedExisting
        ? `ربط ملف ${data.kind} بحساب Auth موجود مسبقاً: ${email}`
        : `إنشاء حساب ${data.kind} للمستخدم ${email}`,
      new_values: { email, kind: data.kind, profile_id: data.profile_id, role, linked_existing: linkedExisting },
    });

    return {
      user_id: newUserId,
      email,
      linked_existing: linkedExisting,
      password: temporaryPassword ?? undefined,
    };
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
    await assertAnyRole(
      context.userId,
      ACCOUNT_PROVISION_ROLES[data.kind],
      "ليس لديك صلاحية إعادة تعيين كلمة المرور",
    );
    await enforceRateLimit(
      `admin-reset:${context.userId}:${data.kind}:${data.profile_id}`,
      SERVER_RATE_LIMIT_POLICIES.adminPasswordReset,
    );

    const table =
      data.kind === "student" ? "student_profiles"
      : data.kind === "faculty" ? "faculty_profiles"
      : "staff_profiles";

    const { data: profile } = await supabaseAdmin
      .from(table).select("*").eq("id", data.profile_id).maybeSingle();
    if (!profile) throw new Error("الحساب غير موجود");

    const identifier =
      data.kind === "student"
        ? (profile as any).academic_number
        : (profile as any).employee_number;
    if (!identifier) throw new Error("الرقم الأكاديمي/الوظيفي مفقود");

    const email = emailFor(data.kind, identifier);
    const profileUserId = ((profile as any).user_id as string | null) ?? null;

    let authUserId = await findAuthUserIdByEmail(email);
    let relinked = false;
    let repairedAuth = false;

    if (!authUserId && !profileUserId) {
      throw new Error("لا يوجد حساب دخول مرتبط بهذا الملف");
    }

    if (authUserId && authUserId !== profileUserId) {
      if (profileUserId) await migrateUserRoles(profileUserId, authUserId);
      await relinkProfileUserId(context, data.kind, data.profile_id, authUserId);
      relinked = true;
    } else if (!authUserId && profileUserId) {
      authUserId = profileUserId;
    }

    const password = generateTemporaryPassword();

    let { error: aErr } = await supabaseAdmin.auth.admin.updateUserById(authUserId!, { password });

    if (aErr && /Database error loading user/i.test(aErr.message)) {
      const roleSourceId = profileUserId ?? authUserId!;
      const { data: existingRoles } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", roleSourceId);
      const rolesToRestore = (existingRoles ?? []).map((r) => r.role as string);

      const previousAuthUserId = authUserId!;
      authUserId = await repairAuthUserForEmail(
        email,
        password,
        { full_name_ar: (profile as any).full_name_ar, kind: data.kind },
      );
      repairedAuth = true;

      if (authUserId !== previousAuthUserId || !profileUserId) {
        await relinkProfileUserId(context, data.kind, data.profile_id, authUserId);
        relinked = true;
        await ensureProfileRoles(data.kind, profile as Record<string, unknown>, authUserId, rolesToRestore);
      }
      aErr = null;
    } else if (aErr) {
      throw new Error(`تعذّر إعادة تعيين كلمة المرور — ${aErr.message}`);
    }

    // Use SECURITY DEFINER RPCs to bypass protect_*_sensitive_fields triggers
    // (service_role has no auth.uid(), so a direct UPDATE is silently reverted).
    const rpcName =
      data.kind === "student" ? "admin_mark_student_password_reset"
      : data.kind === "faculty" ? "admin_mark_faculty_password_reset"
      : "admin_mark_staff_password_reset";
    const { error: rErr } = await actorSupabase(context).rpc(
      rpcName, { _profile_id: data.profile_id }
    );
    if (rErr) {
      throw new Error(`تم تحديث كلمة المرور لكن تعذّر ضبط must_change_password — ${rErr.message}`);
    }

    await logAudit({
      actor_user_id: context.userId,
      action_type: repairedAuth ? "auth_user_repaired" : "password_reset",
      entity_id: authUserId,
      notes: repairedAuth
        ? `إصلاح حساب Auth وإعادة تعيين كلمة المرور لـ ${identifier} (${email})`
        : relinked
          ? `إعادة ربط ملف ${data.kind} وإعادة تعيين كلمة المرور لـ ${identifier}`
          : `إعادة تعيين كلمة المرور لـ ${identifier}`,
      new_values: repairedAuth || relinked
        ? { kind: data.kind, profile_id: data.profile_id, email, relinked, repaired_auth: repairedAuth }
        : undefined,
    });

    return { ok: true, password };
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
    await assertAnyRole(
      context.userId,
      ACCOUNT_PROVISION_ROLES[data.kind],
      "ليس لديك صلاحية تغيير حالة الحساب",
    );

    const table =
      data.kind === "student" ? "student_profiles"
      : data.kind === "faculty" ? "faculty_profiles"
      : "staff_profiles";

    const { data: profile } = await supabaseAdmin
      .from(table).select("*").eq("id", data.profile_id).maybeSingle();
    if (!profile) throw new Error("الحساب غير موجود");
    const targetUserId = (profile as any).user_id as string | null;

    // Protect last admin / system_admin
    if (!data.active && targetUserId) {
      const { data: roleRows } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", targetUserId)
        .in("role", ["admin", "system_admin"]);
      const roles = (roleRows ?? []).map((r: any) => r.role as string);
      if (roles.includes("admin")) {
        const { count } = await supabaseAdmin
          .from("user_roles")
          .select("id", { count: "exact", head: true })
          .eq("role", "admin");
        if ((count ?? 0) <= 1) {
          throw new Error("لا يمكن تعطيل آخر حساب مدير في النظام");
        }
      }
      if (roles.includes("system_admin")) {
        const { count } = await supabaseAdmin
          .from("user_roles")
          .select("id", { count: "exact", head: true })
          .eq("role", "system_admin");
        if ((count ?? 0) <= 1) {
          throw new Error("لا يمكن تعطيل آخر system_admin في النظام");
        }
      }
    }

    // Update auth.users first (ban/unban) — works on auth schema, unaffected by trigger
    if (targetUserId) {
      const { error: banErr } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
        ban_duration: data.active ? "none" : "876000h", // ~100 years
      } as any);
      if (banErr) throw new Error(`تعذّر تحديث حالة الحساب — ${banErr.message}`);
    }

    // Then update profile status via SECURITY DEFINER RPC to bypass
    // protect_*_sensitive_fields (service_role has no auth.uid()).
    const rpcName =
      data.kind === "student" ? "admin_set_student_status"
      : data.kind === "faculty" ? "admin_set_faculty_status"
      : "admin_set_staff_status";
    const { error: sErr } = await (context.supabase as any).rpc(
      rpcName, { _profile_id: data.profile_id, _active: data.active }
    );
    if (sErr) {
      // Roll back the auth ban so state stays consistent
      if (targetUserId) {
        await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
          ban_duration: data.active ? "876000h" : "none",
        } as any);
      }
      throw new Error(`تعذّر تحديث حالة الملف — ${sErr.message}`);
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
    if (data.role === "system_admin") {
      const { count } = await supabaseAdmin
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("role", "system_admin");
      if ((count ?? 0) <= 1) throw new Error("لا يمكن إزالة آخر system_admin في النظام");
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

    await syncCatalogRoleAssignment(newUserId, data.role, context.userId);

    await logAudit({
      actor_user_id: context.userId,
      action_type: "admin_account_created",
      entity_id: newUserId,
      notes: `إنشاء حساب ${data.role} للبريد ${data.email}`,
      new_values: { email: data.email, role: data.role },
    });

    return { user_id: newUserId, email: data.email };
  });
