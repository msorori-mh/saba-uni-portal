import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("request workflow route unnest 01F", () => {
  it("1 — uses trailing-underscore workflow route file", () => {
    expect(
      existsSync(join(ROOT, "src/routes/admin/request-types_.$id.workflow.tsx")),
    ).toBe(true);
  });

  it("2 — old nested workflow route file is gone", () => {
    expect(
      existsSync(join(ROOT, "src/routes/admin/request-types.$id.workflow.tsx")),
    ).toBe(false);
  });

  it("3 — request-types list still links to public URL without underscore", () => {
    const list = read("src/routes/admin/request-types.tsx");
    expect(list).toContain('to="/admin/request-types/$id/workflow"');
    expect(list).toContain("params={{ id: row.id }}");
    expect(list).not.toContain('to="/admin/request-types_/$id/workflow"');
    expect(list).not.toMatch(/\bOutlet\b/);
  });

  it("4 — routeTree keeps public fullPath /admin/request-types/$id/workflow", () => {
    const tree = read("src/routeTree.gen.ts");
    expect(tree).toContain("fullPath: '/admin/request-types/$id/workflow'");
    expect(tree).toMatch(
      /from ['"]\.\/routes\/admin\/request-types_\.\$id\.workflow['"]/,
    );
    expect(tree).not.toMatch(
      /from ['"]\.\/routes\/admin\/request-types\.\$id\.workflow['"]/,
    );
  });

  it("5 — workflow is not a child of RequestTypes page in routeTree", () => {
    const tree = read("src/routeTree.gen.ts");

    // Old nesting shape must be gone.
    expect(tree).not.toMatch(
      /interface AdminRequestTypesRouteChildren[\s\S]*AdminRequestTypesIdWorkflowRoute/,
    );
    expect(tree).not.toContain(
      "AdminRequestTypesRoute: typeof AdminRequestTypesRouteWithChildren",
    );

    // New unnested route should parent under admin layout, not request-types.
    const workflowBlock = tree.match(
      /'\/admin\/request-types_\/\$id\/workflow':\s*\{[\s\S]*?\n\s*\}/,
    );
    expect(workflowBlock).not.toBeNull();
    expect(workflowBlock![0]).toContain("fullPath: '/admin/request-types/$id/workflow'");
    expect(workflowBlock![0]).toContain("parentRoute: typeof AdminRoute");
    expect(workflowBlock![0]).not.toContain("parentRoute: typeof AdminRequestTypesRoute");
  });

  it("6 — workflow editor still has config, editors, and save actions", () => {
    const workflow = read("src/routes/admin/request-types_.$id.workflow.tsx");
    expect(workflow).toContain('createFileRoute("/admin/request-types_/$id/workflow")');
    expect(workflow).toContain("getAdminRequestWorkflowConfig");
    expect(workflow).toContain("WorkflowStepsEditor");
    expect(workflow).toContain("WorkflowTransitionsEditor");
    expect(workflow).toContain("حفظ كمسودة");
    expect(workflow).toContain("حفظ وتفعيل");
    expect(workflow).toContain("التحقق من التكوين");
  });
});
