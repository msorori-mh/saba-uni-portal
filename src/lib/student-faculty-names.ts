import { supabase } from "@/integrations/supabase/client";

/**
 * Lecturer Arabic names for the signed-in student's own sections only
 * (get_my_section_faculty_names). Never reads faculty_profiles directly.
 */
export async function fetchMySectionFacultyNames(): Promise<Map<string, string>> {
  const { data, error } = await (supabase as unknown as {
    rpc: (fn: string) => Promise<{ data: unknown; error: { message: string } | null }>;
  }).rpc("get_my_section_faculty_names");
  if (error) return new Map();
  const rows = (data ?? []) as { faculty_profile_id: string; full_name_ar: string | null }[];
  return new Map(rows.filter((r) => r.full_name_ar).map((r) => [r.faculty_profile_id, r.full_name_ar as string]));
}
