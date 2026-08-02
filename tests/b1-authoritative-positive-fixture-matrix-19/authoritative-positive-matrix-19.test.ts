import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { generateManifest, type AuthoritativeManifest } from "./generate-manifest";

const root = process.cwd();
const manifestPath = join(root, "tests", "b1-authoritative-positive-fixture-matrix-19", "MANIFEST.json");
const migrationPath = join(root, "supabase", "migrations", "20260801021541_4a93f2d8-18ad-453f-a00d-6a9ea08f7fbe.sql");

const manifest: AuthoritativeManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const migrationSql = readFileSync(migrationPath, "utf8");

describe("PORTAL-B1-AUTHORITATIVE-POSITIVE-FIXTURE-MATRIX-19-MINIMAL-36", () => {
  it("Requirement 2: requires exactly 19 cases and exactly 19 active runtime steps in manifest", () => {
    expect(manifest.matrix_metadata.total_requests).toBe(19);
    expect(manifest.matrix_metadata.total_active_runtime_steps).toBe(19);
    expect(manifest.cases.length).toBe(19);
  });

  it("Requirement 3: requires exactly one active step per request", () => {
    const activeStepsPerReq = new Map<string, number>();
    for (const c of manifest.cases) {
      activeStepsPerReq.set(c.request_id, (activeStepsPerReq.get(c.request_id) || 0) + 1);
    }
    expect(activeStepsPerReq.size).toBe(19);
    for (const count of activeStepsPerReq.values()) {
      expect(count).toBe(1);
    }
  });

  it("Requirement 4: rejects all SR-20260727 identities as non-authoritative", () => {
    for (const c of manifest.cases) {
      expect(c.request_number).not.toMatch(/^SR-20260727-/);
      expect(c.request_number).toMatch(/^SR-20260801-13/);
    }
  });

  it("Drift test: fails on duplicate request IDs or runtime step IDs", () => {
    const reqIds = new Set<string>();
    const stepIds = new Set<string>();
    const reqNums = new Set<string>();

    for (const c of manifest.cases) {
      expect(reqIds.has(c.request_id)).toBe(false);
      expect(stepIds.has(c.runtime_step_id)).toBe(false);
      expect(reqNums.has(c.request_number)).toBe(false);

      reqIds.add(c.request_id);
      stepIds.add(c.runtime_step_id);
      reqNums.add(c.request_number);
    }
  });

  it("Drift test: rejects synthetic IDs and enforces deterministic fixture UUID structure", () => {
    for (const c of manifest.cases) {
      expect(c.request_id).toMatch(/^f1300000-0000-4000-8000-\d{12}$/);
      expect(c.runtime_step_id).toMatch(/^f1300001-0000-4000-8000-\d{12}$/);
    }
  });

  it("Drift test: validates wrong actor/action binding per service step", () => {
    for (const c of manifest.cases) {
      expect(c.direct_assignee_principal_id).toBeDefined();
      expect(c.direct_assignee_principal_id.length).toBe(36);
      expect(c.exact_configured_action).toMatch(/^(approve|clear|confirm_payment|apply_decision|archive)$/);

      if (c.step_code === "payment_confirmation") {
        expect(c.exact_configured_action).toBe("confirm_payment");
        expect(c.exact_rpc_signature).toBe("record_external_university_payment_confirmation");
        expect(c.processing_unit).toBe("finance");
        expect(c.processing_role).toBe("revenue_finance_officer");
        expect(c.direct_assignee_principal_id).toBe("79783c0f-8d95-4110-8239-0ac504d63a24");
      } else if (c.step_code === "registrar_apply") {
        expect(c.exact_configured_action).toBe("apply_decision");
        expect(c.processing_unit).toBe("registrar");
        expect(c.processing_role).toBe("registrar_general");
        expect(c.direct_assignee_principal_id).toBe("4c261c1c-97fb-42da-a544-e8a59853ebe3");
      } else if (c.step_code === "source_department_head_approval") {
        expect(c.department_scope).toBe("ce485c67-5f7c-498d-b120-4b1130a86ae8"); // IT
        expect(c.direct_assignee_principal_id).toBe("d4aaa5c9-72d1-4996-b0e8-d30c6327da6e");
      } else if (c.step_code === "target_department_head_approval") {
        expect(c.department_scope).toBe("11111111-1111-4111-8111-111111111111"); // CS
        expect(c.direct_assignee_principal_id).toBe("97acbe02-c59c-409c-8d51-7d4ef72e6db7");
      }
    }
  });

  it("Drift test: verifies migration head matches 20260801021541", () => {
    expect(manifest.matrix_metadata.migration_head).toBe("20260801021541");
    expect(migrationSql).toContain("k_head            CONSTANT text := '20260731203030';");
    expect(migrationSql).toContain("SR-20260801-13");
  });

  it("Drift test: fails if direct assignment is missing", () => {
    for (const c of manifest.cases) {
      expect(c.direct_assignee_principal_id).not.toBeNull();
      expect(c.direct_assignee_principal_id).not.toBe("");
    }
  });

  it("Deterministic manifest reproducibility test: generated manifest matches MANIFEST.json exactly", () => {
    const recomputed = generateManifest();
    expect(JSON.stringify(recomputed)).toBe(JSON.stringify(manifest));
  });

  it("Safety controls: execution authorization false & no production connection", () => {
    expect(manifest.matrix_metadata.execution_authorization).toBe(false);
    expect(manifest.matrix_metadata.production_connection).toBe(false);
  });
});
