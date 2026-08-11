import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertOrgStructureRead,
  assertOrgStructureWrite,
} from "@/lib/authz.server";

const PROTECTED_APP_ROLES = new Set(["admin", "system_admin"]);

async function logOrgAudit(input: {
  actor_user_id: string;
  action_type: string;
  entity_id: string | null;
  notes?: string;
  old_values?: any;
  new_values?: any;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { primaryActorRole } = await import("@/lib/authz.server");
  const role = await primaryActorRole(input.actor_user_id);
  await supabaseAdmin.from("audit_logs").insert({
    actor_user_id: input.actor_user_id,
    actor_role: role,
    entity_type: "organizational_position",
    entity_id: input.entity_id,
    action_type: input.action_type,
    notes: input.notes ?? null,
    old_values: input.old_values ?? null,
    new_values: input.new_values ?? null,
  } as any);
}

/** Grant every operational role mapped to a position, marked as derived. */
async function grantDerivedRoles(params: {
  actorUserId: string;
  positionId: string;
  userId: string;
  assignmentId: string;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: maps } = await supabaseAdmin
    .from("position_role_mapping")
    .select("role_code")
    .eq("position_id", params.positionId)
    .eq("is_active", true);

  const granted: string[] = [];
  for (const m of maps ?? []) {
    const roleCode = (m as any).role_code as string;
    const { data: existing } = await supabaseAdmin
      .from("user_role_assignments")
      .select("id, source_type")
      .eq("user_id", params.userId)
      .eq("role_code", roleCode)
      .maybeSingle();

    if (!existing) {
      const { error } = await supabaseAdmin.from("user_role_assignments").insert({
        user_id: params.userId,
        role_code: roleCode,
        assigned_by: params.actorUserId,
        source_type: "position",
        source_position_assignment_id: params.assignmentId,
        notes: "ممنوح تلقائياً بسبب شغل منصب تنظيمي",
      } as any);
      if (!error) granted.push(roleCode);
    } else if ((existing as any).source_type === "position") {
      await supabaseAdmin
        .from("user_role_assignments")
        .update({ source_position_assignment_id: params.assignmentId } as any)
        .eq("id", (existing as any).id);
    }

    // Sync the operational role behind the catalog role.
    const { data: cat } = await supabaseAdmin
      .from("roles_catalog")
      .select("app_role_mapping")
      .eq("code", roleCode)
      .maybeSingle();
    const mapped = (cat as any)?.app_role_mapping as string | null;
    if (mapped) {
      const { data: has } = await supabaseAdmin
        .from("user_roles")
        .select("id")
        .eq("user_id", params.userId)
        .eq("role", mapped as any)
        .maybeSingle();
      if (!has) {
        await supabaseAdmin.from("user_roles").insert({ user_id: params.userId, role: mapped as any });
      }
    }
  }

  if (granted.length) {
    await logOrgAudit({
      actor_user_id: params.actorUserId,
      action_type: "position_derived_roles_granted",
      entity_id: params.positionId,
      notes: `منح أدوار مشتقة من المنصب: ${granted.join(", ")}`,
      new_values: { user_id: params.userId, roles: granted },
    });
  }
  return granted;
}

/** Revoke only roles derived from a specific (ending) position assignment. */
async function revokeDerivedRoles(params: {
  actorUserId: string;
  assignmentId: string;
  userId: string;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: derived } = await supabaseAdmin
    .from("user_role_assignments")
    .select("id, role_code")
    .eq("source_position_assignment_id", params.assignmentId)
    .eq("source_type", "position");

  const removed: string[] = [];
  for (const row of derived ?? []) {
    const roleCode = (row as any).role_code as string;
    const { error } = await supabaseAdmin
      .from("user_role_assignments")
      .delete()
      .eq("id", (row as any).id);
    if (error) continue;
    removed.push(roleCode);

    const { data: cat } = await supabaseAdmin
      .from("roles_catalog")
      .select("app_role_mapping")
      .eq("code", roleCode)
      .maybeSingle();
    const mapped = (cat as any)?.app_role_mapping as string | null;
    if (!mapped || PROTECTED_APP_ROLES.has(mapped)) continue;

    const { data: others } = await supabaseAdmin
      .from("user_role_assignments")
      .select("role_code, roles_catalog!inner(app_role_mapping)")
      .eq("user_id", params.userId);
    const stillMapped = (others ?? []).some(
      (r: any) => r.roles_catalog?.app_role_mapping === mapped,
    );
    if (!stillMapped) {
      await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", params.userId)
        .eq("role", mapped as any);
    }
  }

  if (removed.length) {
    await logOrgAudit({
      actor_user_id: params.actorUserId,
      action_type: "position_derived_roles_revoked",
      entity_id: null,
      notes: `سحب أدوار مشتقة عند إنهاء التعيين: ${removed.join(", ")}`,
      old_values: { user_id: params.userId, roles: removed },
    });
  }
  return removed;
}

// -------------------- Reads --------------------

export const listOrgStructure = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOrgStructureRead(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getProfileDirectoryUsers } = await import("@/lib/admin/auth-users-directory.server");

    const [positionsRes, mappingsRes, assignmentsRes, rolesRes, departmentsRes] = await Promise.all([
        supabaseAdmin.from("organizational_positions").select("*").order("sort_order"),
        supabaseAdmin.from("position_role_mapping").select("*, roles_catalog:role_code(name_ar, app_role_mapping)"),
        supabaseAdmin.from("position_assignments").select("*").order("assigned_from", { ascending: false }),
        supabaseAdmin.from("roles_catalog").select("code, name_ar, app_role_mapping, is_active").order("name_ar"),
        supabaseAdmin.from("departments").select("id, name_ar").order("name_ar"),
      ]);

    if (positionsRes.error) throw new Error(`تعذّر تحميل المناصب: ${positionsRes.error.message}`);
    if (mappingsRes.error) throw new Error(`تعذّر تحميل ربط الأدوار بالمناصب: ${mappingsRes.error.message}`);
    if (assignmentsRes.error) throw new Error(`تعذّر تحميل التعيينات: ${assignmentsRes.error.message}`);
    if (rolesRes.error) throw new Error(`تعذّر تحميل كتالوج الأدوار: ${rolesRes.error.message}`);

    const dir = await getProfileDirectoryUsers(
      Array.from(new Set((assignmentsRes.data ?? []).map((assignment: any) => assignment.user_id))),
    );

    const assignments = (assignmentsRes.data ?? []).map((a: any) => ({
      ...a,
      user_email: dir.get(a.user_id)?.email ?? null,
      user_name: dir.get(a.user_id)?.name ?? null,
    }));

    return {
      positions: positionsRes.data ?? [],
      mappings: mappingsRes.data ?? [],
      assignments,
      activeAssignments: assignments.filter((a: any) => a.is_active),
      roles: rolesRes.data ?? [],
      departments: departmentsRes.data ?? [],
    };
  });

