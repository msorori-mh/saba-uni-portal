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
import {
  facultyTemporaryPassword,
  isValidUniversityLoginEmail,
  normalizeUniversityLoginEmail,
  validateStudentUniversityEmailInput,
} from "@/lib/university-email-auth";
import { staffFunctionalRoleToAppRole } from "@/lib/staff-functional-roles";

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

/** @deprecated Legacy synthetic email — do not use for new logins. */
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

async function fetchAuthEmailsByUserIds(userIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!userIds.length) return map;
  const wanted = new Set(userIds);
  for (let page = 1; page <= 20; page++) {
    const { data } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    const list = data?.users ?? [];
    for (const u of list) {
      if (wanted.has(u.id) && u.email) map.set(u.id, normalizeUniversityLoginEmail(u.email));
    }
    if (map.size >= wanted.size || list.length < 200) break;
  }
  return map;
}

async function resolveProfileLoginEmail(
  kind: AccountKind,
  profile: Record<string, unknown>,
): Promise<string> {
  if (kind === "student") {
    const email = String(profile.email ?? "").trim();
    if (!email || !isValidUniversityLoginEmail(email)) {
      throw new Error("الإيميل الجامعي غير مسجل في ملف الطالب — يرجى تحديث البيانات أولاً");
    }
    return normalizeUniversityLoginEmail(email);
  }

  if (kind === "faculty") {
    const facultyId = profile.faculty_id as string | undefined;
    if (!facultyId) throw new Error("ملف عضو هيئة التدريس غير مكتمل");
    const { data: fac } = await supabaseAdmin
      .from("faculty")
      .select("email")
      .eq("id", facultyId)
      .maybeSingle();
    const email = String(fac?.email ?? "").trim();
    if (!email || !isValidUniversityLoginEmail(email)) {
      throw new Error("الإيميل الجامعي غير مسجل في ملف عضو هيئة التدريس — يرجى تحديث البيانات أولاً");
    }
    return normalizeUniversityLoginEmail(email);
  }

  const userId = profile.user_id as string | null | undefined;
  if (userId) {
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
    const email = authUser?.user?.email?.trim();
    if (email && isValidUniversityLoginEmail(email)) {
      return normalizeUniversityLoginEmail(email);
    }
  }
  const profileEmail = String(profile.email ?? "").trim();
  if (profileEmail && isValidUniversityLoginEmail(profileEmail)) {
    return normalizeUniversityLoginEmail(profileEmail);
  }
  throw new Error(
    "الإيميل الجامعي غير متوفر في ملف الموظف — يرجى إنشاء الحساب من صفحة الموظفين مع إدخال البريد الجامعي",
  );
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

/** Server-safe staff link (service_role RPC — bypasses sensitive-field trigger). */
async function linkStaffProfileToAuth(profileId: string, userId: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc("link_staff_profile_account", {
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
  await linkStaffProfileToAuth(profileId, userId);
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
  if (!roleType) return "registrar";
  return staffFunctionalRoleToAppRole(roleType) ?? "registrar";
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
    case "registrar_general":
    case "registrar":
      return "registrar_officer";
    case "student_affairs_manager":
    case "student_affairs_specialist":
    case "graduate_affairs_manager":
    case "graduate_affairs_specialist":
    case "archive_officer":
    case "library_officer":
    case "labs_manager":
    case "lab_custodian":
    case "student_affairs":
    case "lab_manager":
    case "lab_keeper":
      return "student_affairs_officer";
    case "revenue_finance_officer":
    case "finance":
    case "finance_officer":
      return "finance_officer";
    case "hr_officer":
      return "hr_officer";
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

    // Sanitize free-text search to keep PostgREST `.or(...)` well-formed.
    const searchRaw = (data.search ?? "").replace(/[,()"']/g, "").trim();
    const hasSearch = searchRaw.length > 0;

    // For faculty search, email lives in the joined `faculty` table, not in faculty_profiles.
    // Pre-fetch matching faculty_ids so we can include them in the or-filter.
    let facultyIdsMatchingEmail: string[] = [];
    if (data.kind === "faculty" && hasSearch) {
      const { data: facMatches } = await supabaseAdmin
        .from("faculty")
        .select("id")
        .ilike("email", `%${searchRaw}%`)
        .limit(500);
      facultyIdsMatchingEmail = (facMatches ?? []).map((f: any) => f.id).filter(Boolean);
    }

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
      if (hasSearch) {
        const parts = [
          `${identCol}.ilike.%${searchRaw}%`,
          `full_name_ar.ilike.%${searchRaw}%`,
        ];
        if (table === "student_profiles" || table === "staff_profiles") {
          parts.push(`email.ilike.%${searchRaw}%`);
        }
        if (table === "faculty_profiles" && facultyIdsMatchingEmail.length > 0) {
          parts.push(`faculty_id.in.(${facultyIdsMatchingEmail.join(",")})`);
        }
        q = q.or(parts.join(","));
      }
      if (data.status && data.status !== "all") q = q.eq("status", data.status);
      return q.range(from, to);
    };

    if (data.kind === "student") {
      const { data: rows, count, error } = await buildSelect(
        "student_profiles",
        "id, user_id, academic_number, full_name_ar, status, must_change_password, department_id, email",
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
        email: r.email ? normalizeUniversityLoginEmail(r.email) : null,
        roles: (roles ?? []).filter((x: any) => x.user_id === r.user_id).map((x: any) => x.role),
      }));
      return Object.assign(mapped, { __total: count ?? mapped.length, __page: page, __pageSize: pageSize });
    }

    if (data.kind === "faculty") {
      const { data: rows, count, error } = await buildSelect(
        "faculty_profiles",
        "id, user_id, employee_number, full_name_ar, status, must_change_password, department_id, academic_rank, faculty_id",
        "employee_number",
      );
      if (error) throw new Error(error.message);
      const facultyIds = Array.from(new Set((rows ?? []).map((r: any) => r.faculty_id).filter(Boolean)));
      const { data: facRows } = facultyIds.length
        ? await supabaseAdmin.from("faculty").select("id, email").in("id", facultyIds as string[])
        : { data: [] as { id: string; email: string | null }[] };
      const facultyEmailById = new Map((facRows ?? []).map((f) => [f.id, f.email]));
      const userIds = (rows ?? []).filter((r: any) => r.user_id).map((r: any) => r.user_id as string);
      const { data: roles } = userIds.length
        ? await supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", userIds)
        : { data: [] as any[] };
      const mapped = (rows ?? []).map((r: any) => ({
        ...r,
        identifier: r.employee_number ?? "",
        email: (() => {
          const raw = facultyEmailById.get(r.faculty_id);
          return raw && isValidUniversityLoginEmail(raw) ? normalizeUniversityLoginEmail(raw) : null;
        })(),
        roles: (roles ?? []).filter((x: any) => x.user_id === r.user_id).map((x: any) => x.role),
      }));
      return Object.assign(mapped, { __total: count ?? mapped.length, __page: page, __pageSize: pageSize });
    }

    // staff
    const { data: rows, count, error } = await buildSelect(
      "staff_profiles",
      "id, user_id, employee_number, full_name_ar, status, must_change_password, department_id, department_scope, role_type, job_title, email",
      "employee_number",
    );
    if (error) throw new Error(error.message);
    const profileIds = (rows ?? []).map((r: any) => r.id as string);
    const [{ data: deptLinks }, { data: deptRows }] = await Promise.all([
      profileIds.length
        ? supabaseAdmin.from("staff_profile_departments").select("staff_profile_id, department_id").in("staff_profile_id", profileIds)
        : Promise.resolve({ data: [] as any[] }),
      supabaseAdmin.from("departments").select("id, name_ar"),
    ]);
    const deptNameById = new Map((deptRows ?? []).map((d: any) => [d.id, d.name_ar]));
    const linksByProfile = new Map<string, string[]>();
    for (const link of deptLinks ?? []) {
      const arr = linksByProfile.get(link.staff_profile_id) ?? [];
      arr.push(link.department_id);
      linksByProfile.set(link.staff_profile_id, arr);
    }
    const userIds = (rows ?? []).filter((r: any) => r.user_id).map((r: any) => r.user_id as string);
    const authEmailByUserId = await fetchAuthEmailsByUserIds(userIds);
    const { data: roles } = userIds.length
      ? await supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", userIds)
      : { data: [] as any[] };
    const mapped = (rows ?? []).map((r: any) => {
      const department_ids = linksByProfile.get(r.id)
        ?? (r.department_id ? [r.department_id] : []);
      const department_names = department_ids
        .map((id: string) => deptNameById.get(id))
        .filter(Boolean) as string[];
      const department_label = r.department_scope === "all"
        ? "كل أقسام الكلية"
        : department_names.length === 0
          ? "—"
          : department_names.length === 1
            ? department_names[0]
            : `${department_names.length} أقسام`;
      return {
        ...r,
        department_ids,
        department_names,
        department_label,
        department_names_title: department_names.length > 1 ? department_names.join("، ") : undefined,
        identifier: r.employee_number ?? "",
        email: r.user_id
          ? (authEmailByUserId.get(r.user_id) ?? r.email ?? null)
          : (r.email ?? null),
        roles: (roles ?? []).filter((x: any) => x.user_id === r.user_id).map((x: any) => x.role),
      };
    });
    return Object.assign(mapped, { __total: count ?? mapped.length, __page: page, __pageSize: pageSize });
  });

// ------------ Create Account ------------

export const createAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { kind: AccountKind; profile_id: string; university_email?: string }) =>
    z.object({
      kind: z.enum(["student", "faculty", "staff"]),
      profile_id: z.string().uuid(),
      // STUDENT-PROVISIONING-EMAIL-02T: explicit, admin-confirmed student email.
      // Required for kind="student" (validated in the handler); ignored otherwise.
      university_email: z.string().trim().max(160).optional(),
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

    // STUDENT-PROVISIONING-EMAIL-02T: student logins are NEVER derived silently
    // from the profile record (a stale/placeholder profile email like a@b.comt
    // must not flow into Auth). The admin must type an explicit, valid
    // @students.usr.edu.ye address in the confirmation dialog.
    let email: string;
    if (data.kind === "student") {
      const invalidEmail = validateStudentUniversityEmailInput(data.university_email ?? "");
      if (invalidEmail) throw new Error(invalidEmail);
      email = normalizeUniversityLoginEmail(data.university_email!);
    } else {
      email = await resolveProfileLoginEmail(data.kind, profile as Record<string, unknown>);
    }

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
      try {
        await linkStaffProfileToAuth(data.profile_id, newUserId!);
      } catch (e) {
        uErr = { message: e instanceof Error ? e.message : String(e) };
      }
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

    const profileUserId = ((profile as any).user_id as string | null) ?? null;
    let email: string;
    if (profileUserId) {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(profileUserId);
      const authEmail = authUser?.user?.email?.trim();
      if (authEmail && isValidUniversityLoginEmail(authEmail)) {
        email = normalizeUniversityLoginEmail(authEmail);
      } else {
        email = await resolveProfileLoginEmail(data.kind, profile as Record<string, unknown>);
      }
    } else {
      email = await resolveProfileLoginEmail(data.kind, profile as Record<string, unknown>);
    }

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

    const identifier =
      data.kind === "student"
        ? ((profile as any).academic_number ?? "")
        : ((profile as any).employee_number ?? "");
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

// ------------ Unlink portal login (Phase 1: no profile delete, no Auth delete) ------------

const PRIVILEGED_ROLES_NEVER_STRIPPED = new Set(["admin", "system_admin"]);

async function assertNotLastPrivilegedAdmin(targetUserId: string): Promise<void> {
  const { data: roleRows } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", targetUserId)
    .in("role", ["admin", "system_admin"]);
  const roles = (roleRows ?? []).map((r) => r.role as string);
  if (roles.includes("admin")) {
    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) <= 1) throw new Error("لا يمكن فك ربط أو حذف آخر حساب مدير في النظام");
  }
  if (roles.includes("system_admin")) {
    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "system_admin");
    if ((count ?? 0) <= 1) throw new Error("لا يمكن فك ربط أو حذف آخر system_admin في النظام");
  }
}

