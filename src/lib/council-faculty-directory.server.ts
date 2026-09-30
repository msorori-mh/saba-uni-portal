import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Called only after council-manager authorization. The input profiles have
 * already been read through the caller's RLS client; never widen that set.
 * Direct authenticated SELECT on faculty is intentionally revoked.
 */
export async function loadCouncilFacultyEmails(
  admin: SupabaseClient<Database>,
  visibleProfiles: ReadonlyArray<{ faculty_id: string | null }>,
): Promise<Map<string, string | null>> {
  const ids = [...new Set(visibleProfiles.flatMap((p) => p.faculty_id ? [p.faculty_id] : []))];
  if (!ids.length) return new Map();
  const { data, error } = await admin.from("faculty").select("id, email").in("id", ids);
  if (error) throw new Error("تعذّر تحميل بريد أعضاء المجلس. أعد المحاولة.");
  return new Map((data ?? []).map((row) => [row.id, row.email]));
}
