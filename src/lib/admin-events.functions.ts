import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const EVENTS_ADMIN_ROLES = ["system_admin", "admin"] as const;

async function assertEventsAdmin(userId: string) {
  await assertAnyRole(userId, EVENTS_ADMIN_ROLES, "ليس لديك صلاحية إدارة الفعاليات");
}

export const listAdminEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertEventsAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("events")
      .select("*")
      .order("event_date", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertAdminEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        title_ar: z.string().min(1),
        title_en: z.string().nullable(),
        description_ar: z.string().nullable(),
        description_en: z.string().nullable(),
        event_date: z.string().min(1),
        event_time: z.string().nullable(),
        location: z.string().nullable(),
        registration_url: z.string().nullable(),
        image: z.string().nullable(),
        is_published: z.boolean(),
        is_featured: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertEventsAdmin(context.userId);
    const payload = {
      title_ar: data.title_ar.trim(),
      title_en: data.title_en?.trim() || null,
      description_ar: data.description_ar?.trim() || null,
      description_en: data.description_en?.trim() || null,
      event_date: data.event_date,
      event_time: data.event_time?.trim() || null,
      location: data.location?.trim() || null,
      registration_url: data.registration_url?.trim() || null,
      image: data.image,
      is_published: data.is_published,
      is_featured: data.is_featured,
    };

    if (data.id) {
      const { error } = await supabaseAdmin.from("events").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    const { data: row, error } = await supabaseAdmin
      .from("events")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteAdminEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertEventsAdmin(context.userId);
    const { error } = await supabaseAdmin.from("events").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const toggleAdminEventPublish = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        is_published: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertEventsAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("events")
      .update({ is_published: data.is_published })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
