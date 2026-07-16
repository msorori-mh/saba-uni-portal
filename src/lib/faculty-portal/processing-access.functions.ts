/**
 * Faculty portal: does the current signed-in user have at least one ACTIVE
 * `request_processing_assignments` row?
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
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { userRoles } from "@/lib/authz.server";

export type HasActiveProcessingAssignmentResult = {
  hasAssignment: boolean;
  isAdmin: boolean;
};

export const hasActiveProcessingAssignment = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HasActiveProcessingAssignmentResult> => {
    const roles = await userRoles(context.userId);
    const isAdmin = roles.includes("admin") || roles.includes("system_admin");

    const { data, error } = await supabaseAdmin
      .from("request_processing_assignments")
      .select("id")
      .eq("user_id", context.userId)
      .eq("is_active", true)
      .limit(1);
    if (error) throw new Error(error.message);

    return {
      hasAssignment: Array.isArray(data) && data.length > 0,
      isAdmin,
    };
  });
