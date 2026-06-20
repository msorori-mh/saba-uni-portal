import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const ACADEMIC_CORE_ADMIN_ROLES = [
  "system_admin",
  "admin",
  "dean",
  "registrar",
] as const;

const statusSchema = z.enum(["active", "archived"]);
const semesterCodeSchema = z.enum(["first", "second"]);

async function assertAcademicCoreAdmin(userId: string) {
  await assertAnyRole(
    userId,
    ACADEMIC_CORE_ADMIN_ROLES,
    "ليس لديك صلاحية إدارة البنية الأكاديمية",
  );
}

export const listAcademicYears = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAcademicCoreAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("academic_years")
      .select("*")
      .order("start_date", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertAcademicYear = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      name: z.string().min(1),
      start_date: z.string().min(1),
      end_date: z.string().min(1),
      is_current: z.boolean(),
      status: statusSchema,
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAcademicCoreAdmin(context.userId);
    const payload = {
      name: data.name.trim(),
      start_date: data.start_date,
      end_date: data.end_date,
      is_current: data.is_current,
      status: data.status,
    };

    if (data.is_current) {
      const clearQ = supabaseAdmin.from("academic_years").update({ is_current: false });
      if (data.id) await clearQ.neq("id", data.id);
      else await clearQ;
    }

    if (data.id) {
      const { error } = await supabaseAdmin
        .from("academic_years")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    const { data: row, error } = await supabaseAdmin
      .from("academic_years")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteAcademicYear = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAcademicCoreAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("academic_years")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const listSemesters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAcademicCoreAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("semesters")
      .select("*")
      .order("start_date", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertSemester = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      academic_year_id: z.string().uuid(),
      name: z.string().min(1),
      code: semesterCodeSchema,
      start_date: z.string().min(1),
      end_date: z.string().min(1),
      is_current: z.boolean(),
      status: statusSchema,
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAcademicCoreAdmin(context.userId);
    const payload = {
      academic_year_id: data.academic_year_id,
      name: data.name.trim(),
      code: data.code,
      start_date: data.start_date,
      end_date: data.end_date,
      is_current: data.is_current,
      status: data.status,
    };

    if (data.is_current) {
      let clearQ = supabaseAdmin
        .from("semesters")
        .update({ is_current: false })
        .eq("academic_year_id", data.academic_year_id);
      if (data.id) clearQ = clearQ.neq("id", data.id);
      await clearQ;
    }

    if (data.id) {
      const { error } = await supabaseAdmin
        .from("semesters")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    const { data: row, error } = await supabaseAdmin
      .from("semesters")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteSemester = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAcademicCoreAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("semesters")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const listAcademicLevels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAcademicCoreAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("academic_levels")
      .select("*")
      .order("level_number");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertAcademicLevel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      name: z.string().min(1),
      level_number: z.number().int().min(1),
      status: statusSchema,
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAcademicCoreAdmin(context.userId);
    const payload = {
      name: data.name.trim(),
      level_number: data.level_number,
      status: data.status,
    };

    if (data.id) {
      const { error } = await supabaseAdmin
        .from("academic_levels")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    const { data: row, error } = await supabaseAdmin
      .from("academic_levels")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteAcademicLevel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAcademicCoreAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("academic_levels")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
