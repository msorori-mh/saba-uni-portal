import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertAnyRole, primaryActorRole } from "@/lib/authz.server";
import { generateTemporaryPassword } from "@/lib/password.server";
import {
  facultyTemporaryPassword,
  isValidUniversityLoginEmail,
  normalizeUniversityLoginEmail,
} from "@/lib/university-email-auth";

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
  academic_number: z.string().trim().max(32).optional().nullable(),
  email: z.string().trim().email().max(160).optional().or(z.literal("")).nullable(),
  phone: z.string().trim().max(32).optional().nullable(),
  status: z.enum(["active", "inactive"]).default("active"),
  create_login: z.boolean().default(false),
}).superRefine((data, ctx) => {
  if (data.create_login) {
    const email = String(data.email ?? "").trim();
    if (!email || !isValidUniversityLoginEmail(email)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "الإيميل الجامعي مطلوب عند إنشاء حساب الدخول",
        path: ["email"],
      });
    }
  }
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
      const loginEmail = normalizeUniversityLoginEmail(data.email!);
      const password = facultyTemporaryPassword(data.academic_number, data.employee_number);
      if (!password) {
        throw new Error("يجب توفير الرقم الأكاديمي أو الوظيفي لكلمة المرور المؤقتة");
      }
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

import {
  ALLOWED_STAFF_ROLE_TYPES_CREATE,
  ALLOWED_STAFF_ROLE_TYPES_UPDATE,
  staffFunctionalRoleToAppRole,
  staffRoleTypeSupportsLogin,
} from "@/lib/staff-functional-roles";

const STAFF_ROLES = ["admin", "system_admin", "dean", "hr_officer"];
type StaffDepartmentScope = "all" | "specific";

function normalizeStaffDepartmentInput(input: {
  department_scope?: StaffDepartmentScope;
  department_ids?: string[];
  department_id?: string | null;
}): { scope: StaffDepartmentScope; ids: string[] } {
  const scope: StaffDepartmentScope = input.department_scope === "all" ? "all" : "specific";
  let ids = dedupeDepartmentIds(input.department_ids ?? []);
  if (scope === "specific" && ids.length === 0 && input.department_id) {
    ids = [input.department_id];
  }
  return { scope, ids };
}

/** Stable unique department id list for staffing scope writes. */
export function dedupeDepartmentIds(departmentIds: readonly string[]): string[] {
  return [...new Set(departmentIds.filter(Boolean))].toSorted();
}

async function syncStaffDepartmentScope(
  profileId: string,
  scope: StaffDepartmentScope,
  departmentIds: string[],
): Promise<void> {
  if (scope === "all") {
    await supabaseAdmin
      .from("staff_profile_departments")
      .delete()
      .eq("staff_profile_id", profileId);
    const { error } = await supabaseAdmin
      .from("staff_profiles")
      .update({ department_scope: "all", department_id: null, updated_at: new Date().toISOString() } as any)
      .eq("id", profileId);
    if (error) throw new Error(error.message);
    return;
  }

  const ids = dedupeDepartmentIds(departmentIds);
  await supabaseAdmin
    .from("staff_profile_departments")
    .delete()
    .eq("staff_profile_id", profileId);

  if (ids.length) {
    const { error: linkErr } = await supabaseAdmin
      .from("staff_profile_departments")
      .insert(ids.map((department_id) => ({ staff_profile_id: profileId, department_id })));
    if (linkErr) throw new Error(linkErr.message);
  }

  const { error } = await supabaseAdmin
    .from("staff_profiles")
    .update({
      department_scope: "specific",
      department_id: ids[0] ?? null,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", profileId);
  if (error) throw new Error(error.message);
}

const staffDepartmentFieldsSchema = z.object({
  department_scope: z.enum(["all", "specific"]).default("specific"),
  department_ids: z.array(z.string().uuid()).default([]),
  department_id: z.string().uuid().optional().nullable(),
}).superRefine((data, ctx) => {
  const { scope, ids } = normalizeStaffDepartmentInput(data);
  if (scope === "specific" && ids.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "يجب اختيار قسم واحد على الأقل عند تحديد «أقسام محددة»",
      path: ["department_ids"],
    });
  }
});

