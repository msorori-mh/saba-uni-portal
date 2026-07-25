// B1-SEQUENTIAL-APPLY-MANIFEST-AND-VERIFIER-CLOSURE-01
// Structural tests for docs/b1/B1-SEQUENTIAL-APPLY-MANIFEST.json.
// Read-only: asserts manifest integrity, dependency graph, uniqueness and
// sequential-apply enforcement fields. Never touches the database.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const manifestPath = join(repoRoot, "docs", "b1", "B1-SEQUENTIAL-APPLY-MANIFEST.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous manifest schema
const entries = manifest.migrations as Array<Record<string, any>>;
const ids = entries.map((e) => e.canonical_id as string);
const idSet = new Set(ids);

const REQUIRED_FIELDS = [
  "canonical_id",
  "filename",
  "category",
  "source_sha",
  "sha256",
  "dependencies",
  "objects_created",
  "objects_modified",
  "functions",
  "rpcs",
  "rls_impact",
  "grants_revokes",
  "storage_impact",
  "protected_record_impact",
  "preflight",
  "apply_channel",
  "post_verifier",
  "expected_object_proof",
  "stop_conditions",
  "partial_apply_detection",
  "rollback_by_forward",
  "activation_dependency",
  "status",
];

describe("manifest shape", () => {
  test("manifest loads from its repo path and has required top-level sections", () => {
    expect(manifest.manifest_id).toBe("B1-SEQUENTIAL-APPLY-MANIFEST-01");
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBe(22); // prior 20 + secure reads + secure draft mutations
    expect(manifest.global_policies).toBeTruthy();
    expect(manifest.dependency_graph).toBeTruthy();
    expect(manifest.excluded).toBeTruthy();
    expect(manifest.existing_ci_pg_verifiers).toBeTruthy();
  });

  test("every entry has all required fields", () => {
    for (const e of entries) {
      for (const f of REQUIRED_FIELDS) {
        expect(Object.prototype.hasOwnProperty.call(e, f)).toBe(true);
      }
    }
  });
});

