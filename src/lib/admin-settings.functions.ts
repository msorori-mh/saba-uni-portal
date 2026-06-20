import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SETTINGS_ADMIN_ROLES = ["system_admin", "admin"] as const;

const settingRowSchema = z.object({
  setting_key: z.string().min(1),
  setting_group: z.string().min(1),
  setting_value: z.string(),
});

export const listSiteSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAnyRole(context.userId, SETTINGS_ADMIN_ROLES, "ليس لديك صلاحية عرض الإعدادات");
    const { data, error } = await supabaseAdmin
      .from("site_settings")
      .select("setting_key, setting_value, setting_group");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveSiteSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ rows: z.array(settingRowSchema).min(1).max(100) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.userId, SETTINGS_ADMIN_ROLES, "ليس لديك صلاحية حفظ الإعدادات");
    const { error } = await supabaseAdmin
      .from("site_settings")
      .upsert(data.rows, { onConflict: "setting_key" });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
