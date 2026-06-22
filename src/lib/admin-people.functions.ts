import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertAnyRole, primaryActorRole } from "@/lib/authz.server";
import { generateTemporaryPassword } from "@/lib/password.server";

// ---------- Authorization ----------

async function logAudit(input: {
  actor_user_id: string;
  entity_type: "faculty" | "staff" | "student" | "user";
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
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    action_type: input.action_type,
    notes: input.notes ?? null,
    old_values: input.old_values ?? null,
    new_values: input.new_values ?? null,
  } as any);
}

// ---------- Shared lookups ----------

export const getPeopleLookups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAnyRole(context.userId, [
      "admin", "system_admin", "dean", "registrar", "student_affairs", "hr_officer",
    ]);
    const [deps, progs] = await Promise.all([
      supabaseAdmin.from("departments").select("id, name_ar").eq("is_active", true).order("sort_order"),
      supabaseAdmin.from("programs").select("id, name_ar, department_id").eq("is_active", true).order("sort_order"),
    ]);
    if (deps.error) throw new Error(deps.error.message);
    return {
      departments: deps.data ?? [],
      programs: progs.data ?? [],
    };
  });

// =====================================================
// FACULTY MANAGEMENT
// =====================================================

const FACULTY_ROLES = ["admin", "system_admin", "dean", "registrar", "hr_officer"];

const createFacultySchema = z.object({
  employee_number: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/),
  full_name_ar: z.string().trim().min(2).max(160),
  full_name_en: z.string().trim().max(160).optional().nullable(),
  department_id: z.string().uuid(),
  program_id: z.string().uuid().optional().nullable(),
  academic_rank: z.string().trim().min(1).max(80),
  position_title: z.string().trim().max(120).optional().nullable(),
  email: z.string().trim().email().max(160).optional().or(z.literal("")).nullable(),
  phone: z.string().trim().max(32).optional().nullable(),
  status: z.enum(["active", "inactive"]).default("active"),
  create_login: z.boolean().default(false),
});

export const createFacultyMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createFacultySchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.userId, FACULTY_ROLES);

    // Check duplicate
    const { data: existing } = await supabaseAdmin
      .from("faculty_profiles")
      .select("id")
      .eq("employee_number", data.employee_number)
      .maybeSingle();
    if (existing) throw new Error("الرقم الوظيفي مستخدم مسبقاً");

    // Insert into `faculty` (public site faculty entry) first — required FK
    const { data: facRow, error: fErr } = await supabaseAdmin
      .from("faculty")
      .insert({
        employee_id: data.employee_number,
        full_name_ar: data.full_name_ar,
        full_name_en: data.full_name_en || null,
        rank: data.academic_rank,
        program_id: data.program_id || null,
        email: data.email || null,
        phone: data.phone || null,
        is_active: data.status === "active",
        category: "faculty",
      } as any)
      .select("id")
      .single();
    if (fErr || !facRow) throw new Error(`تعذّر إنشاء سجل العضو: ${fErr?.message ?? ""}`);

    const { data: profile, error: pErr } = await supabaseAdmin
      .from("faculty_profiles")
      .insert({
        faculty_id: facRow.id,
        employee_number: data.employee_number,
        full_name_ar: data.full_name_ar,
        full_name_en: data.full_name_en || null,
        department_id: data.department_id,
        program_id: data.program_id || null,
        academic_rank: data.academic_rank,
        position_title: data.position_title || null,
        status: data.status,
        must_change_password: true,
      } as any)
      .select("id")
      .single();
    if (pErr || !profile) {
      await supabaseAdmin.from("faculty").delete().eq("id", facRow.id);
      throw new Error(`تعذّر إنشاء الملف: ${pErr?.message ?? ""}`);
    }

    let credentials: { email: string; password: string } | null = null;

    if (data.create_login) {
      const loginEmail = `${data.employee_number.toLowerCase()}@faculty.usr.edu.ye`;
      const password = generateTemporaryPassword();
      const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
        email: loginEmail,
        password,
        email_confirm: true,
        user_metadata: { full_name_ar: data.full_name_ar, kind: "faculty" },
      });
      if (cErr || !created.user) {
        throw new Error(`تم إنشاء الملف لكن تعذّر إنشاء حساب الدخول: ${cErr?.message ?? ""}`);
      }
      const newUserId = created.user.id;
      const { error: linkErr } = await supabaseAdmin.rpc("link_faculty_profile_account", {
        p_profile_id: profile.id,
        p_auth_user_id: newUserId,
      });
      if (linkErr) {
        throw new Error(`تم إنشاء الملف لكن تعذّر ربط حساب الدخول: ${linkErr.message}`);
      }
      credentials = { email: loginEmail, password };
    }

    await logAudit({
      actor_user_id: context.userId,
      entity_type: "faculty",
      entity_id: profile.id,
      action_type: "faculty_created",
      notes: `إضافة عضو هيئة تدريس: ${data.full_name_ar} (${data.employee_number})`,
      new_values: { employee_number: data.employee_number, full_name_ar: data.full_name_ar, with_login: data.create_login },
    });

    return {
      id: profile.id,
      employee_number: data.employee_number,
      full_name_ar: data.full_name_ar,
      credentials,
    };
  });

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const updateFacultySchema = z.object({
  id: z.string().uuid(),
  full_name_ar: z.string().trim().min(2).max(160),
  full_name_en: z.preprocess(emptyToNull, z.string().trim().max(160).nullable().optional()),
  department_id: z.string().uuid(),
  program_id: z.preprocess(emptyToNull, z.string().uuid().nullable().optional()),
  academic_rank: z.string().trim().min(1).max(80),
  position_title: z.preprocess(emptyToNull, z.string().trim().max(120).nullable().optional()),
  email: z.preprocess(emptyToNull, z.string().trim().email().max(160).nullable().optional()),
  phone: z.preprocess(emptyToNull, z.string().trim().max(32).nullable().optional()),
  status: z.enum(["active", "inactive"]),
  photo: z.preprocess(emptyToNull, z.string().trim().url().max(1024).nullable().optional()),
  bio_ar: z.preprocess(emptyToNull, z.string().trim().max(4000).nullable().optional()),
});

