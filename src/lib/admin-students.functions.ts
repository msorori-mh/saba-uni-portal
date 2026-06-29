import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertStudentAdmin, assertStudentRead, primaryActorRole } from "@/lib/authz.server";
import { generateTemporaryPassword } from "@/lib/password.server";

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
    entity_type: "student",
    entity_id: input.entity_id,
    action_type: input.action_type,
    notes: input.notes ?? null,
    old_values: input.old_values ?? null,
    new_values: input.new_values ?? null,
  } as any);
}

async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const { data, error } = await (supabaseAdmin as any).rpc("find_auth_user_id_by_email", {
    p_email: email,
  });
  if (error) throw new Error(`تعذّر التحقق من حساب الدخول — ${error.message}`);
  return data ? (data as string) : null;
}

// ------------ Lookups ------------

export const getStudentLookups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStudentRead(context.userId);
    const [deps, progs, levels, years, sems] = await Promise.all([
      supabaseAdmin.from("departments").select("id, name_ar").eq("is_active", true).order("sort_order"),
      supabaseAdmin.from("programs").select("id, name_ar, department_id, code").eq("is_active", true).order("sort_order"),
      supabaseAdmin.from("academic_levels").select("id, name, level_number").eq("status", "active").order("level_number"),
      supabaseAdmin.from("academic_years").select("id, name, is_current").order("start_date", { ascending: false }),
      supabaseAdmin.from("semesters").select("id, name, code, academic_year_id, is_current").order("start_date", { ascending: false }),
    ]);
    if (deps.error) throw new Error(deps.error.message);
    return {
      departments: deps.data ?? [],
      programs: progs.data ?? [],
      levels: levels.data ?? [],
      academic_years: years.data ?? [],
      semesters: sems.data ?? [],
    };
  });

const loginBackfillPreviewSchema = z.object({
  academicPrefix: z.string().trim().max(32).regex(/^[A-Za-z0-9_-]*$/, "بادئة الرقم الأكاديمي تحتوي على أحرف غير صحيحة").optional(),
  department_id: z.string().uuid().optional().nullable(),
  program_id: z.string().uuid().optional().nullable(),
  level_id: z.string().uuid().optional().nullable(),
  academic_year_id: z.string().uuid().optional().nullable(),
  semester_id: z.string().uuid().optional().nullable(),
});

