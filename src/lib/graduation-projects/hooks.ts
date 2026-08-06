import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { graduationProjectKeys } from "./query-keys";
import {
  GraduationProjectsService,
  createGraduationProjectsService,
} from "./service";
import type {
  AdministrationOverviewReport,
  GraduationProjectDetail,
  MyProjectRow,
} from "./lifecycle";
import type {
  FinalReviewAction,
  ProgressReviewAction,
  ProposalReviewAction,
  ResultOutcomeInput,
  RpcClient,
  SupervisionResponse,
} from "./rpc";
import type { FileCategory } from "./domain";
export type GpServiceFactory = (queryClient: ReturnType<typeof useQueryClient>) => GraduationProjectsService;

let defaultRpcClient: RpcClient | null = null;
let defaultServiceFactory: GpServiceFactory | null = null;

/** Wire the browser Supabase (or test) RPC client once for Package C hooks. */
export function configureGraduationProjectsRpc(client: RpcClient): void {
  defaultRpcClient = client;
  defaultServiceFactory = (qc) => createGraduationProjectsService(client, qc);
}

export function configureGraduationProjectsServiceFactory(factory: GpServiceFactory): void {
  defaultServiceFactory = factory;
}

function useGpService(): GraduationProjectsService {
  const queryClient = useQueryClient();
  if (defaultServiceFactory) return defaultServiceFactory(queryClient);
  if (defaultRpcClient) return createGraduationProjectsService(defaultRpcClient, queryClient);
  throw new Error(
    "Graduation Projects RPC client is not configured. Call configureGraduationProjectsRpc first.",
  );
}

/* ---------- queries (Package C) ---------- */

export function useMyGraduationProjects(
  options?: Omit<UseQueryOptions<MyProjectRow[], Error>, "queryKey" | "queryFn">,
) {
  const service = useGpService();
  return useQuery({
    queryKey: graduationProjectKeys.myProjects(),
    queryFn: () => service.listMyProjects(),
    ...options,
  });
}

export function useGraduationProjectDetail(
  projectId: string | undefined,
  options?: Omit<UseQueryOptions<GraduationProjectDetail, Error>, "queryKey" | "queryFn">,
) {
  const service = useGpService();
  return useQuery({
    queryKey: graduationProjectKeys.projectDetail(projectId ?? ""),
    queryFn: () => service.getProjectDetail(projectId!),
    enabled: Boolean(projectId) && (options?.enabled ?? true),
    ...options,
  });
}

export function useFacultyGraduationAssignments(
  options?: Omit<UseQueryOptions<MyProjectRow[], Error>, "queryKey" | "queryFn">,
) {
  const service = useGpService();
  return useQuery({
    queryKey: graduationProjectKeys.facultyAssignments(),
    queryFn: () => service.listFacultyAssignments(),
    ...options,
  });
}

export function useCoordinatorGraduationQueues(
  options?: Omit<UseQueryOptions<MyProjectRow[], Error>, "queryKey" | "queryFn">,
) {
  const service = useGpService();
  return useQuery({
    queryKey: graduationProjectKeys.coordinatorQueues(),
    queryFn: () => service.listCoordinatorQueue(),
    ...options,
  });
}

export function useDefenseGraduationAssignments(
  options?: Omit<UseQueryOptions<MyProjectRow[], Error>, "queryKey" | "queryFn">,
) {
  const service = useGpService();
  return useQuery({
    queryKey: graduationProjectKeys.defenseAssignments(),
    queryFn: () => service.listDefenseAssignments(),
    ...options,
  });
}

export function useAdministrationGraduationOverview(
  filters?: { departmentId?: string | null; lifecycleState?: string | null },
  options?: Omit<UseQueryOptions<AdministrationOverviewReport, Error>, "queryKey" | "queryFn">,
) {
  const service = useGpService();
  return useQuery({
    queryKey: graduationProjectKeys.administrationOverview(filters),
    queryFn: () => service.listAdministrationOverview(filters),
    ...options,
  });
}