const createStaffSchema = z.object({
  employee_number: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/),
  full_name_ar: z.string().trim().min(2).max(160),
  full_name_en: z.string().trim().max(160).optional().nullable(),
  job_title: z.string().trim().min(1).max(120),
  role_type: z.enum(ALLOWED_STAFF_ROLE_TYPES_CREATE),
  email: z.string().trim().email().max(160).optional().or(z.literal("")).nullable(),
  phone: z.string().trim().max(32).optional().nullable(),
  status: z.enum(["active", "inactive"]).default("active"),
  create_login: z.boolean().default(false),
}).and(staffDepartmentFieldsSchema).superRefine((data, ctx) => {
  if (data.create_login) {
    const email = String(data.email ?? "").trim();
    if (!email || !isValidUniversityLoginEmail(email)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "الإيميل الجامعي مطلوب عند إنشاء حساب الدخول",
        path: ["email"],
      });
    }
    if (!staffRoleTypeSupportsLogin(data.role_type)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "هذا الدور الوظيفي لا يدعم إنشاء حساب دخول حالياً — يحتاج توسيع صلاحيات النظام (app_role)",
        path: ["role_type"],
      });
    }
  }
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

    const { scope, ids } = normalizeStaffDepartmentInput(data);

    const { data: profile, error: pErr } = await supabaseAdmin
      .from("staff_profiles")
      .insert({
        employee_number: data.employee_number,
        full_name_ar: data.full_name_ar,
        full_name_en: data.full_name_en || null,
        department_scope: scope,
        department_id: scope === "all" ? null : ids[0] ?? null,
        job_title: data.job_title,
        role_type: data.role_type,
        status: data.status,
        must_change_password: true,
      } as any)
      .select("id")
      .single();
    if (pErr || !profile) throw new Error(`تعذّر إنشاء الملف: ${pErr?.message ?? ""}`);

    await syncStaffDepartmentScope(profile.id, scope, ids);

    let credentials: { email: string; password: string } | null = null;

    if (data.create_login) {
      const loginEmail = normalizeUniversityLoginEmail(data.email!);
      const appRole = staffFunctionalRoleToAppRole(data.role_type);
      if (!appRole) {
        throw new Error("هذا الدور الوظيفي لا يدعم إنشاء حساب دخول حالياً");
      }
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
      await supabaseAdmin.from("user_roles").insert({
        user_id: newUserId,
        role: appRole as any,
      });
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
  job_title: z.string().trim().min(1).max(120),
  role_type: z.enum(ALLOWED_STAFF_ROLE_TYPES_UPDATE),
  email: z.string().trim().email().max(160).optional().or(z.literal("")).nullable(),
  phone: z.string().trim().max(32).optional().nullable(),
  status: z.enum(["active", "inactive"]),
}).and(staffDepartmentFieldsSchema);