async function isAuthUserLinkedToAnyProfile(userId: string): Promise<boolean> {
  const [{ data: s }, { data: f }, { data: st }] = await Promise.all([
    supabaseAdmin.from("student_profiles").select("id").eq("user_id", userId).limit(1).maybeSingle(),
    supabaseAdmin.from("faculty_profiles").select("id").eq("user_id", userId).limit(1).maybeSingle(),
    supabaseAdmin.from("staff_profiles").select("id").eq("user_id", userId).limit(1).maybeSingle(),
  ]);
  return !!(s || f || st);
}

function portalRolesForKind(kind: AccountKind, profile: Record<string, unknown>): string[] {
  const roles =
    kind === "student"
      ? ["student"]
      : kind === "faculty"
        ? ["faculty_member"]
        : [staffRoleFor(profile.role_type as string | null | undefined)];
  return roles.filter((r) => !PRIVILEGED_ROLES_NEVER_STRIPPED.has(r));
}

async function removePortalRolesOnly(
  kind: AccountKind,
  userId: string,
  profile: Record<string, unknown>,
): Promise<string[]> {
  const roles = portalRolesForKind(kind, profile);
  for (const role of roles) {
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId).eq("role", role as any);
  }
  return roles;
}

const UNLINK_LOGIN_CONFIRM_HINT =
  "سيتم فك ربط حساب الدخول فقط. لن يُحذف الملف الأكاديمي أو المالي أو الإداري. يمكن إنشاء حساب دخول جديد لاحقاً.";

