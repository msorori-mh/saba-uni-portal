import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash } from "crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  MATERIALS_BUCKET,
  MATERIALS_SETTINGS_KEYS,
  MATERIAL_WEEK_MAX,
  MATERIAL_WEEK_MIN,
  buildMaterialsUsageReport,
  resolveMaterialsUploadPolicy,
  sanitizeFileName,
  type MaterialAccessLogEntry,
  type MaterialUsageEventRow,
  type MaterialUsageMaterialRow,
  type MaterialsUploadPolicy,
  type StudySystemTag,
  type LinkageMode,
} from "@/lib/course-materials.shared";

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
    .select("id, faculty_profile_id, course_section_id, status")
    .eq("id", materialId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.faculty_profile_id !== facultyProfileId) {
    throw new Error("ليس لديك صلاحية على هذه المادة");
  }
  return data as { id: string; course_section_id: string; status: string };
}

/**
 * Effective upload policy: site_settings may only NARROW the conservative
 * compiled-in defaults (D-16 final limits still pending). Missing/invalid
 * settings fall back to the defaults, so this never widens the baseline.
 */
async function getEffectiveMaterialsUploadPolicy(): Promise<MaterialsUploadPolicy> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("site_settings")
    .select("setting_key, setting_value")
    .in("setting_key", [
      MATERIALS_SETTINGS_KEYS.maxMb,
      MATERIALS_SETTINGS_KEYS.allowedMimeTypes,
      MATERIALS_SETTINGS_KEYS.allowedExtensions,
    ]);
  const values = new Map<string, string>();
  for (const row of (data ?? []) as { setting_key: string; setting_value: string | null }[]) {
    if (typeof row.setting_value === "string") values.set(row.setting_key, row.setting_value);
  }
  return resolveMaterialsUploadPolicy({
    maxMb: values.get(MATERIALS_SETTINGS_KEYS.maxMb),
    allowedMimeTypes: values.get(MATERIALS_SETTINGS_KEYS.allowedMimeTypes),
    allowedExtensions: values.get(MATERIALS_SETTINGS_KEYS.allowedExtensions),
  });
}

export const getMaterialsUploadPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return getEffectiveMaterialsUploadPolicy();
  });