export const listStudentLoginBackfillCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => loginBackfillPreviewSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertStudentAdmin(context.userId);

    const hasExplicitFilter = Boolean(
      data.academicPrefix
      || data.department_id
      || data.program_id
      || data.level_id
      || data.academic_year_id
      || data.semester_id,
    );
    if (!hasExplicitFilter) {
      throw new Error("اختر فلترًا واحدًا على الأقل قبل معاينة الطلاب بدون حساب.");
    }

    let scopedProfileIds: string[] | null = null;
    if (data.level_id || data.academic_year_id || data.semester_id) {
      let statusQuery = supabaseAdmin
        .from("student_academic_status")
        .select("student_profile_id")
        .limit(5000);
      if (data.level_id) statusQuery = statusQuery.eq("level_id", data.level_id);
      if (data.academic_year_id) statusQuery = statusQuery.eq("academic_year_id", data.academic_year_id);
      if (data.semester_id) statusQuery = statusQuery.eq("semester_id", data.semester_id);
      const { data: statusRows, error: statusErr } = await statusQuery;
      if (statusErr) throw new Error(statusErr.message);
      scopedProfileIds = Array.from(new Set((statusRows ?? []).map((r: any) => r.student_profile_id).filter(Boolean)));
      if (scopedProfileIds.length === 0) {
        return { total: 0, rows: [], truncated: false };
      }
    }

    let query = supabaseAdmin
      .from("student_profiles")
      .select(`
        id,
        academic_number,
        full_name_ar,
        status,
        user_id,
        department_id,
        program_id,
        departments(name_ar),
        programs(name_ar, code)
      `, { count: "exact" })
      .is("user_id", null)
      .order("academic_number", { ascending: true })
      .limit(250);

    if (data.academicPrefix) query = query.ilike("academic_number", `${data.academicPrefix}%`);
    if (data.department_id) query = query.eq("department_id", data.department_id);
    if (data.program_id) query = query.eq("program_id", data.program_id);
    if (scopedProfileIds) query = query.in("id", scopedProfileIds);

    const { data: profiles, error, count } = await query;
    if (error) throw new Error(error.message);

    const profileIds = (profiles ?? []).map((p: any) => p.id);
    const statusByProfile = new Map<string, any>();
    if (profileIds.length > 0) {
      const { data: statuses, error: statusesErr } = await supabaseAdmin
        .from("student_academic_status")
        .select(`
          student_profile_id,
          enrollment_status,
          updated_at,
          academic_levels(name, level_number),
          academic_years(name),
          semesters(name, code)
        `)
        .in("student_profile_id", profileIds)
        .order("updated_at", { ascending: false });
      if (statusesErr) throw new Error(statusesErr.message);
      for (const row of statuses ?? []) {
        if (!statusByProfile.has((row as any).student_profile_id)) {
          statusByProfile.set((row as any).student_profile_id, row);
        }
      }
    }

    const rows = (profiles ?? []).map((profile: any) => {
      const academicStatus = statusByProfile.get(profile.id);
      const level = academicStatus?.academic_levels;
      const year = academicStatus?.academic_years;
      const semester = academicStatus?.semesters;
      return {
        id: profile.id,
        academic_number: profile.academic_number,
        full_name_ar: profile.full_name_ar,
        status: profile.status,
        user_id: profile.user_id,
        has_user_id: Boolean(profile.user_id),
        department_name: profile.departments?.name_ar ?? null,
        program_name: profile.programs?.name_ar ?? null,
        program_code: profile.programs?.code ?? null,
        level_name: level?.name ?? null,
        level_number: level?.level_number ?? null,
        academic_year: year?.name ?? null,
        semester: semester?.code ?? semester?.name ?? null,
        enrollment_status: academicStatus?.enrollment_status ?? null,
      };
    });

    return {
      total: count ?? rows.length,
      rows,
      truncated: (count ?? rows.length) > rows.length,
    };
  });

const adminStudentStatusSchema = z.enum([
  "all",
  "active",
  "inactive",
  "suspended",
  "graduated",
  "withdrawn",
  "transferred",
]);

