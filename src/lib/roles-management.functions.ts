import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertAdmin, primaryActorRole } from "@/lib/authz.server";

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
  .inputValidator((input: { search?: string; onlyWithRoles?: boolean; page?: number; pageSize?: number } | undefined) =>
    z.object({
      search: z.string().max(120).optional(),
      onlyWithRoles: z.boolean().optional(),
      page: z.number().int().min(1).optional(),
      pageSize: z.number().int().min(5).max(100).optional(),
    }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { listProfileDirectory } = await import("@/lib/admin/auth-users-directory.server");
    const directoryPage = await listProfileDirectory({
      search: data.search,
      onlyWithRoles: data.onlyWithRoles,
      page: data.page,
      pageSize: data.pageSize,
    });
    const pageUserIds = directoryPage.rows.map((user) => user.user_id);

    const [assignments, operational, positions] = await Promise.all([
      supabaseAdmin
        .from("user_role_assignments")
        .select("user_id, role_code, source_type, source_position_assignment_id")
        .in("user_id", pageUserIds.length ? pageUserIds : ["00000000-0000-0000-0000-000000000000"]),
      supabaseAdmin.from("user_roles").select("user_id, role")
        .in("user_id", pageUserIds.length ? pageUserIds : ["00000000-0000-0000-0000-000000000000"]),
      supabaseAdmin
        .from("position_assignments")
        .select("id, is_active, organizational_positions:position_id(name_ar)")
        .eq("is_active", true),
    ]);

    if (assignments.error) throw new Error(`تعذّر تحميل إسنادات الأدوار: ${assignments.error.message}`);
    if (operational.error) throw new Error(`تعذّر تحميل الأدوار التشغيلية: ${operational.error.message}`);

    const positionNameByAssignment = new Map<string, string>();
    for (const p of positions.data ?? []) {
      positionNameByAssignment.set(
        (p as any).id,
        (p as any).organizational_positions?.name_ar ?? "منصب تنظيمي",
      );
    }

    type Row = {
      user_id: string;
      email: string | null;
      name: string;
      kind: string;
      roles: Array<{ role_code: string; source_type: string; position_name: string | null }>;
      app_roles: string[];
    };

    const map = new Map<string, Row>();
    for (const u of directoryPage.rows) {
      map.set(u.user_id, {
        user_id: u.user_id,
        email: u.email,
        name: u.name,
        kind: u.kind,
        roles: [],
        app_roles: [],
      });
    }
    for (const a of assignments.data ?? []) {
      const m = map.get((a as any).user_id);
      if (!m) continue;
      m.roles.push({
        role_code: (a as any).role_code,
        source_type: (a as any).source_type ?? "direct",
        position_name: (a as any).source_position_assignment_id
          ? positionNameByAssignment.get((a as any).source_position_assignment_id) ?? "منصب تنظيمي"
          : null,
      });
    }
    for (const r of operational.data ?? []) {
      const m = map.get((r as any).user_id);
      if (m) m.app_roles.push((r as any).role as string);
    }

    return { ...directoryPage, rows: Array.from(map.values()) };
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
      .from("roles_catalog")
      .select("code, is_active, app_role_mapping")
      .eq("code", data.role_code)
      .maybeSingle();
    if (!cat) throw new Error("الدور غير موجود في الكتالوج");
    if (!(cat as any).is_active) throw new Error("الدور معطل ولا يمكن إسناده");

    const { error } = await supabaseAdmin.from("user_role_assignments").insert({
      user_id: data.user_id,
      role_code: data.role_code,
      assigned_by: context.userId,
      source_type: "direct",
      notes: data.notes ?? null,
    } as any);
    if (error && !error.message.toLowerCase().includes("duplicate")) throw new Error(error.message);


    await logAudit({
      actor_user_id: context.userId,
      action_type: "user_catalog_role_added",
      entity_id: data.user_id,
      notes: `إسناد دور كتالوجي ${data.role_code}`,
      new_values: { role_code: data.role_code },
    });

    // Sync operational role if mapping exists
    const mapped = (cat as any).app_role_mapping as string | null;
    if (mapped) {
      const { data: existing } = await supabaseAdmin
        .from("user_roles")
        .select("id")
        .eq("user_id", data.user_id)
        .eq("role", mapped as any)
        .maybeSingle();
      if (!existing) {
        const { error: rErr } = await supabaseAdmin
          .from("user_roles")
          .insert({ user_id: data.user_id, role: mapped as any });
        if (!rErr) {
          await logAudit({
            actor_user_id: context.userId,
            action_type: "user_operational_role_synced",
            entity_id: data.user_id,
            notes: `مزامنة الدور التشغيلي ${mapped} (من ${data.role_code})`,
            new_values: { app_role: mapped, from_catalog: data.role_code },
          });
        }
      }
    }

    return { ok: true, synced_app_role: mapped };
  });

export const unassignUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { user_id: string; role_code: string }) =>
    z.object({ user_id: z.string().uuid(), role_code: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    // Derived roles are owned by the organizational structure, not by this page.
    const { data: current } = await supabaseAdmin
      .from("user_role_assignments")
      .select("source_type")
      .eq("user_id", data.user_id)
      .eq("role_code", data.role_code)
      .maybeSingle();
    if ((current as any)?.source_type === "position") {
      throw new Error(
        "هذا الدور مشتق من منصب تنظيمي ولا يمكن حذفه من هنا. أنهِ تعيين المنصب من صفحة الهيكل التنظيمي.",
      );
    }

    // Get mapping of role being removed
    const { data: cat } = await supabaseAdmin
      .from("roles_catalog")
      .select("app_role_mapping")
      .eq("code", data.role_code)
      .maybeSingle();
    const mapped = (cat as any)?.app_role_mapping as string | null;


    const { error } = await supabaseAdmin
      .from("user_role_assignments")
      .delete()
      .eq("user_id", data.user_id)
      .eq("role_code", data.role_code);
    if (error) throw new Error(error.message);

    await logAudit({
      actor_user_id: context.userId,
      action_type: "user_catalog_role_removed",
      entity_id: data.user_id,
      notes: `إزالة دور كتالوجي ${data.role_code}`,
      old_values: { role_code: data.role_code },
    });

    // Conditionally remove operational role: only if no other catalog role
    // assigned to this user still maps to it.
    if (mapped) {
      const { data: others } = await supabaseAdmin
        .from("user_role_assignments")
        .select("role_code, roles_catalog!inner(app_role_mapping)")
        .eq("user_id", data.user_id);
      const stillMapped = (others ?? []).some(
        (r: any) => r.roles_catalog?.app_role_mapping === mapped,
      );
      if (!stillMapped) {
        // Safety: never auto-remove admin/system_admin operational role
        if (mapped !== "admin" && mapped !== "system_admin") {
          const { error: dErr } = await supabaseAdmin
            .from("user_roles")
            .delete()
            .eq("user_id", data.user_id)
            .eq("role", mapped as any);
          if (!dErr) {
            await logAudit({
              actor_user_id: context.userId,
              action_type: "user_operational_role_removed_if_unused",
              entity_id: data.user_id,
              notes: `إزالة الدور التشغيلي ${mapped} لعدم وجود دور كتالوجي آخر يربطه`,
              old_values: { app_role: mapped, via_catalog: data.role_code },
            });
          }
        }
      }
    }

    return { ok: true };
  });

