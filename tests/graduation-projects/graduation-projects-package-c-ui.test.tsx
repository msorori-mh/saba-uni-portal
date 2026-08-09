import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MvpProjectWorkspace } from "@/components/graduation-projects/MvpProjectWorkspace";
import { PrivateFileControl } from "@/components/graduation-projects/PrivateFileControl";
import type {
  GraduationProjectActor,
  GraduationProjectDetail,
} from "@/components/graduation-projects/mvp-ui";

const ROOT = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const noop = () => undefined;

function detail(viewer: GraduationProjectActor): GraduationProjectDetail {
  return {
    id: "project-safe-ref",
    title: "منصة متابعة التدريب",
    state: viewer === "coordinator" || viewer === "committee" ? "evaluating" : "active",
    finalDecision: null,
    roles: [viewer],
    viewer,
    nextAction: "متابعة المشروع",
    teamLocked: false,
    team: [
      { id: "leader-ref", name: "الطالب القائد", academicNumber: "2026001", leader: true },
      { id: "member-ref", name: "عضو الفريق", leader: false },
    ],
    proposal: {
      problemStatement: "المشكلة",
      objectives: "الأهداف",
      summary: "الملخص",
      attachment: {
        id: "proposal-file",
        name: "proposal.pdf",
        category: "proposal",
        state: "ready",
        downloadable: true,
      },
    },
    supervisor: {
      name: "د. المشرف",
      acceptance: viewer === "supervisor_pending" ? "pending" : "accepted",
    },
    progress: [
      { id: "progress-ref", text: "اكتمل التحليل", state: "submitted", submittedAt: "2026-08-06" },
    ],
    finalFile: {
      id: "final-file",
      name: "final.pdf",
      category: "final",
      state: "ready",
      downloadable: true,
    },
    defense: {
      startsAt: "2026-09-01T10:00:00Z",
      venue: "القاعة الرئيسية",
      committeeCount: 2,
      held: true,
    },
    evaluation: {
      submitted: viewer === "committee",
      submittedCount: 2,
      requiredCount: 2,
      average: 88.5,
    },
    coordinatorOptions: {
      students: [{ id: "student-ref", name: "طالب متاح", secondary: "2026002" }],
      supervisors: [{ id: "faculty-ref", name: "د. مشرف متاح" }],
      committee: [
        { id: "committee-a", name: "د. عضو أول" },
        { id: "committee-b", name: "د. عضو ثان" },
      ],
    },
  };
}

const renderActor = (
  actor: GraduationProjectActor,
  defaultTab: "team" | "progress" | "defense" | "result" = "team",
) =>
  renderToStaticMarkup(
    createElement(MvpProjectWorkspace, { detail: detail(actor), defaultTab, onAction: noop }),
  );

