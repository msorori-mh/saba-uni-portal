/**
 * GRADUATION-PROJECTS-PORTAL-VISUAL-UX-ACCESSIBILITY-QA-01
 *
 * Visual/UX/RTL/accessibility/privacy coverage for the graduation-projects
 * portal routes and components. Component renders use renderToStaticMarkup
 * (no DOM available in this repo); route-level behavior is pinned via source
 * contracts, matching the existing graduation-projects test style.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  GraduationProjectsEmpty,
  GraduationProjectsLoading,
  GraduationProjectsNetworkError,
  GraduationProjectsPermissionDenied,
  GraduationProjectsUnavailable,
} from "../../src/components/graduation-projects/PortalRuntimeStates";
import { GraduationProjectStateBadge } from "../../src/components/graduation-projects/GraduationProjectStateBadge";
import { ProposalWorkflowPanel } from "../../src/components/graduation-projects/ProposalWorkflowPanel";
import { EvaluationPanel } from "../../src/components/graduation-projects/EvaluationPanel";
import { MilestonesPanel } from "../../src/components/graduation-projects/MilestonesPanel";
import { ResultCorrectionsArchivePanel } from "../../src/components/graduation-projects/ResultCorrectionsArchivePanel";
import { GraduationProjectReports } from "../../src/components/graduation-projects/GraduationProjectReports";
import { CreateProjectForm } from "../../src/components/graduation-projects/CreateProjectForm";
import {
  availableProjectActions,
  type ProjectDetailProject,
} from "../../src/lib/graduation-projects/lifecycle";

const root = join(import.meta.dir, "../..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const COMPONENT_DIR = join(root, "src/components/graduation-projects");
const componentSources: Record<string, string> = {};
for (const file of readdirSync(COMPONENT_DIR)) {
  if (file.endsWith(".tsx") || file.endsWith(".ts")) {
    componentSources[`src/components/graduation-projects/${file}`] = readFileSync(
      join(COMPONENT_DIR, file),
      "utf8",
    );
  }
}
const GP_ROUTES = [
  "src/routes/student.graduation-project.tsx",
  "src/routes/student.graduation-project.index.tsx",
  "src/routes/student.graduation-project.$projectId.tsx",
  "src/routes/faculty-portal.graduation-projects.tsx",
  "src/routes/faculty-portal.graduation-projects.index.tsx",
  "src/routes/faculty-portal.graduation-projects.$projectId.tsx",
  "src/routes/admin/graduation-projects.tsx",
  "src/routes/admin/graduation-projects.index.tsx",
  "src/routes/admin/graduation-projects.$projectId.tsx",
];
const routeSources = GP_ROUTES.map((route) => [route, read(route)] as const);

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const RAW_ISO_PATTERN = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

const projectFixture: ProjectDetailProject = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  department_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  program_id: null,
  academic_year_id: null,
  semester_id: null,
  proposal_title: "نظام إدارة المكتبات",
  proposal_abstract: "ملخص المشروع",
  state: "completed",
  progress_percent: 100,
  at_risk: false,
  version: 4,
  approved_at: null,
  completed_at: "2026-03-01T10:00:00Z",
  archived_at: "2026-03-05T10:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-03-05T10:00:00Z",
};

describe("runtime states render (loading/empty/unavailable/permission/network)", () => {
  test("each state renders an Arabic, non-technical, RTL message with a stable testid", () => {
    const cases: Array<[string, string]> = [
      [renderToStaticMarkup(createElement(GraduationProjectsLoading)), "gp-loading"],
      [renderToStaticMarkup(createElement(GraduationProjectsEmpty)), "gp-empty"],
      [renderToStaticMarkup(createElement(GraduationProjectsUnavailable)), "gp-unavailable"],
      [
        renderToStaticMarkup(createElement(GraduationProjectsPermissionDenied)),
        "gp-permission-denied",
      ],
      [renderToStaticMarkup(createElement(GraduationProjectsNetworkError)), "gp-network-error"],
    ];
    for (const [html, testid] of cases) {
      expect(html).toContain(`data-testid="${testid}"`);
      expect(html).toContain('dir="rtl"');
      expect(UUID_PATTERN.test(html)).toBe(false);
      expect(html).not.toMatch(/supabase|rpc|postgres|storage_/i);
    }
  });

  test("live regions and alerts are announced", () => {
    expect(renderToStaticMarkup(createElement(GraduationProjectsLoading))).toContain(
      'role="status"',
    );
    expect(renderToStaticMarkup(createElement(GraduationProjectsUnavailable))).toContain(
      'role="alert"',
    );
    expect(renderToStaticMarkup(createElement(GraduationProjectsPermissionDenied))).toContain(
      'role="alert"',
    );
    expect(renderToStaticMarkup(createElement(GraduationProjectsNetworkError))).toContain(
      'role="alert"',
    );
  });

  test("routes map every backend failure to a state component (fail-closed)", () => {
    for (const [route, source] of routeSources.filter(
      ([r]) => r.includes("index") || r.includes("$projectId"),
    )) {
      if (!source.includes("useQuery")) continue;
      expect(source, route).toContain("GraduationProjectsUnavailable");
      expect(source, route).toContain("GraduationProjectsNetworkError");
    }
    const workspace = read(
      "src/components/graduation-projects/GraduationProjectPortalWorkspace.tsx",
    );
    expect(workspace).toContain("GraduationProjectsPermissionDenied");
    expect(workspace).toContain("GraduationProjectsUnavailable");
    expect(workspace).toContain("GraduationProjectsNetworkError");
  });
});

describe("privacy regression guards", () => {
  test("no component renders storage internals or object keys", () => {
    for (const [path, source] of Object.entries(componentSources)) {
      expect(/\{[^}]*object_key/.test(source), path).toBe(false);
      expect(/storage_bucket|storage_object_path/i.test(source), path).toBe(false);
    }
  });

  test("no component renders raw user ids or department ids", () => {
    for (const [path, source] of Object.entries(componentSources)) {
      expect(/\{[^}]*user_id/.test(source), path).toBe(false);
      expect(/\{[^}]*department_id/.test(source), path).toBe(false);
    }
    expect(
      componentSources["src/components/graduation-projects/GraduationProjectReports.tsx"],
    ).not.toContain("supervisor.user_id");
    expect(
      componentSources["src/components/graduation-projects/CreateProjectForm.tsx"],
    ).not.toContain("({departmentId})");
  });

  test("no emails or phone numbers anywhere in the components layer", () => {
    for (const [path, source] of Object.entries(componentSources)) {
      expect(/[\w.+-]+@[\w-]+\.[\w.]+/.test(source), path).toBe(false);
      expect(/\b(phone|mobile|email)\b/i.test(source), path).toBe(false);
    }
  });

  test("no component imports Supabase directly", () => {
    for (const [path, source] of Object.entries(componentSources)) {
      expect(/from\s+["'][^"']*supabase/i.test(source), path).toBe(false);
    }
  });

  test("rendered reports and forms leak no UUIDs", () => {
    const reportsHtml = renderToStaticMarkup(
      createElement(GraduationProjectReports, {
        departmentId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        statesReport: null,
        assignmentsReport: {
          department_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          supervisors: [
            {
              assignment_id: "asg-1",
              user_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
              active_projects: 2,
              at_risk_projects: 0,
              avg_progress: 55,
            },
          ],
          teams: [],
          unassigned_projects: [],
        },
        evaluationsReport: null,
        archiveReport: null,
        onLoad: () => {},
      }),
    );
    expect(UUID_PATTERN.test(reportsHtml)).toBe(false);
    // Radix Tabs unmount inactive content in SSR; the supervisor label is
    // asserted at source level (raw user_id must never be rendered).
    expect(
      componentSources["src/components/graduation-projects/GraduationProjectReports.tsx"],
    ).toContain("مشرف {index + 1}");

    const formHtml = renderToStaticMarkup(
      createElement(CreateProjectForm, {
        departmentId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        onSubmit: () => {},
      }),
    );
    expect(UUID_PATTERN.test(formHtml)).toBe(false);
  });
});

describe("hidden committee evaluations and role-specific actions", () => {
  test("evaluation panel shows nothing when the privacy layer cleared evaluations", () => {
    const html = renderToStaticMarkup(
      createElement(EvaluationPanel, {
        actions: [],
        discussionId: null,
        evaluations: [],
        ownEvaluation: null,
        onSave: () => {},
      }),
    );
    expect(html).toContain("لا توجد تقييمات ظاهرة.");
    expect(html).not.toContain("<button");
  });

  test("proposal panel renders only the actions the backend authorized", () => {
    const html = renderToStaticMarkup(
      createElement(ProposalWorkflowPanel, {
        project: { ...projectFixture, state: "under_review", version: 2 },
        actions: ["start_review"],
        onSubmitProposal: () => {},
        onResubmitProposal: () => {},
        onReview: () => {},
      }),
    );
    expect(html).toContain("بدء المراجعة");
    expect(html).not.toContain("اعتماد المقترح");
    expect(html).not.toContain("رفض المقترح");
    expect(html).not.toContain("تقديم المقترح");
  });

  test("terminal states expose no mutating actions to students (read-only)", () => {
    for (const state of ["completed", "archived"] as const) {
      const actions = availableProjectActions(["student"], state);
      const mutating = actions.filter((action) =>
        [
          "submit_deliverable",
          "add_note",
          "request_discussion",
          "submit_proposal",
          "resubmit_proposal",
        ].includes(action),
      );
      expect(mutating, state).toEqual([]);
    }
  });
});

describe("result/corrections/archive panel privacy and dates", () => {
  test("archive renders Arabic date and file name only — never the object key", () => {
    const html = renderToStaticMarkup(
      createElement(ResultCorrectionsArchivePanel, {
        project: projectFixture,
        actions: [],
        corrections: [],
        archive: {
          id: "ar-1",
          project_id: projectFixture.id,
          archived_at: "2026-03-05T10:00:00Z",
          final_file_name: "final.pdf",
          final_file_object_key: "graduation-projects/secret/final.pdf",
        },
        onConclude: () => {},
        onCompleteCorrection: () => {},
        onAcceptCorrection: () => {},
      }),
    );
    expect(html).toContain("final.pdf");
    expect(html).not.toContain("object_key");
    expect(html).not.toContain("graduation-projects/secret");
    expect(RAW_ISO_PATTERN.test(html)).toBe(false);
  });

  test("milestones panel lists files without storage keys", () => {
    const html = renderToStaticMarkup(
      createElement(MilestonesPanel, {
        actions: [],
        milestones: [],
        submissions: [],
        notes: [],
        files: [
          {
            id: "f1",
            submission_id: null,
            original_name: "doc.pdf",
            media_type: "application/pdf",
            byte_size: 1024,
            scan_state: "clean",
            object_key: "graduation-projects/secret/doc.pdf",
            uploaded_by_assignment_id: "asg-1",
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
        onSubmitDeliverable: () => {},
        onReviewSubmission: () => {},
        onAddNote: () => {},
        onResolveNote: () => {},
        onRegisterFile: () => {},
      }),
    );
    expect(html).toContain("doc.pdf");
    expect(html).not.toContain("graduation-projects/secret");
    expect(html).not.toContain("object_key");
  });
});

describe("RTL, responsive structure and accessibility", () => {
  test("every component roots at dir=rtl", () => {
    for (const [path, source] of Object.entries(componentSources)) {
      if (!path.endsWith(".tsx")) continue;
      expect(source, path).toContain('dir="rtl"');
    }
  });

  test("routes set rtl direction", () => {
    // The student/faculty index pages delegate every branch to components
    // that are themselves rtl-rooted (PortalRuntimeStates / GraduationProjectsList).
    const delegated = new Set([
      "src/routes/student.graduation-project.index.tsx",
      "src/routes/faculty-portal.graduation-projects.index.tsx",
    ]);
    for (const [route, source] of routeSources) {
      if (delegated.has(route)) continue;
      expect(source, route).toContain('dir="rtl"');
    }
    for (const route of delegated) {
      const source = read(route);
      for (const branch of source.matchAll(/return\s*\(?\s*<(\w+)/g)) {
        const tag = branch[1]!;
        if (/^[A-Z]/.test(tag)) {
          expect(
            [
              "GraduationProjectsLoading",
              "GraduationProjectsNetworkError",
              "GraduationProjectsUnavailable",
              "GraduationProjectsEmpty",
              "GraduationProjectsList",
            ],
            `${route} branch <${tag}> must be an rtl-rooted component`,
          ).toContain(tag);
        }
      }
    }
  });

  test("no physical left/right spacing utilities where logical ones apply", () => {
    for (const [path, source] of Object.entries(componentSources)) {
      expect(/\b(ml-|mr-|pl-|pr-|left-|right-)\d/.test(source), path).toBe(false);
    }
  });

  test("state badges always carry text (never color alone)", () => {
    const html = renderToStaticMarkup(
      createElement(GraduationProjectStateBadge, { state: "evaluating", atRisk: true }),
    );
    expect(html).toContain("قيد التقييم");
    expect(html).toContain("متعثر");
  });

  test("headings hierarchy starts below the page h1 (panels use card titles)", () => {
    for (const [path, source] of Object.entries(componentSources)) {
      expect(/<h1[\s>]/.test(source), path).toBe(false);
    }
  });

  test("workspace events and discussion dates render in Arabic locale, not raw ISO", () => {
    expect(
      componentSources["src/components/graduation-projects/GraduationProjectWorkspace.tsx"],
    ).toContain("formatGpDateTimeAr(event.occurred_at)");
    expect(componentSources["src/components/graduation-projects/DiscussionPanel.tsx"]).toContain(
      "formatGpDateTimeAr(discussion.starts_at)",
    );
  });
});