/* ---------- mutations ---------- */

type MutOpts<TData, TVariables> = Omit<
  UseMutationOptions<TData, Error, TVariables>,
  "mutationFn"
>;

export function useCreateGraduationProjectTeam(
  options?: MutOpts<string, {
    departmentId: string;
    leaderStudentProfileId: string;
    title?: string;
    programId?: string | null;
    academicYearId?: string | null;
    semesterId?: string | null;
    correlationId?: string;
  }>,
) {
  const service = useGpService();
  return useMutation({
    mutationFn: (input) => service.createTeam(input),
    ...options,
  });
}

export function useUpsertGraduationProjectProposal(
  projectId: string,
  options?: MutOpts<string, {
    title: string;
    problemStatement: string;
    objectives: string;
    summary: string;
    expectedVersion: number;
    correlationId?: string;
  }>,
) {
  const service = useGpService();
  return useMutation({
    mutationFn: (input) => service.upsertProposal({ ...input, projectId }),
    ...options,
  });
}

export function useSubmitGraduationProjectProposal(
  projectId: string,
  options?: MutOpts<string, { expectedVersion: number; correlationId?: string }>,
) {
  const service = useGpService();
  return useMutation({
    mutationFn: (input) => service.submitProposal({ ...input, projectId }),
    ...options,
  });
}

export function useResubmitGraduationProjectProposal(
  projectId: string,
  options?: MutOpts<string, { expectedVersion: number; correlationId?: string }>,
) {
  const service = useGpService();
  return useMutation({
    mutationFn: (input) => service.resubmitProposal({ ...input, projectId }),
    ...options,
  });
}

export function useReviewGraduationProjectProposal(
  projectId: string,
  options?: MutOpts<string, {
    action: ProposalReviewAction;
    reason?: string | null;
    comments?: string | null;
    expectedVersion: number;
    correlationId?: string;
  }>,
) {
  const service = useGpService();
  return useMutation({
    mutationFn: (input) => service.reviewProposal({ ...input, projectId }),
    ...options,
  });
}

export function useAssignGraduationProjectSupervisor(
  projectId: string,
  options?: MutOpts<string, {
    facultyProfileId: string;
    userId: string;
    correlationId?: string;
  }>,
) {
  const service = useGpService();
  return useMutation({
    mutationFn: (input) => service.assignSupervisor({ ...input, projectId }),
    ...options,
  });
}

export function useRespondGraduationProjectSupervision(
  projectId: string,
  options?: MutOpts<string, {
    response: SupervisionResponse;
    expectedVersion: number;
    correlationId?: string;
  }>,
) {
  const service = useGpService();
  return useMutation({
    mutationFn: (input) => service.respondSupervision({ ...input, projectId }),
    ...options,
  });
}

export function useSubmitGraduationProjectProgress(
  projectId: string,
  options?: MutOpts<string, {
    summary: string;
    fileId?: string | null;
    correlationId?: string;
  }>,
) {
  const service = useGpService();
  return useMutation({
    mutationFn: (input) => service.submitProgress({ ...input, projectId }),
    ...options,
  });
}

export function useReviewGraduationProjectProgress(
  projectId: string,
  options?: MutOpts<string, {
    progressId: string;
    action: ProgressReviewAction;
    comments?: string | null;
    correlationId?: string;
  }>,
) {
  const service = useGpService();
  return useMutation({
    mutationFn: (input) => service.reviewProgress({ ...input, projectId }),
    ...options,
  });
}

export function useSubmitGraduationProjectFinal(
  projectId: string,
  options?: MutOpts<string, { fileId: string; correlationId?: string }>,
) {
  const service = useGpService();
  return useMutation({
    mutationFn: (input) => service.submitFinal({ ...input, projectId }),
    ...options,
  });
}

