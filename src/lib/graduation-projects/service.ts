import type { QueryClient } from "@tanstack/react-query";
import {
  filterCoordinatorQueue,
  filterDefenseAssignments,
  filterFacultyAssignments,
  type AdministrationOverviewReport,
  type GraduationProjectDetail,
  type MyProjectRow,
} from "./lifecycle";
import {
  GraduationProjectsRpcClient,
  toCanonicalResultOutcome,
  type FinalReviewAction,
  type ProgressReviewAction,
  type ProposalReviewAction,
  type ResultOutcomeInput,
  type RpcClient,
  type SignedDownloadResult,
  type SupervisionResponse,
  type UploadIntentResult,
} from "./rpc";
import type { FileCategory } from "./domain";
import {
  GraduationProjectsRpcError,
  isStaleVersionError,
} from "./errors";
import {
  invalidateAfterGpMutation,
  invalidateAllGraduationProjects,
  type GpMutationKind,
} from "./invalidation";
import { buildPrivateObjectKey } from "./lifecycle";
import { newCorrelationId } from "./correlation";
import { GP_PRIVATE_BUCKET } from "./domain";

export interface GraduationProjectsServiceOptions {
  rpc: RpcClient;
  queryClient?: QueryClient;
  /** Called when expected-version conflicts require a detail refresh. */
  onStaleVersion?: (projectId: string) => void | Promise<void>;
}

/**
 * Service orchestration over the frozen RPC adapter.
 * Never touches tables/storage outside register → upload → finalize → signed download.
 */
export class GraduationProjectsService {
  readonly client: GraduationProjectsRpcClient;

  constructor(private readonly options: GraduationProjectsServiceOptions) {
    this.client = new GraduationProjectsRpcClient(options.rpc);
  }

  private async after(kind: GpMutationKind, projectId?: string | null): Promise<void> {
    if (this.options.queryClient) {
      await invalidateAfterGpMutation(this.options.queryClient, kind, projectId);
    }
  }

