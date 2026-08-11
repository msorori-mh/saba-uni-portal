// Read-only authorization parity audit across academic councils.
// Evaluates the same backend authorization predicates for every council role
// (chair / secretary / member / decision-responsible) in every council, then
// compares department councils against the college council baseline.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CouncilAuditRoleKey = "chair" | "secretary" | "member" | "responsible";

export type CouncilAuditCapabilityKey =
  | "can_manage_council"
  | "can_schedule_council_meeting"
  | "can_write_council_agenda"
  | "can_submit_council_topic"
  | "quorum_eligible";

export type CouncilAuditRoleResult = {
  role: CouncilAuditRoleKey;
  roleLabel: string;
  actorUserId: string | null;
  actorName: string | null;
  assigned: boolean;
  capabilities: Record<CouncilAuditCapabilityKey, boolean | null>;
  parity: "match" | "mismatch" | "baseline" | "unknown";
  mismatchedCapabilities: CouncilAuditCapabilityKey[];
};

export type CouncilAuditResult = {
  councilId: string;
  councilName: string;
  councilType: string;
  isBaseline: boolean;
  hasApprovedQuorumPolicy: boolean;
  activeMemberCount: number;
  roles: CouncilAuditRoleResult[];
};

export type CouncilAuthorizationAuditReport = {
  generatedAt: string;
  baselineCouncilId: string | null;
  councils: CouncilAuditResult[];
  totalChecks: number;
  mismatchCount: number;
  unassignedRoleCount: number;
  verdict: "PASS" | "ATTENTION";
};

const ROLE_LABELS: Record<CouncilAuditRoleKey, string> = {
  chair: "رئيس المجلس",
  secretary: "أمين السر",
  member: "عضو",
  responsible: "مسؤول تكليف",
};

export const CAPABILITY_LABELS: Record<CouncilAuditCapabilityKey, string> = {
  can_manage_council: "إدارة المجلس",
  can_schedule_council_meeting: "جدولة الاجتماعات",
  can_write_council_agenda: "تحرير جدول الأعمال",
  can_submit_council_topic: "تقديم الموضوعات",
  quorum_eligible: "الاحتساب في النصاب",
};

const CAPABILITY_KEYS: CouncilAuditCapabilityKey[] = [
  "can_manage_council",
  "can_schedule_council_meeting",
  "can_write_council_agenda",
  "can_submit_council_topic",
  "quorum_eligible",
];

const AUDIT_DENIED = "لا تملك صلاحية تشغيل فحص صلاحيات المجالس.";