export const listAssignableUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { search?: string; page?: number; pageSize?: number } | undefined) =>
    z.object({
      search: z.string().max(120).optional(),
      page: z.number().int().min(1).optional(),
      pageSize: z.number().int().min(5).max(50).optional(),
    }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    await assertOrgStructureWrite(context.userId);
    const { listProfileDirectory } = await import("@/lib/admin/auth-users-directory.server");
    const result = await listProfileDirectory({
      search: data.search,
      kinds: ["faculty", "staff"],
      page: data.page,
      pageSize: data.pageSize ?? 20,
    });
    return {
      ...result,
      rows: result.rows.map((user) => ({
        id: user.user_id,
        email: user.email ?? "",
        name: user.name,
        kind: user.kind,
        identifier: user.identifier,
      })),
    };
  });

/** Position ↔ operational role drift report. */
export const auditOrgRoleDrift = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOrgStructureRead(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getProfileDirectoryUsers } = await import("@/lib/admin/auth-users-directory.server");

    const [positionsRes, mappingsRes, assignmentsRes, uraRes] = await Promise.all([
      supabaseAdmin.from("organizational_positions").select("id, code, name_ar, is_active"),
      supabaseAdmin.from("position_role_mapping").select("position_id, role_code, is_active"),
      supabaseAdmin.from("position_assignments").select("id, position_id, user_id").eq("is_active", true),
      supabaseAdmin.from("user_role_assignments").select("user_id, role_code, source_type, source_position_assignment_id"),
    ]);
    if (positionsRes.error) throw new Error(positionsRes.error.message);
    if (uraRes.error) throw new Error(uraRes.error.message);

    const directoryUserIds = new Set<string>();
    for (const assignment of assignmentsRes.data ?? []) directoryUserIds.add((assignment as any).user_id);
    for (const assignment of uraRes.data ?? []) directoryUserIds.add((assignment as any).user_id);
    const dir = await getProfileDirectoryUsers(Array.from(directoryUserIds));
    const posById = new Map((positionsRes.data ?? []).map((p: any) => [p.id, p]));
    const ura = uraRes.data ?? [];

    const missing: Array<{
      position_id: string; position_name: string; user_id: string; user_name: string; role_code: string;
    }> = [];

    for (const a of assignmentsRes.data ?? []) {
      const maps = (mappingsRes.data ?? []).filter(
        (m: any) => m.position_id === (a as any).position_id && m.is_active,
      );
      for (const m of maps) {
        const has = ura.some(
          (r: any) => r.user_id === (a as any).user_id && r.role_code === (m as any).role_code,
        );
        if (!has) {
          const p: any = posById.get((a as any).position_id);
          missing.push({
            position_id: (a as any).position_id,
            position_name: p?.name_ar ?? "—",
            user_id: (a as any).user_id,
            user_name: dir.get((a as any).user_id)?.name ?? (a as any).user_id.slice(0, 8),
            role_code: (m as any).role_code,
          });
        }
      }
    }

    // Derived roles whose backing assignment is gone / inactive.
    const activeIds = new Set((assignmentsRes.data ?? []).map((a: any) => a.id));
    const orphaned = ura
      .filter((r: any) => r.source_type === "position" && !activeIds.has(r.source_position_assignment_id))
      .map((r: any) => ({
        user_id: r.user_id,
        user_name: dir.get(r.user_id)?.name ?? r.user_id.slice(0, 8),
        role_code: r.role_code,
      }));

    const vacantMapped = (positionsRes.data ?? [])
      .filter((p: any) => p.is_active)
      .filter((p: any) => (mappingsRes.data ?? []).some((m: any) => m.position_id === p.id && m.is_active))
      .filter((p: any) => !(assignmentsRes.data ?? []).some((a: any) => a.position_id === p.id))
      .map((p: any) => ({ position_id: p.id, position_name: p.name_ar }));

    return { missing, orphaned, vacantMapped };
  });

