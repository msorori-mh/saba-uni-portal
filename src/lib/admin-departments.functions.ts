import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const DEPARTMENTS_ADMIN_ROLES = ["system_admin", "admin"] as const;

const degreeTypeSchema = z.enum(["بكالوريوس", "ماجستير", "دبلوم", "دكتوراه"]);

async function assertDepartmentsAdmin(userId: string) {
  await assertAnyRole(
    userId,
    DEPARTMENTS_ADMIN_ROLES,
    "ليس لديك صلاحية إدارة الأقسام والبرامج",
  );
}

export const listDepartments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertDepartmentsAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("departments")
      .select("*")
      .order("sort_order");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listProgramsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertDepartmentsAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("programs")
      .select("*")
      .order("sort_order");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listDepartmentOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertDepartmentsAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("departments")
      .select("id, name_ar")
      .order("sort_order");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const uploadDepartmentImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      fileBase64: z.string().min(1),
      contentType: z.string().regex(/^image\//),
      fileName: z.string().min(1).max(200),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertDepartmentsAdmin(context.userId);
    const buffer = Buffer.from(data.fileBase64, "base64");
    if (buffer.byteLength > 5 * 1024 * 1024) {
      throw new Error("الحد الأقصى 5 ميجابايت");
    }
    const ext = data.fileName.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabaseAdmin.storage
      .from("department-images")
      .upload(path, buffer, { contentType: data.contentType, upsert: false });
    if (error) throw new Error(error.message);
    const { data: urlData } = supabaseAdmin.storage
      .from("department-images")
      .getPublicUrl(path);
    return { publicUrl: urlData.publicUrl };
  });

export const upsertDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      name_ar: z.string().min(3),
      name_en: z.string().nullable(),
      description_ar: z.string().nullable(),
      description_en: z.string().nullable(),
      image: z.string().nullable(),
      sort_order: z.number().int(),
      is_active: z.boolean(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertDepartmentsAdmin(context.userId);
    const payload = {
      name_ar: data.name_ar.trim(),
      name_en: data.name_en?.trim() || null,
      description_ar: data.description_ar?.trim() || null,
      description_en: data.description_en?.trim() || null,
      image: data.image,
      sort_order: data.sort_order,
      is_active: data.is_active,
    };

    if (data.id) {
      const { error } = await supabaseAdmin
        .from("departments")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    const { data: row, error } = await supabaseAdmin
      .from("departments")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertDepartmentsAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("departments")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const upsertProgram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      name_ar: z.string().min(3),
      name_en: z.string().nullable(),
      code: z.string().min(1),
      description_ar: z.string().nullable(),
      department_id: z.string().uuid(),
      degree_type: degreeTypeSchema,
      years: z.number().int().min(1).max(10),
      sort_order: z.number().int(),
      is_active: z.boolean(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertDepartmentsAdmin(context.userId);
    const payload = {
      name_ar: data.name_ar.trim(),
      name_en: data.name_en?.trim() || null,
      code: data.code.trim(),
      description_ar: data.description_ar?.trim() || null,
      department_id: data.department_id,
      degree_type: data.degree_type,
      years: data.years,
      sort_order: data.sort_order,
      is_active: data.is_active,
    };

    if (data.id) {
      const { error } = await supabaseAdmin
        .from("programs")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    const { data: row, error } = await supabaseAdmin
      .from("programs")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteProgram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertDepartmentsAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("programs")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
