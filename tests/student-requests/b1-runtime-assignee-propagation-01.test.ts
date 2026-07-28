import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migration = readFileSync(
  join(root, "docs", "migration-drafts", "B1-RUNTIME-ASSIGNEE-PROPAGATION-01.sql"),
  "utf8",
);
const preflight = readFileSync(
  join(
    root,
    "docs",
    "migration-drafts",
    "b1-backend-verifiers",
    "29-B1_29_RUNTIME_ASSIGNEE_PROPAGATION_01-PREFLIGHT.sql",
  ),
  "utf8",
);
const postVerifier = readFileSync(
  join(
    root,
    "docs",
    "migration-drafts",
    "b1-backend-verifiers",
    "29-B1_29_RUNTIME_ASSIGNEE_PROPAGATION_01-POST-VERIFIER.sql",
  ),
  "utf8",
);
const negativeHarness = readFileSync(
  join(root, "scripts", "b1-rpc-principal-harness-01", "negative-harness.sql"),
  "utf8",
);
const positiveHarness = readFileSync(
  join(root, "scripts", "b1-rpc-principal-harness-01", "positive-harness.sql"),
  "utf8",
);

describe("B1 runtime assignee propagation — migration draft", () => {
  it("creates the effective-assignee assert and the activation guard trigger", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.assert_b1_runtime_step_assignee_effective(p_step_id uuid)",
    );
    expect(migration).toContain("CREATE TRIGGER trg_guard_b1_runtime_step_activation");
    expect(migration).toContain("BEFORE UPDATE OF status ON public.student_request_workflow_steps");
    expect(migration).toContain(
      "WHEN (NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active')",
    );
  });

  it("resolves source head only from current_department_id", () => {
    expect(migration).toContain(
      "WHEN 'source_department_head_approval' THEN d.current_department_id",
    );
  });

  it("resolves target head only from requested_department_id", () => {
    expect(migration).toContain("ELSE d.requested_department_id");
    expect(migration).toContain("B1_TRANSFER_DEPARTMENT_SCOPE_MISSING");
  });

  it("scopes department head assignments to position_assignment identities only", () => {
    expect(migration).toContain("a.assignment_type = 'position_assignment'");
    expect(migration).toContain(
      "AND a.user_id IS NULL AND a.staff_profile_id IS NULL AND a.faculty_profile_id IS NULL",
    );
  });

  it("rejects zero and multiple effective assignments", () => {
    expect(migration).toContain("IF v_count <> 1 THEN");
    expect(migration).toContain("B1_RUNTIME_ASSIGNEE_MUST_RESOLVE_ONCE");
  });

  it("stores and verifies exactly one identity kind", () => {
    expect(migration).toContain("B1_RUNTIME_ASSIGNEE_IDENTITY_NOT_SINGULAR");
    expect(migration).toContain("B1_RUNTIME_ASSIGNEE_IDENTITY_MISMATCH");
    const identityChecks = migration.match(/num_nonnulls\(/g) ?? [];
    expect(identityChecks.length).toBeGreaterThanOrEqual(2);
  });

  it("pins provenance to the initialization-time assignment", () => {
    expect(migration).toContain("direct_assignment_id");
    expect(migration).toContain("B1_RUNTIME_ASSIGNEE_PROVENANCE_MISMATCH");
  });

  it("supports all four assignment identity kinds via the shared validator", () => {
    expect(migration).toContain("public.is_valid_b1_direct_assignment(a.id, v_department_id, false)");
  });

  it("is a no-op for non-B1 (legacy, enrollment_certificate) requests", () => {
    expect(migration).toContain("IF NOT public.is_b1_stored_request_type(v_request_type) THEN");
    expect(migration).toContain("RETURN;");
    expect(migration).not.toContain("enrollment_certificate_");
  });

  it("contains no role-based bypass", () => {
    for (const bypass of [
      "is_current_user_admin_actor",
      "is_current_user_registrar",
      "has_role(",
      "USING (true)",
    ]) {
      expect(migration.includes(bypass)).toBe(false);
    }
  });

  it("revokes direct execution from client roles", () => {
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.assert_b1_runtime_step_assignee_effective(uuid) FROM anon",
    );
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.assert_b1_runtime_step_assignee_effective(uuid) FROM authenticated",
    );
  });

  it("is forward-only with no destructive statements", () => {
    for (const forbidden of [
      /\bDELETE\s+FROM\b/i,
      /\bTRUNCATE\b/i,
      /\bDROP\s+TABLE\b/i,
      /\bUPDATE\s+public\./i,
      /\bINSERT\s+INTO\s+public\./i,
    ]) {
      expect(forbidden.test(migration)).toBe(false);
    }
  });

  it("documents fail-closed transactional semantics", () => {
    expect(migration).toContain("the predecessor step is NOT completed");
    expect(migration).toContain("no workflow event row is created");
    expect(migration).toContain("never 0, never >1");
    expect(migration).toContain("retry after the assignment data is corrected is idempotent");
    expect(migration).toContain("without any backfill");
  });
});

describe("B1 runtime assignee propagation — verifiers", () => {
  it("preflight is read-only and blocks double apply", () => {
    expect(preflight).toContain("-- READ ONLY");
    expect(preflight.trimEnd().endsWith("ROLLBACK;")).toBe(true);
    expect(preflight).toContain("order 29 already applied");
    expect(preflight).not.toContain("COMMIT;");
  });

  it("post-verifier is read-only and asserts the invariants", () => {
    expect(postVerifier).toContain("-- READ ONLY");
    expect(postVerifier.trimEnd().endsWith("ROLLBACK;")).toBe(true);
    expect(postVerifier).toContain("B1 runtime step without exactly one assignee");
    expect(postVerifier).toContain("active-step invariant broken");
    expect(postVerifier).toContain("role bypass detected in assignee assert");
    expect(postVerifier).not.toContain("COMMIT;");
  });
});

describe("B1 RPC principal harness", () => {
  it("negative harness proves the authenticated principal before calling", () => {
    expect(negativeHarness).toContain("SET LOCAL ROLE authenticated");
    expect(negativeHarness).toContain("request.jwt.claims");
    expect(negativeHarness).toContain("auth.uid()::text = :'principal_user_id'");
    expect(negativeHarness).toContain("auth.role() = 'authenticated'");
    expect(negativeHarness).toContain("rolsuper OR rolbypassrls");
  });

  it("negative harness never commits", () => {
    expect(negativeHarness).toContain("ROLLBACK;");
    expect(/^\s*COMMIT;/m.test(negativeHarness)).toBe(false);
  });

  it("negative harness covers cross-department head denial", () => {
    expect(negativeHarness).toContain("source head principal on the TARGET head step");
    expect(negativeHarness).toContain("target head principal on the SOURCE head step");
    expect(negativeHarness).toContain("a third department head on both head steps");
  });

  it("positive harness is held back (no executable statements)", () => {
    const executable = positiveHarness
      .split("\n")
      .filter((line) => line.trim().length > 0 && !line.trim().startsWith("--"));
    expect(executable).toEqual(["\\set ON_ERROR_STOP on"]);
  });
});
