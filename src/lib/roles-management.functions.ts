import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "system_admin"]);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("ليس لديك صلاحية");
}

async function actorRole(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  if (!data?.length) return null;
  const pr = ["system_admin", "admin", "dean", "registrar", "student_affairs", "finance_officer", "department_head", "faculty_member"];
  for (const p of pr) if (data.some((r: any) => r.role === p)) return p;
  return (data[0] as any).role;
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
    entity_type: "role",
    entity_id: input.entity_id,
    action_type: input.action_type,
    notes: input.notes ?? null,
    old_values: input.old_values ?? null,
    new_values: input.new_values ?? null,
  } as any);
}

// -------- Roles Catalog --------

export const listRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("roles_catalog")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string; name_ar: string; name_en?: string; description?: string }) =>
    z.object({
      code: z.string().min(2).max(60).regex(/^[a-z0-9_]+$/, "كود لاتيني صغير وأرقام و _"),
      name_ar: z.string().min(2).max(120),
      name_en: z.string().max(120).optional(),
      description: z.string().max(500).optional(),
    }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("roles_catalog")
      .insert({
        code: data.code,
        name_ar: data.name_ar,
        name_en: data.name_en ?? null,
        description: data.description ?? null,
      } as any)
      .select()
      .single();
    if (error) throw new Error(error.message);
    await logAudit({
      actor_user_id: context.userId,
      action_type: "role_created",
      entity_id: (row as any).id,
      notes: `إنشاء دور ${data.code}`,
      new_values: data,
    });
    return row;
  });

export const updateRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; name_ar?: string; name_en?: string; description?: string }) =>
    z.object({
      id: z.string().uuid(),
      name_ar: z.string().min(2).max(120).optional(),
      name_en: z.string().max(120).optional(),
      description: z.string().max(500).optional(),
    }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const patch: any = {};
    if (data.name_ar !== undefined) patch.name_ar = data.name_ar;
    if (data.name_en !== undefined) patch.name_en = data.name_en;
    if (data.description !== undefined) patch.description = data.description;
    const { data: row, error } = await supabaseAdmin
      .from("roles_catalog").update(patch).eq("id", data.id).select().single();
    if (error) throw new Error(error.message);
    await logAudit({
      actor_user_id: context.userId,
      action_type: "role_updated",
      entity_id: data.id,
      new_values: patch,
    });
    return row;
  });

export const setRoleActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; active: boolean }) =>
    z.object({ id: z.string().uuid(), active: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("roles_catalog").update({ is_active: data.active } as any).eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAudit({
      actor_user_id: context.userId,
      action_type: data.active ? "role_enabled" : "role_disabled",
      entity_id: data.id,
      new_values: { is_active: data.active },
    });
    return { ok: true };
  });

// -------- User Role Assignments --------

export const listUsersWithRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { search?: string }) => input ?? {})
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    // Pull profiles to get display name + email by user_id
    const [students, faculty, staff, assignments, auth] = await Promise.all([
      supabaseAdmin.from("student_profiles").select("user_id, full_name_ar, academic_number").not("user_id", "is", null),
      supabaseAdmin.from("faculty_profiles").select("user_id, full_name_ar, employee_number").not("user_id", "is", null),
      supabaseAdmin.from("staff_profiles").select("user_id, full_name_ar, employee_number, job_title").not("user_id", "is", null),
      supabaseAdmin.from("user_role_assignments").select("user_id, role_code"),
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

    const map = new Map<string, { user_id: string; email: string | null; name: string; kind: string; roles: string[] }>();
    for (const u of (auth.data?.users ?? [])) {
      map.set(u.id, { user_id: u.id, email: u.email ?? null, name: u.email ?? "", kind: "user", roles: [] });
    }
    for (const r of (students.data ?? [])) {
      const m = map.get((r as any).user_id);
      if (m) { m.name = (r as any).full_name_ar; m.kind = "student"; }
    }
    for (const r of (faculty.data ?? [])) {
      const m = map.get((r as any).user_id);
      if (m) { m.name = (r as any).full_name_ar; m.kind = "faculty"; }
    }
    for (const r of (staff.data ?? [])) {
      const m = map.get((r as any).user_id);
      if (m) { m.name = (r as any).full_name_ar; m.kind = "staff"; }
    }
    for (const a of (assignments.data ?? [])) {
      const m = map.get((a as any).user_id);
      if (m) m.roles.push((a as any).role_code);
    }
    let rows = Array.from(map.values()).filter((r) => r.kind !== "user" || r.roles.length > 0);
    const s = (data?.search ?? "").trim().toLowerCase();
    if (s) {
      rows = rows.filter((r) =>
        r.name.toLowerCase().includes(s) || (r.email ?? "").toLowerCase().includes(s)
      );
    }
    rows.sort((a, b) => a.name.localeCompare(b.name, "ar"));
    return rows.slice(0, 500);
  });

export const assignUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { user_id: string; role_code: string; notes?: string }) =>
    z.object({
      user_id: z.string().uuid(),
      role_code: z.string().min(1),
      notes: z.string().max(500).optional(),
    }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: cat } = await supabaseAdmin
      .from("roles_catalog").select("code, is_active").eq("code", data.role_code).maybeSingle();
    if (!cat) throw new Error("الدور غير موجود في الكتالوج");
    if (!(cat as any).is_active) throw new Error("الدور معطل ولا يمكن إسناده");

    const { error } = await supabaseAdmin.from("user_role_assignments").insert({
      user_id: data.user_id,
      role_code: data.role_code,
      assigned_by: context.userId,
      notes: data.notes ?? null,
    } as any);
    if (error && !error.message.toLowerCase().includes("duplicate")) throw new Error(error.message);

    await logAudit({
      actor_user_id: context.userId,
      action_type: "user_role_added",
      entity_id: data.user_id,
      notes: `إسناد دور ${data.role_code}`,
      new_values: { role_code: data.role_code },
    });
    return { ok: true };
  });

export const unassignUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { user_id: string; role_code: string }) =>
    z.object({ user_id: z.string().uuid(), role_code: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("user_role_assignments")
      .delete()
      .eq("user_id", data.user_id)
      .eq("role_code", data.role_code);
    if (error) throw new Error(error.message);
    await logAudit({
      actor_user_id: context.userId,
      action_type: "user_role_removed",
      entity_id: data.user_id,
      notes: `إزالة دور ${data.role_code}`,
      old_values: { role_code: data.role_code },
    });
    return { ok: true };
  });