// -------------------- Position CRUD --------------------

const positionInput = z.object({
  code: z.string().min(2).max(80).regex(/^[a-z0-9_]+$/, "الكود بحروف لاتينية صغيرة وأرقام و _ فقط"),
  name_ar: z.string().min(2).max(160),
  name_en: z.string().max(160).optional().nullable(),
  parent_code: z.string().max(80).optional().nullable(),
  unit_type: z.string().min(2).max(40),
  sort_order: z.number().int().min(0).max(9999).optional(),
  department_id: z.string().uuid().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export const createPosition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => positionInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertOrgStructureWrite(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("organizational_positions")
      .insert({
        code: data.code,
        name_ar: data.name_ar,
        name_en: data.name_en ?? null,
        parent_code: data.parent_code || null,
        unit_type: data.unit_type,
        sort_order: data.sort_order ?? 0,
        department_id: data.department_id ?? null,
        notes: data.notes ?? null,
      } as any)
      .select()
      .single();
    if (error) throw new Error(error.message);
    await logOrgAudit({
      actor_user_id: context.userId,
      action_type: "position_created",
      entity_id: (row as any).id,
      notes: `إنشاء منصب ${data.name_ar}`,
      new_values: data,
    });
    return row;
  });

export const updatePosition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    positionInput.partial().extend({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertOrgStructureWrite(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: any = {};
    for (const key of ["name_ar", "name_en", "unit_type", "sort_order", "notes"] as const) {
      if (data[key] !== undefined) patch[key] = data[key];
    }
    if (data.parent_code !== undefined) patch.parent_code = data.parent_code || null;
    if (data.department_id !== undefined) patch.department_id = data.department_id ?? null;
    patch.updated_at = new Date().toISOString();

    const { error } = await supabaseAdmin
      .from("organizational_positions").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    await logOrgAudit({
      actor_user_id: context.userId,
      action_type: "position_updated",
      entity_id: data.id,
      new_values: patch,
    });
    return { ok: true };
  });

export const setPositionActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; active: boolean }) =>
    z.object({ id: z.string().uuid(), active: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertOrgStructureWrite(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!data.active) {
      const { count } = await supabaseAdmin
        .from("position_assignments")
        .select("id", { count: "exact", head: true })
        .eq("position_id", data.id)
        .eq("is_active", true);
      if ((count ?? 0) > 0) {
        throw new Error("لا يمكن تعطيل منصب له شاغل نشط. أنهِ التعيين أولاً.");
      }
    }

    const { error } = await supabaseAdmin
      .from("organizational_positions")
      .update({ is_active: data.active, updated_at: new Date().toISOString() } as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logOrgAudit({
      actor_user_id: context.userId,
      action_type: data.active ? "position_enabled" : "position_disabled",
      entity_id: data.id,
      new_values: { is_active: data.active },
    });
    return { ok: true };
  });

// -------------------- Position ↔ role mapping --------------------

export const addPositionRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { position_id: string; role_code: string }) =>
    z.object({ position_id: z.string().uuid(), role_code: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertOrgStructureWrite(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: cat } = await supabaseAdmin
      .from("roles_catalog").select("code, is_active").eq("code", data.role_code).maybeSingle();
    if (!cat) throw new Error("الدور غير موجود في الكتالوج");
    if (!(cat as any).is_active) throw new Error("الدور معطل ولا يمكن ربطه بمنصب");

    const { data: existing } = await supabaseAdmin
      .from("position_role_mapping")
      .select("id")
      .eq("position_id", data.position_id)
      .eq("role_code", data.role_code)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin.from("position_role_mapping")
        .update({ is_active: true } as any).eq("id", (existing as any).id);
    } else {
      const { error } = await supabaseAdmin.from("position_role_mapping").insert({
        position_id: data.position_id,
        role_code: data.role_code,
      } as any);
      if (error) throw new Error(error.message);
    }

    // Propagate to the current occupant, if any.
    const { data: active } = await supabaseAdmin
      .from("position_assignments")
      .select("id, user_id")
      .eq("position_id", data.position_id)
      .eq("is_active", true)
      .maybeSingle();
    if (active) {
      await grantDerivedRoles({
        actorUserId: context.userId,
        positionId: data.position_id,
        userId: (active as any).user_id,
        assignmentId: (active as any).id,
      });
    }

    await logOrgAudit({
      actor_user_id: context.userId,
      action_type: "position_role_mapped",
      entity_id: data.position_id,
      new_values: { role_code: data.role_code },
    });
    return { ok: true };
  });

