import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash, randomUUID } from "crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  MATERIALS_ALLOWED_MIME,
  MATERIALS_ALLOWED_EXT,
  MATERIALS_MAX_BYTES_DEFAULT,
  MATERIALS_BUCKET,
  sanitizeFileName,
} from "@/lib/course-materials.shared";
import { mutateCourseMaterialAtomically } from "@/lib/materials-atomic-mutation";

/* eslint-disable @typescript-eslint/no-explicit-any */
// NOTE: `course_materials*` tables are not yet in supabase/types.ts (migration not applied).
// Server-side calls cast clients to `any` until types are regenerated post-migration.

async function getFacultyProfileForUser(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("faculty_profiles")
    .select("id, status")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("لا يوجد ملف عضو هيئة تدريس");
  return data as { id: string; status: string };
}

async function assertOwnsSection(supabase: any, sectionId: string, facultyProfileId: string) {
  const { data, error } = await supabase
    .from("course_sections")
    .select("id, faculty_profile_id")
    .eq("id", sectionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.faculty_profile_id !== facultyProfileId) {
    throw new Error("ليس لديك صلاحية على هذه المجموعة");
  }
}

async function assertOwnsMaterial(supabase: any, materialId: string, facultyProfileId: string) {
  const { data, error } = await supabase
    .from("course_materials")
    .select("id, faculty_profile_id, course_section_id, status, updated_at")
    .eq("id", materialId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.faculty_profile_id !== facultyProfileId) {
    throw new Error("ليس لديك صلاحية على هذه المادة");
  }
  return data as { id: string; course_section_id: string; status: string; updated_at: string };
}

export const getMyAssignedSectionsForMaterials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const fp = await getFacultyProfileForUser(context.supabase as any, context.userId);
    const { data, error } = await (context.supabase as any)
      .from("course_sections")
      .select(
        "id, section_code, status, offering:course_offerings(academic_year:academic_years(name_ar), semester:semesters(name_ar), program:programs(name_ar), level:academic_levels(name_ar), course:courses(code, name_ar))",
      )
      .eq("faculty_profile_id", fp.id)
      .eq("status", "active");
    if (error) throw new Error(error.message);
    type Raw = {
      id: string;
      section_code: string;
      offering: {
        academic_year: { name_ar: string } | null;
        semester: { name_ar: string } | null;
        program: { name_ar: string } | null;
        level: { name_ar: string } | null;
        course: { code: string; name_ar: string } | null;
      } | null;
    };
    return ((data ?? []) as unknown as Raw[]).map((r) => ({
      id: r.id,
      section_code: r.section_code,
      course_code: r.offering?.course?.code ?? "—",
      course_name: r.offering?.course?.name_ar ?? "—",
      program_name: r.offering?.program?.name_ar ?? null,
      level_name: r.offering?.level?.name_ar ?? null,
      semester_name: r.offering?.semester?.name_ar ?? null,
      year_name: r.offering?.academic_year?.name_ar ?? null,
    }));
  });

export const listMyCourseMaterials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ sectionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const fp = await getFacultyProfileForUser(context.supabase as any, context.userId);
    await assertOwnsSection(context.supabase as any, data.sectionId, fp.id);
    const { data: rows, error } = await (context.supabase as any)
      .from("course_materials")
      .select(
        "id, title, description, lecture_number, study_system, status, published_at, created_at, updated_at, files:course_material_files(id, original_filename, mime_type, size_bytes, version_number, uploaded_at)",
      )
      .eq("course_section_id", data.sectionId)
      .order("lecture_number", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createCourseMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        sectionId: z.string().uuid(),
        title: z.string().trim().min(1).max(200),
        description: z.string().trim().max(2000).optional().nullable(),
        lecture_number: z.number().int().min(1).max(200).optional().nullable(),
        study_system: z.enum(["regular", "parallel", "both"]),
        mutationId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const row = await mutateCourseMaterialAtomically(context.supabase as any, {
      action: "create",
      sectionId: data.sectionId,
      idempotencyKey: data.mutationId ?? randomUUID(),
      patch: {
        title: data.title,
        description: data.description ?? null,
        lecture_number: data.lecture_number ?? null,
        study_system: data.study_system,
      },
    });
    return { id: row.material_id };
  });

