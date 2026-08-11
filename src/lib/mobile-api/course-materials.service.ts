/* eslint-disable @typescript-eslint/no-explicit-any */
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
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveOwnStudentProfile, type StudentProfileIdentity } from "./student-identity";
import { MobileApiError } from "./errors";

export const COURSE_MATERIAL_SIGNED_URL_TTL_SECONDS = 60 as const;

async function getLinkageMode(): Promise<LinkageMode> {
  const { data } = await supabaseAdmin
    .from("site_settings")
    .select("setting_value")
    .eq("setting_key", "materials_linkage_mode")
    .maybeSingle();
  const v = (data?.setting_value as string | undefined) ?? "cohort_fallback";
  return v === "enrollment_only" ? "enrollment_only" : "cohort_fallback";
}

async function eligibleSectionIdsForStudent(
  student: StudentProfileIdentity,
  mode: LinkageMode,
): Promise<Set<string>> {
  void mode;
  const currentTerm = await fetchCanonicalCurrentTerm(
    supabaseAdmin as unknown as CurrentTermClient,
  );
  if (!currentTerm) return new Set<string>();

  const { data: enrolled, error } = await supabaseAdmin
    .from("student_enrollments")
    .select(
      "course_section_id, enrollment_status, section:course_sections(status, offering:course_offerings(academic_year_id, semester_id, status))",
    )
    .eq("student_profile_id", student.id)
    .eq("enrollment_status", "enrolled");
  if (error) {
    throw new MobileApiError(
      "SERVICE_UNAVAILABLE",
      "ENROLLMENT_LOOKUP_FAILED",
      "Unable to resolve enrollments",
      "تعذر تحميل التسجيلات",
    );
  }
  return exactCurrentMaterialSectionIds(
    (enrolled ?? []) as unknown as MaterialEnrollmentRow[],
    currentTerm,
  );
}

export async function listMobileCourseMaterials(userId: string) {
  const student = await resolveOwnStudentProfile(userId);
  const mode = await getLinkageMode();
  const sectionIds = await eligibleSectionIdsForStudent(student, mode);
  if (sectionIds.size === 0) return [];

  const ids = Array.from(sectionIds);
  const { data: sections } = await supabaseAdmin
    .from("course_sections")
    .select("id, section_code, offering:course_offerings(course:courses(code, name_ar))")
    .in("id", ids);

  const { data: materials } = await (supabaseAdmin as any)
    .from("course_materials")
    .select("id, course_section_id, study_system")
    .in("course_section_id", ids)
    .eq("status", "published");

  const countBySection = new Map<string, number>();
  for (const m of (materials ?? []) as {
    course_section_id: string;
    study_system: StudySystemTag;
  }[]) {
    if (!materialStudySystemMatches(m.study_system, student.study_system)) continue;
    countBySection.set(m.course_section_id, (countBySection.get(m.course_section_id) ?? 0) + 1);
  }

  type S = {
    id: string;
    section_code: string;
    offering: { course: { code: string; name_ar: string } | null } | null;
  };
  return ((sections ?? []) as S[])
    .map((s) => ({
      section_id: s.id,
      section_code: s.section_code,
      course_code: s.offering?.course?.code ?? "—",
      course_name: s.offering?.course?.name_ar ?? "—",
      material_count: countBySection.get(s.id) ?? 0,
    }))
    .filter((s) => s.material_count > 0);
}

export async function mintMobileCourseMaterialDownloadUrl(input: {
  userId: string;
  fileId: string;
}): Promise<{ url: string; expiresInSeconds: number }> {
  const student = await resolveOwnStudentProfile(input.userId);
  const { data: file, error } = await (supabaseAdmin as any)
    .from("course_material_files")
    .select(
      "id, storage_path, scan_state, course_material_id, material:course_materials(id, course_section_id, study_system, status, faculty_profile_id)",
    )
    .eq("id", input.fileId)
    .maybeSingle();

  if (error) {
    throw new MobileApiError(
      "SERVICE_UNAVAILABLE",
      "MATERIAL_LOOKUP_FAILED",
      "Unable to load material file",
      "تعذر تحميل ملف المادة",
    );
  }
  if (!file) {
    throw new MobileApiError(
      "NOT_FOUND",
      "MATERIAL_FILE_NOT_FOUND",
      "File not found",
      "الملف غير موجود",
    );
  }

  const material = (file as any).material as {
    id: string;
    course_section_id: string;
    study_system: StudySystemTag;
    status: string;
    faculty_profile_id: string;
  } | null;
  if (!material) {
    throw new MobileApiError(
      "NOT_FOUND",
      "MATERIAL_UNLINKED",
      "File not linked to a material",
      "الملف غير مرتبط بمادة",
    );
  }

  const mode = await getLinkageMode();
  const sectionIds = await eligibleSectionIdsForStudent(student, mode);
  if (
    !canAccessPublishedMaterial({
      eligibleSectionIds: sectionIds,
      sectionId: material.course_section_id,
      status: material.status,
      materialTag: material.study_system,
      studentSystem: student.study_system,
    })
  ) {
    throw new MobileApiError(
      "NOT_ALLOWED",
      "MATERIAL_ACCESS_DENIED",
      "Not allowed to access this file",
      "لا يمكنك الوصول إلى هذا الملف",
    );
  }

  if (!isMaterialFileDownloadable((file as any).scan_state)) {
    throw new MobileApiError(
      "INVALID_STATE",
      "MATERIAL_NOT_CLEAN",
      "File not available yet",
      "الملف غير متاح بعد (قيد الفحص أو غير آمن)",
    );
  }

  const storagePath = String((file as any).storage_path ?? "");
  if (
    !storagePath ||
    storagePath.includes("..") ||
    storagePath.startsWith("http://") ||
    storagePath.startsWith("https://")
  ) {
    throw new MobileApiError(
      "INVALID_STATE",
      "MATERIAL_PATH_INVALID",
      "Invalid storage path",
      "مسار التخزين غير صالح",
    );
  }

  const { data: signed, error: sErr } = await (supabaseAdmin as any).storage
    .from(MATERIALS_BUCKET)
    .createSignedUrl(storagePath, COURSE_MATERIAL_SIGNED_URL_TTL_SECONDS);
  if (sErr || !signed?.signedUrl) {
    throw new MobileApiError(
      "SERVICE_UNAVAILABLE",
      "SIGNED_URL_FAILED",
      "Unable to create download link",
      "تعذّر إنشاء رابط التنزيل",
    );
  }

  try {
    await (supabaseAdmin as any).from("course_material_events").insert({
      course_material_id: material.id,
      actor_user_id: input.userId,
      event: "downloaded",
      meta: { file_id: input.fileId, source: "mobile_api_v1" },
    });
  } catch {
    /* best-effort audit */
  }

  return {
    url: signed.signedUrl as string,
    expiresInSeconds: COURSE_MATERIAL_SIGNED_URL_TTL_SECONDS,
  };
}
