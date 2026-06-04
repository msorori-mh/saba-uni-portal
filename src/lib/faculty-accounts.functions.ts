// FACULTY-ACCOUNT-MANAGEMENT-01
// Manual-email faculty account management — no auto-generated emails.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId)
    .in("role", ["admin", "system_admin"]);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("ليس لديك صلاحية");
}

async function logAudit(actor: string, action: string, entity_id: string | null, notes: string, payload?: any) {
  await supabaseAdmin.from("audit_logs").insert({
    actor_user_id: actor,
    actor_role: "admin",
    entity_type: "faculty_account",
    entity_id,
    action_type: action,
    notes,
    new_values: payload ?? null,
  } as any);
}

async function findAuthByEmail(email: string) {
  // paginate auth.users
  for (let page = 1; page <= 20; page++) {
    const { data } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    const list = data?.users ?? [];
    const hit = list.find((u: any) => (u.email ?? "").toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (list.length < 200) break;
  }
  return null;
}

async function linkProfileToAuth(profile_id: string, user_id: string, forceChange: boolean) {
  // Bypass faculty lock trigger via existing security-definer RPC
  const { error } = await supabaseAdmin.rpc("link_faculty_profile_account" as any, {
    p_profile_id: profile_id,
    p_auth_user_id: user_id,
  });
  if (error) throw new Error(error.message);
  if (forceChange) {
    try { await (supabaseAdmin.rpc as any)("set_config", { setting_name: "app.bypass_faculty_lock", new_value: "1", is_local: true }); } catch {/* ignore */}
    await supabaseAdmin.from("faculty_profiles").update({ must_change_password: true } as any).eq("id", profile_id);
  }
  // ensure faculty_member role
  const { data: existing } = await supabaseAdmin
    .from("user_roles").select("id").eq("user_id", user_id).eq("role", "faculty_member" as any).maybeSingle();
  if (!existing) {
    await supabaseAdmin.from("user_roles").insert({ user_id, role: "faculty_member" as any });
  }
}

// ---------- List with auth metadata (last_sign_in) ----------
export const listFacultyAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { search?: string; status?: string; hasAccount?: "all" | "yes" | "no"; departmentId?: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    let q = supabaseAdmin
      .from("faculty_profiles")
      .select("id, user_id, employee_number, full_name_ar, status, must_change_password, department_id, academic_rank")
      .order("employee_number");
    if (data.search) {
      q = q.or(`employee_number.ilike.%${data.search}%,full_name_ar.ilike.%${data.search}%`);
    }
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.departmentId && data.departmentId !== "all") q = q.eq("department_id", data.departmentId);

    const { data: rows, error } = await q.limit(1000);
    if (error) throw new Error(error.message);

    // departments
    const deptIds = Array.from(new Set((rows ?? []).map((r: any) => r.department_id).filter(Boolean)));
    const { data: depts } = deptIds.length
      ? await supabaseAdmin.from("departments").select("id, name_ar").in("id", deptIds as any)
      : { data: [] as any[] };
    const deptMap = new Map((depts ?? []).map((d: any) => [d.id, d.name_ar]));

    // fetch auth users in pages, build a map by id
    const userIds = new Set((rows ?? []).filter((r: any) => r.user_id).map((r: any) => r.user_id as string));
    const authMap = new Map<string, { email: string | null; last_sign_in_at: string | null; banned: boolean }>();
    if (userIds.size > 0) {
      for (let page = 1; page <= 20; page++) {
        const { data: au } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
        const list = au?.users ?? [];
        for (const u of list) {
          if (userIds.has(u.id)) {
            authMap.set(u.id, {
              email: u.email ?? null,
              last_sign_in_at: (u as any).last_sign_in_at ?? null,
              banned: Boolean((u as any).banned_until && new Date((u as any).banned_until) > new Date()),
            });
          }
        }
        if (list.length < 200) break;
      }
    }

    let result = (rows ?? []).map((r: any) => {
      const auth = r.user_id ? authMap.get(r.user_id) : undefined;
      let accountState: "none" | "linked" | "disabled" | "review" = "none";
      if (!r.user_id) accountState = "none";
      else if (auth?.banned || r.status === "inactive") accountState = "disabled";
      else if (!auth) accountState = "review";
      else accountState = "linked";
      return {
        id: r.id,
        user_id: r.user_id,
        employee_number: r.employee_number,
        full_name_ar: r.full_name_ar,
        department_id: r.department_id,
        department_name: deptMap.get(r.department_id) ?? null,
        academic_rank: r.academic_rank,
        status: r.status,
        must_change_password: r.must_change_password,
        email: auth?.email ?? null,
        last_sign_in_at: auth?.last_sign_in_at ?? null,
        account_state: accountState,
      };
    });

    if (data.hasAccount === "yes") result = result.filter((r) => !!r.user_id);
    if (data.hasAccount === "no") result = result.filter((r) => !r.user_id);
    return result;
  });