/** Unlink portal login from profile; Phase 1 does not delete auth.users rows. */
export const removeLoginAccount = createServerFn({ method: "POST" })
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
      "ليس لديك صلاحية فك ربط حسابات الدخول",
    );

    const table =
      data.kind === "student" ? "student_profiles"
      : data.kind === "faculty" ? "faculty_profiles"
      : "staff_profiles";

    const { data: profile } = await supabaseAdmin
      .from(table).select("*").eq("id", data.profile_id).maybeSingle();
    if (!profile) throw new Error("الحساب غير موجود");

    const targetUserId = (profile as any).user_id as string | null;
    if (!targetUserId) throw new Error("لا يوجد حساب دخول مرتبط بهذا الملف");

    const identifier =
      data.kind === "student"
        ? (profile as any).academic_number
        : (profile as any).employee_number;

    if (context.userId === targetUserId) {
      await logAudit({
        actor_user_id: context.userId,
        action_type: "portal_login_unlink_blocked",
        entity_id: targetUserId,
        notes: `محاولة فك ربط الحساب الحالي: ${identifier}`,
        new_values: { reason: "self_target", kind: data.kind, profile_id: data.profile_id },
      });
      throw new Error("لا يمكن حذف أو فك ربط حساب الدخول الخاص بك.");
    }

    try {
      await assertNotLastPrivilegedAdmin(targetUserId);
    } catch (e) {
      await logAudit({
        actor_user_id: context.userId,
        action_type: "portal_login_unlink_blocked",
        entity_id: targetUserId,
        notes: `رفض فك ربط ${identifier}`,
        new_values: {
          reason: "last_privileged_admin",
          message: e instanceof Error ? e.message : String(e),
        },
      });
      throw e;
    }

    const { data: unlinkedId, error: uErr } = await actorSupabase(context).rpc(
      "admin_unlink_portal_login",
      { p_kind: data.kind, p_profile_id: data.profile_id },
    );
    if (uErr) throw new Error(uErr.message);
    if (!unlinkedId) throw new Error("لا يوجد حساب دخول لإزالته");

    const removedRoles = await removePortalRolesOnly(
      data.kind,
      targetUserId,
      profile as Record<string, unknown>,
    );

    const stillLinked = await isAuthUserLinkedToAnyProfile(targetUserId);
    const { data: remainingRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", targetUserId);
    const roleNames = (remainingRoles ?? []).map((r) => r.role as string);

    if (!stillLinked) {
      await logAudit({
        actor_user_id: context.userId,
        action_type: "auth_user_delete_skipped",
        entity_id: targetUserId,
        notes: `Phase 1: Auth user retained after unlink for ${identifier}`,
        new_values: {
          remaining_roles: roleNames,
          removed_portal_roles: removedRoles,
          reason: "phase_1_unlink_only",
        },
      });
    }

    await logAudit({
      actor_user_id: context.userId,
      action_type: "portal_login_unlinked",
      entity_id: targetUserId,
      notes: `فك ربط حساب الدخول لـ ${identifier}`,
      old_values: { kind: data.kind, profile_id: data.profile_id, user_id: targetUserId },
      new_values: { removed_portal_roles: removedRoles, hint: UNLINK_LOGIN_CONFIRM_HINT },
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
