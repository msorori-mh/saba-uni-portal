import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { authorizeProjectAction, type ProjectRole } from "../../src/lib/graduation-projects/domain";
import {
  availableProjectActions,
  ROLE_LABELS,
  visibleEvaluations,
  type EvaluationRow,
} from "../../src/lib/graduation-projects/lifecycle";
import {
  ERROR_LABELS,
  GraduationProjectsRpcClient,
  mapGraduationProjectRpcError,
} from "../../src/lib/graduation-projects/rpc";

const enumMigration = readFileSync(
  "docs/migration-drafts/GRADUATION-PROJECTS-M3-CO-SUPERVISOR-ENUM.NOT_APPLIED.sql",
  "utf8",
);
const hardeningMigration = readFileSync(
  "docs/migration-drafts/GRADUATION-PROJECTS-M4-COMPLETION-HARDENING.NOT_APPLIED.sql",
  "utf8",
);

type RpcCall = { fn: string; args: Record<string, unknown> };

function recordingClient(result: unknown = "00000000-0000-0000-0000-0000000000ff") {
  const calls: RpcCall[] = [];
  const transport = {
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      calls.push({ fn, args: args ?? {} });
      return { data: result, error: null };
    },
  };
  return { calls, client: new GraduationProjectsRpcClient(transport) };
}

describe("co_supervisor role contract", () => {
  test("has an Arabic role label and read-only client action surface", () => {
    expect(ROLE_LABELS.co_supervisor).toBe("مشرف مشارك");
    for (const state of ["draft", "active", "evaluating", "corrections_required"] as const) {
      expect(availableProjectActions(["co_supervisor"], state)).toEqual([]);
    }
  });

  test("domain authorization grants read only, scoped to the same project/department", () => {
    const base = {
      actorId: "u1",
      role: "co_supervisor" as ProjectRole,
      departmentId: "d1",
      projectId: "p1",
      active: true,
      directlyAssigned: true,
    };
    const project = { id: "p1", departmentId: "d1", state: "active" as const };
    expect(authorizeProjectAction(base, project, "read")).toBe(true);
    expect(authorizeProjectAction(base, project, "comment")).toBe(false);
    expect(authorizeProjectAction(base, project, "manage_milestones")).toBe(false);
    expect(authorizeProjectAction({ ...base, projectId: "p2" }, project, "read")).toBe(false);
  });

  test("co_supervisor sees staff-level evaluation visibility", () => {
    const evaluations: EvaluationRow[] = [
      {
        id: "e1",
        discussion_id: "d1",
        panel_member_id: "pm-other",
        rubric_version: "v1",
        state: "draft",
        total_score: 10,
        comments: null,
        submitted_at: null,
        finalized_at: null,
        scores: [],
      },
    ];
    const visible = visibleEvaluations(evaluations, { viewerRoles: ["co_supervisor"], ownPanelMemberIds: [] });
    expect(visible).toHaveLength(1);
  });
});

describe("hardening error labels", () => {
  test("every new guarded SQL message maps to Arabic", () => {
    for (const message of [
      "project supervisor slot already filled",
      "discussion request already pending",
      "panel chair already assigned",
      "scan state invalid",
      "file not found",
      "file scan state already decided",
    ]) {
      expect(ERROR_LABELS[message]).toBeTruthy();
      expect(mapGraduationProjectRpcError({ message }).message).toBe(ERROR_LABELS[message]);
    }
  });
});

describe("foundation RPC wrappers (GP-02 gap closure)", () => {
  test("submitProposal calls the exact RPC with literal args", async () => {
    const { calls, client } = recordingClient();
    await client.submitProposal({ projectId: "p1", expectedVersion: 3, correlationId: "c1" });
    expect(calls).toEqual([
      {
        fn: "submit_graduation_project_proposal",
        args: { p_project_id: "p1", p_expected_version: 3, p_correlation_id: "c1" },
      },
    ]);
  });

  test("addTeamMember calls the exact RPC", async () => {
    const { calls, client } = recordingClient();
    await client.addTeamMember({
      projectId: "p1",
      studentProfileId: "sp1",
      studentUserId: "su1",
      correlationId: "c1",
    });
    expect(calls[0].fn).toBe("add_graduation_project_team_member");
    expect(calls[0].args).toEqual({
      p_project_id: "p1",
      p_student_profile_id: "sp1",
      p_student_user_id: "su1",
      p_correlation_id: "c1",
    });
  });

  test("setMilestone calls the exact RPC", async () => {
    const { calls, client } = recordingClient();
    await client.setMilestone({
      projectId: "p1",
      title: "المرحلة الأولى",
      kind: "final",
      sequence: 2,
      weight: 40,
      correlationId: "c1",
    });
    expect(calls[0].fn).toBe("set_graduation_project_milestone");
    expect(calls[0].args).toEqual({
      p_project_id: "p1",
      p_title: "المرحلة الأولى",
      p_kind: "final",
      p_sequence: 2,
      p_weight: 40,
      p_correlation_id: "c1",
    });
  });

  test("requestDiscussion calls the exact RPC", async () => {
    const { calls, client } = recordingClient();
    await client.requestDiscussion({ projectId: "p1", correlationId: "c1" });
    expect(calls[0]).toEqual({
      fn: "request_graduation_project_discussion",
      args: { p_project_id: "p1", p_correlation_id: "c1" },
    });
  });

  test("finalizeEvaluation calls the exact RPC", async () => {
    const { calls, client } = recordingClient();
    await client.finalizeEvaluation({ evaluationId: "e1", correlationId: "c1" });
    expect(calls[0]).toEqual({
      fn: "finalize_graduation_project_evaluation",
      args: { p_evaluation_id: "e1", p_correlation_id: "c1" },
    });
  });

  test("archiveProject calls the exact RPC", async () => {
    const { calls, client } = recordingClient();
    await client.archiveProject({ projectId: "p1", finalFileId: "f1", expectedVersion: 9, correlationId: "c1" });
    expect(calls[0]).toEqual({
      fn: "archive_graduation_project",
      args: { p_project_id: "p1", p_final_file_id: "f1", p_expected_version: 9, p_correlation_id: "c1" },
    });
  });

  test("wrappers generate a correlation id when omitted", async () => {
    const { calls, client } = recordingClient();
    await client.requestDiscussion({ projectId: "p1" });
    expect(typeof calls[0].args.p_correlation_id).toBe("string");
    expect((calls[0].args.p_correlation_id as string).length).toBeGreaterThan(0);
  });
});