  private async withVersionGuard<T>(
    projectId: string,
    run: () => Promise<T>,
  ): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (isStaleVersionError(error as GraduationProjectsRpcError)) {
        if (this.options.queryClient) {
          await invalidateAllGraduationProjects(this.options.queryClient);
        }
        await this.options.onStaleVersion?.(projectId);
      }
      throw error;
    }
  }

  /* ---------- reads ---------- */

  async listMyProjects(): Promise<MyProjectRow[]> {
    return this.client.listMyProjects();
  }

  async listFacultyAssignments(): Promise<MyProjectRow[]> {
    const rows = await this.client.listMyProjects();
    return filterFacultyAssignments(rows, [
      "coordinator",
      "supervisor",
      "committee_member",
      "panel_member",
    ]);
  }

  async listCoordinatorQueue(): Promise<MyProjectRow[]> {
    const rows = await this.client.listMyProjects();
    return filterCoordinatorQueue(rows);
  }

  async listDefenseAssignments(): Promise<MyProjectRow[]> {
    const rows = await this.client.listMyProjects();
    return filterDefenseAssignments(rows);
  }

  async getProjectDetail(projectId: string): Promise<GraduationProjectDetail> {
    return this.client.getProjectDetail(projectId);
  }

  async listAdministrationOverview(filters?: {
    departmentId?: string | null;
    lifecycleState?: string | null;
  }): Promise<AdministrationOverviewReport> {
    return this.client.listAdministrationOverview(filters);
  }

  /* ---------- team ---------- */

  async createTeam(input: {
    departmentId: string;
    leaderStudentProfileId: string;
    title?: string;
    programId?: string | null;
    academicYearId?: string | null;
    semesterId?: string | null;
    correlationId?: string;
  }): Promise<string> {
    const id = await this.client.createTeam(input);
    await this.after("team", id);
    return id;
  }

  async addTeamMember(input: {
    projectId: string;
    studentProfileId: string;
    correlationId?: string;
  }): Promise<string> {
    const id = await this.client.addTeamMember(input);
    await this.after("team", input.projectId);
    return id;
  }

  async removeTeamMember(input: {
    projectId: string;
    assignmentId: string;
    correlationId?: string;
  }): Promise<string> {
    const id = await this.client.removeTeamMember(input);
    await this.after("team", input.projectId);
    return id;
  }

  /* ---------- proposal ---------- */

  async upsertProposal(input: {
    projectId: string;
    title: string;
    problemStatement: string;
    objectives: string;
    summary: string;
    expectedVersion: number;
    correlationId?: string;
  }): Promise<string> {
    return this.withVersionGuard(input.projectId, async () => {
      const id = await this.client.upsertProposal(input);
      await this.after("proposal", input.projectId);
      return id;
    });
  }

  async submitProposal(input: {
    projectId: string;
    expectedVersion: number;
    correlationId?: string;
  }): Promise<string> {
    return this.withVersionGuard(input.projectId, async () => {
      const id = await this.client.submitProposal(input);
      await this.after("proposal", input.projectId);
      return id;
    });
  }

  async resubmitProposal(input: {
    projectId: string;
    expectedVersion: number;
    correlationId?: string;
  }): Promise<string> {
    return this.withVersionGuard(input.projectId, async () => {
      const id = await this.client.resubmitProposal(input);
      await this.after("proposal", input.projectId);
      return id;
    });
  }

  async reviewProposal(input: {
    projectId: string;
    action: ProposalReviewAction;
    reason?: string | null;
    comments?: string | null;
    expectedVersion: number;
    correlationId?: string;
  }): Promise<string> {
    return this.withVersionGuard(input.projectId, async () => {
      const id = await this.client.reviewProposal(input);
      await this.after("proposal_review", input.projectId);
      return id;
    });
  }

  /* ---------- supervision ---------- */

  async assignSupervisor(input: {
    projectId: string;
    facultyProfileId: string;
    userId: string;
    correlationId?: string;
  }): Promise<string> {
    const id = await this.client.assignSupervisor(input);
    await this.after("supervision", input.projectId);
    return id;
  }

  async respondSupervision(input: {
    projectId: string;
    response: SupervisionResponse;
    expectedVersion: number;
    correlationId?: string;
  }): Promise<string> {
    return this.withVersionGuard(input.projectId, async () => {
      const id = await this.client.respondSupervision(input);
      await this.after("supervision", input.projectId);
      return id;
    });
  }

  /* ---------- progress / final ---------- */

  async submitProgress(input: {
    projectId: string;
    summary: string;
    fileId?: string | null;
    correlationId?: string;
  }): Promise<string> {
    const id = await this.client.submitProgress(input);
    await this.after("progress", input.projectId);
    return id;
  }

  async reviewProgress(input: {
    projectId: string;
    progressId: string;
    action: ProgressReviewAction;
    comments?: string | null;
    correlationId?: string;
  }): Promise<string> {
    const id = await this.client.reviewProgress(input);
    await this.after("progress", input.projectId);
    return id;
  }

  async submitFinal(input: {
    projectId: string;
    fileId: string;
    correlationId?: string;
  }): Promise<string> {
    const id = await this.client.submitFinal(input);
    await this.after("final", input.projectId);
    return id;
  }

  async reviewFinal(input: {
    projectId: string;
    finalId: string;
    action: FinalReviewAction;
    comments?: string | null;
    correlationId?: string;
  }): Promise<string> {
    const id = await this.client.reviewFinal(input);
    await this.after("final", input.projectId);
    return id;
  }

  /* ---------- defense / evaluation / result ---------- */

  async scheduleDefense(input: {
    projectId: string;
    startsAt: string;
    venue: string;
    expectedVersion: number;
    correlationId?: string;
  }): Promise<string> {
    return this.withVersionGuard(input.projectId, async () => {
      const id = await this.client.scheduleDefense(input);
      await this.after("defense", input.projectId);
      return id;
    });
  }

  async assignCommitteeMember(input: {
    projectId: string;
    defenseId: string;
    facultyProfileId: string;
    userId: string;
    chair?: boolean;
    correlationId?: string;
  }): Promise<string> {
    const id = await this.client.assignCommitteeMember(input);
    await this.after("committee", input.projectId);
    return id;
  }

  async markDefenseHeld(input: {
    projectId: string;
    defenseId: string;
    expectedVersion: number;
    correlationId?: string;
  }): Promise<string> {
    return this.withVersionGuard(input.projectId, async () => {
      const id = await this.client.markDefenseHeld(input);
      await this.after("defense", input.projectId);
      return id;
    });
  }

  async submitEvaluation(input: {
    projectId: string;
    defenseId: string;
    score: number;
    notes?: string | null;
    correlationId?: string;
  }): Promise<string> {
    const id = await this.client.submitEvaluation(input);
    await this.after("evaluation", input.projectId);
    return id;
  }

  async concludeResult(input: {
    projectId: string;
    outcome: ResultOutcomeInput;
    expectedVersion: number;
    correlationId?: string;
  }): Promise<string> {
    return this.withVersionGuard(input.projectId, async () => {
      const id = await this.client.concludeResult({
        ...input,
        outcome: toCanonicalResultOutcome(input.outcome),
      });
      await this.after("result", input.projectId);
      return id;
    });
  }

  async archiveProject(input: {
    projectId: string;
    expectedVersion: number;
    correlationId?: string;
  }): Promise<string> {
    return this.withVersionGuard(input.projectId, async () => {
      const id = await this.client.archiveProject(input);
      await this.after("archive", input.projectId);
      return id;
    });
  }

  /* ---------- files: register → (caller uploads) → finalize → signed download ---------- */

  async beginFileUpload(input: {
    projectId: string;
    category: FileCategory;
    originalName: string;
    mediaType: string;
    byteSize: number;
    sha256: string;
    token?: string;
    correlationId?: string;
  }): Promise<{ fileRef: string | UploadIntentResult; objectKey: string; bucket: string }> {
    const token = input.token ?? newCorrelationId().replace(/-/g, "").slice(0, 16);
    const objectKey = buildPrivateObjectKey(input.projectId, input.originalName, token);
    if (!objectKey) {
      throw new GraduationProjectsRpcError("بيانات الملف الوصفية غير مكتملة أو غير صالحة", {
        family: "validation",
      });
    }
    const fileRef = await this.client.registerFile({
      projectId: input.projectId,
      category: input.category,
      objectKey,
      originalName: input.originalName,
      mediaType: input.mediaType,
      byteSize: input.byteSize,
      sha256: input.sha256,
      correlationId: input.correlationId,
    });
    await this.after("file", input.projectId);
    return { fileRef, objectKey, bucket: GP_PRIVATE_BUCKET };
  }

  async finalizeFileUpload(input: {
    projectId: string;
    fileId: string;
    correlationId?: string;
  }): Promise<string | { file_id: string; scan_state: string }> {
    const result = await this.client.finalizeFile(input);
    await this.after("file", input.projectId);
    return result;
  }

  async signedDownload(input: {
    projectId: string;
    fileId: string;
    correlationId?: string;
  }): Promise<SignedDownloadResult> {
    const result = await this.client.createSignedDownload(input);
    await this.after("download", input.projectId);
    return result;
  }
}

export function createGraduationProjectsService(
  rpc: RpcClient,
  queryClient?: QueryClient,
): GraduationProjectsService {
  return new GraduationProjectsService({ rpc, queryClient });
}
