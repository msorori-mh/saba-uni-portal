// Read-only faculty portal functions for academic council memberships.
// Uses user session (context.supabase) — no service role, no writes.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CouncilLinkMemberRole } from "@/lib/admin-councils.functions";

export type MyAcademicCouncilMembership = {
  membership_id: string;
  council_id: string;
  council_name: string;
  council_type: "college" | "department" | string;
  member_role: CouncilLinkMemberRole | string;
  is_active: boolean;
  active_from: string;
};

export const getMyAcademicCouncilMemberships = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyAcademicCouncilMembership[]> => {
    const sb = context.supabase;

    const { data: profile, error: profileErr } = await sb
      .from("faculty_profiles")
      .select("id, status")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (profileErr) throw new Error("تعذّر تحميل بيانات العضو");
    if (!profile) throw new Error("حساب عضو هيئة التدريس غير متاح");
    if (profile.status !== "active") {
      throw new Error("حساب عضو هيئة التدريس غير فعّال");
    }

    const { data: rows, error } = await sb
      .from("academic_council_members")
      .select(
        "id, member_role, is_active, active_from, council:academic_councils(id, name, council_type, is_active)",
      )
      .eq("user_id", context.userId)
      .eq("is_active", true)
      .is("active_to", null)
      .order("active_from", { ascending: false });
    if (error) throw new Error("تعذّر تحميل عضويات المجالس");

    return (rows ?? [])
      .map((row) => {
        const council = row.council as
          | { id: string; name: string; council_type: string; is_active: boolean }
          | { id: string; name: string; council_type: string; is_active: boolean }[]
          | null;
        const c = Array.isArray(council) ? council[0] : council;
        if (!c) return null;
        return {
          membership_id: row.id as string,
          council_id: c.id,
          council_name: c.name,
          council_type: c.council_type,
          member_role: row.member_role as string,
          is_active: Boolean(row.is_active),
          active_from: row.active_from as string,
        };
      })
      .filter((r): r is MyAcademicCouncilMembership => r !== null);
  });
