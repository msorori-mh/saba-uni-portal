/**
 * Administration read-only overview for Graduates Affairs.
 *
 * This surface is intentionally separate from the operational AUTH-04 RPCs.
 * It grants admin / system_admin a sanitized, aggregate view for go-live
 * oversight without exposing PII, contact values, protected follow-up notes,
 * survey answers, audit payloads, or storage paths.
 *
 * No mutation paths are exposed here.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ADMIN_GA_OVERVIEW_ROLES = ["admin", "system_admin"] as const;

export type AdminGraduatesAffairsOverviewDto = {
  counts: {
    totalRecords: number;
    approvedRecords: number;
    pendingRecords: number;
    correctedRecords: number;
    revokedRecords: number;
    openFollowups: number;
    activeEvents: number;
    activeOpportunities: number;
    publishedSurveyVersions: number;
  };
  recentRecords: AdminGraduateRecordSummary[];
};

export type AdminGraduateRecordSummary = {
  recordId: string;
  recordState: string;
  graduationYear: number | null;
  effectiveGraduationDate: string;
  programId: string;
  departmentId: string;
  createdAt: string;
};

function extractYear(dateString: string | null): number | null {
  if (!dateString) return null;
  const year = Number(dateString.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

async function countRecordsByState(
  states: readonly string[],
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const state of states) {
    const { count, error } = await supabaseAdmin
      .from("graduate_records")
      .select("id", { count: "exact", head: true })
      .eq("record_state", state);
    if (error) throw new Error(error.message);
    result[state] = count ?? 0;
  }
  return result;
}

export const getAdminGraduatesAffairsOverviewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const states = ["approved", "pending", "corrected", "revoked"] as const;
    const [totalRes, byState, openFollowupsRes, activeEventsRes, activeOpportunitiesRes, publishedSurveysRes, recentRes] =
      await Promise.all([
        supabaseAdmin
          .from("graduate_records")
          .select("id", { count: "exact", head: true }),
        countRecordsByState(states),
        supabaseAdmin
          .from("graduate_followups")
          .select("id", { count: "exact", head: true })
          .in("state", ["open", "in_progress"]),
        supabaseAdmin
          .from("graduate_events")
          .select("id", { count: "exact", head: true })
          .eq("state", "active"),
        supabaseAdmin
          .from("graduate_opportunities")
          .select("id", { count: "exact", head: true })
          .eq("state", "active"),
        supabaseAdmin
          .from("graduate_survey_versions")
          .select("id", { count: "exact", head: true })
          .not("published_at", "is", null),
        supabaseAdmin
          .from("graduate_records")
          .select(
            "id, record_state, effective_graduation_date, program_id, department_id, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

    if (totalRes.error) throw new Error(totalRes.error.message);
    if (openFollowupsRes.error) throw new Error(openFollowupsRes.error.message);
    if (activeEventsRes.error) throw new Error(activeEventsRes.error.message);
    if (activeOpportunitiesRes.error) throw new Error(activeOpportunitiesRes.error.message);
    if (publishedSurveysRes.error) throw new Error(publishedSurveysRes.error.message);
    if (recentRes.error) throw new Error(recentRes.error.message);

    const recentRecords: AdminGraduateRecordSummary[] = (recentRes.data ?? []).map(
      (row) => ({
        recordId: row.id as string,
        recordState: row.record_state as string,
        graduationYear: extractYear(row.effective_graduation_date as string | null),
        effectiveGraduationDate: (row.effective_graduation_date as string) ?? "",
        programId: row.program_id as string,
        departmentId: row.department_id as string,
        createdAt: row.created_at as string,
      }),
    );

    return {
      counts: {
        totalRecords: totalRes.count ?? 0,
        approvedRecords: byState.approved ?? 0,
        pendingRecords: byState.pending ?? 0,
        correctedRecords: byState.corrected ?? 0,
        revokedRecords: byState.revoked ?? 0,
        openFollowups: openFollowupsRes.count ?? 0,
        activeEvents: activeEventsRes.count ?? 0,
        activeOpportunities: activeOpportunitiesRes.count ?? 0,
        publishedSurveyVersions: publishedSurveysRes.count ?? 0,
      },
      recentRecords,
    } satisfies AdminGraduatesAffairsOverviewDto;
  });

export { ADMIN_GA_OVERVIEW_ROLES };
