/**
 * PORTAL-B1-ACTOR-IS-ACTIONABLE-PRODUCTION-SOURCE-RECONCILIATION-38
 *
 * Source-only guards. These tests prevent regression of the three defects found
 * during the controlled production apply of migration 20260729173359, plus the
 * duplicate-migration and promotion-map reconciliation invariants.
 */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const MIGRATIONS_DIR = resolve(ROOT, "supabase/migrations");
const APPLIED_FILE = "20260729173359_9a749214-c28e-489b-95ec-038f290a5c3c.sql";
const DUPLICATE_FILE = "20260730000000_b1_30_actor_is_actionable_configured_action_01.sql";
const DRAFT = resolve(ROOT, "docs/migration-drafts/B1-ACTOR-IS-ACTIONABLE-CONFIGURED-ACTION-01.sql");
const VERIFIER_DIR = resolve(ROOT, "docs/migration-drafts/b1-backend-verifiers");
const VERIFIERS = [
  "30-B1_30_ACTOR_IS_ACTIONABLE_CONFIGURED_ACTION_01-PREFLIGHT.sql",
  "30-B1_30_ACTOR_IS_ACTIONABLE_CONFIGURED_ACTION_01-STRUCTURAL-VERIFIER.sql",
  "30-B1_30_ACTOR_IS_ACTIONABLE_CONFIGURED_ACTION_01-POST-VERIFIER.sql",
];

const lf = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const shaLf = (p: string) => createHash("sha256").update(lf(p), "utf8").digest("hex");

/** Strip SQL line comments, collapse whitespace, drop blank lines. */
const semanticLines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.replace(/--.*$/, "").replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 0);

describe("38 · production migration file identity", () => {
  it("the applied migration file exists in source under its production name", () => {
    expect(readdirSync(MIGRATIONS_DIR)).toContain(APPLIED_FILE);
  });

  it("the proposed duplicate migration filename is absent from supabase/migrations", () => {
    expect(readdirSync(MIGRATIONS_DIR)).not.toContain(DUPLICATE_FILE);
  });

  it("the migration is present exactly once (no other file carries the helper DDL)", () => {
    const carriers = readdirSync(MIGRATIONS_DIR).filter((f) =>
      lf(resolve(MIGRATIONS_DIR, f)).includes(
        "create or replace function public.workflow_runtime_step_configured_action",
      ),
    );
    expect(carriers).toEqual([APPLIED_FILE]);
  });

  it("applied file and approved draft have ZERO semantic SQL diff (comments/whitespace only)", () => {
    const applied = semanticLines(lf(resolve(MIGRATIONS_DIR, APPLIED_FILE)));
    const draft = semanticLines(lf(DRAFT));
    expect(applied).toEqual(draft);
  });

  it("pins the divergent LF SHAs that the semantic comparison explains", () => {
    expect(shaLf(DRAFT)).toBe(
      "d24d42c99f8a8f19935f659e5e4e6c2bca0e86f4639970735e6db033dbdbf1b2",
    );
    expect(shaLf(resolve(MIGRATIONS_DIR, APPLIED_FILE))).toBe(
      "63c15a74936335da6635cc3af290936bede51c7a55b65dc50677223d20750eb3",
    );
  });
});

describe("38 · verifier defect regressions", () => {
  const bodies = VERIFIERS.map((f) => [f, lf(resolve(VERIFIER_DIR, f))] as const);

  it("DEFECT-1: no unqualified oid/proname reference (ambiguous column)", () => {
    for (const [name, sql] of bodies) {
      expect(sql, `${name}: bare md5(oid...)`).not.toMatch(/md5\(\s*(?:pg_get_functiondef\()?oid/);
      expect(sql, `${name}: bare select proname`).not.toMatch(/^\s*select\s+proname\b/im);
      expect(sql, `${name}: bare and proname in`).not.toMatch(/^\s*and\s+proname\s+in/im);
    }
  });

  it("DEFECT-2: function bodies are inspected via prosrc, never regex over pg_get_functiondef", () => {
    for (const [name, sql] of bodies) {
      const active = sql
        .split("\n")
        .filter((l) => !l.trim().startsWith("--"))
        .join("\n");
      expect(active, `${name}: pg_get_functiondef used for body inspection`).not.toMatch(
        /pg_get_functiondef/,
      );
      expect(active, `${name}: must inspect p.prosrc`).toMatch(/p\.prosrc/);
    }
  });

  it("DEFECT-3: no active statement reads supabase_migrations", () => {
    for (const [name, sql] of bodies) {
      const active = sql
        .split("\n")
        .filter((l) => !l.trim().startsWith("--"))
        .join("\n");
      expect(active, `${name}: active supabase_migrations read`).not.toMatch(
        /supabase_migrations/,
      );
    }
  });
});

describe("38 · promotion map reconciliation", () => {
  const MAP = resolve(VERIFIER_DIR, "PROMOTION-MAP.json");
  const entry = JSON.parse(lf(MAP)).find((e: { order: number }) => e.order === 30);

  it("records the applied state and the actual production version", () => {
    expect(entry.apply_status).toBe("APPLIED");
    expect(entry.production_version).toBe("20260729173359");
    expect(entry.applied_migration_path).toBe(`supabase/migrations/${APPLIED_FILE}`);
    expect(entry.applied_exactly_once).toBe(true);
  });

  it("records both SHAs and explains the divergence", () => {
    expect(entry.draft_sha_lf).toBe(shaLf(DRAFT));
    expect(entry.applied_migration_sha_lf).toBe(shaLf(resolve(MIGRATIONS_DIR, APPLIED_FILE)));
    expect(entry.sha_divergence_explanation).toMatch(/ZERO SEMANTIC SQL DIFF/);
  });

  it("no longer proposes the duplicate migration filename", () => {
    expect(entry.proposed_migration_filename).toBeUndefined();
    expect(lf(MAP)).not.toContain(`"${DUPLICATE_FILE}"`);
  });

  it("keeps the verifier SHAs in sync with the on-disk verifiers", () => {
    expect(entry.preflight_sha_lf).toBe(shaLf(resolve(ROOT, entry.preflight)));
    expect(entry.structural_verifier_sha_lf).toBe(shaLf(resolve(ROOT, entry.structural_verifier)));
    expect(entry.post_verifier_sha_lf).toBe(shaLf(resolve(ROOT, entry.post_verifier)));
  });
});
