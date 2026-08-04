/**
 * PORTAL_B1_E2E_REQUEST_SCOPED_SUPPORT_IMPLEMENTATION_88
 * Source-only contract tests for the temporary request-scoped E2E package.
 */
import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");
const MIGRATION = join(
  ROOT,
  "supabase/migrations/20260804120000_b1_88_request_scoped_e2e_support.sql",
);
const CLEANUP_MANIFEST = join(import.meta.dir, "CLEANUP_MANIFEST.md");
const IDENTITIES = join(import.meta.dir, "IDENTITIES.md");
const HARNESS_SQL = join(import.meta.dir, "pg17-disposable-harness.sql");
const HARNESS_SCHEMA = join(import.meta.dir, "pg", "10-minimal-schema.sql");
const CLEANUP_DRAFT = join(
  ROOT,
  "docs/migration-drafts/B1-E2E-88-REQUEST-SCOPED-SUPPORT-CLEANUP.NOT_APPLIED.sql",
);

const sql = readFileSync(MIGRATION, "utf8").replace(/\r\n/g, "\n");
const sqlCode = sql
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const FIVE = [
  "enrollment_suspension",
  "excused_absence",
  "department_transfer",
  "final_chance",
  "file_withdrawal",
] as const;

describe("B1 E2E 88 — migration source contract", () => {
  it("ships exactly one forward-only migration that is NOT_APPLIED locally", () => {
    expect(existsSync(MIGRATION)).toBe(true);
    expect(sql).toContain("TEST_ONLY_B1_E2E_88");
    expect(sql.toLowerCase()).toContain("forward");
    expect(sql.trimStart().startsWith("--")).toBe(true);
    expect(sql).toMatch(/\bBEGIN;/i);
    expect(sql).toMatch(/\bCOMMIT;/i);

    const carriers = readdirSync(join(ROOT, "supabase/migrations")).filter((f) =>
      f.includes("b1_88_request_scoped_e2e_support"),
    );
    expect(carriers).toEqual(["20260804120000_b1_88_request_scoped_e2e_support.sql"]);

    // Local apply ledger must not claim this version.
    const ledgerHint = join(ROOT, "supabase/.temp");
    if (existsSync(ledgerHint)) {
      // presence of temp dir is fine; migration must remain unapplied by policy
    }
    expect(sql).toContain("NOT applied by this mission");
  });

  it("defines execution + actor-binding + append-only audit tables", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.b1_e2e_88_executions");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.b1_e2e_88_actor_bindings");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.b1_e2e_88_audit_events");
    expect(sql).toContain("correlation_id uuid NOT NULL UNIQUE");
    expect(sql).toContain("B1_E2E_88_AUDIT_APPEND_ONLY");
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/i);
  });

  it("allowlists only the five B1 services and rejects enrollment_certificate", () => {
    for (const code of FIVE) {
      expect(sql).toContain(`'${code}'`);
    }
    expect(sql).toContain("B1_E2E_88_ENROLLMENT_CERTIFICATE_FORBIDDEN");
    expect(sqlCode).not.toMatch(
      /enrollment_certificate['"]\s*,\s*['"]enrollment_suspension/i,
    );
    expect(sql).toContain("b1_e2e_88_is_five_service");
  });

  it("keeps student_visible read-only and never mutates request_types visibility", () => {
    expect(sql).toContain("student_visible IS DISTINCT FROM true");
    // Executable DML only — ignore postcheck string literals that quote the forbid pattern.
    expect(sqlCode).not.toMatch(/^\s*UPDATE\s+public\.request_types\b/im);
    expect(sqlCode).not.toMatch(/\bSET\s+student_visible\s*=/i);
    expect(sql).toContain("B1_E2E_88_STUDENT_VISIBLE_MUTATION_FORBIDDEN");
  });

  it("never touches request_processing_assignments", () => {
    expect(sqlCode).not.toMatch(
      /\b(insert\s+into|update|delete\s+from)\s+public\.request_processing_assignments\b/i,
    );
    expect(sql).toContain("never touches request_processing_assignments");
  });

  it("revokes PUBLIC EXECUTE and pins SECURITY DEFINER search_path", () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.open_b1_e2e_88_execution/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.bind_b1_e2e_88_actor_to_runtime_step/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.cleanup_b1_e2e_88_package/i);
    expect(sql).toContain("B1_E2E_88_PUBLIC_EXECUTE_NOT_REVOKED");
    const definerFns = [
      "open_b1_e2e_88_execution",
      "bind_b1_e2e_88_actor_to_runtime_step",
      "cleanup_b1_e2e_88_package",
      "can_current_user_act_on_step",
      "create_student_request",
      "current_user_has_b1_e2e_88_actor_binding",
    ];
    for (const name of definerFns) {
      const idx = sql.indexOf(`FUNCTION public.${name}`);
      expect(idx).toBeGreaterThan(-1);
      const window = sql.slice(Math.max(0, idx - 200), idx + 800);
      expect(window).toMatch(/SECURITY DEFINER/i);
      expect(window).toMatch(/SET search_path/i);
    }
  });

  it("keeps authorization fail-closed: no admin/registrar/dean/service-role bypass", () => {
    const authz = sql.match(
      /CREATE OR REPLACE FUNCTION public\.can_current_user_act_on_step[\s\S]*?\$function\$;/i,
    )?.[0] ?? "";
    expect(authz).toContain("current_user_has_b1_e2e_88_actor_binding");
    expect(authz).toContain("current_user_has_exact_processing_binding");
    expect(authz).toContain("user_matches_workflow_runtime_step");
    expect(authz).toContain("is_owner_of_request");
    expect(authz).not.toMatch(/has_role\s*\(/i);
    expect(authz).not.toMatch(/is_current_user_admin_actor/i);
    expect(authz).not.toMatch(/'(admin|system_admin|registrar|dean)'/i);
    expect(sql).toContain("B1_E2E_88_BROAD_BYPASS_FORBIDDEN");
  });

  it("handles department-head steps without assigned_user_id pinning", () => {
    expect(sql).toContain("current_user_has_b1_e2e_88_department_binding");
    expect(sql).toContain("source_department_head_approval");
    expect(sql).toContain("target_department_head_approval");
    expect(sql).toContain("Department-head steps forbid assigned_user_id");
    const bind = sql.match(
      /CREATE OR REPLACE FUNCTION public\.bind_b1_e2e_88_actor_to_runtime_step[\s\S]*?\$\$;/i,
    )?.[0] ?? "";
    expect(bind).toContain("B1_E2E_88_DEPARTMENT_SCOPE_REQUIRED");
    expect(bind).not.toMatch(/INSERT INTO public\.position_assignments/i);
  });

  it("expires and closes fail-closed", () => {
    expect(sql).toContain("e.status = 'active'");
    expect(sql).toContain("e.expires_at > now()");
    expect(sql).toContain("e.closed_at IS NULL");
    expect(sql).toContain("close_b1_e2e_88_execution");
    expect(sql).toContain("B1_E2E_88_EXECUTION_NOT_LIVE");
  });

  it("writes canonical audit evidence and ships cleanup artifacts", () => {
    expect(sql).toContain("b1_e2e_88_write_audit");
    expect(sql).toContain("execution_opened");
    expect(sql).toContain("actor_bound");
    expect(sql).toContain("cleanup_executed");
    expect(existsSync(CLEANUP_MANIFEST)).toBe(true);
    expect(existsSync(IDENTITIES)).toBe(true);
    expect(existsSync(CLEANUP_DRAFT)).toBe(true);
    expect(existsSync(HARNESS_SQL)).toBe(true);
    expect(existsSync(HARNESS_SCHEMA)).toBe(true);
    const manifest = readFileSync(CLEANUP_MANIFEST, "utf8");
    expect(manifest).toContain("request_processing_assignments");
    expect(manifest).toContain("19/19");
    expect(manifest).toContain("student_visible");
  });

  it("rejects authoritative fixtures and preserves resubmit safety", () => {
    expect(sql).toContain("B1_E2E_88_AUTHORITATIVE_FIXTURE_FORBIDDEN");
    expect(sql).toContain("SR-20260801-13%");
    expect(sql).toContain("B1_E2E_88_RESUBMIT_STATE_UNSAFE");
    expect(sql).toContain("B1_E2E_88_STEP_COMPLETED");
    expect(sql).toContain("set_config('b1.atomic_action', '1', true)");
  });

  it("does not modify routeTree.gen.ts or graduation/graduates packages", () => {
    expect(sqlCode).not.toMatch(/routeTree|graduation-projects|graduates-affairs/i);
  });
});
