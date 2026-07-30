import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  applyPortalPrivacy,
  deriveDiscussionReadiness,
  isStudentOnlyViewer,
  portalStateMessage,
} from "../../src/lib/graduation-projects/portal-privacy";
import {
  assertGraduationProjectsAvailable,
  isGraduationProjectsPortalMockEnabled,
  probeGraduationProjectsRuntime,
} from "../../src/lib/graduation-projects/availability";
import {
  GRADUATION_PROJECTS_SERVICE_UPDATING_MSG,
  GraduationProjectsRpcClient,
  GraduationProjectsRpcError,
  isGraduationProjectsRpcUnavailable,
} from "../../src/lib/graduation-projects/rpc";
import {
  availableProjectActions,
  type GraduationProjectDetail,
} from "../../src/lib/graduation-projects/lifecycle";
import { canAccessAdminRoute, canSeeNavItem, NAV_ITEM_ROLES } from "../../src/lib/admin-nav";

const root = join(import.meta.dir, "../..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

function baseDetail(overrides: Partial<GraduationProjectDetail> = {}): GraduationProjectDetail {
  return {
    project: {
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      department_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      program_id: null,
      academic_year_id: null,
      semester_id: null,
      proposal_title: "عنوان",
      proposal_abstract: "ملخص",
      state: "evaluating",
      progress_percent: 80,
      at_risk: false,
      version: 3,
      approved_at: null,
      completed_at: null,
      archived_at: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    },
    viewer_roles: ["student"],
    assignments: [
      {
        id: "asg-student",
        role: "student",
        user_id: "student-user",
        student_profile_id: "sp1",
        faculty_profile_id: null,
        active: true,
        assigned_at: "2026-01-01T00:00:00Z",
        ended_at: null,
      },
    ],
    milestones: [],
    submissions: [],
    files: [
      {
        id: "f1",
        submission_id: null,
        original_name: "doc.pdf",
        media_type: "application/pdf",
        byte_size: 10,
        scan_state: "clean",
        object_key: "graduation-projects/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/tok-doc.pdf",
        uploaded_by_assignment_id: "asg-student",
        created_at: "2026-01-01T00:00:00Z",
      },
    ],
    notes: [],
    approvals: [],
    discussion_requests: [],
    discussions: [],
    panel_members: [],
    evaluations: [
      {
        id: "ev1",
        discussion_id: "d1",
        panel_member_id: "pm1",
        rubric_version: "v1",
        state: "finalized",
        total_score: 90,
        comments: "سرّي",
        submitted_at: "2026-01-01T00:00:00Z",
        finalized_at: "2026-01-01T00:00:00Z",
        scores: [],
      },
    ],
    corrections: [],
    archive: null,
    events: [
      {
        id: 1,
        event_type: "proposal_submitted",
        entity_type: "graduation_projects",
        entity_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        actor_user_id: "actor-1",
        actor_assignment_id: "asg-student",
        reason: null,
        payload: { secret: true },
        occurred_at: "2026-01-01T00:00:00Z",
      },
    ],
    ...overrides,
  };
}

describe("graduation-projects portal routes registration", () => {
  test("1 — route files register the required portal paths", () => {
    expect(read("src/routes/student.graduation-project.tsx")).toContain(
      'createFileRoute("/student/graduation-project")',
    );
    expect(read("src/routes/student.graduation-project.index.tsx")).toContain(
      'createFileRoute("/student/graduation-project/")',
    );
    expect(read("src/routes/student.graduation-project.$projectId.tsx")).toContain(
      'createFileRoute("/student/graduation-project/$projectId")',
    );
    expect(read("src/routes/faculty-portal.graduation-projects.tsx")).toContain(
      'createFileRoute("/faculty-portal/graduation-projects")',
    );
    expect(read("src/routes/faculty-portal.graduation-projects.index.tsx")).toContain(
      'createFileRoute("/faculty-portal/graduation-projects/")',
    );
    expect(read("src/routes/faculty-portal.graduation-projects.$projectId.tsx")).toContain(
      'createFileRoute("/faculty-portal/graduation-projects/$projectId")',
    );
    expect(read("src/routes/admin/graduation-projects.tsx")).toContain(
      'createFileRoute("/admin/graduation-projects")',
    );
    expect(read("src/routes/admin/graduation-projects.index.tsx")).toContain(
      'createFileRoute("/admin/graduation-projects/")',
    );
    expect(read("src/routes/admin/graduation-projects.$projectId.tsx")).toContain(
      'createFileRoute("/admin/graduation-projects/$projectId")',
    );
  });

  test("2 — route visibility follows portal audience nav entries", () => {
    const studentDash = read("src/routes/student.index.tsx");
    expect(studentDash).toContain('to: "/student/graduation-project"');
    expect(studentDash).toContain("مشروع التخرج");

    const facultyDash = read("src/routes/faculty-portal.index.tsx");
    expect(facultyDash).toContain('to="/faculty-portal/graduation-projects"');
    expect(facultyDash).toContain("مشاريع التخرج");

    expect(NAV_ITEM_ROLES["/admin/graduation-projects"]).toEqual(["department_head", "dean"]);
    expect(canSeeNavItem(NAV_ITEM_ROLES["/admin/graduation-projects"]!, ["department_head"])).toBe(
      true,
    );
    expect(canSeeNavItem(NAV_ITEM_ROLES["/admin/graduation-projects"]!, ["registrar"])).toBe(false);
    expect(canAccessAdminRoute("/admin/graduation-projects", ["department_head"])).toBe(true);
    expect(canAccessAdminRoute("/admin/graduation-projects", ["registrar"])).toBe(false);

    const shell = read("src/components/admin/AdminShell.tsx");
    expect(shell).toContain('to: "/admin/graduation-projects"');
  });

  test("18 — routeTree.gen.ts is auto-generated via build and registers GP paths", () => {
    const tree = read("src/routeTree.gen.ts");
    expect(tree).toContain("This file was automatically generated");
    expect(tree).toContain("fullPath: '/student/graduation-project'");
    expect(tree).toContain("fullPath: '/faculty-portal/graduation-projects'");
    expect(tree).toContain("fullPath: '/admin/graduation-projects'");
    expect(read("scripts/validate-tanstack-route-tree-register.ts")).toContain("routeTree.gen.ts");
  });
});

describe("graduation-projects runtime fail-closed", () => {
  test("3 — missing RPC probes unavailable and never hard-codes true", () => {
    const availability = read("src/lib/graduation-projects/availability.ts");
    expect(availability).not.toMatch(/available\s*=\s*true/);
    expect(availability).toContain("list_my_graduation_projects");
    expect(isGraduationProjectsPortalMockEnabled()).toBe(false);
  });

  test("3b — probe maps function-missing to Arabic unavailable message", async () => {
    const probe = await probeGraduationProjectsRuntime({
      rpc: async () => ({
        data: null,
        error: { code: "42883", message: "function list_my_graduation_projects does not exist" },
      }),
    });
    expect(probe.available).toBe(false);
    expect(probe.message).toBe(GRADUATION_PROJECTS_SERVICE_UPDATING_MSG);
    expect(() => assertGraduationProjectsAvailable(probe)).toThrow(GraduationProjectsRpcError);
  });

  test("3c — pages render unavailable state component wiring", () => {
    for (const rel of [
      "src/routes/student.graduation-project.index.tsx",
      "src/routes/faculty-portal.graduation-projects.index.tsx",
      "src/routes/admin/graduation-projects.index.tsx",
    ]) {
      const src = read(rel);
      expect(src).toContain("GraduationProjectsUnavailable");
      expect(src).toContain("probeGraduationProjectsAvailability");
      expect(src).not.toContain("mockProjects");
    }
  });
});

describe("graduation-projects authorization & privacy portal layer", () => {
  test("4/5 — student-only viewer helper and list filters student role", () => {
    expect(isStudentOnlyViewer(["student"])).toBe(true);
    expect(isStudentOnlyViewer(["student", "supervisor"])).toBe(false);
    const studentIndex = read("src/routes/student.graduation-project.index.tsx");
    expect(studentIndex).toContain('row.roles.includes("student")');
  });

  test("6 — faculty list keeps only assigned faculty/panel roles", () => {
    const facultyIndex = read("src/routes/faculty-portal.graduation-projects.index.tsx");
    expect(facultyIndex).toContain("FACULTY_ROLES");
    expect(facultyIndex).toContain("supervisor");
    expect(facultyIndex).toContain("panel_member");
    expect(facultyIndex).toContain("listMyGraduationProjects");
  });

  test("7 — panel/evaluation actions remain role+state gated", () => {
    expect(availableProjectActions(["panel_member"], "evaluating")).toEqual(["save_evaluation"]);
    expect(availableProjectActions(["panel_member"], "active")).toEqual([]);
    expect(availableProjectActions(["student"], "evaluating")).toEqual([]);
  });

  test("8 — other department head is not granted by nav alone; RPC assignment remains authority", () => {
    expect(canAccessAdminRoute("/admin/graduation-projects", ["department_head"])).toBe(true);
    const adminPage = read("src/routes/admin/graduation-projects.tsx");
    expect(adminPage).toContain("لا يوجد تجاوز عام");
    const functions = read("src/lib/graduation-projects/portal.functions.ts");
    expect(functions).toContain("listMyProjects");
    expect(functions).toContain("getProjectDetail");
    expect(read("src/lib/graduation-projects/availability.ts")).toContain(
      "list_my_graduation_projects",
    );
  });

  test("9 — admin/registrar are not in graduation-projects NAV_ITEM_ROLES allow-list", () => {
    const allowed = NAV_ITEM_ROLES["/admin/graduation-projects"]!;
    expect(allowed).not.toContain("admin");
    expect(allowed).not.toContain("registrar");
    expect(allowed).not.toContain("system_admin");
    // Super-role UI bypass exists globally, but page copy + RPCs stay fail-closed.
    expect(canSeeNavItem(allowed, ["admin"])).toBe(true);
    expect(canAccessAdminRoute("/admin/graduation-projects", ["admin"])).toBe(true);
  });

  test("10 — student does not see committee evaluations before result states", () => {
    const evaluating = applyPortalPrivacy(
      baseDetail({ project: { ...baseDetail().project, state: "evaluating" } }),
      "student-user",
    );
    expect(evaluating.evaluations).toEqual([]);

    const completed = applyPortalPrivacy(
      baseDetail({ project: { ...baseDetail().project, state: "completed" } }),
      "student-user",
    );
    expect(completed.evaluations).toHaveLength(1);
    expect(completed.evaluations[0]?.state).toBe("finalized");
  });

  test("11 — illegal actions absent for student in completed/archived", () => {
    expect(availableProjectActions(["student"], "completed")).toEqual([]);
    expect(availableProjectActions(["student"], "archived")).toEqual([]);
    expect(availableProjectActions(["supervisor"], "archived")).toEqual([]);
  });
});

describe("graduation-projects portal security contracts", () => {
  test("12 — components and portal functions avoid direct table access for GP domain", () => {
    const componentFiles = walk(join(root, "src/components/graduation-projects")).filter((f) =>
      f.endsWith(".tsx"),
    );
    for (const file of componentFiles) {
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(/\.from\(\s*["']graduation_project/);
      expect(src).not.toMatch(/supabase\.from\(/);
    }
    const portalFns = read("src/lib/graduation-projects/portal.functions.ts");
    expect(portalFns).not.toMatch(/\.from\(\s*["']graduation_project/);
    expect(portalFns).toContain("GraduationProjectsRpcClient");
    expect(read("src/lib/graduation-projects/rpc.ts")).not.toContain(".from(");
  });

  test("13 — no public attachment URL construction", () => {
    const files = [
      ...walk(join(root, "src/components/graduation-projects")),
      ...walk(join(root, "src/lib/graduation-projects")),
      join(root, "src/routes/student.graduation-project.index.tsx"),
      join(root, "src/routes/faculty-portal.graduation-projects.index.tsx"),
      join(root, "src/routes/admin/graduation-projects.index.tsx"),
    ];
    for (const file of files) {
      if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
      const src = readFileSync(file, "utf8");
      expect(src).not.toContain("getPublicUrl");
      expect(src).not.toMatch(/https?:\/\/.*storage/i);
      expect(src).not.toContain("publicUrl");
    }
    const register = read("src/lib/graduation-projects/portal.functions.ts");
    expect(register).toContain("buildPrivateObjectKey");
    expect(register).toContain("never trust a client-supplied path");
  });

  test("14 — client never sends actor user ids on mutations", () => {
    const portalFns = read("src/lib/graduation-projects/portal.functions.ts");
    expect(portalFns).toContain("Never accept actor ids from the client");
    expect(portalFns).not.toMatch(/p_actor/);
    expect(portalFns).not.toMatch(/actorUserId/);
    expect(portalFns).not.toMatch(/actor_user_id\s*:/);
    const workspace = read(
      "src/components/graduation-projects/GraduationProjectPortalWorkspace.tsx",
    );
    expect(workspace).not.toMatch(/actorUserId|actor_user_id|p_user_id/);
  });

  test("15 — terminal states freeze mutations in action matrix", () => {
    for (const state of ["completed", "archived", "rejected", "cancelled"] as const) {
      expect(availableProjectActions(["student"], state)).toEqual([]);
      expect(
        availableProjectActions(["supervisor"], state).some((a) =>
          [
            "submit_deliverable",
            "review_submission",
            "save_evaluation",
            "conclude_result",
          ].includes(a),
        ),
      ).toBe(false);
    }
  });

  test("16/17 — student portal and B1 request routes remain intact", () => {
    expect(read("src/routes/student.index.tsx")).toContain('to: "/student/requests"');
    expect(read("src/routes/student.requests.tsx")).toContain(
      'createFileRoute("/student/requests")',
    );
    expect(read("src/routes/faculty-portal.index.tsx")).toContain('to="/faculty-portal/schedule"');
    // B1 five-services surface not modified by this task.
    expect(read("src/routes/student.requests.index.tsx")).toContain(
      "getMyStudentRequestsWithProgress",
    );
  });
});

describe("graduation-projects portal privacy helpers", () => {
  test("student presentation redacts object keys and actor ids", () => {
    const safe = applyPortalPrivacy(baseDetail(), "student-user");
    expect(safe.files[0]?.object_key).toBeNull();
    expect(safe.events[0]?.actor_user_id).toBeNull();
    expect(safe.events[0]?.payload).toBeNull();
  });

  test("staff viewer retains evaluation visibility via visibleEvaluations path", () => {
    const staff = applyPortalPrivacy(baseDetail({ viewer_roles: ["supervisor"] }), "staff-user");
    expect(staff.evaluations).toHaveLength(1);
    expect(staff.files[0]?.object_key).not.toBeNull();
  });

  test("readiness derivation and status banners", () => {
    const readiness = deriveDiscussionReadiness(
      baseDetail({
        project: { ...baseDetail().project, state: "active" },
        assignments: [
          ...baseDetail().assignments,
          {
            id: "asg-sup",
            role: "supervisor",
            user_id: "sup",
            student_profile_id: null,
            faculty_profile_id: "fp",
            active: true,
            assigned_at: "2026-01-01T00:00:00Z",
            ended_at: null,
          },
        ],
      }),
    );
    expect(readiness.teamMembers).toBe(1);
    expect(readiness.activeSupervisors).toBe(1);
    expect(portalStateMessage("corrections_required")).toContain("تصحيحات");
    expect(portalStateMessage("discussion_scheduled")).toContain("جدولة");
  });

  test("RPC client still maps unavailable and exposes submit/request/archive", () => {
    expect(isGraduationProjectsRpcUnavailable({ code: "42883", message: "x" })).toBe(true);
    const clientSrc = read("src/lib/graduation-projects/rpc.ts");
    expect(clientSrc).toContain("submit_graduation_project_proposal");
    expect(clientSrc).toContain("request_graduation_project_discussion");
    expect(clientSrc).toContain("archive_graduation_project");
    expect(typeof GraduationProjectsRpcClient).toBe("function");
  });
});
