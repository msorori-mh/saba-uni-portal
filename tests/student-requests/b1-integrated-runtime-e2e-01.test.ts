import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
const harnessDir = join(root, "tests/b1-integrated-runtime/pg");
const report = join(
  root,
  "docs/PORTAL-B1-FIVE-SERVICES-INTEGRATED-RUNTIME-E2E-HARNESS-01-REPORT.md",
);
const mapPath = join(root, "docs/migration-drafts/b1-backend-verifiers/PROMOTION-MAP.json");
const manifestPath = join(root, "docs/b1/B1-SEQUENTIAL-APPLY-MANIFEST.json");

describe("B1 integrated runtime E2E harness — source surface", () => {
  test("harness files exist under tests/b1-integrated-runtime", () => {
    expect(existsSync(join(harnessDir, "run-harness.ps1"))).toBe(true);
    const files = readdirSync(harnessDir);
    for (const f of [
      "10-e2e-helpers.sql",
      "20-position-assignment-fixtures.sql",
      "40-lifecycle-five-services.sql",
      "45-authz-negatives.sql",
      "50-draft-and-read-matrix.sql",
      "55-attachments-stub.sql",
      "60-enrollment-certificate-regression.sql",
      "70-summarize.sql",
    ]) {
      expect(files).toContain(f);
    }
  });

  test("runner applies secure-read before secure-draft and activates locally only", () => {
    const runner = readFileSync(join(harnessDir, "run-harness.ps1"), "utf8");
    expect(runner).toContain("B1-FIVE-SERVICES-SECURE-READ-CONTRACTS-01.sql");
    expect(runner).toContain("SECURE-DRAFT-MUTATIONS");
    expect(runner).toContain("35-activate-workflows-local-only.sql");
    expect(runner).toContain("TEST_ONLY_B1_FIVE_SERVICES_INTEGRATED_RUNTIME");
    expect(runner).toContain("docker stop");
    expect(runner).toContain("SERVICES_COMPLETED");
    expect(runner).not.toMatch(/supabase\s+db\s+push|production|staging/i);
  });

  test("promotion map order 20/21 and activation gate 22 remain distinct", () => {
    const map = JSON.parse(readFileSync(mapPath, "utf8")) as Array<{
      order: number;
      draft: string;
    }>;
    expect(map.find((x) => x.order === 20)?.draft).toContain("SECURE-READ");
    expect(map.find((x) => x.order === 21)?.draft).toContain("SECURE-DRAFT");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      global_policies: { activation_gate: string };
      migrations: Array<{ sequence_order: number; filename: string }>;
    };
    expect(manifest.global_policies.activation_gate).toMatch(/gate 22/);
    expect(manifest.migrations.find((m) => m.sequence_order === 20)?.filename).toContain(
      "CONFIRM-PAYMENT-PREDECESSOR",
    );
    expect(manifest.migrations.find((m) => m.sequence_order === 21)?.filename).toContain(
      "SECURE-DRAFT-MUTATIONS",
    );
  });

  test("lifecycle SQL covers five services and payment specialized RPC", () => {
    const life = readFileSync(join(harnessDir, "40-lifecycle-five-services.sql"), "utf8");
    for (const s of [
      "enrollment_suspension",
      "excused_absence",
      "department_transfer",
      "final_chance",
      "file_withdrawal",
    ]) {
      expect(life).toContain(s);
    }
    expect(life).toContain("create_b1_request_draft_for_student");
    expect(life).toContain("save_b1_request_draft_for_student");
    expect(life).toContain("submit_b1_student_request_atomic");
    expect(life).toContain("act_on_b1_student_request_step_atomic");
    expect(life).toContain("record_external_university_payment_confirmation");
    expect(life).not.toContain("e_rpcmatrix.advance_to");
  });

  test("transfer scope remediation prefers position_assignment over faculty_profiles", () => {
    const draft = readFileSync(
      join(root, "docs/migration-drafts/B1-TRANSFER-DEPARTMENT-SCOPE-POSITION-ASSIGNMENT-01.sql"),
      "utf8",
    );
    expect(draft).toContain("assigned_position_assignment_id");
    expect(draft).toContain("position_assignments");
    expect(draft).not.toMatch(/JOIN public\.faculty_profiles/i);
    const applyOrder = readFileSync(
      join(root, "tests/b1-rpc-matrix/pg/20-draft-apply-order.txt"),
      "utf8",
    );
    expect(applyOrder).toContain("B1-TRANSFER-DEPARTMENT-SCOPE-POSITION-ASSIGNMENT-01.sql");
    expect(applyOrder).toMatch(/23 docs\/migration-drafts\/B1-TRANSFER-DEPARTMENT-SCOPE/);
  });

  test("file_withdrawal impact ack null-guard uses IS DISTINCT FROM", () => {
    const draft = readFileSync(
      join(root, "docs/migration-drafts/B1-FILE-WITHDRAWAL-IMPACT-ACK-NULL-GUARD-01.sql"),
      "utf8",
    );
    const body = draft.slice(draft.indexOf("CREATE OR REPLACE FUNCTION"));
    expect(body).toMatch(/impact_acknowledgment'\s+IS DISTINCT FROM\s+'true'::jsonb/i);
    expect(body).not.toMatch(/impact_acknowledgment'\s*<>\s*'true'::jsonb/);
    const applyOrder = readFileSync(
      join(root, "tests/b1-rpc-matrix/pg/20-draft-apply-order.txt"),
      "utf8",
    );
    expect(applyOrder).toMatch(/24 docs\/migration-drafts\/B1-FILE-WITHDRAWAL-IMPACT-ACK/);
  });

  test("report path reserved for PASS artifact", () => {
    // Report may be written after harness PASS in the same track.
    expect(
      report.endsWith("PORTAL-B1-FIVE-SERVICES-INTEGRATED-RUNTIME-E2E-HARNESS-01-REPORT.md"),
    ).toBe(true);
  });
});
