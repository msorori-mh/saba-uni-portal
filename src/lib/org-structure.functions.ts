import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertOrgStructureRead,
  assertOrgStructureWrite,
} from "@/lib/authz.server";

export const listOrgStructure = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOrgStructureRead(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: positions }, { data: mappings }, { data: assignments }, authList] = await Promise.all([
      supabaseAdmin.from("organizational_positions").select("*").order("sort_order"),
      supabaseAdmin.from("position_role_mapping").select("*, roles_catalog:role_code(name_ar)"),
      supabaseAdmin.from("position_assignments").select("*").eq("is_active", true),
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

    const userMap = new Map<string, { email: string | null }>();
    for (const u of authList.data?.users ?? []) userMap.set(u.id, { email: u.email ?? null });

    return {
      positions: positions ?? [],
      mappings: mappings ?? [],
      assignments: (assignments ?? []).map((a: any) => ({
        ...a,
        user_email: userMap.get(a.user_id)?.email ?? null,
      })),
    };
  });

export const listAssignableUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOrgStructureWrite(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [auth, faculty, staff] = await Promise.all([
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      supabaseAdmin.from("faculty_profiles").select("user_id, full_name_ar").not("user_id", "is", null),
      supabaseAdmin.from("staff_profiles").select("user_id, full_name_ar").not("user_id", "is", null),
    ]);
    const nameByUser = new Map<string, string>();
    for (const r of faculty.data ?? []) nameByUser.set((r as any).user_id, (r as any).full_name_ar);
    for (const r of staff.data ?? []) nameByUser.set((r as any).user_id, (r as any).full_name_ar);
    return (auth.data?.users ?? [])
      .map((u) => ({ id: u.id, email: u.email ?? "", name: nameByUser.get(u.id) ?? u.email ?? "" }))
      .sort((a, b) => a.name.localeCompare(b.name, "ar"));
  });

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

    // End any existing active assignment for this position
    await supabaseAdmin.from("position_assignments").update({
      is_active: false,
      assigned_to: new Date().toISOString().slice(0, 10),
    }).eq("position_id", data.position_id).eq("is_active", true);

    const { error } = await supabaseAdmin.from("position_assignments").insert({
      position_id: data.position_id,
      user_id: data.user_id,
      notes: data.notes ?? null,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const endAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { assignment_id: string }) =>
    z.object({ assignment_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertOrgStructureWrite(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("position_assignments").update({
      is_active: false,
      assigned_to: new Date().toISOString().slice(0, 10),
    }).eq("id", data.assignment_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
