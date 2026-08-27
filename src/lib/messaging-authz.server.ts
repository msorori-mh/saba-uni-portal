/**
 * Shared server-side messaging authorization.
 *
 * Single source of truth used by BOTH `searchMessageRecipients` (who may I
 * pick?) and `sendMessage` (may I actually send to this user?), so the two
 * can never drift. Fail-closed: any query error denies.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { userRoles } from "@/lib/authz.server";

/** Administrative roles allowed to originate internal messages. */
export const MESSAGE_SENDER_ROLES = [
  "admin",
  "system_admin",
  "dean",
  "registrar",
  "student_affairs",
  "finance_officer",
  "hr_officer",
] as const;

/** Stable Arabic denial message surfaced to the caller. */
export const MESSAGE_SEND_DENIED_AR =
  "غير مصرح لك بإرسال رسائل إلى هذا المستلم.";

export type MessagingCapability =
  | { kind: "admin"; roles: string[] }
  | { kind: "faculty"; roles: string[]; facultyProfileId: string }
  | { kind: "none"; roles: string[] };

function failClosed(message: string): never {
  throw new Error(MESSAGE_SEND_DENIED_AR + ` (${message})`);
}

/** Resolve what the caller is allowed to do, independent of the surface. */
export async function resolveMessagingCapability(
  userId: string,
): Promise<MessagingCapability> {
  const roles = await userRoles(userId);
  if (roles.some((r) => (MESSAGE_SENDER_ROLES as readonly string[]).includes(r))) {
    return { kind: "admin", roles };
  }

  const isFaculty =
    roles.includes("faculty_member") || roles.includes("department_head");
  if (!isFaculty) return { kind: "none", roles };

  const { data: fp, error } = await supabaseAdmin
    .from("faculty_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) failClosed("faculty_profiles lookup failed");
  if (!fp) return { kind: "none", roles };
  return { kind: "faculty", roles, facultyProfileId: fp.id as string };
}

/** Student profile ids enrolled in the sections taught by this faculty profile. */
export async function facultyTaughtStudentProfileIds(
  facultyProfileId: string,
): Promise<string[]> {
  const { data: sections, error: sectionsError } = await supabaseAdmin
    .from("course_sections")
    .select("id")
    .eq("faculty_profile_id", facultyProfileId);
  if (sectionsError) failClosed("course_sections lookup failed");
  const sectionIds = (sections ?? []).map((s) => s.id as string);
  if (!sectionIds.length) return [];

  const { data: enrolls, error: enrollError } = await supabaseAdmin
    .from("student_enrollments")
    .select("student_profile_id")
    .in("course_section_id", sectionIds);
  if (enrollError) failClosed("student_enrollments lookup failed");
  return Array.from(
    new Set((enrolls ?? []).map((e) => e.student_profile_id as string)),
  );
}

/** True when the user id is bound to a student/faculty/staff profile. */
async function isProfileBoundUser(userId: string): Promise<boolean> {
  const [stud, fac, staf] = await Promise.all([
    supabaseAdmin.from("student_profiles").select("id").eq("user_id", userId).maybeSingle(),
    supabaseAdmin.from("faculty_profiles").select("id").eq("user_id", userId).maybeSingle(),
    supabaseAdmin.from("staff_profiles").select("id").eq("user_id", userId).maybeSingle(),
  ]);
  if (stud.error || fac.error || staf.error) failClosed("recipient profile lookup failed");
  return Boolean(stud.data || fac.data || staf.data);
}

/**
 * Authoritative pre-insert guard. Throws when the sender may not message the
 * recipient — never relies on hidden UI or RLS alone.
 */
export async function assertCanSendMessageTo(
  senderUserId: string,
  recipientUserId: string,
): Promise<void> {
  if (!recipientUserId || recipientUserId === senderUserId) {
    failClosed("invalid recipient");
  }

  const capability = await resolveMessagingCapability(senderUserId);

  if (capability.kind === "none") {
    throw new Error(MESSAGE_SEND_DENIED_AR);
  }

  if (capability.kind === "admin") {
    if (!(await isProfileBoundUser(recipientUserId))) {
      throw new Error(MESSAGE_SEND_DENIED_AR);
    }
    return;
  }

  // faculty_member / department_head: only their own enrolled students
  const { data: recipientStudent, error } = await supabaseAdmin
    .from("student_profiles")
    .select("id")
    .eq("user_id", recipientUserId)
    .maybeSingle();
  if (error) failClosed("recipient student lookup failed");
  if (!recipientStudent) throw new Error(MESSAGE_SEND_DENIED_AR);

  const allowed = await facultyTaughtStudentProfileIds(capability.facultyProfileId);
  if (!allowed.includes(recipientStudent.id as string)) {
    throw new Error(MESSAGE_SEND_DENIED_AR);
  }
}
