import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("GA baseline AUTH-04 / RTL / navigation closure", () => {
  const functions = read("src/lib/graduates-affairs/graduates-affairs.functions.ts");
  const rpc = read("src/lib/graduates-affairs/rpc.ts");
  const gate = read("src/lib/graduates-affairs/runtime-gate.ts");
  const migration = read(
    "supabase/migrations/20260819001000_ga_active_followup_types_auth04_read_01.sql",
  );
  const panel = read(
    "src/components/graduates-affairs/GraduateFollowupWorkflowPanel.tsx",
  );
  const controller = read(
    "src/lib/graduates-affairs/GraduateFollowupWorkflowPanel.controller.tsx",
  );
  const nav = read("src/lib/admin-navigation-config.ts");

  test("active follow-up types use an approved actor-scoped RPC only", () => {
    expect(functions).not.toMatch(/\.from\(["']graduate_/);
    expect(functions).toContain("listActiveFollowupTypes()");
    expect(rpc).toContain('"graduate_affairs_list_active_followup_types"');
    expect(gate).toContain('"graduate_affairs_list_active_followup_types"');
    expect(migration).toContain(
      "graduate_affairs_resolve_caller_authorized_staff_profile_id",
    );
    expect(migration).toContain("'graduate_affairs_manager'");
    expect(migration).toContain("'graduate_affairs_specialist'");
    expect(migration).toContain("GRADUATE_AFFAIRS_ACCESS_DENIED");
    expect(migration).not.toMatch(/has_any_role[\s\S]{0,120}(admin|system_admin)/);
  });

  test("workflow display boundary is RTL and transport-agnostic", () => {
    expect(panel).toContain('dir="rtl"');
    expect(panel).toContain("GraduateFollowupWorkflowPanelController");
    expect(panel).not.toMatch(/useServerFn|useQuery|useMutation|\bfetch\(/);
    expect(panel).not.toMatch(/<h[12][\s>]/);
    expect(controller).toContain('dir="rtl"');
    expect(controller).not.toMatch(/<h2[\s>]/);
  });

  test("legacy navigation registry covers every visible admin path", () => {
    expect(nav).toContain('"/admin/lecture-execution"');
    expect(nav).toContain('"/admin/graduation-project-policies"');
  });
});
