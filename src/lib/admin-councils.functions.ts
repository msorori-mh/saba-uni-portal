// Read-only server functions for the Academic Councils portal (MVP UI integration).
// Scope: SELECT counts and lightweight lists only. No writes. No storage. No email.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const COUNCILS_READ_ROLES = ["system_admin", "admin", "dean"] as const;

async function assertCouncilsReader(userId: string) {
  await assertAnyRole(
    userId,
    COUNCILS_READ_ROLES,
    "ليس لديك صلاحية الاطلاع على بوابة المجالس الأكاديمية",
  );
}

export type CouncilsOverviewItem = {
  id: string;
  name: string;
  council_type: "college" | "department" | string;
  department_id: string | null;
  is_active: boolean;
  members_count: number;
  next_meeting_at: string | null;
  last_meeting_at: string | null;
};

export type CouncilsSummary = {
  councils: CouncilsOverviewItem[];
  kpis: {
    upcoming_meetings: number;
    submitted_topics: number;
    open_decisions: number;
    overdue_decisions: number;
  };
  agenda_stages: {
    draft: number;
    under_review: number;
    approved: number;
    deferred: number;
  };
  upcoming_meetings: Array<{
    id: string;
    title: string;
    scheduled_at: string;
    location: string | null;
    council_name: string;
  }>;
};

export const getCouncilsSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CouncilsSummary> => {
    await assertCouncilsReader(context.userId);

    const nowIso = new Date().toISOString();
    const todayIso = new Date().toISOString().slice(0, 10);

    const [
      councilsRes,
      membersRes,
      upcomingCountRes,
      submittedTopicsRes,
      openDecisionsRes,
      overdueDecisionsRes,
      draftRes,
      underReviewRes,
      approvedRes,
      deferredRes,
      upcomingListRes,
    ] = await Promise.all([
      supabaseAdmin
        .from("academic_councils")
        .select("id, name, council_type, department_id, is_active")
        .order("council_type", { ascending: true })
        .order("name", { ascending: true }),
      supabaseAdmin
        .from("academic_council_members")
        .select("council_id")
        .is("active_to", null as never),
      supabaseAdmin
        .from("academic_council_meetings")
        .select("id", { count: "exact", head: true })
        .gte("scheduled_at", nowIso)
        .in("status", ["scheduled", "intake_open", "intake_closed"] as never),
      supabaseAdmin
        .from("academic_council_topics")
        .select("id", { count: "exact", head: true })
        .in("status", ["submitted", "under_review"] as never),
      supabaseAdmin
        .from("academic_council_decisions")
        .select("id", { count: "exact", head: true })
        .in("status", ["issued", "in_progress"] as never),
      supabaseAdmin
        .from("academic_council_decisions")
        .select("id", { count: "exact", head: true })
        .in("status", ["issued", "in_progress"] as never)
        .lt("due_date", todayIso),
      supabaseAdmin
        .from("academic_council_topics")
        .select("id", { count: "exact", head: true })
        .eq("status", "draft" as never),
      supabaseAdmin
        .from("academic_council_topics")
        .select("id", { count: "exact", head: true })
        .eq("status", "under_review" as never),
      supabaseAdmin
        .from("academic_council_agenda_items")
        .select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("academic_council_topics")
        .select("id", { count: "exact", head: true })
        .eq("status", "deferred" as never),
      supabaseAdmin
        .from("academic_council_meetings")
        .select("id, title, scheduled_at, location, council_id, academic_councils!inner(name)")
        .gte("scheduled_at", nowIso)
        .order("scheduled_at", { ascending: true })
        .limit(5),
    ]);

    for (const r of [
      councilsRes,
      membersRes,
      upcomingCountRes,
      submittedTopicsRes,
      openDecisionsRes,
      overdueDecisionsRes,
      draftRes,
      underReviewRes,
      approvedRes,
      deferredRes,
      upcomingListRes,
    ]) {
      if (r.error) throw new Error(r.error.message);
    }

    const memberCounts = new Map<string, number>();
    for (const m of (membersRes.data ?? []) as Array<{ council_id: string }>) {
      memberCounts.set(m.council_id, (memberCounts.get(m.council_id) ?? 0) + 1);
    }

    // Fetch last/next meeting per council in bulk.
    const councilIds = (councilsRes.data ?? []).map((c) => c.id as string);
    const nextByCouncil = new Map<string, string>();
    const lastByCouncil = new Map<string, string>();
    if (councilIds.length > 0) {
      const [nextRes, lastRes] = await Promise.all([
        supabaseAdmin
          .from("academic_council_meetings")
          .select("council_id, scheduled_at")
          .in("council_id", councilIds)
          .gte("scheduled_at", nowIso)
          .order("scheduled_at", { ascending: true }),
        supabaseAdmin
          .from("academic_council_meetings")
          .select("council_id, scheduled_at")
          .in("council_id", councilIds)
          .lt("scheduled_at", nowIso)
          .order("scheduled_at", { ascending: false }),
      ]);
      if (nextRes.error) throw new Error(nextRes.error.message);
      if (lastRes.error) throw new Error(lastRes.error.message);
      for (const r of (nextRes.data ?? []) as Array<{ council_id: string; scheduled_at: string }>) {
        if (!nextByCouncil.has(r.council_id)) nextByCouncil.set(r.council_id, r.scheduled_at);
      }
      for (const r of (lastRes.data ?? []) as Array<{ council_id: string; scheduled_at: string }>) {
        if (!lastByCouncil.has(r.council_id)) lastByCouncil.set(r.council_id, r.scheduled_at);
      }
    }

    const councils: CouncilsOverviewItem[] = (councilsRes.data ?? []).map((c) => ({
      id: c.id as string,
      name: c.name as string,
      council_type: c.council_type as string,
      department_id: (c.department_id as string | null) ?? null,
      is_active: Boolean(c.is_active),
      members_count: memberCounts.get(c.id as string) ?? 0,
      next_meeting_at: nextByCouncil.get(c.id as string) ?? null,
      last_meeting_at: lastByCouncil.get(c.id as string) ?? null,
    }));

    const upcoming_meetings = ((upcomingListRes.data ?? []) as Array<{
      id: string;
      title: string;
      scheduled_at: string;
      location: string | null;
      academic_councils: { name: string } | { name: string }[] | null;
    }>).map((m) => ({
      id: m.id,
      title: m.title,
      scheduled_at: m.scheduled_at,
      location: m.location,
      council_name: Array.isArray(m.academic_councils)
        ? m.academic_councils[0]?.name ?? ""
        : m.academic_councils?.name ?? "",
    }));

    return {
      councils,
      kpis: {
        upcoming_meetings: upcomingCountRes.count ?? 0,
        submitted_topics: submittedTopicsRes.count ?? 0,
        open_decisions: openDecisionsRes.count ?? 0,
        overdue_decisions: overdueDecisionsRes.count ?? 0,
      },
      agenda_stages: {
        draft: draftRes.count ?? 0,
        under_review: underReviewRes.count ?? 0,
        approved: approvedRes.count ?? 0,
        deferred: deferredRes.count ?? 0,
      },
      upcoming_meetings,
    };
  });
