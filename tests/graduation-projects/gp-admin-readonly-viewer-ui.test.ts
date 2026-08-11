/**
 * PORTAL-GP-ADMIN-READONLY-VIEWER-PRODUCTION-HOTFIX-01
 * Adapter / route error mapping + authorization-family UI contracts.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyGpError,
  ERROR_LABELS,
  mapGraduationProjectRpcError,
} from "@/lib/graduation-projects/errors";

const ROOT = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const RAW_VIEWER_DENIAL = "administration graduation-project viewer capability required";
const ARABIC_PERMISSION =
  "عفواً، لا تملك الصلاحية الكافية لاستعراض النشرة الإدارية لمشاريع التخرج.";

describe("admin GP viewer error mapping", () => {
  it("classifies viewer capability required as authorization", () => {
    expect(classifyGpError({ message: RAW_VIEWER_DENIAL })).toBe("authorization");
    const mapped = mapGraduationProjectRpcError({ message: RAW_VIEWER_DENIAL, code: "P0001" });
    expect(mapped.authorizationDenied).toBe(true);
    expect(mapped.unavailable).toBe(false);
    expect(mapped.message).toBe(ARABIC_PERMISSION);
    expect(mapped.message).not.toContain(RAW_VIEWER_DENIAL);
    expect(ERROR_LABELS[RAW_VIEWER_DENIAL]).toBe(ARABIC_PERMISSION);
  });

  it("does not hide unavailable infrastructure as a permission denial", () => {
    const mapped = mapGraduationProjectRpcError({
      message: "function public.list_administration_graduation_projects_overview does not exist",
      code: "42883",
    });
    expect(mapped.unavailable).toBe(true);
    expect(mapped.message).not.toBe(ARABIC_PERMISSION);
  });

  it("adapter maps raw viewer denial and never renders English SQL text", () => {
    const adapter = read("src/routes/-graduation-projects-adapter.ts");
    expect(adapter).toContain("viewer capability required");
    expect(adapter).toContain(ARABIC_PERMISSION);
    expect(adapter).toContain("GP_UNAVAILABLE");
    expect(adapter).toContain("retry: false");
    // Source must not leave the raw English string as a user-facing fallback.
    expect(adapter).not.toMatch(
      /return new Error\(\s*["']administration graduation-project viewer capability required["']\s*\)/,
    );
  });

  it("admin route remains read-only with retry and Arabic error surface", () => {
    const route = read("src/routes/admin/graduation-projects.tsx");
    expect(route).toContain('createFileRoute("/admin/graduation-projects")');
    expect(route).toContain("useGraduationProjectAdministrationReport");
    expect(route).toContain("administration-read-only");
    expect(route).toContain("readOnly");
    expect(route).toContain("MvpError");
    expect(route).toContain("query.refetch");
    expect(route).not.toMatch(/useGraduationProjectAction|onAction|\.mutate\(/);
    expect(route).not.toContain(RAW_VIEWER_DENIAL);
  });

  it("viewer role contract matches admin navigation authz", () => {
    const nav = read("src/lib/admin-nav.ts");
    expect(nav).toContain(
      '"/admin/graduation-projects": ["system_admin", "admin", "dean", "registrar"]',
    );
    const migration = read(
      "supabase/migrations/20260811041600_de9e9a8e-741e-4415-9741-fd8a2e53d22d.sql",
    );
    expect(migration).toContain("array['system_admin', 'admin', 'dean', 'registrar']");
    expect(migration).not.toContain("department_head");
    expect(migration).not.toContain("student_affairs");
  });

  it("preserves Arabic assignment denial for operational authorization errors", () => {
    const mapped = mapGraduationProjectRpcError({
      message: "exact direct processing assignment required",
    });
    expect(mapped.authorizationDenied).toBe(true);
    expect(mapped.message).toContain("تعييناً مباشراً");
    expect(mapped.message).not.toBe(ARABIC_PERMISSION);
  });
});

describe("admin viewer cannot gain mutation authority via title", () => {
  it("contract matrix keeps administration_viewer off coordinator mutations", () => {
    const mutations = [
      "review_graduation_project_proposal",
      "assign_graduation_project_supervisor",
      "schedule_graduation_project_defense",
      "assign_graduation_project_committee_member",
      "conclude_graduation_project_result",
      "archive_graduation_project",
    ] as const;

    const contracts = read("tests/graduation-projects/graduation-projects-package-d-contracts.test.ts");
    expect(contracts).toContain("'administration_viewer'");
    expect(contracts).toContain("'coordinator'");
    expect(contracts).toContain("'unauthorized_department_head'");

    const overviewIdx = contracts.indexOf(
      "rpc: 'list_administration_graduation_projects_overview'",
    );
    expect(overviewIdx).toBeGreaterThan(-1);
    const overviewSlice = contracts.slice(overviewIdx, overviewIdx + 1200);
    expect(overviewSlice).toContain("'administration_viewer'");
    expect(overviewSlice).toContain("'coordinator'");
    expect(overviewSlice).toContain("'unauthorized_admin'");
    expect(overviewSlice).toContain("'unauthorized_dean'");
    expect(overviewSlice).toContain("'unauthorized_registrar'");
    expect(overviewSlice).toContain("'unauthorized_department_head'");

    for (const rpc of mutations) {
      const idx = contracts.indexOf(`rpc: '${rpc}'`);
      expect(idx).toBeGreaterThan(-1);
      const slice = contracts.slice(idx, idx + 900);
      expect(slice).toContain("'administration_viewer'");
      expect(slice).toMatch(/allowedActors:\s*\['coordinator'\]/);
    }

    const teamIdx = contracts.indexOf("rpc: 'add_graduation_project_team_member'");
    expect(teamIdx).toBeGreaterThan(-1);
    const teamSlice = contracts.slice(teamIdx, teamIdx + 700);
    expect(teamSlice).toContain("'administration_viewer'");
    expect(teamSlice).toMatch(/deniedActors:[\s\S]*'administration_viewer'/);
  });
});
