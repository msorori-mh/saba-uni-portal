import { describe, expect, test, beforeEach } from "bun:test";
import {
  CorrelationIdStore,
  correlationKey,
  newCorrelationId,
  resolveCorrelationId,
} from "../../src/lib/graduation-projects/correlation";
import {
  classifyGpError,
  isAuthorizationDenial,
  isGraduationProjectsRpcUnavailable,
  isStaleVersionError,
  mapGraduationProjectRpcError,
  GRADUATION_PROJECTS_SERVICE_UPDATING_MSG,
} from "../../src/lib/graduation-projects/errors";
import { invalidationTargets } from "../../src/lib/graduation-projects/invalidation";
import { graduationProjectKeys } from "../../src/lib/graduation-projects/query-keys";
import {
  FROZEN_READ_RPCS,
  FROZEN_WRITE_RPCS,
  GraduationProjectsRpcClient,
  PACKAGE_A_SIGNATURE_DEPENDENCIES,
  toCanonicalProposalReviewAction,
  toCanonicalResultOutcome,
  type RpcClient,
} from "../../src/lib/graduation-projects/rpc";
import { GraduationProjectsService } from "../../src/lib/graduation-projects/service";
import { visibleEvaluations, type EvaluationRow } from "../../src/lib/graduation-projects/lifecycle";

type Call = { fn: string; args: Record<string, unknown> };

function mockRpc(handler?: (fn: string, args: Record<string, unknown>) => unknown): {
  client: RpcClient;
  calls: Call[];
} {
  const calls: Call[] = [];
  return {
    calls,
    client: {
      async rpc(fn, args = {}) {
        calls.push({ fn, args });
        try {
          const data = handler ? handler(fn, args) : "ok";
          return { data, error: null };
        } catch (error) {
          const err = error as { message: string; code?: string };
          return { data: null, error: { message: err.message, code: err.code } };
        }
      },
    },
  };
}