export const updateStaffMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateStaffSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.userId, STAFF_ROLES);
    const { data: old } = await supabaseAdmin
      .from("staff_profiles").select("*").eq("id", data.id).maybeSingle();
    if (!old) throw new Error("الموظف غير موجود");

    const { scope, ids } = normalizeStaffDepartmentInput(data);

    const { error } = await supabaseAdmin
      .from("staff_profiles")
      .update({
        full_name_ar: data.full_name_ar,
        full_name_en: data.full_name_en || null,
        job_title: data.job_title,
        role_type: data.role_type,
        status: data.status,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await syncStaffDepartmentScope(data.id, scope, ids);

    // Sync role: if role_type changed and account exists, swap user_roles
    if ((old as any).role_type !== data.role_type && (old as any).user_id) {
      const userId = (old as any).user_id as string;
      const prevAppRole = staffFunctionalRoleToAppRole((old as any).role_type);
      const nextAppRole = staffFunctionalRoleToAppRole(data.role_type);
      if (!nextAppRole) {
        throw new Error("الدور الوظيفي الجديد لا يدعم حساب دخول — اختر دوراً له صلاحية نظام معروفة");
      }
      if (prevAppRole) {
        await supabaseAdmin
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .eq("role", prevAppRole as any);
      }
      await supabaseAdmin.from("user_roles").insert({
        user_id: userId,
        role: nextAppRole as any,
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

    const { data: deptLinks } = await supabaseAdmin
      .from("staff_profile_departments")
      .select("department_id")
      .eq("staff_profile_id", data.id);

    const linkedIds = (deptLinks ?? []).map((l: { department_id: string }) => l.department_id);
    const department_ids = linkedIds.length
      ? linkedIds
      : (row as any).department_id
        ? [(row as any).department_id as string]
        : [];

    return {
      ...row,
      department_scope: ((row as any).department_scope as StaffDepartmentScope) ?? "specific",
      department_ids,
    };
  });

/**
 * Generic staffing department-scope write contract.
 * Synchronizes staff_profile_departments to the exact selected set.
 * Does NOT grant Graduate Affairs (or any) operational capability by itself —
 * CONFIGURATION AUTHORITY != OPERATIONAL AUTHORITY.
 *
 * Always writes department_scope='specific'. GA specialist auth reads only SPD
 * rows and never interprets department_scope='all' as college-wide specialist
 * access (fail-closed / no silent inheritance of future departments).
 */
export const setStaffDepartmentScope = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        staffProfileId: z.string().uuid(),
        departmentIds: z.array(z.string().uuid()).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.userId, STAFF_ROLES);

    const desiredIds = dedupeDepartmentIds(data.departmentIds);

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("staff_profiles")
      .select("id, user_id, status, full_name_ar, employee_number")
      .eq("id", data.staffProfileId)
      .maybeSingle();
    if (profileErr) throw new Error(profileErr.message);
    if (!profile) throw new Error("ملف الموظف غير موجود");
    if ((profile as any).status !== "active") {
      throw new Error("لا يمكن ضبط نطاق الأقسام لموظف غير نشط");
    }

    // No self-elevation / specialist editing own authority.
    if ((profile as any).user_id && (profile as any).user_id === context.userId) {
      throw new Error("لا يمكنك تعديل نطاق أقسام ملفك التشغيلي بنفسك");
    }

    if (desiredIds.length > 0) {
      const { data: activeDepts, error: deptErr } = await supabaseAdmin
        .from("departments")
        .select("id")
        .in("id", desiredIds)
        .eq("is_active", true);
      if (deptErr) throw new Error(deptErr.message);
      const activeSet = new Set((activeDepts ?? []).map((d) => d.id));
      const invalid = desiredIds.filter((id) => !activeSet.has(id));
      if (invalid.length > 0) {
        throw new Error("أحد معرفات الأقسام غير موجود أو غير نشط");
      }
    }

    const { data: oldLinks, error: oldErr } = await supabaseAdmin
      .from("staff_profile_departments")
      .select("department_id")
      .eq("staff_profile_id", data.staffProfileId);
    if (oldErr) throw new Error(oldErr.message);
    const oldIds = dedupeDepartmentIds((oldLinks ?? []).map((l) => l.department_id));

    await syncStaffDepartmentScope(data.staffProfileId, "specific", desiredIds);

    await logAudit({
      actor_user_id: context.userId,
      entity_type: "staff",
      entity_id: data.staffProfileId,
      action_type: "staff_department_scope_set",
      notes: `مزامنة نطاق أقسام الموظف ${(profile as any).employee_number}`,
      old_values: { department_ids: oldIds },
      new_values: { department_ids: desiredIds, department_scope: "specific" },
    });

    return {
      ok: true as const,
      staffProfileId: data.staffProfileId,
      departmentIds: desiredIds,
      previousDepartmentIds: oldIds,
    };
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
