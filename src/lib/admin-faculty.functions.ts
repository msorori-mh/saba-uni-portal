import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const FACULTY_ADMIN_ROLES = ["system_admin", "admin"] as const;

async function assertFacultyAdmin(userId: string) {
  await assertAnyRole(userId, FACULTY_ADMIN_ROLES, "ليس لديك صلاحية إدارة أعضاء هيئة التدريس");
}

export const listAdminFaculty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        search: z.string().optional(),
        programFilter: z.string().optional(),
        rankFilter: z.string().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(25),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertFacultyAdmin(context.userId);
    let q = supabaseAdmin
      .from("faculty")
      .select("*", { count: "exact" })
      .order("sort_order")
      .order("full_name_ar");

    if (data.search?.trim()) {
      const s = data.search.trim();
      q = q.or(`full_name_ar.ilike.%${s}%,full_name_en.ilike.%${s}%,email.ilike.%${s}%`);
    }
    if (data.programFilter && data.programFilter !== "all") {
      q = q.eq("program_id", data.programFilter);
    }
    if (data.rankFilter && data.rankFilter !== "all") {
      q = q.eq("rank", data.rankFilter);
    }

    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    const { data: rows, count, error } = await q.range(from, to);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

export const listAdminProgramOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFacultyAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("programs")
      .select("id, name_ar")
      .order("sort_order");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listAdminFacultyPapers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ facultyId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertFacultyAdmin(context.userId);
    const { data: papers, error } = await supabaseAdmin
      .from("research_papers")
      .select("id, title_ar, publication_year, journal_name")
      .eq("faculty_id", data.facultyId)
      .order("publication_year", { ascending: false });
    if (error) throw new Error(error.message);
    return papers ?? [];
  });

export const upsertAdminFaculty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        full_name_ar: z.string().min(3),
        full_name_en: z.string().nullable(),
        employee_id: z.string().min(1),
        email: z.string().nullable(),
        phone: z.string().nullable(),
        degree: z.string().nullable(),
        rank: z.string().nullable(),
        program_id: z.string().uuid().nullable(),
        bio_ar: z.string().nullable(),
        specialization: z.string().nullable(),
        photo: z.string().nullable(),
        is_active: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertFacultyAdmin(context.userId);
    const payload = {
      full_name_ar: data.full_name_ar.trim(),
      full_name_en: data.full_name_en?.trim() || null,
      employee_id: data.employee_id.trim(),
      email: data.email?.trim() || null,
      phone: data.phone?.trim() || null,
      degree: data.degree?.trim() || null,
      rank: data.rank || null,
      program_id: data.program_id,
      bio_ar: data.bio_ar?.trim() || null,
      specialization: data.specialization,
      photo: data.photo,
      is_active: data.is_active,
    };

    if (data.id) {
      const { error } = await supabaseAdmin.from("faculty").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    const { data: row, error } = await supabaseAdmin
      .from("faculty")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteAdminFaculty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertFacultyAdmin(context.userId);
    const { error } = await supabaseAdmin.from("faculty").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
