import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole, primaryActorRole } from "@/lib/authz.server";

const PROCESSING_ASSIGNMENT_ADMIN_ROLES = ["admin", "system_admin"] as const;

async function assertProcessingAssignmentAdmin(userId: string) {
  await assertAnyRole(
    userId,
    PROCESSING_ASSIGNMENT_ADMIN_ROLES,
    "ليست لديك صلاحية إدارة ممثلي أدوار الطلبات.",
  );
}

/** Roles whose assignee MUST be selected from faculty members. */
export const FACULTY_ONLY_ROLE_CODES = ["dean", "vice_dean"] as const;
export function isFacultyOnlyRoleCode(code: string | null | undefined): boolean {
  if (!code) return false;
  return (FACULTY_ONLY_ROLE_CODES as readonly string[]).includes(code);
}

async function logAssignmentAudit(input: {
  actor_user_id: string;
  entity_id: string | null;
  action_type: string;
  notes?: string;
  new_values?: unknown;
  old_values?: unknown;
}): Promise<{ ok: true } | { ok: false; messageAr: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const role = await primaryActorRole(input.actor_user_id);
  const { error } = await supabaseAdmin.from("audit_logs").insert({
    actor_user_id: input.actor_user_id,
    actor_role: role,
    entity_type: "processing_assignment",
    entity_id: input.entity_id,
    action_type: input.action_type,
    notes: input.notes ?? null,
    old_values: (input.old_values ?? null) as never,
    new_values: (input.new_values ?? null) as never,
  });
  if (error) return { ok: false, messageAr: error.message || "تعذر تسجيل التدقيق." };
  return { ok: true };
}

export const listProcessingAssignments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertProcessingAssignmentAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [unitsRes, rolesRes, assignRes, facultyRes, staffRes, authRes] = await Promise.all([
      supabaseAdmin.from("request_processing_units").select("id, code, name_ar, is_active, sort_order").order("sort_order"),
      supabaseAdmin.from("request_processing_roles").select("id, unit_id, code, name_ar, is_active, sort_order").order("sort_order"),
      supabaseAdmin
        .from("request_processing_assignments")
        .select("id, unit_id, role_id, assignment_type, user_id, faculty_profile_id, staff_profile_id, is_active, starts_at, ends_at, created_at")
        .eq("is_active", true),
      supabaseAdmin.from("faculty_profiles").select("id, user_id, full_name_ar, employee_number").not("user_id", "is", null),
      supabaseAdmin.from("staff_profiles").select("id, user_id, full_name_ar, employee_number").not("user_id", "is", null),
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

    if (unitsRes.error) throw new Error(unitsRes.error.message);
    if (rolesRes.error) throw new Error(rolesRes.error.message);
    if (assignRes.error) throw new Error(assignRes.error.message);

    const emailByUser = new Map<string, string>();
    for (const u of authRes.data?.users ?? []) if (u.email) emailByUser.set(u.id, u.email);
    const nameByUser = new Map<string, string>();
    for (const r of facultyRes.data ?? []) if (r.user_id) nameByUser.set(r.user_id, r.full_name_ar);
    for (const r of staffRes.data ?? []) if (r.user_id) nameByUser.set(r.user_id, r.full_name_ar);

    return {
      units: unitsRes.data ?? [],
      roles: rolesRes.data ?? [],
      assignments: (assignRes.data ?? []).map((a) => ({
        ...a,
        user_email: a.user_id ? emailByUser.get(a.user_id) ?? null : null,
        user_name: a.user_id ? nameByUser.get(a.user_id) ?? null : null,
      })),
    };
  });