const adminStudentsFilterSchema = z.object({
  academic_number: z.string().trim().max(32).regex(/^[A-Za-z0-9_-]*$/, "الرقم الأكاديمي يحتوي على أحرف غير صحيحة").optional(),
  study_system: z.enum(["all", "general", "private_expense"]).default("all"),
  department_id: z.string().uuid().optional().nullable(),
  program_id: z.string().uuid().optional().nullable(),
  level_id: z.string().uuid().optional().nullable(),
  academic_year_id: z.string().uuid().optional().nullable(),
  semester_id: z.string().uuid().optional().nullable(),
  status: adminStudentStatusSchema.default("all"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
});

export const listStudentsForAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => adminStudentsFilterSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertStudentRead(context.userId);

    const academicNumber = data.academic_number?.trim() ?? "";
    const hasAcademicNumber = academicNumber.length > 0;
    const hasGroupFilter = Boolean(
      data.department_id
      || data.program_id
      || data.level_id
      || data.academic_year_id
      || data.semester_id
      || (data.status && data.status !== "all"),
    );

    if (!hasAcademicNumber && !hasGroupFilter) {
      return {
        rows: [],
        total: 0,
        page: data.page,
        pageSize: data.pageSize,
        mode: "empty" as const,
        message: "اختر فلترًا واحدًا على الأقل أو أدخل الرقم الأكاديمي",
      };
    }

    let scopedProfileIds: string[] | null = null;
    if (!hasAcademicNumber && (data.level_id || data.academic_year_id || data.semester_id)) {
      let statusQuery = supabaseAdmin
        .from("student_academic_status")
        .select("student_profile_id")
        .limit(5000);
      if (data.level_id) statusQuery = statusQuery.eq("level_id", data.level_id);
      if (data.academic_year_id) statusQuery = statusQuery.eq("academic_year_id", data.academic_year_id);
      if (data.semester_id) statusQuery = statusQuery.eq("semester_id", data.semester_id);

      const { data: statusRows, error: statusErr } = await statusQuery;
      if (statusErr) throw new Error(statusErr.message);
      scopedProfileIds = Array.from(new Set((statusRows ?? []).map((r: any) => r.student_profile_id).filter(Boolean)));
      if (scopedProfileIds.length === 0) {
        return {
          rows: [],
          total: 0,
          page: data.page,
          pageSize: data.pageSize,
          mode: hasAcademicNumber ? "academic_number" as const : "filters" as const,
          message: hasAcademicNumber ? "لا يوجد طالب بهذا الرقم الأكاديمي" : null,
        };
      }
    }

    const from = hasAcademicNumber ? 0 : (data.page - 1) * data.pageSize;
    const to = hasAcademicNumber ? 0 : from + data.pageSize - 1;

    let query = supabaseAdmin
      .from("student_profiles")
      .select(`
        id,
        user_id,
        academic_number,
        full_name_ar,
        status,
        must_change_password,
        department_id,
        program_id,
        departments(name_ar),
        programs(name_ar, code)
      `, { count: "exact" })
      .order("academic_number", { ascending: true });

    if (hasAcademicNumber) {
      query = query.eq("academic_number", academicNumber);
    } else {
      if (data.department_id) query = query.eq("department_id", data.department_id);
      if (data.program_id) query = query.eq("program_id", data.program_id);
      if (data.status && data.status !== "all") query = query.eq("status", data.status);
      if (scopedProfileIds) query = query.in("id", scopedProfileIds);
    }

    const { data: profiles, error, count } = await query.range(from, to);
    if (error) throw new Error(error.message);

    const profileIds = (profiles ?? []).map((profile: any) => profile.id);
    const statusByProfile = new Map<string, any>();
    if (profileIds.length > 0) {
      let academicStatusQuery = supabaseAdmin
        .from("student_academic_status")
        .select(`
          student_profile_id,
          enrollment_status,
          updated_at,
          academic_levels(name, level_number),
          academic_years(name),
          semesters(name, code)
        `)
        .in("student_profile_id", profileIds)
        .order("updated_at", { ascending: false });
      if (!hasAcademicNumber) {
        if (data.level_id) academicStatusQuery = academicStatusQuery.eq("level_id", data.level_id);
        if (data.academic_year_id) academicStatusQuery = academicStatusQuery.eq("academic_year_id", data.academic_year_id);
        if (data.semester_id) academicStatusQuery = academicStatusQuery.eq("semester_id", data.semester_id);
      }
      const { data: statuses, error: statusesErr } = await academicStatusQuery;
      if (statusesErr) throw new Error(statusesErr.message);
      for (const row of statuses ?? []) {
        const profileId = (row as any).student_profile_id;
        if (!statusByProfile.has(profileId)) statusByProfile.set(profileId, row);
      }
    }

    const userIds = (profiles ?? []).filter((profile: any) => profile.user_id).map((profile: any) => profile.user_id as string);
    const { data: roles } = userIds.length
      ? await supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", userIds)
      : { data: [] as any[] };

    const rows = (profiles ?? []).map((profile: any) => {
      const academicStatus = statusByProfile.get(profile.id);
      const level = academicStatus?.academic_levels;
      const year = academicStatus?.academic_years;
      const semester = academicStatus?.semesters;
      return {
        id: profile.id,
        user_id: profile.user_id,
        academic_number: profile.academic_number,
        identifier: profile.academic_number,
        email: profile.user_id ? `${profile.academic_number.toLowerCase()}@students.usr.edu.ye` : null,
        roles: (roles ?? []).filter((role: any) => role.user_id === profile.user_id).map((role: any) => role.role),
        full_name_ar: profile.full_name_ar,
        status: profile.status,
        must_change_password: profile.must_change_password,
        department_id: profile.department_id,
        program_id: profile.program_id,
        study_system: null as string | null,
        department_name: profile.departments?.name_ar ?? null,
        program_name: profile.programs?.name_ar ?? null,
        program_code: profile.programs?.code ?? null,
        level_name: level?.name ?? null,
        level_number: level?.level_number ?? null,
        academic_year: year?.name ?? null,
        semester: semester?.code ?? semester?.name ?? null,
        enrollment_status: academicStatus?.enrollment_status ?? null,
      };
    });

    return {
      rows,
      total: count ?? rows.length,
      page: data.page,
      pageSize: data.pageSize,
      mode: hasAcademicNumber ? "academic_number" as const : "filters" as const,
      message: hasAcademicNumber && rows.length === 0 ? "لا يوجد طالب بهذا الرقم الأكاديمي" : null,
    };
  });

