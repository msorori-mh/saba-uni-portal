import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const NEWS_ADMIN_ROLES = ["system_admin", "admin"] as const;

async function assertNewsAdmin(userId: string) {
  await assertAnyRole(userId, NEWS_ADMIN_ROLES, "ليس لديك صلاحية إدارة الأخبار");
}

export const listAdminNews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertNewsAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("news")
      .select("*")
      .order("published_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertAdminNews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        slug: z.string().min(1),
        title_ar: z.string().min(3),
        title_en: z.string().nullable(),
        content_ar: z.string().nullable(),
        content_en: z.string().nullable(),
        excerpt_ar: z.string().nullable(),
        excerpt_en: z.string().nullable(),
        featured_image: z.string().nullable(),
        category: z.string().min(1),
        is_published: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertNewsAdmin(context.userId);
    const payload = {
      slug: data.slug.trim(),
      title_ar: data.title_ar.trim(),
      title_en: data.title_en?.trim() || null,
      content_ar: data.content_ar?.trim() || null,
      content_en: data.content_en?.trim() || null,
      excerpt_ar: data.excerpt_ar?.trim() || null,
      excerpt_en: data.excerpt_en?.trim() || null,
      featured_image: data.featured_image,
      category: data.category,
      is_published: data.is_published,
    };

    if (data.id) {
      const { error } = await supabaseAdmin.from("news").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    const { data: row, error } = await supabaseAdmin
      .from("news")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteAdminNews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertNewsAdmin(context.userId);
    const { error } = await supabaseAdmin.from("news").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const toggleAdminNewsPublish = createServerFn({ method: "POST" })
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
    await assertNewsAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("news")
      .update({ is_published: data.is_published })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