export const listAssignmentCandidates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { role_code: string }) =>
    z.object({ role_code: z.string().trim().min(1).max(80) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertProcessingAssignmentAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const facultyOnly = isFacultyOnlyRoleCode(data.role_code);

    const [faculty, staff, auth] = await Promise.all([
      supabaseAdmin.from("faculty_profiles").select("id, user_id, full_name_ar, employee_number").not("user_id", "is", null),
      facultyOnly
        ? Promise.resolve({ data: [] as Array<{ id: string; user_id: string | null; full_name_ar: string; employee_number: string | null }>, error: null })
        : supabaseAdmin.from("staff_profiles").select("id, user_id, full_name_ar, employee_number").not("user_id", "is", null),
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

    const emailByUser = new Map<string, string>();
    for (const u of auth.data?.users ?? []) if (u.email) emailByUser.set(u.id, u.email);

    const rows: Array<{
      user_id: string;
      email: string;
      name: string;
      kind: "faculty" | "staff";
      profile_id: string;
      employee_number: string | null;
    }> = [];

    for (const r of faculty.data ?? []) {
      if (!r.user_id) continue;
      rows.push({
        user_id: r.user_id,
        email: emailByUser.get(r.user_id) ?? "",
        name: r.full_name_ar,
        kind: "faculty",
        profile_id: r.id,
        employee_number: r.employee_number,
      });
    }
    if (!facultyOnly) {
      for (const r of staff.data ?? []) {
        if (!r.user_id) continue;
        rows.push({
          user_id: r.user_id,
          email: emailByUser.get(r.user_id) ?? "",
          name: r.full_name_ar,
          kind: "staff",
          profile_id: r.id,
          employee_number: r.employee_number,
        });
      }
    }
    rows.sort((a, b) => a.name.localeCompare(b.name, "ar"));
    return { candidates: rows, facultyOnly };
  });

export const createProcessingAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { role_id: string; user_id: string; notes?: string }) =>
    z.object({
      role_id: z.string().uuid(),
      user_id: z.string().uuid(),
      notes: z.string().max(500).optional(),
    }).parse(input))
  .handler(async ({ data, context }) => {
    await assertProcessingAssignmentAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: role, error: roleErr } = await supabaseAdmin
      .from("request_processing_roles")
      .select("id, code, unit_id, is_active, request_processing_units!inner(id, code, is_active)")
      .eq("id", data.role_id)
      .maybeSingle();
    if (roleErr) throw new Error(roleErr.message);
    if (!role) throw new Error("مسمى المعالجة غير موجود.");
    if (!role.is_active) throw new Error("مسمى المعالجة غير مفعّل.");
    const unit = role.request_processing_units as unknown as { id: string; code: string; is_active: boolean };
    if (!unit?.is_active) throw new Error("جهة المعالجة غير مفعّلة.");

    // Duplicate active assignment for the same role is forbidden.
    const { data: dup, error: dupErr } = await supabaseAdmin
      .from("request_processing_assignments")
      .select("id, user_id")
      .eq("role_id", data.role_id)
      .eq("is_active", true);
    if (dupErr) throw new Error(dupErr.message);
    if ((dup ?? []).some((row) => row.user_id === data.user_id)) {
      throw new Error("يوجد بالفعل إسناد نشط لهذا المستخدم على نفس الدور.");
    }
    if ((dup ?? []).length > 0) {
      throw new Error("يوجد إسناد نشط آخر لهذا الدور. عطّله أولاً قبل إضافة إسناد جديد.");
    }

    // Faculty-only roles must pick a faculty user.
    let assignmentType: "faculty_profile" | "staff_profile" | "user" = "user";
    let facultyProfileId: string | null = null;
    let staffProfileId: string | null = null;

    const { data: fp } = await supabaseAdmin
      .from("faculty_profiles")
      .select("id, user_id")
      .eq("user_id", data.user_id)
      .maybeSingle();
    const { data: sp } = fp
      ? { data: null as { id: string } | null }
      : await supabaseAdmin
          .from("staff_profiles")
          .select("id, user_id")
          .eq("user_id", data.user_id)
          .maybeSingle();

    if (isFacultyOnlyRoleCode(role.code)) {
      if (!fp) throw new Error("هذا الدور يتطلب اختيار عضو هيئة تدريس.");
      assignmentType = "faculty_profile";
      facultyProfileId = fp.id;
    } else if (fp) {
      assignmentType = "faculty_profile";
      facultyProfileId = fp.id;
    } else if (sp) {
      assignmentType = "staff_profile";
      staffProfileId = sp.id;
    } else {
      assignmentType = "user";
    }

    const nowIso = new Date().toISOString();
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("request_processing_assignments")
      .insert({
        unit_id: role.unit_id,
        role_id: role.id,
        assignment_type: assignmentType,
        user_id: data.user_id,
        faculty_profile_id: facultyProfileId,
        staff_profile_id: staffProfileId,
        is_active: true,
        starts_at: nowIso,
      })
      .select("id")
      .maybeSingle();
    if (insErr) throw new Error(insErr.message);

    const audit = await logAssignmentAudit({
      actor_user_id: context.userId,
      entity_id: inserted?.id ?? null,
      action_type: "created",
      notes: data.notes,
      new_values: {
        role_id: role.id,
        role_code: role.code,
        unit_id: role.unit_id,
        user_id: data.user_id,
        assignment_type: assignmentType,
      },
    });

    return {
      ok: true,
      assignment_id: inserted?.id ?? null,
      ...(audit.ok ? {} : { warning: `تم الحفظ لكن تعذر تسجيل التدقيق: ${audit.messageAr}` }),
    };
  });

export const deactivateProcessingAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { assignment_id: string }) =>
    z.object({ assignment_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertProcessingAssignmentAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing, error: exErr } = await supabaseAdmin
      .from("request_processing_assignments")
      .select("id, role_id, user_id, is_active")
      .eq("id", data.assignment_id)
      .maybeSingle();
    if (exErr) throw new Error(exErr.message);
    if (!existing) throw new Error("الإسناد غير موجود.");
    if (!existing.is_active) {
      return { ok: true, idempotent: true as const };
    }

    const nowIso = new Date().toISOString();
    const { error: updErr } = await supabaseAdmin
      .from("request_processing_assignments")
      .update({ is_active: false, ends_at: nowIso })
      .eq("id", data.assignment_id);
    if (updErr) throw new Error(updErr.message);

    const audit = await logAssignmentAudit({
      actor_user_id: context.userId,
      entity_id: existing.id,
      action_type: "deactivated",
      old_values: { user_id: existing.user_id, role_id: existing.role_id },
      new_values: { is_active: false, ends_at: nowIso },
    });
    return {
      ok: true,
      ...(audit.ok ? {} : { warning: `تم التعطيل لكن تعذر تسجيل التدقيق: ${audit.messageAr}` }),
    };
  });