// ------------ Create Student ------------

const createSchema = z.object({
  academic_number: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/, "الرقم الأكاديمي يحتوي على أحرف غير صحيحة"),
  full_name_ar: z.string().trim().min(2).max(160),
  full_name_en: z.string().trim().max(160).optional().nullable(),
  phone: z.string().trim().max(32).optional().nullable(),
  email: z.string().trim().email().max(160).optional().or(z.literal("")).nullable(),
  national_id: z.string().trim().max(32).optional().nullable(),
  department_id: z.string().uuid().optional().nullable(),
  program_id: z.string().uuid().optional().nullable(),
  level_id: z.string().uuid(),
  academic_year_id: z.string().uuid(),
  semester_id: z.string().uuid(),
  create_login: z.boolean().default(false),
});

export const createStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertStudentAdmin(context.userId);

    // Check duplicate academic_number
    const { data: existing } = await supabaseAdmin
      .from("student_profiles")
      .select("id")
      .eq("academic_number", data.academic_number)
      .maybeSingle();
    if (existing) throw new Error("الرقم الأكاديمي مستخدم مسبقاً");

    // Insert profile
    const { data: profile, error: pErr } = await supabaseAdmin
      .from("student_profiles")
      .insert({
        academic_number: data.academic_number,
        full_name_ar: data.full_name_ar,
        full_name_en: data.full_name_en || null,
        phone: data.phone || null,
        email: data.email || null,
        national_id: data.national_id || null,
        department_id: data.department_id || null,
        program_id: data.program_id || null,
        status: "active",
        must_change_password: true,
      } as any)
      .select("id")
      .single();
    if (pErr || !profile) throw new Error(pErr?.message ?? "تعذّر إنشاء الملف");

    // Insert academic status
    const { error: sErr } = await supabaseAdmin
      .from("student_academic_status")
      .insert({
        student_profile_id: profile.id,
        academic_year_id: data.academic_year_id,
        semester_id: data.semester_id,
        level_id: data.level_id,
        enrollment_status: "active",
      } as any);
    if (sErr) {
      await supabaseAdmin.from("student_profiles").delete().eq("id", profile.id);
      throw new Error(`تعذّر إنشاء الحالة الأكاديمية: ${sErr.message}`);
    }

    let credentials: { email: string; password: string } | null = null;

    if (data.create_login) {
      const email = `${data.academic_number.toLowerCase()}@students.usr.edu.ye`;
      const password = generateTemporaryPassword();

      const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name_ar: data.full_name_ar, kind: "student" },
      });
      if (cErr || !created.user) {
        throw new Error(`تم إنشاء الملف لكن تعذّر إنشاء حساب الدخول: ${cErr?.message ?? "خطأ"}`);
      }

      const newUserId = created.user.id;
      // Use SECURITY DEFINER RPC to bypass protect_student_sensitive_fields trigger
      // (service_role has no auth.uid(), so a direct UPDATE would be reverted silently).
      // Use SECURITY DEFINER RPC (called as the authenticated admin so the role
      // check inside the RPC passes) to bypass protect_student_sensitive_fields.
      const { error: linkErr } = await (context.supabase as any).rpc(
        "link_student_user_account",
        { _profile_id: profile.id, _target_user_id: newUserId }
      );
      if (linkErr) {
        await supabaseAdmin.auth.admin.deleteUser(newUserId);
        throw new Error(linkErr.message);
      }

      await supabaseAdmin.from("user_roles").insert({ user_id: newUserId, role: "student" as any });
      credentials = { email, password };
    }

    await logAudit({
      actor_user_id: context.userId,
      entity_id: profile.id,
      action_type: "student_created",
      notes: `إضافة طالب جديد: ${data.full_name_ar} (${data.academic_number})`,
      new_values: {
        academic_number: data.academic_number,
        full_name_ar: data.full_name_ar,
        with_login: data.create_login,
      },
    });

    return {
      id: profile.id,
      academic_number: data.academic_number,
      full_name_ar: data.full_name_ar,
      credentials,
    };
  });