describe("uniqueness and identifiers", () => {
  test("canonical_ids are unique", () => {
    expect(idSet.size).toBe(ids.length);
  });
  test("filenames are unique", () => {
    const fns = entries.map((e) => e.filename);
    expect(new Set(fns).size).toBe(fns.length);
  });
  test("sequence_order is unique, contiguous 1..N and total", () => {
    const seqs = entries.map((e) => e.sequence_order).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: entries.length }, (_, i) => i + 1));
  });
  test("source_sha and sha256 formats", () => {
    for (const e of entries) {
      expect(e.source_sha).toMatch(/^[0-9a-f]{40}$/);
      expect(e.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe("dependency graph", () => {
  test("every dependency references an existing canonical_id", () => {
    for (const e of entries) {
      expect(Array.isArray(e.dependencies)).toBe(true);
      for (const d of e.dependencies) {
        expect(idSet.has(d)).toBe(true);
      }
    }
  });
  test("no self-dependency", () => {
    for (const e of entries) expect(e.dependencies.includes(e.canonical_id)).toBe(false);
  });
  test("graph is acyclic (topological sort covers all nodes)", () => {
    const indeg = new Map<string, number>(ids.map((i) => [i, 0]));
    for (const e of entries)
      for (const d of e.dependencies)
        indeg.set(e.canonical_id, (indeg.get(e.canonical_id) ?? 0) + 1);
    const queue = ids.filter((i) => (indeg.get(i) ?? 0) === 0);
    let seen = 0;
    const depsOf = new Map(entries.map((e) => [e.canonical_id, e.dependencies as string[]]));
    const dependents = new Map<string, string[]>(ids.map((i) => [i, []]));
    for (const e of entries)
      for (const d of e.dependencies) dependents.get(d)!.push(e.canonical_id);
    const work = [...queue];
    while (work.length) {
      const n = work.pop()!;
      seen++;
      for (const m of dependents.get(n) ?? []) {
        indeg.set(m, (indeg.get(m) ?? 0) - 1);
        if (indeg.get(m) === 0) work.push(m);
      }
    }
    expect(seen).toBe(entries.length);
  });
  test("EXACTLY ONE first migration (zero dependencies) and it is sequence_order 1", () => {
    const first = entries.filter((e) => e.dependencies.length === 0);
    expect(first.length).toBe(1);
    expect(first[0].sequence_order).toBe(1);
    expect(first[0].canonical_id).toBe(manifest.dependency_graph.first_migration);
  });
  test("every non-first entry depends on its sequence predecessor (batch-apply prevention)", () => {
    const bySeq = [...entries].sort((a, b) => a.sequence_order - b.sequence_order);
    for (let i = 1; i < bySeq.length; i++) {
      expect(bySeq[i].dependencies).toContain(bySeq[i - 1].canonical_id);
    }
  });
});

describe("status and gates", () => {
  test("ALL entries are NOT_APPLIED", () => {
    for (const e of entries) expect(e.status).toBe("NOT_APPLIED");
  });
  test("every entry has a post_verifier with bun source-contract tests and explicit B1 PG-verifier gap", () => {
    for (const e of entries) {
      expect(e.post_verifier).toBeTruthy();
      expect(Array.isArray(e.post_verifier.bun_source_contract_tests)).toBe(true);
      expect(e.post_verifier.bun_source_contract_tests.length).toBeGreaterThan(0);
      for (const t of e.post_verifier.bun_source_contract_tests) {
        expect(t).toMatch(/^tests\//);
        expect(existsSync(join(repoRoot, t))).toBe(true);
      }
      expect(e.post_verifier.existing_ci_pg_verifiers_cover_this_migration).toBe(false);
      expect(String(e.post_verifier.pg_verifier_status)).toMatch(/FOLLOW-UP/);
    }
  });
  test("every entry has non-empty preflight, stop_conditions, expected_object_proof", () => {
    for (const e of entries) {
      expect(e.preflight.length).toBeGreaterThan(0);
      expect(e.stop_conditions.length).toBeGreaterThan(0);
      expect(e.expected_object_proof.length).toBeGreaterThan(0);
    }
  });
  test("every entry documents partial_apply_detection, rollback_by_forward, activation_dependency", () => {
    for (const e of entries) {
      expect(String(e.partial_apply_detection).length).toBeGreaterThan(10);
      expect(String(e.rollback_by_forward).length).toBeGreaterThan(10);
      expect(String(e.rollback_by_forward)).toMatch(/forward/i);
      expect(String(e.activation_dependency).length).toBeGreaterThan(0);
    }
  });
  test("protected-record handling documented per entry", () => {
    for (const e of entries) {
      expect(String(e.protected_record_impact).length).toBeGreaterThan(0);
    }
  });
});

describe("batch-apply prevention policies", () => {
  test("manifest-level policies make sequential one-at-a-time apply explicit", () => {
    const p = manifest.global_policies;
    expect(p.batch_apply_forbidden).toBe(true);
    expect(p.max_migrations_per_apply_session).toBe(1);
    expect(p.parallel_apply_forbidden).toBe(true);
    expect(p.ci_auto_apply_forbidden).toBe(true);
    const stages = p.sequential_protocol.join(" ");
    for (const stage of ["PREFLIGHT", "APPLY ONE ONLY", "VERIFY", "PROTECTED RECORD CHECK"]) {
      expect(stages).toContain(stage);
    }
    const stops = p.stop_on.join(" ");
    expect(stops).toMatch(/PARTIAL/);
    expect(stops).toMatch(/AMBIGUOUS/);
  });
});

describe("excluded and verifier mapping", () => {
  test("never-apply section lists exactly 5 drafts, each with a reason and hashes", () => {
    const na = manifest.excluded.never_apply;
    expect(na.length).toBe(5);
    expect(
      na.some(
        (x: { filename: string }) =>
          x.filename === "B1-RUNTIME-PREDECESSOR-GUARD-REMEDIATION-01.sql",
      ),
    ).toBe(true);
    for (const x of na) {
      expect(String(x.reason).length).toBeGreaterThan(10);
      expect(x.source_sha).toMatch(/^[0-9a-f]{40}$/);
      expect(x.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
  test("no never-apply or out-of-scope filename appears in the apply set", () => {
    const applyFns = new Set(entries.map((e) => e.filename));
    for (const x of manifest.excluded.never_apply) expect(applyFns.has(x.filename)).toBe(false);
    for (const x of manifest.excluded.out_of_scope_non_b1)
      expect(applyFns.has(x.filename)).toBe(false);
  });
  test("all 8 existing CI pg-verifier legs are mapped and explicitly marked NOT B1", () => {
    const v = manifest.existing_ci_pg_verifiers;
    expect(v.count).toBe(8);
    expect(v.legs.length).toBe(8);
    expect(v.none_covers_b1).toBe(true);
    for (const leg of v.legs) {
      expect(leg.is_b1_verifier).toBe(false);
      expect(Array.isArray(leg.related_b1_canonical_ids)).toBe(true);
      for (const cid of leg.related_b1_canonical_ids) {
        expect(idSet.has(cid)).toBe(true);
      }
    }
  });
});
