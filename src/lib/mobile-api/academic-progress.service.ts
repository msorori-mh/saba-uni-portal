import {
  computeStudentProgress,
  type StudentProgressDTO,
} from "@/lib/academic-status.functions";
import { resolveOwnStudentProfile } from "./student-identity";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Student-self academic progress — same DTO as getMyProgress / computeStudentProgress.
 */
export async function getMobileAcademicProgress(
  userId: string,
): Promise<StudentProgressDTO> {
  const profile = await resolveOwnStudentProfile(userId);
  const dto = await computeStudentProgress(profile.id);
  try {
    await supabaseAdmin.rpc("log_audit" as never, {
      _entity_type: "academic_status",
      _entity_id: dto.student.id,
      _action_type: "student_progress_viewed",
      _old: null,
      _new: { notes: dto.student.academic_number, source: "mobile_api_v1" },
      _notes: dto.student.academic_number,
    });
  } catch {
    /* audit best-effort */
  }
  return dto;
}

export type { StudentProgressDTO };
