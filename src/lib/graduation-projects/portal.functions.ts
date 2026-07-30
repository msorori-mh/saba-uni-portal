import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchCanonicalCurrentTerm } from "@/lib/current-term";
import {
  assertGraduationProjectsAvailable,
  isGraduationProjectsPortalMockEnabled,
  probeGraduationProjectsRuntime,
  type GraduationProjectsRuntimeProbe,
} from "./availability";
import { applyPortalPrivacy, deriveDiscussionReadiness } from "./portal-privacy";
import {
  GraduationProjectsRpcClient,
  GraduationProjectsRpcError,
  GRADUATION_PROJECTS_SERVICE_UPDATING_MSG,
  type CorrectionInput,
  type DiscussionOutcome,
  type ProposalReviewAction,
  type ResultOutcome,
  type SubmissionReviewAction,
} from "./rpc";
import type {
  GraduationProjectArchiveReport,
  GraduationProjectAssignmentsReport,
  GraduationProjectDetail,
  GraduationProjectEvaluationsReport,
  GraduationProjectStatesReport,
  MyProjectRow,
  AssignmentCandidates,
  EvaluationScoreRow,
  ProjectNotificationRow,
} from "./lifecycle";
import type { DiscussionReadiness } from "./domain";
import { buildPrivateObjectKey } from "./lifecycle";

const uuid = z.string().uuid();

type RpcLike = ConstructorParameters<typeof GraduationProjectsRpcClient>[0];

function clientOf(supabase: RpcLike) {
  return new GraduationProjectsRpcClient(supabase);
}

async function ensureAvailable(supabase: RpcLike) {
  const probe = await probeGraduationProjectsRuntime(supabase);
  assertGraduationProjectsAvailable(probe);
  return probe;
}

function mapThrown(error: unknown): never {
  if (error instanceof GraduationProjectsRpcError) throw error;
  if (error instanceof Error) throw new GraduationProjectsRpcError(error.message);
  throw new GraduationProjectsRpcError(GRADUATION_PROJECTS_SERVICE_UPDATING_MSG, "", true);
}

const MOCK_PROJECTS: MyProjectRow[] = [
  {
    project_id: "11111111-1111-1111-1111-111111111111",
    department_id: "22222222-2222-2222-2222-222222222222",
    title: "مشروع تجريبي (تطوير محلي فقط)",
    state: "active",
    progress_percent: 40,
    at_risk: false,
    version: 1,
    roles: ["student"],
    updated_at: new Date(0).toISOString(),
  },
];

export type GraduationProjectDetailView = {
  detail: GraduationProjectDetail;
  readiness: DiscussionReadiness;
  viewerUserId: string;
};

const emptyInput = (input: unknown) =>
  z
    .object({})
    .strict()
    .parse(input ?? {});

export const probeGraduationProjectsAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(emptyInput)
  .handler(async ({ context }): Promise<GraduationProjectsRuntimeProbe> => {
    return probeGraduationProjectsRuntime(context.supabase);
  });

export const listMyGraduationProjects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(emptyInput)
  .handler(async ({ context }): Promise<MyProjectRow[]> => {
    try {
      await ensureAvailable(context.supabase);
      if (isGraduationProjectsPortalMockEnabled()) return MOCK_PROJECTS;
      return await clientOf(context.supabase).listMyProjects();
    } catch (error) {
      mapThrown(error);
    }
  });

export const getGraduationProjectDetailView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: uuid }).strict().parse(input))
  .handler(async ({ data, context }): Promise<GraduationProjectDetailView> => {
    try {
      await ensureAvailable(context.supabase);
      if (isGraduationProjectsPortalMockEnabled()) {
        throw new GraduationProjectsRpcError(
          "المحاكاة المحلية لا تعرض تفاصيل مشروع كاملة. عطّل GRADUATION_PROJECTS_PORTAL_MOCK.",
        );
      }
      const raw = await clientOf(context.supabase).getProjectDetail(data.projectId);
      const detail = applyPortalPrivacy(raw, context.userId);
      return {
        detail,
        readiness: deriveDiscussionReadiness(raw),
        viewerUserId: context.userId,
      };
    } catch (error) {
      mapThrown(error);
    }
  });

