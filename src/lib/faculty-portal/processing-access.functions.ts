/**
 * Faculty portal: does the current signed-in user have at least one ACTIVE
 * `request_processing_assignments` row?
 *
 * Identity resolution uses the shared closure helper
 * (`hasActiveProcessingAssignmentForUser`), which recognizes all four
 * production binding types: user, staff_profile, faculty_profile and
 * position_assignment. A `user_id`-only lookup would deny legitimate
 * actors whose assignment binds indirectly.
 *
 * This is a lightweight UI gate for showing/hiding the «طلبات المعالجة»
 * card in the faculty portal. It never grants access on its own — every
 * read/write in the staff inbox still goes through
 * `assertStaffInboxAccess` + the per-user-scoped RPCs
 * (`get_my_request_actor_inbox`, `get_student_request_detail_for_actor`,
 * `act_on_student_request_step`), which enforce `can_current_user_act_on_step`.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { userRoles } from "@/lib/authz.server";
import { headedDepartmentIdsForUser } from "@/lib/faculty-portal/delivery-monitoring-heads.server";
import { canSeeDeliveryMonitoring } from "@/lib/faculty-portal/delivery-monitoring-roles";
import { hasActiveProcessingAssignmentForUser } from "@/lib/student-requests/processing-assignment-identity.server";

export type HasActiveProcessingAssignmentResult = {
  hasAssignment: boolean;
  isAdmin: boolean;
  /**
   * Faculty-portal «متابعة سير العملية التعليمية» tab: college-wide role holder
   * or head of at least one department (active department-head position, or
   * the legacy role). UI gate only — the page/RPC stay authoritative.
   */
  canMonitorDelivery: boolean;
};



export const hasActiveProcessingAssignment = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HasActiveProcessingAssignmentResult> => {
    const roles = await userRoles(context.userId);
    const isAdmin = roles.includes("admin") || roles.includes("system_admin");

    const hasAssignment = await hasActiveProcessingAssignmentForUser(
      context.userId,
    );

    // Fail closed: a failed headship lookup grants no department scope.
    let headedDepartmentIds: string[] = [];
    try {
      headedDepartmentIds = await headedDepartmentIdsForUser(context.userId, roles);
    } catch {
      headedDepartmentIds = [];
    }
    const canMonitorDelivery = canSeeDeliveryMonitoring({ roles, headedDepartmentIds });

    return { hasAssignment, isAdmin, canMonitorDelivery };
  });
