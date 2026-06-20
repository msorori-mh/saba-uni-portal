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
