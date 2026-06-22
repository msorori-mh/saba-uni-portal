import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { userRoles } from "@/lib/authz.server";

export type AdminSession = {
  userId: string;
  email: string | null;
  roles: string[];
};

/** Central admin session — email + roles for layout/nav; auth enforced server-side. */
export const getAdminSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await userRoles(context.userId);
    const { data, error } = await context.supabase.auth.getUser();
    if (error) throw new Error(error.message);
    return {
      userId: context.userId,
      email: data.user?.email ?? null,
      roles,
    } satisfies AdminSession;
  });
