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
  type FinalizeFileResult,
} from "./rpc";
import type { FileCategory } from "./domain";
import { GP_PRIVATE_BUCKET } from "./domain";
import {
  GraduationProjectsRpcError,
  isStaleVersionError,
} from "./errors";
import {
  invalidateAfterGpMutation,
  invalidateAllGraduationProjects,
  type GpMutationKind,
} from "./invalidation";

/** Private storage port — upload + signed download only (never getPublicUrl). */
export type GpStorageClient = {
  from: (bucket: string) => {
    upload: (
      path: string,
      body: Blob | ArrayBuffer | File | Uint8Array,
      options?: { contentType?: string; upsert?: boolean },
    ) => Promise<{ error: { message: string } | null }>;
    createSignedUrl: (
      path: string,
      expiresIn: number,
    ) => Promise<{
      data: { signedUrl?: string } | null;
      error: { message?: string } | null;
    }>;
  };
};

export interface GraduationProjectsServiceOptions {
  rpc: RpcClient;
  storage?: GpStorageClient;
  queryClient?: QueryClient;
  /** Called when expected-version conflicts require a detail refresh. */
  onStaleVersion?: (projectId: string) => void | Promise<void>;
}

/**
 * Service orchestration over the frozen RPC adapter.
 * Upload: create intent → private binary upload → finalize (sha256 required) → scan gate → signed download.
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

  private requireStorage(): GpStorageClient {
    if (!this.options.storage) {
      throw new GraduationProjectsRpcError("عميل التخزين الخاص غير مهيأ", {
        family: "validation",
      });
    }
    return this.options.storage;
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
    leaderUserId: string;
    programId: string;
    academicYearId: string;
    semesterId: string;
    correlationId?: string;
  }): Promise<string> {
    const id = await this.client.createTeam(input);
    await this.after("team", id);
    return id;
  }

  async addTeamMember(input: {
    projectId: string;
    studentProfileId: string;
    studentUserId: string;
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
    expectedVersion: number;
    correlationId?: string;
  }): Promise<string> {
    const id = await this.client.submitFinal(input);
    await this.after("final", input.projectId);
    return id;
  }

  async reviewFinal(input: {
    projectId: string;
    action: FinalReviewAction;
    comments?: string | null;
    expectedVersion: number;
    correlationId?: string;
    finalId?: string;
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
    facultyProfileId: string;
    userId: string;
    correlationId?: string;
    defenseId?: string;
    chair?: boolean;
  }): Promise<string> {
    const id = await this.client.assignCommitteeMember(input);
    await this.after("committee", input.projectId);
    return id;
  }

  async markDefenseHeld(input: {
    projectId: string;
    expectedVersion: number;
    correlationId?: string;
    defenseId?: string;
  }): Promise<string> {
    return this.withVersionGuard(input.projectId, async () => {
      const id = await this.client.markDefenseHeld(input);
      await this.after("defense", input.projectId);
      return id;
    });
  }

  async submitEvaluation(input: {
    projectId: string;
    score: number;
    notes?: string | null;
    correlationId?: string;
    defenseId?: string;
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

  /* ---------- files: intent → private upload → finalize → scan → signed download ---------- */

  async beginFileUpload(input: {
    projectId: string;
    category: FileCategory;
    originalName: string;
    mediaType?: string;
    byteSize: number;
    sha256?: string | null;
    correlationId?: string;
  }): Promise<{
    fileRef: string;
    objectKey: string;
    bucket: string;
    intent: UploadIntentResult;
  }> {
    const intent = await this.client.createFileUploadIntent({
      projectId: input.projectId,
      category: input.category,
      originalName: input.originalName,
      byteSize: input.byteSize,
      sha256: input.sha256 ?? null,
      correlationId: input.correlationId,
    });
    if (intent.storage_bucket !== GP_PRIVATE_BUCKET) {
      throw new GraduationProjectsRpcError("حاوية التخزين غير مطابقة للعقد", {
        family: "validation",
      });
    }
    await this.after("file", input.projectId);
    return {
      fileRef: intent.file_id,
      objectKey: intent.storage_object_path,
      bucket: intent.storage_bucket,
      intent,
    };
  }

  async uploadPrivateBytes(input: {
    bucket: string;
    objectKey: string;
    bytes: Blob | ArrayBuffer | File | Uint8Array;
    contentType?: string;
  }): Promise<void> {
    if (input.bucket !== GP_PRIVATE_BUCKET) {
      throw new GraduationProjectsRpcError("حاوية التخزين غير مطابقة للعقد", {
        family: "validation",
      });
    }
    const storage = this.requireStorage();
    const { error } = await storage.from(input.bucket).upload(input.objectKey, input.bytes, {
      contentType: input.contentType ?? "application/pdf",
      upsert: false,
    });
    if (error) {
      throw new GraduationProjectsRpcError(error.message || "تعذر رفع الملف الخاص", {
        family: "unknown",
      });
    }
  }

  async finalizeFileUpload(input: {
    projectId: string;
    fileId: string;
    sha256: string;
    correlationId?: string;
  }): Promise<FinalizeFileResult> {
    const result = await this.client.finalizeFile({
      fileId: input.fileId,
      sha256: input.sha256,
      projectId: input.projectId,
      correlationId: input.correlationId,
    });
    await this.after("file", input.projectId);
    return result;
  }

  /**
   * Full private upload: intent → binary upload → finalize with required sha256.
   * Scan gate remains a separate coordinator RPC before signed download is usable.
   */
  async uploadPrivateFile(input: {
    projectId: string;
    category: FileCategory;
    file: File | Blob;
    originalName: string;
    sha256: string;
    correlationId?: string;
  }): Promise<{ fileId: string; finalize: FinalizeFileResult }> {
    if (!input.sha256 || !/^[0-9a-f]{64}$/.test(input.sha256)) {
      throw new GraduationProjectsRpcError("بصمة الملف مطلوبة عند الإنهاء", {
        family: "validation",
      });
    }
    const byteSize = "size" in input.file ? input.file.size : (input.file as Blob).size;
    const begun = await this.beginFileUpload({
      projectId: input.projectId,
      category: input.category,
      originalName: input.originalName,
      byteSize,
      sha256: null,
      correlationId: input.correlationId,
    });
    await this.uploadPrivateBytes({
      bucket: begun.bucket,
      objectKey: begun.objectKey,
      bytes: input.file,
      contentType: "application/pdf",
    });
    const finalize = await this.finalizeFileUpload({
      projectId: input.projectId,
      fileId: begun.fileRef,
      sha256: input.sha256,
      correlationId: input.correlationId,
    });
    return { fileId: begun.fileRef, finalize };
  }

  async markFileScanState(input: {
    fileId: string;
    scanState: "clean" | "quarantined" | "rejected";
    correlationId?: string;
    projectId?: string;
  }): Promise<string> {
    const id = await this.client.markFileScanState(input);
    await this.after("file", input.projectId);
    return id;
  }

  async signedDownload(input: {
    projectId: string;
    fileId: string;
    correlationId?: string;
  }): Promise<SignedDownloadResult> {
    const auth = await this.client.createSignedDownload({
      fileId: input.fileId,
      projectId: input.projectId,
      correlationId: input.correlationId,
    });
    if (auth.storage_bucket !== GP_PRIVATE_BUCKET) {
      throw new GraduationProjectsRpcError("حاوية التخزين غير مطابقة للعقد", {
        family: "validation",
      });
    }
    const storage = this.requireStorage();
    const expiresIn = auth.expires_in_seconds || 300;
    const signed = await storage
      .from(auth.storage_bucket)
      .createSignedUrl(auth.storage_object_path, expiresIn);
    if (signed.error || !signed.data?.signedUrl) {
      throw new GraduationProjectsRpcError("تعذر إنشاء رابط التحميل الموقّع", {
        family: "authorization",
      });
    }
    await this.after("download", input.projectId);
    return {
      ...auth,
      url: signed.data.signedUrl,
      expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  }
}

export function createGraduationProjectsService(
  rpc: RpcClient,
  queryClient?: QueryClient,
  storage?: GpStorageClient,
): GraduationProjectsService {
  return new GraduationProjectsService({ rpc, queryClient, storage });
}