describe("hardening migration structure", () => {
  test("enum value ships in its own migration before any use", () => {
    expect(enumMigration).toContain("alter type public.graduation_project_assignment_role add value 'co_supervisor'");
    expect(hardeningMigration).not.toContain("add value 'co_supervisor'");
    expect(hardeningMigration).toContain("co_supervisor enum value missing; apply the enum migration first");
  });

  test("forward-only guards refuse ambiguous retries", () => {
    expect(enumMigration).toContain("co_supervisor enum value already exists; refuse ambiguous retry");
    expect(hardeningMigration).toContain("graduation projects hardening already exists; refuse ambiguous retry");
    expect(hardeningMigration).toContain("graduation projects lifecycle missing; apply reviewed lifecycle first");
  });

  test("exactly-one hardening indexes exist", () => {
    expect(hardeningMigration).toContain("create unique index graduation_project_single_active_supervisor");
    expect(hardeningMigration).toContain("where active and role in ('supervisor','co_supervisor')");
    expect(hardeningMigration).toContain("create unique index graduation_project_single_pending_discussion_request");
    expect(hardeningMigration).toContain("create unique index graduation_project_single_panel_chair");
  });

  test("guarded P0001 messages precede the new unique-index violations", () => {
    expect(hardeningMigration).toContain("raise exception 'project supervisor slot already filled'");
    expect(hardeningMigration).toContain("raise exception 'discussion request already pending'");
    expect(hardeningMigration).toContain("raise exception 'panel chair already assigned'");
  });

  test("subject-shape check accepts co_supervisor as faculty-side", () => {
    expect(hardeningMigration).toContain("drop constraint assignment_subject_shape");
    expect(hardeningMigration).toContain("'supervisor','co_supervisor','coordinator','department_head','dean','panel_member'");
  });

  test("scan RPC is one-way, fail-closed, and not granted to app roles", () => {
    expect(hardeningMigration).toContain("if p_scan_state not in ('clean','quarantined','rejected') then raise exception 'scan state invalid'; end if;");
    expect(hardeningMigration).toContain("raise exception 'file scan state already decided'");
    expect(hardeningMigration).toContain(
      "revoke all on function public.set_graduation_project_file_scan_state(uuid,text,uuid) from public, anon, authenticated;",
    );
    expect(hardeningMigration).not.toContain("set_graduation_project_file_scan_state(uuid,text,uuid) to authenticated");
  });

  test("scan audit columns are added before the detail reader references them", () => {
    const alterPos = hardeningMigration.indexOf("add column scan_decided_at");
    const readerPos = hardeningMigration.indexOf("create or replace function public.get_graduation_project_detail");
    expect(alterPos).toBeGreaterThan(-1);
    expect(readerPos).toBeGreaterThan(-1);
    expect(alterPos).toBeLessThan(readerPos);
  });

  test("rubric and notification tables stay deny-by-default", () => {
    expect(hardeningMigration).toContain("create table public.graduation_project_rubrics");
    expect(hardeningMigration).toContain("create table public.graduation_project_rubric_criteria");
    expect(hardeningMigration).toContain("create table public.graduation_project_notification_log");
    expect(hardeningMigration).toContain("alter table public.graduation_project_rubrics enable row level security");
    expect(hardeningMigration).toContain("alter table public.graduation_project_notification_log enable row level security");
    expect(hardeningMigration).toContain(
      "revoke all on public.graduation_project_rubrics,\n  public.graduation_project_rubric_criteria,\n  public.graduation_project_notification_log from anon, authenticated;",
    );
    expect(hardeningMigration).toContain(
      "unique(project_id, recipient_user_id, notification_type, entity_id)",
    );
  });

  test("no GRANT drift: hardening adds no table grants and no new authenticated execute", () => {
    const grants = hardeningMigration.match(/grant \w+ on (?!function public\.set_graduation_project_file_scan_state)[^;]+;/gi) ?? [];
    expect(grants).toEqual([]);
  });
});