export type GraduationProjectsCreateContext = {
  departmentId: string | null;
  programId: string | null;
  academicYearId: string | null;
  semesterId: string | null;
  canCreate: boolean;
};

export const getGraduationProjectsCreateContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(emptyInput)
  .handler(async ({ context }): Promise<GraduationProjectsCreateContext> => {
    try {
      await ensureAvailable(context.supabase);
    } catch (error) {
      mapThrown(error);
    }

    const { data: faculty } = await context.supabase
      .from("faculty_profiles")
      .select("department_id, program_id")
      .eq("user_id", context.userId)
      .maybeSingle();

    const term = await fetchCanonicalCurrentTerm(
      context.supabase as Parameters<typeof fetchCanonicalCurrentTerm>[0],
    );
    const departmentId =
      (faculty as { department_id?: string | null } | null)?.department_id ?? null;
    const programId = (faculty as { program_id?: string | null } | null)?.program_id ?? null;
    const academicYearId = term?.year.id ?? null;
    const semesterId = term?.semester.id ?? null;
    return {
      departmentId,
      programId,
      academicYearId,
      semesterId,
      canCreate: Boolean(departmentId && programId && academicYearId && semesterId),
    };
  });

const createSchema = z
  .object({
    title: z.string().trim().min(3).max(300),
    abstract: z.string().trim().max(5000),
    departmentId: uuid,
    programId: uuid,
    academicYearId: uuid,
    semesterId: uuid,
  })
  .strict();

export const createGraduationProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    try {
      await ensureAvailable(context.supabase);
      // Never accept actor ids from the client — auth.uid() is authoritative in RPC.
      return await clientOf(context.supabase).createProject({
        departmentId: data.departmentId,
        title: data.title,
        abstract: data.abstract,
        programId: data.programId,
        academicYearId: data.academicYearId,
        semesterId: data.semesterId,
      });
    } catch (error) {
      mapThrown(error);
    }
  });

const projectVersionSchema = z
  .object({
    projectId: uuid,
    expectedVersion: z.number().int().nonnegative(),
  })
  .strict();

export const submitGraduationProjectProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => projectVersionSchema.parse(input))
  .handler(async ({ data, context }) => {
    try {
      await ensureAvailable(context.supabase);
      return await clientOf(context.supabase).submitProposal(data);
    } catch (error) {
      mapThrown(error);
    }
  });

export const resubmitGraduationProjectProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => projectVersionSchema.parse(input))
  .handler(async ({ data, context }) => {
    try {
      await ensureAvailable(context.supabase);
      return await clientOf(context.supabase).resubmitProposal(data);
    } catch (error) {
      mapThrown(error);
    }
  });

export const reviewGraduationProjectProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    projectVersionSchema
      .extend({
        action: z.enum(["start_review", "approve", "reject", "require_revision"]),
        reason: z.string().trim().max(2000).nullable().optional(),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    try {
      await ensureAvailable(context.supabase);
      return await clientOf(context.supabase).reviewProposal({
        projectId: data.projectId,
        action: data.action as ProposalReviewAction,
        reason: data.reason ?? null,
        expectedVersion: data.expectedVersion,
      });
    } catch (error) {
      mapThrown(error);
    }
  });

export const submitGraduationProjectDeliverable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: uuid,
        milestoneId: uuid,
        summary: z.string().trim().min(1).max(5000),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    try {
      await ensureAvailable(context.supabase);
      return await clientOf(context.supabase).submitDeliverable(data);
    } catch (error) {
      mapThrown(error);
    }
  });

