import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  MATERIALS_BUCKET,
  isMaterialFileDownloadable,
  type LinkageMode,
  type StudySystemTag,
} from "@/lib/course-materials.shared";
import { fetchCanonicalCurrentTerm, type CurrentTermClient } from "@/lib/current-term";
import {
  canAccessPublishedMaterial,
  exactCurrentMaterialSectionIds,
  materialStudySystemMatches,
  type MaterialEnrollmentRow,
} from "@/lib/materials-audience";

/* eslint-disable @typescript-eslint/no-explicit-any */

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
  // Secure default: enrollment_only. cohort_fallback stays supported in source
  // but must be opted into explicitly via site_settings.
  const v = (data?.setting_value as string | undefined) ?? "enrollment_only";
  return v === "cohort_fallback" ? "cohort_fallback" : "enrollment_only";
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
  // Preserve the setting surface, but never use either mode to infer sibling
  // sections. Exact current enrollment is the only authoritative audience.
  void mode;
  const currentTerm = await fetchCanonicalCurrentTerm(
    supabaseAdmin as unknown as CurrentTermClient,
  );
  if (!currentTerm) return new Set<string>();

  const { data: enrolled, error } = await supabaseAdmin
    .from("student_enrollments")
    .select("course_section_id, enrollment_status, section:course_sections(status, offering:course_offerings(academic_year_id, semester_id, status))")
    .eq("student_profile_id", student.id)
    .eq("enrollment_status", "enrolled");
  if (error) throw new Error(error.message);
  return exactCurrentMaterialSectionIds(
    (enrolled ?? []) as unknown as MaterialEnrollmentRow[],
    currentTerm,
  );
}

export const listStudentCourseMaterials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const student = await getStudentProfile((context.supabase as any), context.userId);
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
      if (!materialStudySystemMatches(m.study_system, student.study_system)) continue;
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
    const student = await getStudentProfile((context.supabase as any), context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const mode = await getLinkageMode(supabaseAdmin);
    const sectionIds = await eligibleSectionIdsForStudent(supabaseAdmin, student, mode);
    if (!sectionIds.has(data.sectionId)) throw new Error("لا يمكنك الوصول إلى مواد هذه المجموعة");

    const { data: rows } = await supabaseAdmin
      .from("course_materials")
      .select("id, title, description, week_number, lecture_number, study_system, material_scope, plan_session_id, published_at, files:course_material_files(id, original_filename, mime_type, size_bytes, version_number, scan_state, uploaded_at)")
      .eq("course_section_id", data.sectionId)
      .eq("status", "published")
      .order("week_number", { ascending: true, nullsFirst: false })
      .order("lecture_number", { ascending: true, nullsFirst: false })
      .order("published_at", { ascending: false });

    // Student-safe plan projection: only the official planned title/topics of
    // the CURRENT plan. Execution reasons/notes are never exposed here.
    const { data: plan } = await supabaseAdmin
      .from("course_delivery_plans")
      .select("id")
      .eq("course_section_id", data.sectionId)
      .eq("is_current", true)
      .maybeSingle();
    const topicsBySession = new Map<string, string | null>();
    if (plan) {
      const { data: sessions } = await supabaseAdmin
        .from("course_delivery_plan_sessions")
        .select("id, planned_topics")
        .eq("plan_id", (plan as any).id);
      for (const s of ((sessions ?? []) as any[])) topicsBySession.set(s.id, s.planned_topics ?? null);
    }

    type R = { id: string; title: string; description: string | null; week_number: number | null; lecture_number: number | null; study_system: StudySystemTag; material_scope: string; plan_session_id: string | null; published_at: string | null; files: any[] };
    return ((rows ?? []) as R[])
      .filter((m) => canAccessPublishedMaterial({
        eligibleSectionIds: sectionIds,
        sectionId: data.sectionId,
        status: "published",
        materialTag: m.study_system,
        studentSystem: student.study_system,
      }))
      // Fail-closed: files are hidden from students until the malware scan marks them clean.
      .map((m) => ({
        ...m,
        material_scope: m.material_scope === "lecture" ? "lecture" : "general",
        planned_topics: m.plan_session_id ? (topicsBySession.get(m.plan_session_id) ?? null) : null,
        files: (m.files ?? []).filter((f) => isMaterialFileDownloadable(f?.scan_state)),
      }));
  });

export const getCourseMaterialDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ fileId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: file, error } = await supabaseAdmin
      .from("course_material_files")
      .select("id, storage_path, scan_state, course_material_id, material:course_materials(id, course_section_id, study_system, status, faculty_profile_id)")
      .eq("id", data.fileId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!file) throw new Error("الملف غير موجود");
    const material = (file as any).material as {
      id: string; course_section_id: string; study_system: StudySystemTag; status: string; faculty_profile_id: string;
    } | null;
    if (!material) throw new Error("الملف غير مرتبط بمادة");

    // Faculty owner shortcut
    const { data: fp } = await (context.supabase as any)
      .from("faculty_profiles")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    const isOwner = !!fp && (fp as any).id === material.faculty_profile_id;

    if (!isOwner) {
      const student = await getStudentProfile((context.supabase as any), context.userId);
      const mode = await getLinkageMode(supabaseAdmin);
      const sectionIds = await eligibleSectionIdsForStudent(supabaseAdmin, student, mode);
      if (!canAccessPublishedMaterial({
        eligibleSectionIds: sectionIds,
        sectionId: material.course_section_id,
        status: material.status,
        materialTag: material.study_system,
        studentSystem: student.study_system,
      })) throw new Error("لا يمكنك الوصول إلى هذا الملف");
    }

    // Fail-closed scan gate: no file access before scan_state = 'clean' (applies to everyone).
    if (!isMaterialFileDownloadable((file as any).scan_state)) {
      throw new Error("الملف غير متاح بعد (قيد الفحص أو غير آمن)");
    }

    const { data: signed, error: sErr } = await (supabaseAdmin as any).storage
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