export function useReviewGraduationProjectFinal(
  projectId: string,
  options?: MutOpts<string, {
    finalId: string;
    action: FinalReviewAction;
    comments?: string | null;
    correlationId?: string;
  }>,
) {
  const service = useGpService();
  return useMutation({
    mutationFn: (input) => service.reviewFinal({ ...input, projectId }),
    ...options,
  });
}

export function useScheduleGraduationProjectDefense(
  projectId: string,
  options?: MutOpts<string, {
    startsAt: string;
    venue: string;
    expectedVersion: number;
    correlationId?: string;
  }>,
) {
  const service = useGpService();
  return useMutation({
    mutationFn: (input) => service.scheduleDefense({ ...input, projectId }),
    ...options,
  });
}

export function useAssignGraduationProjectCommitteeMember(
  projectId: string,
  options?: MutOpts<string, {
    defenseId: string;
    facultyProfileId: string;
    userId: string;
    chair?: boolean;
    correlationId?: string;
  }>,
) {
  const service = useGpService();
  return useMutation({
    mutationFn: (input) => service.assignCommitteeMember({ ...input, projectId }),
    ...options,
  });
}

export function useMarkGraduationProjectDefenseHeld(
  projectId: string,
  options?: MutOpts<string, {
    defenseId: string;
    expectedVersion: number;
    correlationId?: string;
  }>,
) {
  const service = useGpService();
  return useMutation({
    mutationFn: (input) => service.markDefenseHeld({ ...input, projectId }),
    ...options,
  });
}

export function useSubmitGraduationProjectEvaluation(
  projectId: string,
  options?: MutOpts<string, {
    defenseId: string;
    score: number;
    notes?: string | null;
    correlationId?: string;
  }>,
) {
  const service = useGpService();
  return useMutation({
    mutationFn: (input) => service.submitEvaluation({ ...input, projectId }),
    ...options,
  });
}

export function useConcludeGraduationProjectResult(
  projectId: string,
  options?: MutOpts<string, {
    outcome: ResultOutcomeInput;
    expectedVersion: number;
    correlationId?: string;
  }>,
) {
  const service = useGpService();
  return useMutation({
    mutationFn: (input) => service.concludeResult({ ...input, projectId }),
    ...options,
  });
}

export function useArchiveGraduationProject(
  projectId: string,
  options?: MutOpts<string, { expectedVersion: number; correlationId?: string }>,
) {
  const service = useGpService();
  return useMutation({
    mutationFn: (input) => service.archiveProject({ ...input, projectId }),
    ...options,
  });
}

export function useGraduationProjectFileUpload(
  projectId: string,
  options?: MutOpts<
    Awaited<ReturnType<GraduationProjectsService["beginFileUpload"]>>,
    {
      category: FileCategory;
      originalName: string;
      mediaType: string;
      byteSize: number;
      sha256: string;
      token?: string;
      correlationId?: string;
    }
  >,
) {
  const service = useGpService();
  return useMutation({
    mutationFn: (input) => service.beginFileUpload({ ...input, projectId }),
    ...options,
  });
}

export function useFinalizeGraduationProjectFile(
  projectId: string,
  options?: MutOpts<
    Awaited<ReturnType<GraduationProjectsService["finalizeFileUpload"]>>,
    { fileId: string; correlationId?: string }
  >,
) {
  const service = useGpService();
  return useMutation({
    mutationFn: (input) => service.finalizeFileUpload({ ...input, projectId }),
    ...options,
  });
}

export function useGraduationProjectSignedDownload(
  projectId: string,
  options?: MutOpts<
    Awaited<ReturnType<GraduationProjectsService["signedDownload"]>>,
    { fileId: string; correlationId?: string }
  >,
) {
  const service = useGpService();
  return useMutation({
    mutationFn: (input) => service.signedDownload({ ...input, projectId }),
    ...options,
  });
}
