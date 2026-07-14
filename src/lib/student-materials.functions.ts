import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MATERIALS_BUCKET, type LinkageMode, type StudySystemTag } from "@/lib/course-materials.shared";

async function getStudentProfile(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("student_profiles")
    .select("id, user_id, program_id, study_system")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("لا يوجد ملف طالب");
  return data as { id: string; user_id: string; program_id: string | null; study_system: string | null };
}

async function getLinkageMode(supabaseAdmin: any): Promise<LinkageMode> {
  const { data } = await supabaseAdmin
    .from("site_settings")
    .select("setting_value")
    .eq("setting_key", "materials_linkage_mode")
    .maybeSingle();
  const v = (data?.setting_value as string | undefined) ?? "cohort_fallback";
  return v === "enrollment_only" ? "enrollment_only" : "cohort_fallback";
}

/**
 * Returns the set of course_section_ids the student is entitled to see published materials for.
 * Fail-closed: any missing key excludes the section from cohort fallback.
 */
async function eligibleSectionIdsForStudent(
  supabaseAdmin: any,
  student: { id: string; program_id: string | null; study_system: string | null },
  mode: LinkageMode,
): Promise<Set<string>> {
  const result = new Set<string>();
  const { data: enrolled } = await supabaseAdmin
    .from("student_enrollments")
    .select("course_section_id")
    .eq("student_profile_id", student.id)
    .eq("enrollment_status", "enrolled");
  for (const r of ((enrolled ?? []) as { course_section_id: string }[])) result.add(r.course_section_id);

  if (mode === "enrollment_only") return result;
  if (!student.program_id || !student.study_system) return result;

  const { data: statuses } = await supabaseAdmin
    .from("student_academic_status")
    .select("academic_year_id, semester_id, level_id")
    .eq("student_profile_id", student.id)
    .eq("enrollment_status", "enrolled");
  const keys = (statuses ?? []) as { academic_year_id: string; semester_id: string; level_id: string }[];
  if (keys.length === 0) return result;

  for (const k of keys) {
    if (!k.academic_year_id || !k.semester_id || !k.level_id) continue;
    const { data: offerings } = await supabaseAdmin
      .from("course_offerings")
      .select("id, sections:course_sections(id)")
      .eq("academic_year_id", k.academic_year_id)
      .eq("semester_id", k.semester_id)
      .eq("level_id", k.level_id)
      .eq("program_id", student.program_id);
    type O = { id: string; sections: { id: string }[] | null };
    for (const o of ((offerings ?? []) as O[])) {
      for (const s of o.sections ?? []) result.add(s.id);
    }
  }
  return result;
}

function studySystemMatches(materialTag: StudySystemTag, studentSystem: string | null): boolean {
  if (materialTag === "both") return true;
  return !!studentSystem && studentSystem === materialTag;
}

export const listStudentCourseMaterials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const student = await getStudentProfile(((((context.supabase) as any)) as any), context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const mode = await getLinkageMode(supabaseAdmin);
    const sectionIds = await eligibleSectionIdsForStudent(supabaseAdmin, student, mode);
    if (sectionIds.size === 0) return [] as Array<{ section_id: string; course_code: string; course_name: string; material_count: number }>;

    const ids = Array.from(sectionIds);
    const { data: sections } = await supabaseAdmin
      .from("course_sections")
      .select("id, section_code, offering:course_offerings(course:courses(code, name_ar))")
      .in("id", ids);

    const { data: materials } = await supabaseAdmin
      .from("course_materials")
      .select("id, course_section_id, study_system")
      .in("course_section_id", ids)
      .eq("status", "published");

    const countBySection = new Map<string, number>();
    for (const m of ((materials ?? []) as { course_section_id: string; study_system: StudySystemTag }[])) {
      if (!studySystemMatches(m.study_system, student.study_system)) continue;
      countBySection.set(m.course_section_id, (countBySection.get(m.course_section_id) ?? 0) + 1);
    }

    type S = { id: string; section_code: string; offering: { course: { code: string; name_ar: string } | null } | null };
    return ((sections ?? []) as S[])
      .map((s) => ({
        section_id: s.id,
        section_code: s.section_code,
        course_code: s.offering?.course?.code ?? "—",
        course_name: s.offering?.course?.name_ar ?? "—",
        material_count: countBySection.get(s.id) ?? 0,
      }))
      .filter((s) => s.material_count > 0);
  });

export const listStudentMaterialsForCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ sectionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const student = await getStudentProfile(((((context.supabase) as any)) as any), context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const mode = await getLinkageMode(supabaseAdmin);
    const sectionIds = await eligibleSectionIdsForStudent(supabaseAdmin, student, mode);
    if (!sectionIds.has(data.sectionId)) throw new Error("لا يمكنك الوصول إلى مواد هذه المجموعة");

    const { data: rows } = await supabaseAdmin
      .from("course_materials")
      .select("id, title, description, lecture_number, study_system, published_at, files:course_material_files(id, original_filename, mime_type, size_bytes, version_number, uploaded_at)")
      .eq("course_section_id", data.sectionId)
      .eq("status", "published")
      .order("lecture_number", { ascending: true, nullsFirst: false })
      .order("published_at", { ascending: false });

    type R = { id: string; title: string; description: string | null; lecture_number: number | null; study_system: StudySystemTag; published_at: string | null; files: any[] };
    return ((rows ?? []) as R[]).filter((m) => studySystemMatches(m.study_system, student.study_system));
  });

export const getCourseMaterialDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ fileId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: file, error } = await supabaseAdmin
      .from("course_material_files")
      .select("id, storage_path, course_material_id, material:course_materials(id, course_section_id, study_system, status, faculty_profile_id)")
      .eq("id", data.fileId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!file) throw new Error("الملف غير موجود");
    const material = (file as any).material as {
      id: string; course_section_id: string; study_system: StudySystemTag; status: string; faculty_profile_id: string;
    } | null;
    if (!material) throw new Error("الملف غير مرتبط بمادة");

    // Faculty owner shortcut
    const { data: fp } = await ((context.supabase) as any)
      .from("faculty_profiles")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    const isOwner = !!fp && (fp as any).id === material.faculty_profile_id;

    if (!isOwner) {
      if (material.status !== "published") throw new Error("المادة غير متاحة");
      const student = await getStudentProfile(((((context.supabase) as any)) as any), context.userId);
      const mode = await getLinkageMode(supabaseAdmin);
      const sectionIds = await eligibleSectionIdsForStudent(supabaseAdmin, student, mode);
      if (!sectionIds.has(material.course_section_id)) throw new Error("لا يمكنك الوصول إلى هذا الملف");
      if (!studySystemMatches(material.study_system, student.study_system)) throw new Error("لا يمكنك الوصول إلى هذا الملف");
    }

    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from(MATERIALS_BUCKET)
      .createSignedUrl((file as any).storage_path, 60);
    if (sErr || !signed?.signedUrl) throw new Error(sErr?.message ?? "تعذّر إنشاء رابط التنزيل");

    await supabaseAdmin.from("course_material_events").insert({
      course_material_id: material.id,
      actor_user_id: context.userId,
      event: "downloaded",
      meta: { file_id: data.fileId },
    });
    return { url: signed.signedUrl };
  });