export const removePositionRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mapping_id: string }) =>
    z.object({ mapping_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertOrgStructureWrite(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: mapping } = await supabaseAdmin
      .from("position_role_mapping")
      .select("id, position_id, role_code")
      .eq("id", data.mapping_id)
      .maybeSingle();
    if (!mapping) throw new Error("الربط غير موجود");

    const { error } = await supabaseAdmin
      .from("position_role_mapping").delete().eq("id", data.mapping_id);
    if (error) throw new Error(error.message);

    // Remove the derived role from the current occupant only.
    const { data: active } = await supabaseAdmin
      .from("position_assignments")
      .select("id, user_id")
      .eq("position_id", (mapping as any).position_id)
      .eq("is_active", true)
      .maybeSingle();
    if (active) {
      await supabaseAdmin
        .from("user_role_assignments")
        .delete()
        .eq("source_position_assignment_id", (active as any).id)
        .eq("role_code", (mapping as any).role_code)
        .eq("source_type", "position");
    }

    await logOrgAudit({
      actor_user_id: context.userId,
      action_type: "position_role_unmapped",
      entity_id: (mapping as any).position_id,
      old_values: { role_code: (mapping as any).role_code },
    });
    return { ok: true };
  });

// -------------------- Occupant assignment --------------------

export const assignPosition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { position_id: string; user_id: string; notes?: string }) =>
    z.object({
      position_id: z.string().uuid(),
      user_id: z.string().uuid(),
      notes: z.string().max(500).optional(),
    }).parse(input))
  .handler(async ({ data, context }) => {
    await assertOrgStructureWrite(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const today = new Date().toISOString().slice(0, 10);

    // End any existing active assignment for this position (and its derived roles).
    const { data: current } = await supabaseAdmin
      .from("position_assignments")
      .select("id, user_id")
      .eq("position_id", data.position_id)
      .eq("is_active", true);
    for (const c of current ?? []) {
      await supabaseAdmin.from("position_assignments")
        .update({ is_active: false, assigned_to: today, updated_at: new Date().toISOString() } as any)
        .eq("id", (c as any).id);
      await revokeDerivedRoles({
        actorUserId: context.userId,
        assignmentId: (c as any).id,
        userId: (c as any).user_id,
      });
    }

    const { data: row, error } = await supabaseAdmin.from("position_assignments").insert({
      position_id: data.position_id,
      user_id: data.user_id,
      notes: data.notes ?? null,
      created_by: context.userId,
    } as any).select("id").single();
    if (error) throw new Error(error.message);

    const granted = await grantDerivedRoles({
      actorUserId: context.userId,
      positionId: data.position_id,
      userId: data.user_id,
      assignmentId: (row as any).id,
    });

    await logOrgAudit({
      actor_user_id: context.userId,
      action_type: "position_assigned",
      entity_id: data.position_id,
      notes: "تعيين شاغل للمنصب",
      new_values: { user_id: data.user_id, derived_roles: granted },
    });

    return { ok: true, granted_roles: granted };
  });

export const endAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { assignment_id: string }) =>
    z.object({ assignment_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertOrgStructureWrite(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row } = await supabaseAdmin
      .from("position_assignments")
      .select("id, user_id, position_id")
      .eq("id", data.assignment_id)
      .maybeSingle();
    if (!row) throw new Error("التعيين غير موجود");

    const { error } = await supabaseAdmin.from("position_assignments").update({
      is_active: false,
      assigned_to: new Date().toISOString().slice(0, 10),
      updated_at: new Date().toISOString(),
    } as any).eq("id", data.assignment_id);
    if (error) throw new Error(error.message);

    const removed = await revokeDerivedRoles({
      actorUserId: context.userId,
      assignmentId: data.assignment_id,
      userId: (row as any).user_id,
    });

    await logOrgAudit({
      actor_user_id: context.userId,
      action_type: "position_assignment_ended",
      entity_id: (row as any).position_id,
      old_values: { user_id: (row as any).user_id, revoked_roles: removed },
    });

    return { ok: true, revoked_roles: removed };
  });

/** Re-apply mapped roles for every active occupant (fixes drift). */
export const syncAllPositionRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOrgStructureWrite(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: actives } = await supabaseAdmin
      .from("position_assignments")
      .select("id, position_id, user_id")
      .eq("is_active", true);

    let granted = 0;
    for (const a of actives ?? []) {
      const res = await grantDerivedRoles({
        actorUserId: context.userId,
        positionId: (a as any).position_id,
        userId: (a as any).user_id,
        assignmentId: (a as any).id,
      });
      granted += res.length;
    }
    return { ok: true, granted };
  });