describe("frozen RPC inventory and argument contracts", () => {
  test("exports full frozen write/read inventory", () => {
    expect(FROZEN_WRITE_RPCS).toContain("create_graduation_project_team");
    expect(FROZEN_WRITE_RPCS).toContain("respond_graduation_project_supervision");
    expect(FROZEN_WRITE_RPCS).toContain("schedule_graduation_project_defense");
    expect(FROZEN_WRITE_RPCS).toContain("conclude_graduation_project_result");
    expect(FROZEN_WRITE_RPCS).toContain("create_graduation_project_signed_download");
    expect(FROZEN_READ_RPCS).toEqual([
      "list_my_graduation_projects",
      "get_graduation_project_detail",
      "list_administration_graduation_projects_overview",
    ]);
    expect(Object.keys(PACKAGE_A_SIGNATURE_DEPENDENCIES).length).toBeGreaterThanOrEqual(20);
  });

  test("maps proposal review and result outcomes to canonical freeze vocabulary", () => {
    expect(toCanonicalProposalReviewAction("approve")).toBe("accept");
    expect(toCanonicalProposalReviewAction("require_revision")).toBe("return");
    expect(toCanonicalProposalReviewAction("reject")).toBe("reject");
    expect(toCanonicalProposalReviewAction("start_review")).toBeNull();
    expect(toCanonicalResultOutcome("completed")).toBe("passed");
    expect(toCanonicalResultOutcome("corrections_required")).toBe("revisions_required");
    expect(toCanonicalResultOutcome("failed")).toBe("failed");
  });

  test("createTeam / reviewProposal / concludeResult send frozen arg names", async () => {
    const { client, calls } = mockRpc();
    const rpc = new GraduationProjectsRpcClient(client);

    await rpc.createTeam({
      departmentId: "d1",
      leaderStudentProfileId: "sp1",
      title: "مشروع",
      correlationId: "c-create",
    });
    expect(calls[0]).toEqual({
      fn: "create_graduation_project_team",
      args: {
        p_department_id: "d1",
        p_leader_student_profile_id: "sp1",
        p_title: "مشروع",
        p_program_id: null,
        p_academic_year_id: null,
        p_semester_id: null,
        p_correlation_id: "c-create",
      },
    });

    await rpc.reviewProposal({
      projectId: "p1",
      action: "approve",
      reason: null,
      expectedVersion: 3,
      correlationId: "c-review",
    });
    expect(calls[1]?.args.p_action).toBe("accept");
    expect(calls[1]?.args.p_expected_version).toBe(3);

    await rpc.concludeResult({
      projectId: "p1",
      outcome: "completed",
      expectedVersion: 4,
      correlationId: "c-result",
    });
    expect(calls[2]?.fn).toBe("conclude_graduation_project_result");
    expect(calls[2]?.args.p_final_decision).toBe("passed");
  });

  test("upload finalize and signed download adapters use frozen RPCs", async () => {
    const { client, calls } = mockRpc((fn) => {
      if (fn === "create_graduation_project_signed_download") {
        return { url: "https://signed.example/x", expires_at: "2026-01-01T00:00:00Z" };
      }
      return "file-1";
    });
    const rpc = new GraduationProjectsRpcClient(client);

    await rpc.registerFile({
      projectId: "p1",
      category: "proposal",
      objectKey: "graduation-projects/p1/t-a.pdf",
      originalName: "a.pdf",
      mediaType: "application/pdf",
      byteSize: 10,
      sha256: "abc",
      correlationId: "c-reg",
    });
    await rpc.finalizeFile({ projectId: "p1", fileId: "file-1", correlationId: "c-fin" });
    const download = await rpc.createSignedDownload({
      projectId: "p1",
      fileId: "file-1",
      correlationId: "c-dl",
    });

    expect(calls.map((c) => c.fn)).toEqual([
      "register_graduation_project_file",
      "finalize_graduation_project_file",
      "create_graduation_project_signed_download",
    ]);
    expect(calls[0]?.args.p_category).toBe("proposal");
    expect(download.url).toContain("https://");
  });

  test("supervision and defense RPCs match freeze names", async () => {
    const { client, calls } = mockRpc();
    const rpc = new GraduationProjectsRpcClient(client);
    await rpc.assignSupervisor({
      projectId: "p1",
      facultyProfileId: "fp1",
      userId: "u1",
      correlationId: "c1",
    });
    await rpc.respondSupervision({
      projectId: "p1",
      response: "accept",
      expectedVersion: 2,
      correlationId: "c2",
    });
    await rpc.scheduleDefense({
      projectId: "p1",
      startsAt: "2026-06-01T10:00:00Z",
      venue: "قاعة 1",
      expectedVersion: 3,
      correlationId: "c3",
    });
    await rpc.submitEvaluation({
      projectId: "p1",
      defenseId: "def1",
      score: 88,
      notes: "جيد",
      correlationId: "c4",
    });
    expect(calls.map((c) => c.fn)).toEqual([
      "assign_graduation_project_supervisor",
      "respond_graduation_project_supervision",
      "schedule_graduation_project_defense",
      "submit_graduation_project_evaluation",
    ]);
    expect(calls[3]?.args.p_score).toBe(88);
  });

  test("client never uses table from()", async () => {
    const source = await Bun.file("src/lib/graduation-projects/rpc.ts").text();
    expect(source).not.toMatch(/\.from\(/);
    for (const name of FROZEN_WRITE_RPCS) expect(source).toContain(`"${name}"`);
    for (const name of FROZEN_READ_RPCS) expect(source).toContain(`"${name}"`);
  });
});

describe("error mapping families", () => {
  test("unavailable schema maps to Arabic updating message", () => {
    const mapped = mapGraduationProjectRpcError({
      message: 'function public.create_graduation_project_team does not exist',
      code: "42883",
    });
    expect(mapped.unavailable).toBe(true);
    expect(mapped.message).toBe(GRADUATION_PROJECTS_SERVICE_UPDATING_MSG);
    expect(isGraduationProjectsRpcUnavailable({ code: "42883", message: "x" })).toBe(true);
  });

  test("authorization denials are not swallowed into unavailable", () => {
    const mapped = mapGraduationProjectRpcError({
      message: "exact direct processing assignment required",
      code: "P0001",
    });
    expect(mapped.authorizationDenied).toBe(true);
    expect(mapped.unavailable).toBe(false);
    expect(mapped.message).toContain("تعييناً مباشراً");
    expect(isAuthorizationDenial(mapped)).toBe(true);
    expect(classifyGpError({ message: "exact direct processing assignment required" })).toBe("authorization");
  });

  test("stale version family is detectable for refresh", () => {
    const mapped = mapGraduationProjectRpcError({ message: "stale project version" });
    expect(mapped.staleVersion).toBe(true);
    expect(isStaleVersionError(mapped)).toBe(true);
  });
});

describe("correlation id generation and retry reuse", () => {
  test("newCorrelationId returns uuid-like values", () => {
    const a = newCorrelationId();
    const b = newCorrelationId();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(10);
  });

  test("resolveCorrelationId reuses store entry for same logical action", () => {
    const store = new CorrelationIdStore();
    const first = resolveCorrelationId({
      scope: "submit_proposal",
      projectId: "p1",
      store,
    });
    const second = resolveCorrelationId({
      scope: "submit_proposal",
      projectId: "p1",
      store,
    });
    expect(first).toBe(second);
    expect(correlationKey("submit_proposal", "p1")).toBe("submit_proposal:p1:");
    store.clear(correlationKey("submit_proposal", "p1"));
    const third = resolveCorrelationId({
      scope: "submit_proposal",
      projectId: "p1",
      store,
    });
    expect(third).not.toBe(first);
  });

  test("rpc client reuses correlation on retry when not overridden", async () => {
    const store = new CorrelationIdStore();
    const { client, calls } = mockRpc();
    const rpc = new GraduationProjectsRpcClient(client, store);
    await rpc.submitProposal({ projectId: "p1", expectedVersion: 1 });
    await rpc.submitProposal({ projectId: "p1", expectedVersion: 1 });
    expect(calls[0]?.args.p_correlation_id).toBe(calls[1]?.args.p_correlation_id);
  });
});

describe("service orchestration and stale-version refresh", () => {
  test("service maps conclude outcome and invalidation targets include detail", async () => {
    const { client, calls } = mockRpc();
    let staleHits = 0;
    const service = new GraduationProjectsService({
      rpc: client,
      onStaleVersion: () => {
        staleHits += 1;
      },
    });

    await service.concludeResult({
      projectId: "p1",
      outcome: "corrections_required",
      expectedVersion: 5,
      correlationId: "c-c",
    });
    expect(calls[0]?.args.p_final_decision).toBe("revisions_required");

    const { client: failClient } = mockRpc(() => {
      throw { message: "stale project version", code: "P0002" };
    });
    const failing = new GraduationProjectsService({
      rpc: failClient,
      onStaleVersion: async () => {
        staleHits += 1;
      },
    });
    await expect(failing.submitProposal({
      projectId: "p1",
      expectedVersion: 1,
      correlationId: "x",
    })).rejects.toMatchObject({ staleVersion: true });
    expect(staleHits).toBe(1);
  });

  test("beginFileUpload builds safe key and registers proposal category", async () => {
    const { client, calls } = mockRpc(() => "file-9");
    const service = new GraduationProjectsService({ rpc: client });
    const result = await service.beginFileUpload({
      projectId: "p1",
      category: "proposal",
      originalName: "proposal.pdf",
      mediaType: "application/pdf",
      byteSize: 12,
      sha256: "deadbeef",
      token: "tok123",
      correlationId: "c-up",
    });
    expect(result.objectKey).toBe("graduation-projects/p1/tok123-proposal.pdf");
    expect(result.bucket).toBe("graduation-projects-files");
    expect(calls[0]?.args.p_category).toBe("proposal");
  });

  test("queue helpers filter faculty/coordinator/defense without cross-role leakage", async () => {
    const rows = [
      {
        project_id: "p1",
        department_id: "d1",
        title: "t",
        state: "submitted" as const,
        progress_percent: 0,
        at_risk: false,
        version: 1,
        roles: ["coordinator"],
        updated_at: "t",
      },
      {
        project_id: "p2",
        department_id: "d1",
        title: "t2",
        state: "evaluating" as const,
        lifecycle_state: "evaluating" as const,
        progress_percent: 100,
        at_risk: false,
        version: 2,
        roles: ["committee_member"],
        updated_at: "t",
      },
    ];
    const { client } = mockRpc((fn) => {
      if (fn === "list_my_graduation_projects") return rows;
      return null;
    });
    const service = new GraduationProjectsService({ rpc: client });
    expect((await service.listCoordinatorQueue()).map((r) => r.project_id)).toEqual(["p1"]);
    expect((await service.listDefenseAssignments()).map((r) => r.project_id)).toEqual(["p2"]);
  });
});

describe("query keys and mutation invalidation rules", () => {
  test("query keys cover required Package C surfaces", () => {
    expect(graduationProjectKeys.myProjects()).toEqual(["graduation-projects", "my-projects"]);
    expect(graduationProjectKeys.projectDetail("p1")).toEqual(["graduation-projects", "detail", "p1"]);
    expect(graduationProjectKeys.facultyAssignments()[1]).toBe("faculty-assignments");
    expect(graduationProjectKeys.coordinatorQueues()[1]).toBe("coordinator-queues");
    expect(graduationProjectKeys.defenseAssignments()[1]).toBe("defense-assignments");
    expect(graduationProjectKeys.administrationOverview({ departmentId: "d1" })).toContain("d1");
  });

  test("invalidation targets always include lists and detail when project present", () => {
    const targets = invalidationTargets("evaluation", "p1").map((t) => t.join("/"));
    expect(targets).toContain("graduation-projects/my-projects");
    expect(targets).toContain("graduation-projects/detail/p1");
    expect(targets).toContain("graduation-projects/defense-assignments");
    const archiveTargets = invalidationTargets("archive", "p1").map((t) => t.join("/"));
    expect(archiveTargets.some((t) => t.includes("administration-overview"))).toBe(true);
  });
});

describe("visibility filtering regression", () => {
  beforeEach(() => {});

  test("peer notes never leak through visibleEvaluations", () => {
    const evaluations: EvaluationRow[] = [
      {
        id: "e1",
        discussion_id: "d1",
        panel_member_id: "pm1",
        rubric_version: "mvp",
        state: "submitted",
        total_score: 70,
        comments: "mine",
        submitted_at: "t",
        finalized_at: null,
        scores: [],
        notes: "mine",
      },
      {
        id: "e2",
        discussion_id: "d1",
        panel_member_id: "pm2",
        rubric_version: "mvp",
        state: "submitted",
        total_score: 95,
        comments: "peer-secret",
        submitted_at: "t",
        finalized_at: null,
        scores: [],
        notes: "peer-secret",
      },
    ];
    const visible = visibleEvaluations(evaluations, {
      viewerRoles: ["committee_member"],
      ownPanelMemberIds: ["pm1"],
    });
    expect(visible).toHaveLength(1);
    expect(JSON.stringify(visible)).not.toContain("peer-secret");
  });
});
