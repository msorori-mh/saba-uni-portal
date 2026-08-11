import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = join(import.meta.dir, "../../../supabase/migrations");

function allMigrationSql(): string {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
    .join("\n");
}

const sql = allMigrationSql();

describe("B1 configured-runtime cutover contract", () => {
  it("ships a single authoritative transition resolver used by authorization", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.resolve_b1_workflow_transition_safe");
    // The authorization path must delegate to the same resolver the executor uses.
    expect(sql).toContain("public.resolve_b1_workflow_transition_safe(");
    expect(sql).toContain("public.resolve_b1_workflow_transition(");
  });

  it("pins an immutable per-version runtime contract snapshot", () => {
    expect(sql).toContain("public.b1_workflow_runtime_contract_snapshot");
    expect(sql).toContain("B1_RUNTIME_CONTRACT_SNAPSHOT_IS_IMMUTABLE");
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.is_b1_runtime_step_contract_configured",
    );
  });

  it("gates the legacy whitelist behind a per-service runtime flag", () => {
    expect(sql).toContain("public.service_platform_runtime_flags");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.b1_legacy_fallback_enabled");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.b1_runtime_step_contract_ok");
  });

  it("keeps the runtime authorization function off the hardcoded whitelist", () => {
    const authFnStart = sql.lastIndexOf(
      "CREATE OR REPLACE FUNCTION public.can_current_user_act_on_step",
    );
    expect(authFnStart).toBeGreaterThan(-1);
    const authFn = sql.slice(authFnStart);
    expect(authFn).toContain("public.b1_runtime_step_contract_ok(");
    expect(authFn).not.toContain("public.is_valid_b1_runtime_step_contract(");
  });
});