describe("Package C actor-aware components", () => {
  it("shows pre-lock member controls to leader and never to member", () => {
    expect(renderActor("leader")).toContain('data-testid="leader-member-controls"');
    expect(renderActor("member")).not.toContain('data-testid="leader-member-controls"');
  });
  it("isolates pending supervisor invitation from accepted supervisor operations", () => {
    const pending = renderActor("supervisor_pending"),
      accepted = renderActor("supervisor", "progress");
    expect(pending).toContain('data-testid="supervisor-pending"');
    expect(pending).not.toContain('data-testid="supervisor-accepted-controls"');
    expect(accepted).not.toContain('data-testid="supervisor-pending"');
    expect(accepted).toContain('data-testid="supervisor-accepted-controls"');
  });
  it("renders coordinator-only operational controls only for coordinator", () => {
    const coordinatorDefense = renderActor("coordinator", "defense"),
      coordinatorResult = renderActor("coordinator", "result"),
      supervisor = renderActor("supervisor"),
      member = renderActor("member");
    expect(coordinatorDefense).toContain('data-testid="coordinator-defense-controls"');
    expect(coordinatorDefense).toContain('data-testid="coordinator-supervisor-controls"');
    expect(coordinatorResult).toContain('data-testid="coordinator-result-controls"');
    expect(supervisor).not.toContain("coordinator-defense-controls");
    expect(member).not.toContain("coordinator-supervisor-controls");
  });
  it("committee sees own immutable evaluation without peer notes", () => {
    const committee = renderActor("committee", "defense");
    expect(committee).toContain('data-testid="committee-own-evaluation"');
    expect(committee).toContain("تقييمي فقط");
    expect(committee).toContain("غير قابل للتعديل");
    expect(committee).not.toContain("ملاحظات الزملاء:");
  });
  it("private attachment controls expose file input and no public URL", () => {
    const html = renderToStaticMarkup(
      createElement(PrivateFileControl, {
        label: "ملف خاص",
        canUpload: true,
        file: {
          id: "file-ref",
          name: "safe.pdf",
          category: "final",
          state: "uploading",
          progress: 35,
          downloadable: false,
        },
        onUpload: noop,
      }),
    );
    expect(html).toContain('type="file"');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain("لا يُنشأ رابط عام");
    expect(html).not.toMatch(/href="https?:/);
    expect(html).not.toContain("object_key");
  });
});

describe("Package C routed UI contracts", () => {
  const routes = [
    ["src/routes/student.graduation-projects.index.tsx", "/student/graduation-projects/"],
    [
      "src/routes/student.graduation-projects.$projectId.tsx",
      "/student/graduation-projects/$projectId",
    ],
    [
      "src/routes/faculty-portal.graduation-projects.index.tsx",
      "/faculty-portal/graduation-projects/",
    ],
    [
      "src/routes/faculty-portal.graduation-projects.$projectId.tsx",
      "/faculty-portal/graduation-projects/$projectId",
    ],
    ["src/routes/admin/graduation-projects.tsx", "/admin/graduation-projects"],
  ] as const;
  for (const [file, route] of routes)
    it(`registers ${route} with loading/error/empty or workspace UI`, () => {
      const source = read(file);
      expect(source).toContain(`createFileRoute(\"${route}\")`);
      expect(source).toMatch(/Mvp(?:Loading|ProjectWorkspace|ProjectList)/);
      expect(source).not.toMatch(/\.from\s*\(/);
    });
  it("administration route is status/list read-only with no callbacks", () => {
    const source = read("src/routes/admin/graduation-projects.tsx");
    expect(source).toContain("administration-read-only");
    expect(source).toContain("readOnly");
    expect(source).not.toMatch(/useGraduationProjectAction|onAction|mutate/);
  });
  it("adds student, faculty, and administration navigation entries", () => {
    expect(read("src/routes/student.index.tsx")).toContain("/student/graduation-projects");
    expect(read("src/components/portal/FacultyPortalShell.tsx")).toContain(
      "/faculty-portal/graduation-projects",
    );
    expect(read("src/lib/admin-navigation-config.ts")).toContain("/admin/graduation-projects");
    expect(read("src/components/admin/AdminShell.tsx")).toContain("ADMIN_NAV_GROUPS");
  });
  it("adapter is a thin Package B wrapper with no temp RPC names or public URLs", () => {
    const source = read("src/routes/-graduation-projects-adapter.ts");
    expect(source).toContain("@/lib/graduation-projects");
    expect(source).toContain("createGraduationProjectsService");
    expect(source).toContain("uploadPrivateFile");
    expect(source).toContain("signedDownload");
    expect(source).not.toMatch(/getPublicUrl|publicUrl/);
    expect(source).not.toContain("prepare_graduation_project_private_upload");
    expect(source).not.toContain("finalize_graduation_project_private_upload");
    expect(source).not.toContain("list_my_graduation_projects_mvp");
    expect(source).not.toContain("get_my_graduation_project_workspace");
    expect(source).not.toMatch(/\.from\s*\(\s*["']graduation_project/);
  });
  it("uses identity selectors and never raw UUID inputs", () => {
    const source = read("src/components/graduation-projects/MvpProjectWorkspace.tsx");
    expect(source).toContain("IdentitySelect");
    expect(source).toContain("CommitteeSelect");
    expect(source).not.toMatch(/placeholder=.*UUID|placeholder=.*معرّف/);
  });
});
