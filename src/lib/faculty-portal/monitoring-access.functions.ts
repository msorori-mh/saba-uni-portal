import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { userRoles } from "@/lib/authz.server";

/** UI visibility only; the monitoring RPC remains the authorization boundary. */
export const hasLectureMonitoringAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<boolean> => {
    const roles = await userRoles(context.userId);
    return roles.some((role) =>
      ["department_head", "dean", "registrar", "student_affairs", "admin", "system_admin"].includes(role),
    );
  });