export const updateFacultyMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateFacultySchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.userId, FACULTY_ROLES);
    const { data: old } = await supabaseAdmin
      .from("faculty_profiles").select("*").eq("id", data.id).maybeSingle();
    if (!old) throw new Error("العضو غير موجود");

    const { error } = await supabaseAdmin
      .from("faculty_profiles")
      .update({
        full_name_ar: data.full_name_ar,
        full_name_en: data.full_name_en || null,
        department_id: data.department_id,
        program_id: data.program_id || null,
        academic_rank: data.academic_rank,
        position_title: data.position_title || null,
        status: data.status,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    // Mirror to public faculty row
    if ((old as any).faculty_id) {
      await supabaseAdmin
        .from("faculty")
        .update({
          full_name_ar: data.full_name_ar,
          full_name_en: data.full_name_en || null,
          rank: data.academic_rank,
          program_id: data.program_id || null,
          email: data.email || null,
          phone: data.phone || null,
          is_active: data.status === "active",
          ...(data.photo !== undefined ? { photo: data.photo } : {}),
          ...(data.bio_ar !== undefined ? { bio_ar: data.bio_ar } : {}),
        } as any)
        .eq("id", (old as any).faculty_id);
    }

    await logAudit({
      actor_user_id: context.userId,
      entity_type: "faculty",
      entity_id: data.id,
      action_type: "faculty_updated",
      notes: `تعديل بيانات العضو ${(old as any).employee_number}`,
      old_values: old,
      new_values: data,
    });

    return { ok: true };
  });

export const getFacultyMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.userId, [...FACULTY_ROLES, "student_affairs"]);
    const { data: row, error } = await supabaseAdmin
      .from("faculty_profiles").select("*, faculty:faculty_id(email, phone, photo, bio_ar)")
      .eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("العضو غير موجود");
    return row;
  });

// =====================================================
// STAFF MANAGEMENT
// =====================================================

const STAFF_ROLES = ["admin", "system_admin", "dean", "hr_officer"];
const ALLOWED_STAFF_ROLE_TYPES = ["registrar", "student_affairs", "finance_officer", "hr_officer"] as const;

const createStaffSchema = z.object({
  employee_number: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/),
  full_name_ar: z.string().trim().min(2).max(160),
  full_name_en: z.string().trim().max(160).optional().nullable(),
  department_id: z.string().uuid().optional().nullable(),
  job_title: z.string().trim().min(1).max(120),
  role_type: z.enum(ALLOWED_STAFF_ROLE_TYPES),
  email: z.string().trim().email().max(160).optional().or(z.literal("")).nullable(),
  phone: z.string().trim().max(32).optional().nullable(),
  status: z.enum(["active", "inactive"]).default("active"),
  create_login: z.boolean().default(false),
});

