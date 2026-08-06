/**
 * Thin Package C UI adapter over Package B services/hooks.
 * Routes keep stable hook names; all RPCs/storage go through src/lib/graduation-projects.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  configureGraduationProjectsRpc,
  createGraduationProjectsService,
  GraduationProjectsRpcError,
  GP_PRIVATE_BUCKET,
  isGraduationProjectsRpcUnavailable,
  type GraduationProjectsService,
  type MyProjectRow,
} from "@/lib/graduation-projects";
import type {
  GraduationProjectActor,
  GraduationProjectDetail,
  GraduationProjectSummary,
  GraduationProjectState,
  FinalDecision,
  PrivateFile,
  UiAction,
} from "@/components/graduation-projects/mvp-ui";

let configured = false;

function ensureConfigured(): void {
  if (configured) return;
  configureGraduationProjectsRpc(
    supabase as unknown as Parameters<typeof configureGraduationProjectsRpc>[0],
    supabase.storage as unknown as Parameters<typeof configureGraduationProjectsRpc>[1],
  );
  configured = true;
}

function gpService(queryClient?: ReturnType<typeof useQueryClient>): GraduationProjectsService {
  ensureConfigured();
  return createGraduationProjectsService(
    supabase as unknown as Parameters<typeof createGraduationProjectsService>[0],
    queryClient,
    supabase.storage as unknown as Parameters<typeof createGraduationProjectsService>[2],
  );
}

export const GP_UNAVAILABLE = "خدمة مشاريع التخرج قيد التجهيز حالياً. حاول مرة أخرى لاحقاً.";

function mapError(error: unknown): Error {
  if (error instanceof GraduationProjectsRpcError) {
    if (error.unavailable || isGraduationProjectsRpcUnavailable(error)) {
      return new Error(GP_UNAVAILABLE);
    }
    return new Error(error.message || "تعذر تنفيذ العملية.");
  }
  if (error instanceof Error) return error;
  return new Error("تعذر تنفيذ العملية.");
}

function mapRoles(roles: unknown): GraduationProjectActor[] {
  const list = Array.isArray(roles) ? roles.map(String) : [];
  const out: GraduationProjectActor[] = [];
  for (const role of list) {
    if (role === "student") {
      // leader vs member resolved from detail when available
      if (!out.includes("member")) out.push("member");
    } else if (role === "coordinator") out.push("coordinator");
    else if (role === "supervisor") out.push("supervisor");
    else if (role === "panel_member" || role === "committee_member") out.push("committee");
  }
  return out.length ? out : ["member"];
}

function pickViewer(roles: GraduationProjectActor[], isLeader?: boolean): GraduationProjectActor {
  if (roles.includes("coordinator")) return "coordinator";
  if (roles.includes("committee")) return "committee";
  if (roles.includes("supervisor")) return "supervisor";
  if (isLeader) return "leader";
  return "member";
}

function mapSummary(row: MyProjectRow | Record<string, unknown>): GraduationProjectSummary {
  const r = row as Record<string, unknown>;
  const state = String(r.lifecycle_state ?? r.state ?? "draft") as GraduationProjectState;
  const roles = mapRoles(r.roles);
  if (r.is_leader === true && !roles.includes("leader")) {
    const idx = roles.indexOf("member");
    if (idx >= 0) roles.splice(idx, 1, "leader");
    else roles.unshift("leader");
  }
  return {
    id: String(r.project_id ?? r.id),
    title: String(r.title ?? "مشروع تخرج"),
    state,
    finalDecision: (r.final_decision as FinalDecision) ?? null,
    roles,
    nextAction: r.next_action_summary ? String(r.next_action_summary) : undefined,
  };
}

function fileFromRaw(
  raw: Record<string, unknown> | null | undefined,
  category: PrivateFile["category"],
  name = "ملف.pdf",
): PrivateFile | undefined {
  if (!raw) return undefined;
  const scan = String(raw.scan_state ?? "pending");
  const status = String(raw.upload_status ?? "");
  let state: PrivateFile["state"] = "processing";
  if (status === "pending") state = "uploading";
  else if (scan === "clean") state = "ready";
  else if (scan === "rejected" || scan === "quarantined") state = "rejected";
  return {
    id: String(raw.file_id ?? raw.id),
    name: String(raw.original_name ?? name),
    category,
    state,
    downloadable: scan === "clean" && (status === "active" || status === "superseded" || !status),
  };
}

function mapDetail(raw: Record<string, unknown>): GraduationProjectDetail {
  const roles = mapRoles(raw.viewer_roles ?? raw.roles);
  const team = Array.isArray(raw.team) ? raw.team : [];
  const viewerUserRoles = roles;
  const isLeader = team.some(
    (m) =>
      typeof m === "object"
      && m
      && (m as { is_leader?: boolean }).is_leader === true
      && viewerUserRoles.includes("member"),
  );
  // Prefer explicit leader role when assignment says so
  let viewer = pickViewer(roles, false);
  if (roles.includes("member") || roles.includes("leader")) {
    const leaderRow = team.find(
      (m) => typeof m === "object" && m && (m as { is_leader?: boolean }).is_leader,
    ) as { is_leader?: boolean; user_id?: string } | undefined;
    viewer = leaderRow?.is_leader ? "leader" : roles.includes("leader") ? "leader" : "member";
    if (roles.includes("coordinator")) viewer = "coordinator";
    if (roles.includes("committee")) viewer = "committee";
    if (roles.includes("supervisor")) {
      const sup = raw.supervisor as { status?: string } | null | undefined;
      viewer = sup?.status === "pending" ? "supervisor_pending" : "supervisor";
    }
  }
  if (isLeader && viewer === "member") viewer = "leader";

  const progress = Array.isArray(raw.progress) ? raw.progress : [];
  const defense = raw.defense as Record<string, unknown> | null | undefined;
  const ownEval = raw.own_evaluation as Record<string, unknown> | null | undefined;
  const agg = raw.evaluation_aggregate as Record<string, unknown> | null | undefined;
  const supervisor = raw.supervisor as { user_id?: string; status?: string } | null | undefined;

  const summary = mapSummary({
    project_id: raw.project_id,
    title: raw.title,
    lifecycle_state: raw.lifecycle_state,
    final_decision: raw.final_decision,
    roles: raw.viewer_roles,
    version: raw.version,
    updated_at: raw.updated_at,
  });

  return {
    ...summary,
    viewer,
    teamLocked: !["draft", "submitted", "revision_required"].includes(summary.state),
    team: team.map((m, i) => {
      const row = m as Record<string, unknown>;
      return {
        id: String(row.assignment_id ?? row.id ?? `member-${i}`),
        name: String(row.name ?? row.user_id ?? "عضو الفريق"),
        academicNumber: row.academic_number ? String(row.academic_number) : undefined,
        leader: Boolean(row.is_leader),
      };
    }),
    proposal: {
      problemStatement: String(raw.problem_statement ?? ""),
      objectives: String(raw.objectives ?? ""),
      summary: String(raw.summary ?? ""),
      attachment: fileFromRaw(
        (raw.proposal_file as Record<string, unknown>) ?? null,
        "proposal",
        "proposal.pdf",
      ),
    },
    supervisor: supervisor
      ? {
          name: String(supervisor.user_id ?? "مشرف"),
          acceptance:
            supervisor.status === "accepted"
              ? "accepted"
              : supervisor.status === "declined"
                ? "declined"
                : "pending",
        }
      : undefined,
    progress: progress.map((p, i) => {
      const row = p as Record<string, unknown>;
      const st = String(row.state ?? "submitted");
      return {
        id: String(row.id ?? `progress-${i}`),
        text: String(row.summary ?? ""),
        state:
          st === "approved" ? "approved" : st === "returned" ? "returned" : "submitted",
        submittedAt: String(row.submitted_at ?? row.created_at ?? ""),
        supervisorComment: row.review_comments ? String(row.review_comments) : undefined,
      };
    }),
    finalFile: fileFromRaw(
      (raw.final_file as Record<string, unknown>) ?? null,
      "final",
      "final.pdf",
    ),
    defense: defense
      ? {
          startsAt: String(defense.starts_at ?? ""),
          venue: String(defense.venue ?? ""),
          committeeCount: Number(defense.committee_count ?? 0),
          held: String(defense.state ?? "") === "held",
        }
      : undefined,
    evaluation: {
      ownScore: ownEval?.score != null ? Number(ownEval.score) : undefined,
      ownNotes: ownEval?.notes != null ? String(ownEval.notes) : undefined,
      submitted: Boolean(ownEval?.state === "submitted" || ownEval?.score != null),
      submittedCount: Number(agg?.submitted_count ?? 0),
      requiredCount: Number(agg?.required_count ?? 2),
      average: agg?.average_score != null ? Number(agg.average_score) : undefined,
    },
    coordinatorOptions: {
      supervisors: [],
      committee: [],
      students: [],
    },
  };
}

async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function useGraduationProjectList(scope: "assigned" | "administration") {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ["graduation-projects", scope],
    queryFn: async () => {
      const service = gpService(queryClient);
      if (scope === "administration") {
        const report = await service.listAdministrationOverview();
        return report.projects.map((p) =>
          mapSummary({
            ...p,
            roles: ["administration"],
            state: p.lifecycle_state,
          }),
        );
      }
      const rows = await service.listMyProjects();
      return rows.map(mapSummary);
    },
    retry: false,
  });
}

export function useGraduationProject(projectId: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ["graduation-projects", "detail", projectId],
    queryFn: async () => {
      const service = gpService(queryClient);
      const detail = await service.getProjectDetail(projectId);
      return mapDetail(detail as unknown as Record<string, unknown>);
    },
    retry: false,
  });
}

async function runAction(
  service: GraduationProjectsService,
  projectId: string,
  action: UiAction,
  version: number,
  detail?: GraduationProjectDetail,
): Promise<void> {
  switch (action.type) {
    case "member_add":
      await service.addTeamMember({
        projectId,
        studentProfileId: action.studentId,
        studentUserId: action.studentId,
      });
      return;
    case "member_remove":
      await service.removeTeamMember({ projectId, assignmentId: action.memberId });
      return;
    case "proposal_save":
      await service.upsertProposal({
        projectId,
        title: detail?.title || "مشروع تخرج",
        problemStatement: action.problemStatement,
        objectives: action.objectives,
        summary: action.summary,
        expectedVersion: version,
      });
      return;
    case "proposal_submit":
      if (detail?.state === "revision_required") {
        await service.resubmitProposal({ projectId, expectedVersion: version });
      } else {
        await service.submitProposal({ projectId, expectedVersion: version });
      }
      return;
    case "proposal_decide": {
      const mapped =
        action.decision === "accepted"
          ? "accept"
          : action.decision === "returned"
            ? "return"
            : "reject";
      await service.reviewProposal({
        projectId,
        action: mapped,
        reason: action.comments ?? null,
        expectedVersion: version,
      });
      return;
    }
    case "supervisor_assign":
      await service.assignSupervisor({
        projectId,
        facultyProfileId: action.facultyId,
        userId: action.facultyId,
      });
      return;
    case "supervisor_respond":
      await service.respondSupervision({
        projectId,
        response: action.response === "accepted" ? "accept" : "decline",
        expectedVersion: version,
      });
      return;
    case "progress_submit":
      await service.submitProgress({ projectId, summary: action.text });
      return;
    case "progress_review":
      await service.reviewProgress({
        projectId,
        progressId: action.updateId,
        action: action.decision === "approved" ? "approve" : "return",
        comments: action.comments ?? null,
      });
      return;
    case "final_review":
      await service.reviewFinal({
        projectId,
        action: action.decision === "ready" ? "ready" : "return",
        comments: action.comments ?? null,
        expectedVersion: version,
      });
      return;
    case "defense_schedule":
      await service.scheduleDefense({
        projectId,
        startsAt: action.startsAt,
        venue: action.venue,
        expectedVersion: version,
      });
      return;
    case "committee_assign":
      for (const facultyId of action.facultyIds) {
        await service.assignCommitteeMember({
          projectId,
          facultyProfileId: facultyId,
          userId: facultyId,
        });
      }
      return;
    case "defense_held":
      await service.markDefenseHeld({ projectId, expectedVersion: version });
      return;
    case "evaluation_submit":
      await service.submitEvaluation({
        projectId,
        score: action.score,
        notes: action.notes,
      });
      return;
    case "result_record":
      await service.concludeResult({
        projectId,
        outcome: action.decision,
        expectedVersion: version,
      });
      return;
    case "archive":
      await service.archiveProject({ projectId, expectedVersion: version });
      return;
    case "upload": {
      const sha256 = await sha256Hex(action.file);
      const { fileId } = await service.uploadPrivateFile({
        projectId,
        category: action.category,
        file: action.file,
        originalName: action.file.name,
        sha256,
      });
      if (action.category === "final") {
        await service.submitFinal({
          projectId,
          fileId,
          expectedVersion: version,
        });
      }
      return;
    }
    case "download": {
      const signed = await service.signedDownload({
        projectId,
        fileId: action.fileId,
      });
      if (!signed.url) throw new Error("تعذر إنشاء رابط التحميل الموقّع");
      window.location.assign(signed.url);
      return;
    }
    default:
      throw new Error("هذا الإجراء غير متاح حالياً.");
  }
}

export function useGraduationProjectAction(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (action: UiAction) => {
      try {
        const service = gpService(queryClient);
        const detail = await service.getProjectDetail(projectId);
        const raw = detail as unknown as Record<string, unknown>;
        const version = Number(
          raw.version
            ?? (raw.project as { version?: number } | undefined)?.version
            ?? 0,
        );
        const mapped = mapDetail(raw);
        await runAction(service, projectId, action, version, mapped);
      } catch (error) {
        throw mapError(error);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["graduation-projects"] });
    },
  });
}

/** Re-export bucket constant for tests/contracts. */
export { GP_PRIVATE_BUCKET };