export const getMyAssignedSectionsForMaterials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const fp = await getFacultyProfileForUser((context.supabase as any), context.userId);
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
    const fp = await getFacultyProfileForUser((context.supabase as any), context.userId);
    await assertOwnsSection((context.supabase as any), data.sectionId, fp.id);
    const { data: rows, error } = await (context.supabase as any)
      .from("course_materials")
      .select("id, title, description, week_number, lecture_number, study_system, status, published_at, created_at, updated_at, files:course_material_files(id, original_filename, mime_type, size_bytes, version_number, scan_state, uploaded_at)")
      .eq("course_section_id", data.sectionId)
      .order("week_number", { ascending: true, nullsFirst: false })
      .order("lecture_number", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createCourseMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      sectionId: z.string().uuid(),
      title: z.string().trim().min(1).max(200),
      description: z.string().trim().max(2000).optional().nullable(),
      week_number: z.number().int().min(MATERIAL_WEEK_MIN).max(MATERIAL_WEEK_MAX).optional().nullable(),
      lecture_number: z.number().int().min(1).max(200).optional().nullable(),
      study_system: z.enum(["regular", "parallel", "both"]),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const fp = await getFacultyProfileForUser((context.supabase as any), context.userId);
    await assertOwnsSection((context.supabase as any), data.sectionId, fp.id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("course_materials")
      .insert({
        course_section_id: data.sectionId,
        faculty_profile_id: fp.id,
        title: data.title,
        description: data.description ?? null,
        week_number: data.week_number ?? null,
        lecture_number: data.lecture_number ?? null,
        study_system: data.study_system,
        status: "draft",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await (supabaseAdmin as any).from("course_material_events").insert({
      course_material_id: row.id,
      actor_user_id: context.userId,
      event: "created",
    });
    return { id: row.id as string };
  });

export const updateCourseMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      materialId: z.string().uuid(),
      title: z.string().trim().min(1).max(200).optional(),
      description: z.string().trim().max(2000).nullable().optional(),
      week_number: z.number().int().min(MATERIAL_WEEK_MIN).max(MATERIAL_WEEK_MAX).nullable().optional(),
      lecture_number: z.number().int().min(1).max(200).nullable().optional(),
      study_system: z.enum(["regular", "parallel", "both"]).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const fp = await getFacultyProfileForUser((context.supabase as any), context.userId);
    const existing = await assertOwnsMaterial((context.supabase as any), data.materialId, fp.id);
    if (existing.status === "archived") throw new Error("المادة مؤرشفة");
    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description;
    if (data.week_number !== undefined) patch.week_number = data.week_number;
    if (data.lecture_number !== undefined) patch.lecture_number = data.lecture_number;
    if (data.study_system !== undefined) patch.study_system = data.study_system;
    if (Object.keys(patch).length === 0) return { ok: true as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("course_materials").update(patch).eq("id", data.materialId);
    if (error) throw new Error(error.message);
    await (supabaseAdmin as any).from("course_material_events").insert({
      course_material_id: data.materialId,
      actor_user_id: context.userId,
      event: "updated",
      meta: patch,
    });
    return { ok: true as const };
  });

export const uploadCourseMaterialFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      materialId: z.string().uuid(),
      fileBase64: z.string().min(1),
      filename: z.string().min(1).max(200),
      mimeType: z.string().min(1),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const fp = await getFacultyProfileForUser((context.supabase as any), context.userId);
    const material = await assertOwnsMaterial((context.supabase as any), data.materialId, fp.id);
    if (material.status === "archived") throw new Error("المادة مؤرشفة");

    const policy = await getEffectiveMaterialsUploadPolicy();
    if (!policy.allowedMimeTypes.includes(data.mimeType)) {
      throw new Error("نوع الملف غير مسموح به");
    }
    const ext = data.filename.split(".").pop()?.toLowerCase() ?? "";
    if (!policy.allowedExtensions.includes(ext)) {
      throw new Error("امتداد الملف غير مسموح به");
    }
    const buffer = Buffer.from(data.fileBase64, "base64");
    if (buffer.byteLength <= 0) throw new Error("الملف فارغ");
    if (buffer.byteLength > policy.maxBytes) {
      throw new Error(`حجم الملف يتجاوز ${policy.maxMb} ميجابايت`);
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
        scan_state: "pending",
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

async function eligibleStudentsForMaterial(
  supabaseAdmin: any,
  material: {
    id: string;
    course_section_id: string;
    study_system: StudySystemTag;
  },
  linkageMode: LinkageMode,
): Promise<string[]> {
  // Enrollment path
  const { data: enrolled } = await supabaseAdmin
    .from("student_enrollments")
    .select("student:student_profiles(user_id, study_system)")
    .eq("course_section_id", material.course_section_id)
    .eq("enrollment_status", "enrolled");
  type ER = { student: { user_id: string; study_system: string | null } | null };
  const enrolledIds = ((enrolled ?? []) as ER[])
    .map((r) => r.student)
    .filter((s): s is { user_id: string; study_system: string | null } => !!s?.user_id)
    .filter((s) => material.study_system === "both" || s.study_system === material.study_system)
    .map((s) => s.user_id);

  if (linkageMode === "enrollment_only") return Array.from(new Set(enrolledIds));

  // Cohort fallback: match on offering keys
  const { data: section } = await supabaseAdmin
    .from("course_sections")
    .select("offering:course_offerings(academic_year_id, semester_id, program_id, level_id)")
    .eq("id", material.course_section_id)
    .maybeSingle();
  const o = (section as any)?.offering as
    | { academic_year_id: string; semester_id: string; program_id: string; level_id: string }
    | null;
  if (!o) return Array.from(new Set(enrolledIds));

  const { data: cohort } = await supabaseAdmin
    .from("student_academic_status")
    .select("student:student_profiles(user_id, study_system, program_id)")
    .eq("academic_year_id", o.academic_year_id)
    .eq("semester_id", o.semester_id)
    .eq("level_id", o.level_id)
    .eq("enrollment_status", "enrolled");
  type CR = { student: { user_id: string; study_system: string | null; program_id: string | null } | null };
  const cohortIds = ((cohort ?? []) as CR[])
    .map((r) => r.student)
    .filter((s): s is { user_id: string; study_system: string | null; program_id: string | null } => !!s?.user_id)
    .filter((s) => s.program_id === o.program_id)
    .filter((s) => material.study_system === "both" || s.study_system === material.study_system)
    .map((s) => s.user_id);

  return Array.from(new Set([...enrolledIds, ...cohortIds]));
}

async function getLinkageMode(supabaseAdmin: any): Promise<LinkageMode> {
  const { data } = await supabaseAdmin
    .from("site_settings")
    .select("setting_value")
    .eq("setting_key", "materials_linkage_mode")
    .maybeSingle();
  // Secure default: enrollment_only. cohort_fallback stays supported in source
  // but must be opted into explicitly via site_settings.
  const v = (data?.setting_value as string | undefined) ?? "enrollment_only";
  return v === "cohort_fallback" ? "cohort_fallback" : "enrollment_only";
}

export const publishCourseMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ materialId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const fp = await getFacultyProfileForUser((context.supabase as any), context.userId);
    await assertOwnsMaterial((context.supabase as any), data.materialId, fp.id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Idempotency: already published event?
    const { data: prevEvent } = await supabaseAdmin
      .from("course_material_events")
      .select("id")
      .eq("course_material_id", data.materialId)
      .eq("event", "published")
      .limit(1);

    const { data: material, error } = await supabaseAdmin
      .from("course_materials")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", data.materialId)
      .select("id, course_section_id, study_system, title")
      .single();
    if (error) throw new Error(error.message);

    if (!prevEvent || prevEvent.length === 0) {
      await (supabaseAdmin as any).from("course_material_events").insert({
        course_material_id: data.materialId,
        actor_user_id: context.userId,
        event: "published",
      });
      // Notifications (in-portal only), idempotent by first publish
      try {
        const mode = await getLinkageMode(supabaseAdmin);
        const userIds = await eligibleStudentsForMaterial(supabaseAdmin, material as any, mode);
        if (userIds.length > 0) {
          const rows = userIds.map((uid) => ({
            user_id: uid,
            title: "مادة تعليمية جديدة",
            message: `تم نشر: ${(material as any).title}`,
            notification_type: "info",
            reference_type: "course_material",
            reference_id: data.materialId,
            is_read: false,
          }));
          await (supabaseAdmin as any).from("notifications").insert(rows);
        }
      } catch (e) {
        // Non-fatal
        console.error("[materials] notification dispatch failed", e);
      }
    }
    return { ok: true as const };
  });

export const archiveCourseMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ materialId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const fp = await getFacultyProfileForUser((context.supabase as any), context.userId);
    await assertOwnsMaterial((context.supabase as any), data.materialId, fp.id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("course_materials")
      .update({ status: "archived" })
      .eq("id", data.materialId);
    if (error) throw new Error(error.message);
    await (supabaseAdmin as any).from("course_material_events").insert({
      course_material_id: data.materialId,
      actor_user_id: context.userId,
      event: "archived",
    });
    return { ok: true as const };
  });

