import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
const packageDir = join(root, "docs/department-transfer-10a1");
const manifestPath = join(packageDir, "APPLY-MANIFEST.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
  source_only: boolean;
  reviewed_source_sha: string;
  new_sha: string | null;
  production_apply: string;
  activation: { SCHEMA_PENDING: boolean; department_transfer_E2E: string; student_visible: boolean };
  migration_decision: { new_migration_created: boolean };
  authoritative_draft_order: string;
  authoritative_draft_entries: number;
  base_schema_sources: Array<{ path: string; sha256: string }>;
  forward_only_b1_sources: Array<{ path: string; sha256: string }>;
  service_specific_drafts: Array<{ path: string; sha256: string }>;
  read_only_artifacts: string[];
  harness: { runner: string; docker_required: boolean; production_credentials_allowed: boolean };
};

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function withoutSqlComments(sql: string) {
  return sql.replace(/--[^\r\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("Department Transfer 10A1 source package", () => {
  test("pins source-only status and preserves every activation gate", () => {
    expect(manifest.source_only).toBe(true);
    expect(manifest.reviewed_source_sha).toBe("9d1633864b86afdff5ef276a69f532c1580db910");
    expect(manifest.new_sha).toBeNull();
    expect(manifest.production_apply).toBe("GATED_NOT_PERFORMED");
    expect(manifest.activation).toEqual({
      SCHEMA_PENDING: true,
      department_transfer_E2E: "PENDING",
      student_visible: false,
    });
    expect(manifest.migration_decision.new_migration_created).toBe(false);
    expect(read("src/lib/student-requests/request-form-registry.ts")).toContain("const SCHEMA_PENDING = true");
    expect(read("src/lib/student-requests/p1/activation-gate.ts")).toContain('department_transfer: base({ E2E: "PENDING" })');
  });

  test("pins the existing ordered source chain without inventing a migration", () => {
    expect(existsSync(join(root, manifest.authoritative_draft_order))).toBe(true);
    const entries = read(manifest.authoritative_draft_order).split(/\r?\n/).filter((line) => /^\d{2} docs\/migration-drafts\//.test(line));
    expect(entries).toHaveLength(manifest.authoritative_draft_entries);
    const pinned = [...manifest.base_schema_sources, ...manifest.forward_only_b1_sources, ...manifest.service_specific_drafts];
    for (const item of pinned) {
      expect(existsSync(join(root, item.path))).toBe(true);
      const actual = createHash("sha256").update(read(item.path).replace(/\r\n/g, "\n")).digest("hex");
      expect(actual).toBe(item.sha256);
    }
    expect(manifest.service_specific_drafts.map((item) => item.path)).toContain("docs/migration-drafts/REQUEST-B1-TRANSFER-SECURE-ATTACHMENT-05A.sql");
    expect(manifest.service_specific_drafts.map((item) => item.path)).toContain("docs/migration-drafts/B1-TRANSFER-DEPARTMENT-SCOPE-POSITION-ASSIGNMENT-01.sql");
    expect(manifest.service_specific_drafts.map((item) => item.path)).toContain("docs/migration-drafts/REQUEST-B1-DETAIL-ACL-CUTOVER-06.sql");
  });

  test("ships only read-only production artifacts", () => {
    for (const path of manifest.read_only_artifacts) {
      expect(existsSync(join(root, path))).toBe(true);
      const sql = withoutSqlComments(read(path));
      expect(sql).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|grant|revoke|truncate|do)\b/im);
      expect(sql).toContain("BEGIN;");
      expect(sql).toContain("SET TRANSACTION READ ONLY;");
      expect(sql).toContain("ROLLBACK;");
    }
  });

  test("ships a Docker-independent PG17 disposable runner", () => {
    expect(manifest.harness.docker_required).toBe(false);
    expect(manifest.harness.production_credentials_allowed).toBe(false);
    const runner = read(manifest.harness.runner);
    expect(runner).toContain("PG_TARGET_DISPOSABLE");
    expect(runner).toContain("show server_version");
    expect(runner).toContain("psql");
    expect(runner).toContain("DROP DATABASE IF EXISTS");
    expect(runner).toContain("Join-Path $PSScriptRoot '..\\..'");
    expect(runner).toContain("v_commit text := 'APPROVED_RELEASE_COMMIT_PLACEHOLDER';");
    expect(runner).toContain("v_commit = 'APPROVED_RELEASE_COMMIT_PLACEHOLDER'");
    expect(runner).toContain("PG17-DISPOSABLE-FIXTURE-COMPATIBILITY.sql");
    expect(read("scripts/department-transfer-10a1/PG17-DISPOSABLE-FIXTURE-COMPATIBILITY.sql")).toContain("ADD COLUMN IF NOT EXISTS updated_at");
    expect(runner).not.toMatch(/\bdocker\b/i);
    expect(runner).not.toMatch(/supabase\s+(db\s+push|migration\s+repair)/i);
  });

  test("ships a PR-triggered PG17 CI job with no production target", () => {
    const workflow = read(".github/workflows/department-transfer-10a2-pg17.yml");
    expect(workflow).toContain("image: postgres:17");
    expect(workflow).toContain("run-pg17-harness.ps1");
    expect(workflow).toContain('PG_TARGET_DISPOSABLE: "1"');
    expect(workflow).not.toMatch(/supabase\.co|quboolye|production|prod[_-]?host/i);
  });

  test("direct matrix covers transfer isolation and bypass cases", () => {
    const matrix = read("scripts/department-transfer-10a1/DEPARTMENT-TRANSFER-DIRECT-MATRIX.sql");
    for (const token of [
      "other_student_read",
      "student_staff_read",
      "admin_bypass",
      "dean_bypass",
      "registrar_bypass",
      "source_department_head_approval",
      "target_department_head_approval",
      "record_external_university_payment_confirmation",
      "act_on_b1_student_request_step_atomic",
      "audit_append_only",
    ]) expect(matrix).toContain(token);
  });
});
