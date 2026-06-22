import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAuditLogFullRead } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const listAuditLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      from: z.string().optional(),
      to: z.string().optional(),
      entityType: z.string().optional(),
      actionType: z.string().optional(),
      actorUserId: z.string().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAuditLogFullRead(context.userId);
    let q = supabaseAdmin
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.from) q = q.gte("created_at", new Date(data.from).toISOString());
    if (data.to) {
      const end = new Date(data.to);
      end.setDate(end.getDate() + 1);
      q = q.lt("created_at", end.toISOString());
    }
    if (data.entityType) q = q.eq("entity_type", data.entityType);
    if (data.actionType) q = q.eq("action_type", data.actionType);
    if (data.actorUserId?.trim()) q = q.eq("actor_user_id", data.actorUserId.trim());
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