/**
 * Usage report for a section (faculty owner only): per-material download
 * counts, unique downloaders, last download, and scan-state inventory.
 * Read-only aggregation over course_material_events (access logs).
 */
export const getCourseMaterialsUsageReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ sectionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const fp = await getFacultyProfileForUser((context.supabase as any), context.userId);
    await assertOwnsSection((context.supabase as any), data.sectionId, fp.id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: materialRows, error: matsError } = await supabaseAdmin
      .from("course_materials")
      .select("id, title, status, week_number, lecture_number, files:course_material_files(scan_state)")
      .eq("course_section_id", data.sectionId);
    if (matsError) throw new Error(matsError.message);
    const materials = (materialRows ?? []) as unknown as MaterialUsageMaterialRow[];
    const materialIds = materials.map((material) => material.id);
    let events: MaterialUsageEventRow[] = [];
    if (materialIds.length > 0) {
      const { data: eventRows, error: eventsError } = await supabaseAdmin
        .from("course_material_events")
        .select("course_material_id, event, actor_user_id, created_at")
        .in("course_material_id", materialIds)
        .eq("event", "downloaded");
      if (eventsError) throw new Error(eventsError.message);
      events = (eventRows ?? []) as MaterialUsageEventRow[];
    }
    return buildMaterialsUsageReport(data.sectionId, materials, events, new Date().toISOString());
  });

/**
 * Access log (audit trail) for a single material (faculty owner only):
 * most recent lifecycle/access events, newest first, capped at 100 rows.
 */
export const listCourseMaterialAccessLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      materialId: z.string().uuid(),
      limit: z.number().int().min(1).max(100).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const fp = await getFacultyProfileForUser((context.supabase as any), context.userId);
    await assertOwnsMaterial((context.supabase as any), data.materialId, fp.id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("course_material_events")
      .select("event, actor_user_id, created_at, meta")
      .eq("course_material_id", data.materialId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (error) throw new Error(error.message);
    type EventRow = {
      event: string;
      actor_user_id: string | null;
      created_at: string;
      meta: { file_id?: string | null } | null;
    };
    return ((rows ?? []) as EventRow[]).map((row): MaterialAccessLogEntry => ({
      event: row.event,
      actorUserId: row.actor_user_id ?? null,
      createdAt: row.created_at,
      fileId: typeof row.meta?.file_id === "string" ? row.meta.file_id : null,
    }));
  });