export const createStaffMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createStaffSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.userId, STAFF_ROLES);

    const { data: existing } = await supabaseAdmin
      .from("staff_profiles")
      .select("id")
      .eq("employee_number", data.employee_number)
      .maybeSingle();
    if (existing) throw new Error("الرقم الوظيفي مستخدم مسبقاً");

    const { data: profile, error: pErr } = await supabaseAdmin
      .from("staff_profiles")
      .insert({
        employee_number: data.employee_number,
        full_name_ar: data.full_name_ar,
        full_name_en: data.full_name_en || null,
        department_id: data.department_id || null,
        job_title: data.job_title,
        role_type: data.role_type,
        status: data.status,
        must_change_password: true,
      } as any)
      .select("id")
      .single();
    if (pErr || !profile) throw new Error(`تعذّر إنشاء الملف: ${pErr?.message ?? ""}`);

    let credentials: { email: string; password: string } | null = null;

    if (data.create_login) {
      const loginEmail = `${data.employee_number.toLowerCase()}@staff.usr.edu.ye`;
      const password = generateTemporaryPassword();
      const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
        email: loginEmail,
        password,
        email_confirm: true,
        user_metadata: { full_name_ar: data.full_name_ar, kind: "staff" },
      });
      if (cErr || !created.user) {
        throw new Error(`تم إنشاء الملف لكن تعذّر إنشاء حساب الدخول: ${cErr?.message ?? ""}`);
      }
      const newUserId = created.user.id;
      const { error: linkErr } = await supabaseAdmin.rpc("link_staff_profile_account", {
        p_profile_id: profile.id,
        p_auth_user_id: newUserId,
      });
      if (linkErr) {
        throw new Error(`تم إنشاء الملف لكن تعذّر ربط حساب الدخول: ${linkErr.message}`);
      }
      await supabaseAdmin.from("user_roles").insert({ user_id: newUserId, role: data.role_type as any });
      credentials = { email: loginEmail, password };
    }

    await logAudit({
      actor_user_id: context.userId,
      entity_type: "staff",
      entity_id: profile.id,
      action_type: "staff_created",
      notes: `إضافة موظف: ${data.full_name_ar} (${data.employee_number})`,
      new_values: { employee_number: data.employee_number, role_type: data.role_type, with_login: data.create_login },
    });

    return {
      id: profile.id,
      employee_number: data.employee_number,
      full_name_ar: data.full_name_ar,
      credentials,
    };
  });

const updateStaffSchema = z.object({
  id: z.string().uuid(),
  full_name_ar: z.string().trim().min(2).max(160),
  full_name_en: z.string().trim().max(160).optional().nullable(),
  department_id: z.string().uuid().optional().nullable(),
  job_title: z.string().trim().min(1).max(120),
  role_type: z.enum(ALLOWED_STAFF_ROLE_TYPES),
  email: z.string().trim().email().max(160).optional().or(z.literal("")).nullable(),
  phone: z.string().trim().max(32).optional().nullable(),
  status: z.enum(["active", "inactive"]),
});

export const updateStaffMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateStaffSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.userId, STAFF_ROLES);
    const { data: old } = await supabaseAdmin
      .from("staff_profiles").select("*").eq("id", data.id).maybeSingle();
    if (!old) throw new Error("الموظف غير موجود");

    const { error } = await supabaseAdmin
      .from("staff_profiles")
      .update({
        full_name_ar: data.full_name_ar,
        full_name_en: data.full_name_en || null,
        department_id: data.department_id || null,
        job_title: data.job_title,
        role_type: data.role_type,
        status: data.status,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    // Sync role: if role_type changed and account exists, swap user_roles
    if ((old as any).role_type !== data.role_type && (old as any).user_id) {
      await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", (old as any).user_id)
        .eq("role", (old as any).role_type as any);
      await supabaseAdmin.from("user_roles").insert({
        user_id: (old as any).user_id,
        role: data.role_type as any,
      });
    }

    await logAudit({
      actor_user_id: context.userId,
      entity_type: "staff",
      entity_id: data.id,
      action_type: "staff_updated",
      notes: `تعديل بيانات الموظف ${(old as any).employee_number}`,
      old_values: old,
      new_values: data,
    });

    return { ok: true };
  });

export const getStaffMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.userId, [...STAFF_ROLES, "registrar"]);
    const { data: row, error } = await supabaseAdmin
      .from("staff_profiles").select("*")
      .eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("الموظف غير موجود");
    return row;
  });

// ---------- People stats (for dashboard cards) ----------

export const getPeopleStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAnyRole(context.userId, [
      "admin", "system_admin", "dean", "registrar", "student_affairs", "hr_officer",
    ]);
    const [stu, fac, sta, stuNoAcc, facNoAcc, staNoAcc, stuInactive, facInactive, staInactive] = await Promise.all([
      supabaseAdmin.from("student_profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("faculty_profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("staff_profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("student_profiles").select("id", { count: "exact", head: true }).is("user_id", null),
      supabaseAdmin.from("faculty_profiles").select("id", { count: "exact", head: true }).is("user_id", null),
      supabaseAdmin.from("staff_profiles").select("id", { count: "exact", head: true }).is("user_id", null),
      supabaseAdmin.from("student_profiles").select("id", { count: "exact", head: true }).eq("status", "inactive"),
      supabaseAdmin.from("faculty_profiles").select("id", { count: "exact", head: true }).eq("status", "inactive"),
      supabaseAdmin.from("staff_profiles").select("id", { count: "exact", head: true }).eq("status", "inactive"),
    ]);
    return {
      students: stu.count ?? 0,
      faculty: fac.count ?? 0,
      staff: sta.count ?? 0,
      needs_account: (stuNoAcc.count ?? 0) + (facNoAcc.count ?? 0) + (staNoAcc.count ?? 0),
      inactive: (stuInactive.count ?? 0) + (facInactive.count ?? 0) + (staInactive.count ?? 0),
    };
  });