export const updateCourseMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        materialId: z.string().uuid(),
        title: z.string().trim().min(1).max(200).optional(),
        description: z.string().trim().max(2000).nullable().optional(),
        lecture_number: z.number().int().min(1).max(200).nullable().optional(),
        study_system: z.enum(["regular", "parallel", "both"]).optional(),
        mutationId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const fp = await getFacultyProfileForUser(context.supabase as any, context.userId);
    const existing = await assertOwnsMaterial(context.supabase as any, data.materialId, fp.id);
    if (existing.status === "archived") throw new Error("المادة مؤرشفة");
    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description;
    if (data.lecture_number !== undefined) patch.lecture_number = data.lecture_number;
    if (data.study_system !== undefined) patch.study_system = data.study_system;
    if (Object.keys(patch).length === 0) return { ok: true as const };
    await mutateCourseMaterialAtomically(context.supabase as any, {
      action: "update",
      materialId: data.materialId,
      expectedUpdatedAt: existing.updated_at,
      idempotencyKey: data.mutationId ?? randomUUID(),
      patch,
    });
    return { ok: true as const };
  });

export const uploadCourseMaterialFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        materialId: z.string().uuid(),
        fileBase64: z.string().min(1),
        filename: z.string().min(1).max(200),
        mimeType: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const fp = await getFacultyProfileForUser(context.supabase as any, context.userId);
    const material = await assertOwnsMaterial(context.supabase as any, data.materialId, fp.id);
    if (material.status === "archived") throw new Error("المادة مؤرشفة");

    if (!(MATERIALS_ALLOWED_MIME as readonly string[]).includes(data.mimeType)) {
      throw new Error("نوع الملف غير مسموح به");
    }
    const ext = data.filename.split(".").pop()?.toLowerCase() ?? "";
    if (!(MATERIALS_ALLOWED_EXT as readonly string[]).includes(ext)) {
      throw new Error("امتداد الملف غير مسموح به");
    }
    const buffer = Buffer.from(data.fileBase64, "base64");
    if (buffer.byteLength <= 0) throw new Error("الملف فارغ");
    if (buffer.byteLength > MATERIALS_MAX_BYTES_DEFAULT) {
      throw new Error("حجم الملف يتجاوز 25 ميجابايت");
    }
    const hash = createHash("sha256").update(buffer).digest("hex");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Next version
    const { data: prev } = await supabaseAdmin
      .from("course_material_files")
      .select("version_number")
      .eq("course_material_id", data.materialId)
      .order("version_number", { ascending: false })
      .limit(1);
    const nextVersion = ((prev?.[0]?.version_number as number | undefined) ?? 0) + 1;
    const safeName = sanitizeFileName(data.filename);
    const storagePath = `${material.course_section_id}/${data.materialId}/${nextVersion}-${safeName}`;

    const { error: upErr } = await (supabaseAdmin as any).storage
      .from(MATERIALS_BUCKET)
      .upload(storagePath, buffer, { contentType: data.mimeType, upsert: false });
    if (upErr) throw new Error(upErr.message);

    const { data: fileRow, error: insErr } = await supabaseAdmin
      .from("course_material_files")
      .insert({
        course_material_id: data.materialId,
        storage_path: storagePath,
        original_filename: data.filename,
        mime_type: data.mimeType,
        size_bytes: buffer.byteLength,
        file_hash: hash,
        version_number: nextVersion,
      })
      .select("id")
      .single();
    if (insErr) {
      await (supabaseAdmin as any).storage.from(MATERIALS_BUCKET).remove([storagePath]);
      throw new Error(insErr.message);
    }
    await (supabaseAdmin as any).from("course_material_events").insert({
      course_material_id: data.materialId,
      actor_user_id: context.userId,
      event: "file_uploaded",
      meta: { file_id: fileRow.id, version_number: nextVersion },
    });
    return { id: fileRow.id as string, version_number: nextVersion };
  });

export const publishCourseMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ materialId: z.string().uuid(), mutationId: z.string().uuid().optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const fp = await getFacultyProfileForUser(context.supabase as any, context.userId);
    const existing = await assertOwnsMaterial(context.supabase as any, data.materialId, fp.id);
    await mutateCourseMaterialAtomically(context.supabase as any, {
      action: "publish",
      materialId: data.materialId,
      expectedUpdatedAt: existing.updated_at,
      idempotencyKey: data.mutationId ?? randomUUID(),
    });

    return { ok: true as const };
  });

export const archiveCourseMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ materialId: z.string().uuid(), mutationId: z.string().uuid().optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const fp = await getFacultyProfileForUser(context.supabase as any, context.userId);
    const existing = await assertOwnsMaterial(context.supabase as any, data.materialId, fp.id);
    await mutateCourseMaterialAtomically(context.supabase as any, {
      action: "archive",
      materialId: data.materialId,
      expectedUpdatedAt: existing.updated_at,
      idempotencyKey: data.mutationId ?? randomUUID(),
    });
    return { ok: true as const };
  });
