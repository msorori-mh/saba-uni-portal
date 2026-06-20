import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole, userRoles } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const TRANSCRIPT_ADMIN_ROLES = [
  "system_admin",
  "admin",
  "dean",
  "registrar",
] as const;

async function isOwnerStudent(userId: string, studentProfileId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("student_profiles")
    .select("id")
    .eq("user_id", userId)
    .eq("id", studentProfileId)
    .maybeSingle();
  return !!data;
}

async function assertTranscriptAccess(userId: string, studentProfileId: string) {
  const roles = await userRoles(userId);
  if (roles.some((r) => (TRANSCRIPT_ADMIN_ROLES as readonly string[]).includes(r))) return;
  if (await isOwnerStudent(userId, studentProfileId)) return;
  throw new Error("ليس لديك صلاحية عرض هذا السجل");
}

export const searchStudentsForTranscript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ query: z.string().trim().min(2).max(120) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(
      context.userId,
      TRANSCRIPT_ADMIN_ROLES,
      "ليس لديك صلاحية البحث في السجلات الأكاديمية",
    );
    const term = `%${data.query}%`;
    const { data: rows, error } = await supabaseAdmin
      .from("student_profiles")
      .select("id, academic_number, full_name_ar, program:programs(name_ar), department:departments(name_ar)")
      .or(`academic_number.ilike.${term},full_name_ar.ilike.${term}`)
      .limit(20);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getUnofficialTranscriptData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ studentProfileId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertTranscriptAccess(context.userId, data.studentProfileId);

    const [rowsRes, summaryRes] = await Promise.all([
      supabaseAdmin
        .from("student_unofficial_transcript")
        .select("*")
        .eq("student_profile_id", data.studentProfileId),
      supabaseAdmin
        .from("student_transcript_summary")
        .select("*")
        .eq("student_profile_id", data.studentProfileId),
    ]);

    if (rowsRes.error) throw new Error(rowsRes.error.message);
    if (summaryRes.error) throw new Error(summaryRes.error.message);

    return {
      rows: rowsRes.data ?? [],
      summary: summaryRes.data ?? [],
    };
  });