// ---------- KPI stats ----------
export const facultyAccountStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data: rows } = await supabaseAdmin
      .from("faculty_profiles")
      .select("id, user_id, status")
      .eq("status", "active");
    const list = rows ?? [];
    const total = list.length;
    const withAccount = list.filter((r: any) => r.user_id).length;
    const withoutAccount = total - withAccount;

    // pull auth last_sign_in_at
    const userIds = new Set(list.filter((r: any) => r.user_id).map((r: any) => r.user_id));
    let active30 = 0;
    let neverSignedIn = 0;
    const thirty = Date.now() - 30 * 24 * 3600 * 1000;
    if (userIds.size > 0) {
      for (let page = 1; page <= 20; page++) {
        const { data: au } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
        const ulist = au?.users ?? [];
        for (const u of ulist) {
          if (!userIds.has(u.id)) continue;
          const last = (u as any).last_sign_in_at;
          if (!last) neverSignedIn++;
          else if (new Date(last).getTime() >= thirty) active30++;
        }
        if (ulist.length < 200) break;
      }
    }
    return { total, withAccount, withoutAccount, active30, neverSignedIn };
  });

// ---------- Create account with admin-supplied email ----------
export const createFacultyAccountManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { profile_id: string; email: string; password: string; force_password_change?: boolean }) =>
    z.object({
      profile_id: z.string().uuid(),
      email: z.string().trim().email().max(160),
      password: z.string().min(8).max(72),
      force_password_change: z.boolean().optional(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const email = data.email.toLowerCase().trim();

    const { data: profile } = await supabaseAdmin
      .from("faculty_profiles").select("id, user_id, full_name_ar, employee_number").eq("id", data.profile_id).maybeSingle();
    if (!profile) throw new Error("الملف غير موجود");
    if ((profile as any).user_id) throw new Error("هذا الملف لديه حساب مرتبط مسبقاً");

    const existing = await findAuthByEmail(email);
    if (existing) {
      // suggest linking
      const { data: linkedTo } = await supabaseAdmin
        .from("faculty_profiles").select("id, employee_number").eq("user_id", existing.id).maybeSingle();
      if (linkedTo) {
        throw new Error(`البريد ${email} مرتبط بعضو آخر (${(linkedTo as any).employee_number}) — لا يمكن استخدامه`);
      }
      // existing unlinked → link it
      await linkProfileToAuth(data.profile_id, existing.id, data.force_password_change ?? true);
      await logAudit(context.userId, "faculty_account_linked_existing", existing.id,
        `ربط ملف ${(profile as any).employee_number} بحساب Auth موجود ${email}`,
        { email, profile_id: data.profile_id });
      return { ok: true, linked_existing: true, user_id: existing.id, email };
    }

    // create new
    const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name_ar: (profile as any).full_name_ar, kind: "faculty" },
    });
    if (cErr || !created.user) throw new Error(cErr?.message ?? "تعذّر إنشاء الحساب");

    try {
      await linkProfileToAuth(data.profile_id, created.user.id, data.force_password_change ?? true);
    } catch (err) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      throw err;
    }
    await logAudit(context.userId, "faculty_account_created", created.user.id,
      `إنشاء حساب لـ ${(profile as any).employee_number} ببريد ${email}`,
      { email, profile_id: data.profile_id });
    return { ok: true, linked_existing: false, user_id: created.user.id, email };
  });

// ---------- Link existing auth by email ----------
export const linkFacultyAccountByEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { profile_id: string; email: string }) =>
    z.object({
      profile_id: z.string().uuid(),
      email: z.string().trim().email().max(160),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const email = data.email.toLowerCase().trim();

    const { data: profile } = await supabaseAdmin
      .from("faculty_profiles").select("id, user_id, employee_number").eq("id", data.profile_id).maybeSingle();
    if (!profile) throw new Error("الملف غير موجود");
    if ((profile as any).user_id) throw new Error("هذا الملف لديه حساب مرتبط مسبقاً");

    const existing = await findAuthByEmail(email);
    if (!existing) throw new Error(`لا يوجد حساب Auth بالبريد ${email}`);

    const { data: linkedTo } = await supabaseAdmin
      .from("faculty_profiles").select("id, employee_number").eq("user_id", existing.id).maybeSingle();
    if (linkedTo) throw new Error(`البريد مرتبط بعضو آخر (${(linkedTo as any).employee_number})`);

    await linkProfileToAuth(data.profile_id, existing.id, true);
    await logAudit(context.userId, "faculty_account_linked", existing.id,
      `ربط ملف ${(profile as any).employee_number} بـ ${email}`, { email });
    return { ok: true, user_id: existing.id, email };
  });

// ---------- Reset password (manual or random) ----------
function genPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let p = "";
  for (let i = 0; i < 12; i++) p += chars[Math.floor(Math.random() * chars.length)];
  return p;
}

export const resetFacultyPasswordManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { profile_id: string; password?: string }) =>
    z.object({
      profile_id: z.string().uuid(),
      password: z.string().min(8).max(72).optional(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: profile } = await supabaseAdmin
      .from("faculty_profiles").select("id, user_id, employee_number").eq("id", data.profile_id).maybeSingle();
    if (!profile || !(profile as any).user_id) throw new Error("الحساب غير موجود");

    const password = data.password ?? genPassword();
    const { error } = await supabaseAdmin.auth.admin.updateUserById((profile as any).user_id, { password });
    if (error) throw new Error(error.message);

    // set must_change_password via RPC (bypasses lock)
    try {
      await supabaseAdmin.rpc("link_faculty_profile_account" as any, {
        p_profile_id: data.profile_id,
        p_auth_user_id: (profile as any).user_id,
      });
    } catch {/* already linked is fine */}

    await logAudit(context.userId, "faculty_password_reset", (profile as any).user_id,
      `إعادة تعيين كلمة المرور لـ ${(profile as any).employee_number}`);
    return { ok: true, password };
  });
