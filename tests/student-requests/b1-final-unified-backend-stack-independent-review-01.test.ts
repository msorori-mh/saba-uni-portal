import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256Lf = (path: string) =>
  createHash("sha256").update(read(path).replace(/\r\n/g, "\n")).digest("hex");

describe("PR227 final unified backend stack independent review", () => {
  test("sequence 21-27 is contiguous and every source and migration pin is current", () => {
    const promotion = JSON.parse(
      read("docs/migration-drafts/b1-backend-verifiers/PROMOTION-MAP.json"),
    ) as Array<{
      order: number;
      draft: string;
      migration: string;
      draft_sha_lf: string;
      migration_sha_lf: string;
      preflight: string;
      post_verifier: string;
    }>;
    const manifest = JSON.parse(read("docs/b1/B1-SEQUENTIAL-APPLY-MANIFEST.json")) as {
      global_policies: { activation_gate: string };
      migrations: Array<{ sequence_order: number; filename: string; sha256: string }>;
    };

    // Orders 21-27 are promoted into supabase/migrations; order 28 is applied
    // separately under PORTAL-B1-PAYMENT-CONFIRMATION-AUTHORIZATION-HARDENING-PRODUCTION-APPLY-01.
    const finalEntries = promotion.filter(({ order }) => order >= 21 && order <= 27);
    expect(finalEntries.map(({ order }) => order)).toEqual([21, 22, 23, 24, 25, 26, 27]);
    const appliedOutOfManifest = promotion.filter(
      ({ order, apply_status }) => order >= 28 && apply_status !== "NOT_APPLIED",
    );
    expect(appliedOutOfManifest.map(({ order }) => order)).toEqual([28, 29]);
    for (const entry of appliedOutOfManifest) {
      expect(entry.migration).toBeTruthy();
      expect(sha256Lf(entry.migration)).toBe(entry.migration_sha_lf);
      expect(sha256Lf(`docs/migration-drafts/${entry.draft}`)).toBe(entry.draft_sha_lf);
    }
    // Nothing is left pending: orders 28 and 29 are both applied in production.
    const notApplied = promotion.filter(({ apply_status }) => apply_status === "NOT_APPLIED");
    expect(notApplied.map(({ order }) => order)).toEqual([]);

    expect(manifest.migrations.map(({ sequence_order }) => sequence_order)).toEqual(
      Array.from({ length: 27 }, (_, index) => index + 1),
    );
    expect(manifest.global_policies.activation_gate).toMatch(/gate 25/);


    for (const entry of finalEntries) {
      expect(sha256Lf(`docs/migration-drafts/${entry.draft}`)).toBe(entry.draft_sha_lf);
      expect(sha256Lf(entry.migration)).toBe(entry.migration_sha_lf);
      expect(read(entry.preflight)).toContain("PREFLIGHT");
      expect(read(entry.post_verifier)).toContain("POST");
      expect(
        manifest.migrations.find(({ sequence_order }) => sequence_order === entry.order),
      ).toMatchObject({ filename: entry.draft, sha256: entry.draft_sha_lf });
    }
  });

  test("full authorization matrix adapts fixtures without weakening production guards", () => {
    const runner = read("tests/b1-rpc-matrix/pg/run-harness.ps1");
    const verifier = read("tests/b1-rpc-matrix/pg/40-verifier.sql");
    const draftHarness = read("tests/b1-secure-draft/pg/run-harness.ps1");

    expect(runner).toContain(
      "tests\\b1-integrated-runtime\\pg\\20-position-assignment-fixtures.sql",
    );
    expect(verifier).toContain("B1_OPEN_DRAFT_GUARD_MISSING");
    expect(verifier).toContain("DROP INDEX public.uq_b1_one_open_draft_per_student_type");
    expect(draftHarness).toContain("60-concurrency-verifier.sql");
    expect(draftHarness).not.toMatch(/DROP INDEX.*uq_b1_one_open_draft/is);
  });

  test("secure read DTOs and draft mutations preserve privacy and fail-closed boundaries", () => {
    const readSql = read("docs/migration-drafts/B1-FIVE-SERVICES-SECURE-READ-CONTRACTS-01.sql");
    const readContracts = read("src/lib/student-requests/b1-secure-read/contracts.ts");
    const draftSql = read("docs/migration-drafts/B1-FIVE-SERVICES-SECURE-DRAFT-MUTATIONS-01.sql");

    expect(readSql).toContain("public.user_matches_workflow_runtime_step");
    expect(readSql).toContain("public.can_current_user_act_on_step");
    expect(readContracts).not.toMatch(
      /^\s*(storage_bucket|storage_object_path|objectPath|object_key|actorId|actor_id)\??\s*:/m,
    );
    expect(draftSql).toContain("p_expected_updated_at is null");
    expect(draftSql).toContain("v_r.updated_at is distinct from p_expected_updated_at");
    expect(draftSql).not.toMatch(/\bp_(user|student|actor|department)_id\b/i);
    expect(draftSql).not.toMatch(/student_visible\s*=/);
  });

  test("seq23 and seq24 keep exact scope and SQL-null-safe acknowledgments", () => {
    const transfer = read(
      "docs/migration-drafts/B1-TRANSFER-DEPARTMENT-SCOPE-POSITION-ASSIGNMENT-01.sql",
    );
    const withdrawal = read(
      "docs/migration-drafts/B1-FILE-WITHDRAWAL-IMPACT-ACK-NULL-GUARD-01.sql",
    );
    const withdrawalBody = withdrawal.slice(withdrawal.indexOf("CREATE OR REPLACE FUNCTION"));

    expect(transfer).toContain("count(*) = 1");
    expect(transfer).toContain("s.assigned_position_assignment_id");
    expect(transfer).toContain("rpa.department_id = d.current_department_id");
    expect(transfer).toContain("rpa.department_id = d.requested_department_id");
    expect(transfer).not.toContain("JOIN public.faculty_profiles");
    expect(withdrawalBody).toMatch(
      /p_form_data->'impact_acknowledgment'\s+IS DISTINCT FROM\s+'true'::jsonb/i,
    );
    expect(withdrawalBody).not.toMatch(
      /p_form_data->'impact_acknowledgment'\s*<>\s*'true'::jsonb/i,
    );
  });

  test("protected enrollment-certificate records are never embedded in stack SQL", () => {
    const stackSql = [
      "docs/migration-drafts/B1-FIVE-SERVICES-SECURE-READ-CONTRACTS-01.sql",
      "docs/migration-drafts/B1-FIVE-SERVICES-SECURE-DRAFT-MUTATIONS-01.sql",
      "docs/migration-drafts/B1-TRANSFER-DEPARTMENT-SCOPE-POSITION-ASSIGNMENT-01.sql",
      "docs/migration-drafts/B1-FILE-WITHDRAWAL-IMPACT-ACK-NULL-GUARD-01.sql",
    ]
      .map(read)
      .join("\n");

    for (const protectedIdentifier of [
      "SR-20260716-26BAD4C8",
      "SR-20260715-FEDCB3E1",
      "SR-20260713-2DE64041",
      "USR-2026-000001",
      "USR-2026-000002",
    ]) {
      expect(stackSql).not.toContain(protectedIdentifier);
    }
  });
});
