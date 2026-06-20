import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const RESEARCH_ADMIN_ROLES = ["system_admin", "admin"] as const;

async function assertResearchAdmin(userId: string) {
  await assertAnyRole(userId, RESEARCH_ADMIN_ROLES, "ليس لديك صلاحية إدارة الأبحاث");
}

export const listAdminResearchPapers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertResearchAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("research_papers")
      .select("*")
      .order("publication_year", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listAdminResearchFacultyOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertResearchAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("faculty")
      .select("id, full_name_ar")
      .order("full_name_ar");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertAdminResearchPaper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        title_ar: z.string().min(1),
        title_en: z.string().nullable(),
        abstract_ar: z.string().nullable(),
        abstract_en: z.string().nullable(),
        authors: z.string().min(1),
        publication_year: z.number().int().min(1900).max(2100),
        journal_name: z.string().nullable(),
        faculty_id: z.string().uuid().nullable(),
        pdf_url: z.string().nullable(),
        external_url: z.string().nullable(),
        doi: z.string().nullable(),
        keywords: z.string().nullable(),
        is_published: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertResearchAdmin(context.userId);
    const payload = {
      title_ar: data.title_ar.trim(),
      title_en: data.title_en?.trim() || null,
      abstract_ar: data.abstract_ar?.trim() || null,
      abstract_en: data.abstract_en?.trim() || null,
      authors: data.authors.trim(),
      publication_year: data.publication_year,
      journal_name: data.journal_name?.trim() || null,
      faculty_id: data.faculty_id,
      pdf_url: data.pdf_url,
      external_url: data.external_url?.trim() || null,
      doi: data.doi?.trim() || null,
      keywords: data.keywords?.trim() || null,
      ...(data.is_published !== undefined ? { is_published: data.is_published } : {}),
    };

    if (data.id) {
      const { error } = await supabaseAdmin
        .from("research_papers")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    const { data: row, error } = await supabaseAdmin
      .from("research_papers")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteAdminResearchPaper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertResearchAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("research_papers")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