export const reviewGraduationProjectSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: uuid,
        submissionId: uuid,
        action: z.enum(["accept", "require_revision"]),
        note: z.string().trim().max(2000).nullable().optional(),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    try {
      await ensureAvailable(context.supabase);
      return await clientOf(context.supabase).reviewSubmission({
        projectId: data.projectId,
        submissionId: data.submissionId,
        action: data.action as SubmissionReviewAction,
        note: data.note ?? null,
      });
    } catch (error) {
      mapThrown(error);
    }
  });

export const addGraduationProjectSupervisorNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: uuid,
        note: z.string().trim().min(1).max(5000),
        submissionId: uuid.nullable().optional(),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    try {
      await ensureAvailable(context.supabase);
      return await clientOf(context.supabase).addSupervisorNote({
        projectId: data.projectId,
        note: data.note,
        submissionId: data.submissionId ?? null,
      });
    } catch (error) {
      mapThrown(error);
    }
  });

export const resolveGraduationProjectSupervisorNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: uuid, noteId: uuid }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    try {
      await ensureAvailable(context.supabase);
      return await clientOf(context.supabase).resolveSupervisorNote(data);
    } catch (error) {
      mapThrown(error);
    }
  });

export const registerGraduationProjectFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: uuid,
        submissionId: uuid.nullable().optional(),
        originalName: z.string().trim().min(1).max(255),
        mediaType: z.string().trim().min(1).max(120),
        byteSize: z
          .number()
          .int()
          .positive()
          .max(50 * 1024 * 1024),
        sha256: z.string().regex(/^[0-9a-f]{64}$/i),
        fileKind: z
          .enum([
            "attachment", "proposal", "milestone_submission", "supervisor_feedback",
            "final_manuscript", "presentation", "source_archive", "defense_minutes",
            "correction_version", "archived_final",
          ])
          .optional(),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    try {
      await ensureAvailable(context.supabase);
      const token = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
      const objectKey = buildPrivateObjectKey(data.projectId, data.originalName, token);
      if (!objectKey) {
        throw new GraduationProjectsRpcError("بيانات الملف الوصفية غير مكتملة أو غير صالحة");
      }
      // Server builds the private object key — never trust a client-supplied path.
      return await clientOf(context.supabase).registerFile({
        projectId: data.projectId,
        submissionId: data.submissionId ?? null,
        objectKey,
        originalName: data.originalName,
        mediaType: data.mediaType,
        byteSize: data.byteSize,
        sha256: data.sha256.toLowerCase(),
        fileKind: data.fileKind ?? "attachment",
      });
    } catch (error) {
      mapThrown(error);
    }
  });

export const listMyGraduationProjectNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(emptyInput)
  .handler(async ({ context }): Promise<ProjectNotificationRow[]> => {
    try {
      await ensureAvailable(context.supabase);
      return await clientOf(context.supabase).listMyNotifications();
    } catch (error) {
      mapThrown(error);
    }
  });

export const requestGraduationProjectDiscussion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: uuid }).strict().parse(input))
  .handler(async ({ data, context }) => {
    try {
      await ensureAvailable(context.supabase);
      return await clientOf(context.supabase).requestDiscussion(data);
    } catch (error) {
      mapThrown(error);
    }
  });

export const scheduleGraduationProjectDiscussion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: uuid,
        requestId: uuid,
        startsAt: z.string().trim().min(1),
        venue: z.string().trim().min(1).max(300),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    try {
      await ensureAvailable(context.supabase);
      return await clientOf(context.supabase).scheduleDiscussion(data);
    } catch (error) {
      mapThrown(error);
    }
  });

export const rejectGraduationProjectDiscussionRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: uuid,
        requestId: uuid,
        reason: z.string().trim().min(1).max(2000),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    try {
      await ensureAvailable(context.supabase);
      return await clientOf(context.supabase).rejectDiscussionRequest(data);
    } catch (error) {
      mapThrown(error);
    }
  });

export const assignGraduationProjectPanelMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: uuid,
        discussionId: uuid,
        assignmentId: uuid,
        chair: z.boolean(),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    try {
      await ensureAvailable(context.supabase);
      return await clientOf(context.supabase).assignPanelMember(data);
    } catch (error) {
      mapThrown(error);
    }
  });

export const recordGraduationProjectDiscussionOutcome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: uuid,
        discussionId: uuid,
        outcome: z.enum(["held", "postponed", "cancelled"]),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    try {
      await ensureAvailable(context.supabase);
      return await clientOf(context.supabase).recordDiscussionOutcome({
        projectId: data.projectId,
        discussionId: data.discussionId,
        outcome: data.outcome as DiscussionOutcome,
      });
    } catch (error) {
      mapThrown(error);
    }
  });

export const saveGraduationProjectEvaluation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: uuid,
        discussionId: uuid,
        scores: z
          .array(
            z.object({
              criterion_code: z.string(),
              criterion_label: z.string(),
              maximum_score: z.number(),
              awarded_score: z.number(),
              comment: z.string().nullable().optional(),
            }),
          )
          .min(1),
        comments: z.string().trim().max(5000).nullable().optional(),
        submit: z.boolean(),
        rubricVersion: z.string().trim().min(1).max(80).optional(),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    try {
      await ensureAvailable(context.supabase);
      return await clientOf(context.supabase).saveEvaluation({
        projectId: data.projectId,
        discussionId: data.discussionId,
        rubricVersion: data.rubricVersion ?? "v1",
        scores: data.scores as EvaluationScoreRow[],
        comments: data.comments ?? null,
        submit: data.submit,
      });
    } catch (error) {
      mapThrown(error);
    }
  });

export const concludeGraduationProjectResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    projectVersionSchema
      .extend({
        outcome: z.enum(["completed", "corrections_required"]),
        corrections: z
          .array(
            z.object({
              description: z.string().trim().min(1).max(2000),
              due_at: z.string().nullable().optional(),
            }),
          )
          .optional(),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    try {
      await ensureAvailable(context.supabase);
      return await clientOf(context.supabase).concludeResult({
        projectId: data.projectId,
        outcome: data.outcome as ResultOutcome,
        corrections: (data.corrections ?? []) as CorrectionInput[],
        expectedVersion: data.expectedVersion,
      });
    } catch (error) {
      mapThrown(error);
    }
  });

export const completeGraduationProjectCorrection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: uuid, correctionId: uuid }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    try {
      await ensureAvailable(context.supabase);
      return await clientOf(context.supabase).completeCorrection(data);
    } catch (error) {
      mapThrown(error);
    }
  });

export const acceptGraduationProjectCorrection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: uuid, correctionId: uuid }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    try {
      await ensureAvailable(context.supabase);
      return await clientOf(context.supabase).acceptCorrection(data);
    } catch (error) {
      mapThrown(error);
    }
  });

export const addGraduationProjectTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: uuid, studentProfileId: uuid }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    try {
      await ensureAvailable(context.supabase);
      // Derive the user id server-side from the profile — never trust the client.
      const { data: profile, error: profileError } = await context.supabase
        .from("student_profiles")
        .select("id, user_id")
        .eq("id", data.studentProfileId)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profile?.user_id) throw new GraduationProjectsRpcError("الطالب غير موجود");
      return await clientOf(context.supabase).addTeamMember({
        projectId: data.projectId,
        studentProfileId: data.studentProfileId,
        studentUserId: profile.user_id,
      });
    } catch (error) {
      mapThrown(error);
    }
  });

export const assignGraduationProjectFaculty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: uuid,
        role: z.enum(["supervisor", "co_supervisor", "coordinator", "panel_member"]),
        facultyProfileId: uuid,
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    try {
      await ensureAvailable(context.supabase);
      const { data: profile, error: profileError } = await context.supabase
        .from("faculty_profiles")
        .select("id, user_id")
        .eq("id", data.facultyProfileId)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profile?.user_id) throw new GraduationProjectsRpcError("عضو هيئة التدريس غير موجود");
      return await clientOf(context.supabase).assignFaculty({
        projectId: data.projectId,
        role: data.role,
        facultyProfileId: data.facultyProfileId,
        userId: profile.user_id,
      });
    } catch (error) {
      mapThrown(error);
    }
  });