export const runCouncilAuthorizationAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CouncilAuthorizationAuditReport> => {
    const sb = context.supabase;
    const userId = context.userId;

    // Authorize the caller: platform admin/dean, or a chair/secretary somewhere.
    const [adminRes, deanRes, sysRes, membershipRes] = await Promise.all([
      sb.rpc("has_role", { _user_id: userId, _role: "admin" }),
      sb.rpc("has_role", { _user_id: userId, _role: "dean" }),
      sb.rpc("has_role", { _user_id: userId, _role: "system_admin" }),
      sb
        .from("academic_council_members")
        .select("member_role")
        .eq("user_id", userId)
        .eq("is_active", true),
    ]);

    const isPrivileged =
      adminRes.data === true || deanRes.data === true || sysRes.data === true;
    const isCouncilOfficer = (membershipRes.data ?? []).some((row) =>
      ["chair", "vice_chair", "secretary"].includes(String(row.member_role)),
    );
    if (!isPrivileged && !isCouncilOfficer) throw new Error(AUDIT_DENIED);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [councilsRes, membersRes, policiesRes, decisionsRes] = await Promise.all([
      supabaseAdmin
        .from("academic_councils")
        .select("id, name, council_type")
        .order("council_type", { ascending: true })
        .order("name", { ascending: true }),
      supabaseAdmin
        .from("academic_council_members")
        .select("council_id, user_id, member_role, is_active")
        .eq("is_active", true),
      supabaseAdmin
        .from("academic_council_quorum_policies")
        .select("council_id, status"),
      supabaseAdmin
        .from("academic_council_decisions")
        .select("responsible_user_id, meeting_id, meeting:academic_council_meetings(council_id)")
        .not("responsible_user_id", "is", null),
    ]);

    const councils = councilsRes.data ?? [];
    const members = membersRes.data ?? [];
    const policies = policiesRes.data ?? [];
    const decisions = (decisionsRes.data ?? []) as Array<{
      responsible_user_id: string | null;
      meeting: { council_id: string } | { council_id: string }[] | null;
    }>;

    const responsibleByCouncil = new Map<string, string>();
    for (const row of decisions) {
      const meeting = Array.isArray(row.meeting) ? row.meeting[0] : row.meeting;
      if (!meeting?.council_id || !row.responsible_user_id) continue;
      if (!responsibleByCouncil.has(meeting.council_id)) {
        responsibleByCouncil.set(meeting.council_id, row.responsible_user_id);
      }
    }

    // Resolve display names for actors.
    const actorIds = Array.from(
      new Set([
        ...members.map((m) => m.user_id),
        ...Array.from(responsibleByCouncil.values()),
      ]),
    );
    const namesRes = actorIds.length
      ? await supabaseAdmin
          .from("faculty_profiles")
          .select("user_id, full_name")
          .in("user_id", actorIds)
      : { data: [] as Array<{ user_id: string; full_name: string | null }> };
    const nameByUser = new Map<string, string>();
    for (const row of namesRes.data ?? []) {
      if (row.user_id) nameByUser.set(row.user_id, row.full_name ?? "");
    }

    const quorumEligibleCache = new Map<string, boolean | null>();
    const quorumEligible = async (memberRole: string) => {
      if (!quorumEligibleCache.has(memberRole)) {
        const res = await supabaseAdmin.rpc("council_member_is_quorum_eligible", {
          p_role: memberRole as never,
        });
        quorumEligibleCache.set(memberRole, res.error ? null : Boolean(res.data));
      }
      return quorumEligibleCache.get(memberRole) ?? null;
    };

    const evaluate = async (
      actor: string,
      councilId: string,
      memberRole: string | null,
    ): Promise<Record<CouncilAuditCapabilityKey, boolean | null>> => {
      const call = async (fn: string) => {
        const res = await supabaseAdmin.rpc(fn as never, {
          _user: actor,
          _council: councilId,
        } as never);
        return res.error ? null : Boolean(res.data);
      };
      const [manage, schedule, agenda, submit] = await Promise.all([
        call("can_manage_council"),
        call("can_schedule_council_meeting"),
        call("can_write_council_agenda"),
        call("can_submit_council_topic"),
      ]);
      return {
        can_manage_council: manage,
        can_schedule_council_meeting: schedule,
        can_write_council_agenda: agenda,
        can_submit_council_topic: submit,
        quorum_eligible: memberRole ? await quorumEligible(memberRole) : null,
      };
    };

    const baselineCouncil =
      councils.find((c) => c.council_type === "college") ?? councils[0] ?? null;

    const results: CouncilAuditResult[] = [];
    for (const council of councils) {
      const councilMembers = members.filter((m) => m.council_id === council.id);
      const roles: CouncilAuditRoleResult[] = [];

      for (const role of ["chair", "secretary", "member", "responsible"] as CouncilAuditRoleKey[]) {
        let actorUserId: string | null = null;
        let memberRole: string | null = null;

        if (role === "responsible") {
          actorUserId = responsibleByCouncil.get(council.id) ?? null;
          memberRole =
            councilMembers.find((m) => m.user_id === actorUserId)?.member_role ?? null;
        } else {
          const hit = councilMembers.find((m) => m.member_role === role);
          actorUserId = hit?.user_id ?? null;
          memberRole = hit?.member_role ?? null;
        }

        const capabilities: Record<CouncilAuditCapabilityKey, boolean | null> = actorUserId
          ? await evaluate(actorUserId, council.id, memberRole)
          : {
              can_manage_council: null,
              can_schedule_council_meeting: null,
              can_write_council_agenda: null,
              can_submit_council_topic: null,
              quorum_eligible: memberRole ? await quorumEligible(memberRole) : null,
            };

        roles.push({
          role,
          roleLabel: ROLE_LABELS[role],
          actorUserId,
          actorName: actorUserId ? nameByUser.get(actorUserId) || null : null,
          assigned: Boolean(actorUserId),
          capabilities,
          parity: "unknown",
          mismatchedCapabilities: [],
        });
      }

      results.push({
        councilId: council.id,
        councilName: council.name,
        councilType: String(council.council_type),
        isBaseline: baselineCouncil?.id === council.id,
        hasApprovedQuorumPolicy: policies.some(
          (p) => p.council_id === council.id && p.status === "approved",
        ),
        activeMemberCount: councilMembers.length,
        roles,
      });
    }

    // Parity comparison against the baseline (college) council.
    const baselineResult = results.find((r) => r.isBaseline) ?? null;
    let mismatchCount = 0;
    let totalChecks = 0;
    let unassignedRoleCount = 0;

    for (const council of results) {
      for (const roleResult of council.roles) {
        if (!roleResult.assigned) unassignedRoleCount += 1;
        const baselineRole = baselineResult?.roles.find((r) => r.role === roleResult.role);
        if (council.isBaseline) {
          roleResult.parity = "baseline";
          continue;
        }
        if (!baselineRole || !baselineRole.assigned || !roleResult.assigned) {
          roleResult.parity = "unknown";
          continue;
        }
        const diffs = CAPABILITY_KEYS.filter(
          (key) => roleResult.capabilities[key] !== baselineRole.capabilities[key],
        );
        totalChecks += CAPABILITY_KEYS.length;
        roleResult.mismatchedCapabilities = diffs;
        roleResult.parity = diffs.length ? "mismatch" : "match";
        mismatchCount += diffs.length;
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      baselineCouncilId: baselineResult?.councilId ?? null,
      councils: results,
      totalChecks,
      mismatchCount,
      unassignedRoleCount,
      verdict: mismatchCount === 0 ? "PASS" : "ATTENTION",
    };
  });