// ------------ Update Student ------------

const updateSchema = z.object({
  id: z.string().uuid(),
  full_name_ar: z.string().trim().min(2).max(160),
  full_name_en: z.string().trim().max(160).optional().nullable(),
  phone: z.string().trim().max(32).optional().nullable(),
  email: z.string().trim().email().max(160).optional().or(z.literal("")).nullable(),
  national_id: z.string().trim().max(32).optional().nullable(),
  department_id: z.string().uuid().optional().nullable(),
  program_id: z.string().uuid().optional().nullable(),
});

export const updateStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertStudentAdmin(context.userId);

    const { data: old } = await supabaseAdmin
      .from("student_profiles").select("*").eq("id", data.id).maybeSingle();
    if (!old) throw new Error("الطالب غير موجود");

    const { error } = await supabaseAdmin
      .from("student_profiles")
      .update({
        full_name_ar: data.full_name_ar,
        full_name_en: data.full_name_en || null,
        phone: data.phone || null,
        email: data.email || null,
        national_id: data.national_id || null,
        department_id: data.department_id || null,
        program_id: data.program_id || null,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await logAudit({
      actor_user_id: context.userId,
      entity_id: data.id,
      action_type: "student_updated",
      notes: `تعديل بيانات الطالب ${(old as any).academic_number}`,
      old_values: old,
      new_values: data,
    });

    return { ok: true };
  });

// ------------ Get one student (for edit prefill) ------------

export const getStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertStudentRead(context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("student_profiles")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("الطالب غير موجود");
    return row;
  });

// ------------ Provision Student Login (used by bulk import) ------------

const provisionSchema = z.object({
  profile_id: z.string().uuid(),
  academic_number: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/),
  must_change_password: z.boolean().optional().default(true),
});

export const provisionStudentLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => provisionSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertStudentAdmin(context.userId);

    const email = `${data.academic_number.toLowerCase()}@students.usr.edu.ye`;
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("student_profiles")
      .select("id, academic_number, user_id")
      .eq("id", data.profile_id)
      .maybeSingle();
    if (profileErr) throw new Error(profileErr.message);
    if (!profile) throw new Error("الطالب غير موجود");
    if (profile.user_id) throw new Error("لدى الطالب حساب دخول مسبقاً");
    if (profile.academic_number !== data.academic_number) {
      throw new Error("الرقم الأكاديمي لا يطابق ملف الطالب المحدد");
    }
    const existingAuthUserId = await findAuthUserIdByEmail(email);
    if (existingAuthUserId) {
      throw new Error("يوجد حساب دخول مسبق يستخدم بريد هذا الطالب");
    }

    const password = generateTemporaryPassword();

    const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { kind: "student" },
    });
    if (cErr || !created.user) {
      throw new Error(cErr?.message ?? "تعذّر إنشاء حساب الدخول");
    }

    const newUserId = created.user.id;

    // Use SECURITY DEFINER RPC (called as the authenticated admin) to bypass
    // protect_student_sensitive_fields trigger when linking user_id.
    const { error: linkErr } = await (context.supabase as any).rpc(
      "link_student_user_account",
      { _profile_id: data.profile_id, _target_user_id: newUserId }
    );
    if (linkErr) {
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      throw new Error(linkErr.message);
    }

    await supabaseAdmin.from("user_roles").insert({ user_id: newUserId, role: "student" as any });

    // must_change_password: enforced via dedicated admin RPC (uses bypass token).
    if (data.must_change_password) {
      const { error: mErr } = await (context.supabase as any).rpc(
        "admin_mark_student_password_reset",
        { _profile_id: data.profile_id }
      );
      if (mErr) {
        // best-effort: account exists, surface as warning via thrown error
        throw new Error(`تم إنشاء الحساب لكن تعذّر ضبط must_change_password: ${mErr.message}`);
      }
    }

    await logAudit({
      actor_user_id: context.userId,
      entity_id: data.profile_id,
      action_type: "student_login_provisioned",
      notes: `إنشاء حساب دخول للطالب ${data.academic_number} عبر الاستيراد`,
      new_values: { academic_number: data.academic_number, must_change_password: data.must_change_password },
    });

    return { ok: true, user_id: newUserId, email, password };
  });