export const endGraduationProjectAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: uuid, assignmentId: uuid }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    try {
      await ensureAvailable(context.supabase);
      return await clientOf(context.supabase).endAssignment(data);
    } catch (error) {
      mapThrown(error);
    }
  });

export const setGraduationProjectMilestone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: uuid,
        title: z.string().trim().min(1).max(300),
        kind: z.enum(["progress", "final"]),
        sequence: z.number().int().positive(),
        weight: z.number().positive().max(100),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    try {
      await ensureAvailable(context.supabase);
      return await clientOf(context.supabase).setMilestone(data);
    } catch (error) {
      mapThrown(error);
    }
  });

export const finalizeGraduationProjectEvaluation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ evaluationId: uuid }).strict().parse(input))
  .handler(async ({ data, context }) => {
    try {
      await ensureAvailable(context.supabase);
      return await clientOf(context.supabase).finalizeEvaluation(data);
    } catch (error) {
      mapThrown(error);
    }
  });

export const archiveGraduationProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ projectId: uuid, finalFileId: uuid, expectedVersion: z.number().int().nonnegative() })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    try {
      await ensureAvailable(context.supabase);
      return await clientOf(context.supabase).archiveProject(data);
    } catch (error) {
      mapThrown(error);
    }
  });

/**
 * Department-scoped picker candidates for team/faculty assignment forms. The
 * project detail RPC remains the authorization gate: only a viewer with an
 * active assignment on the project receives candidates for its department.
 */
export const listGraduationProjectAssignmentCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: uuid }).strict().parse(input))
  .handler(async ({ data, context }): Promise<AssignmentCandidates> => {
    try {
      await ensureAvailable(context.supabase);
      const detail = await clientOf(context.supabase).getProjectDetail(data.projectId);
      const departmentId = detail.project.department_id;
      const [{ data: students, error: studentsError }, { data: faculty, error: facultyError }] =
        await Promise.all([
          context.supabase
            .from("student_profiles")
            .select("id, user_id, full_name_ar")
            .eq("department_id", departmentId),
          context.supabase
            .from("faculty_profiles")
            .select("id, user_id, full_name_ar")
            .eq("department_id", departmentId),
        ]);
      if (studentsError) throw studentsError;
      if (facultyError) throw facultyError;
      const mapRow = (row: { id: string; user_id: string | null; full_name_ar: string }) => ({
        profile_id: row.id,
        user_id: row.user_id ?? "",
        full_name: row.full_name_ar,
      });
      return {
        students: (students ?? []).filter((row) => row.user_id).map(mapRow),
        faculty: (faculty ?? []).filter((row) => row.user_id).map(mapRow),
      };
    } catch (error) {
      mapThrown(error);
    }
  });

const reportKindSchema = z
  .object({
    departmentId: uuid,
    kind: z.enum(["states", "assignments", "evaluations", "archive"]),
  })
  .strict();

export const loadGraduationProjectReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reportKindSchema.parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<
      | GraduationProjectStatesReport
      | GraduationProjectAssignmentsReport
      | GraduationProjectEvaluationsReport
      | GraduationProjectArchiveReport
    > => {
      try {
        await ensureAvailable(context.supabase);
        const rpc = clientOf(context.supabase);
        switch (data.kind) {
          case "states":
            return await rpc.getStatesReport(data.departmentId);
          case "assignments":
            return await rpc.getAssignmentsReport(data.departmentId);
          case "evaluations":
            return await rpc.getEvaluationsReport(data.departmentId);
          case "archive":
            return await rpc.getArchiveReport(data.departmentId);
        }
      } catch (error) {
        mapThrown(error);
      }
    },
  );
