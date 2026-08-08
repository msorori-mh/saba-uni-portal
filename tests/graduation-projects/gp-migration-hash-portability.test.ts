/**
 * GP-PRODUCTION-MIGRATION-HASH-PORTABILITY-REMEDIATION-02
 *
 * Verifies SHA256_LF_NORMALIZED_V1 evidence for L4 promotion + SET N quarantine.
 * No production access. Proves LF/CRLF checkout invariance.
 */
import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();

const HASH_CONTRACT = "SHA256_LF_NORMALIZED_V1";
const DRAFT = join(
  root,
  "docs/migration-drafts/GRADUATION-PROJECTS-STUDENT-LEVEL4-ONLY-ELIGIBILITY-GUARD-01.sql",
);
const PROMOTED = join(
  root,
  "supabase/migrations/20260808010000_gp_student_level4_only_eligibility_guard_01.sql",
);
const HASHES = join(
  root,
  "docs/migration-evidence/graduation-projects/L4_PROMOTION_HASHES.txt",
);
const MANIFEST = join(
  root,
  "docs/migration-evidence/graduation-projects/duplicate-predecessor-set/MANIFEST.json",
);
const EVIDENCE_DIR = join(
  root,
  "docs/migration-evidence/graduation-projects/duplicate-predecessor-set",
);
const MIGRATIONS_DIR = join(root, "supabase/migrations");
const SCRIPT = join(root, "scripts/sha256_lf_normalized_v1.py");

const SET_N_BASENAMES = [
  "20260806120000_gp_mvp_package_a1_foundation_01.sql",
  "20260806120100_gp_mvp_package_a2_storage_01.sql",
  "20260806120200_gp_mvp_package_a3_lifecycle_01.sql",
  "20260807003000_gp_mvp_storage_insert_policy_predicate_fix_01.sql",
] as const;

const SET_U = [
  "20260806235348_8f36000d-c62c-416f-a84b-eeee7d400dd8.sql",
  "20260807000230_a6771356-c3f3-4cba-9b90-e3f70afbb72b.sql",
  "20260807001114_c22e6009-1472-43ef-9443-b002872bbba5.sql",
  "20260807023229_7adcb3fb-73a1-483c-8ca2-4c93645fb84b.sql",
] as const;

type ManifestEntry = {
  old_path: string;
  new_evidence_path: string;
  hash_contract: string;
  sha256_lf: string;
  canonical_counterpart: string;
  canonical_sha256_lf: string;
  semantic_equivalence: string;
  production_scenario: string;
};

function normalizeLf(raw: Buffer): Buffer {
  const s = raw.toString("binary").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return Buffer.from(s, "binary");
}

function sha256LfBytes(raw: Buffer): string {
  return createHash("sha256").update(normalizeLf(raw)).digest("hex");
}

function sha256LfFile(path: string): string {
  return sha256LfBytes(readFileSync(path));
}

function bodyFromBegin(raw: Buffer): Buffer {
  const norm = normalizeLf(raw);
  const marker = Buffer.from("begin;");
  const idx = norm.indexOf(marker);
  if (idx < 0) throw new Error(`begin; not found in ${pathHint(raw)}`);
  return norm.subarray(idx);
}

function pathHint(raw: Buffer): string {
  return raw.subarray(0, 40).toString("utf8").replace(/\s+/g, " ");
}

function sha256LfBodyFile(path: string): string {
  return createHash("sha256").update(bodyFromBegin(readFileSync(path))).digest("hex");
}

function parseHashEvidence(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    out[t.slice(0, eq)] = t.slice(eq + 1);
  }
  return out;
}

describe("GP migration hash portability (SHA256_LF_NORMALIZED_V1)", () => {
  it("script self-test passes and proves LF/CRLF/CR invariance", () => {
    const r = spawnSync("python", [SCRIPT, "--self-test"], {
      encoding: "utf8",
      cwd: root,
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`${HASH_CONTRACT} self-test PASS`);

    const fixture = Buffer.from("-- header\nbegin;\nselect 1;\n", "utf8");
    const crlf = Buffer.from(fixture.toString("utf8").replace(/\n/g, "\r\n"), "utf8");
    const cr = Buffer.from(fixture.toString("utf8").replace(/\n/g, "\r"), "utf8");
    expect(sha256LfBytes(fixture)).toBe(sha256LfBytes(crlf));
    expect(sha256LfBytes(fixture)).toBe(sha256LfBytes(cr));
    expect(createHash("sha256").update(fixture).digest("hex")).not.toBe(
      createHash("sha256").update(crlf).digest("hex"),
    );
  });

  it("L4 hash evidence reproduces and BODY hashes match", () => {
    const evidence = parseHashEvidence(readFileSync(HASHES, "utf8"));
    expect(evidence.HASH_CONTRACT).toBe(HASH_CONTRACT);
    expect(evidence.BODY_MATCH).toBe("true");

    const draftFull = sha256LfFile(DRAFT);
    const promotedFull = sha256LfFile(PROMOTED);
    const draftBody = sha256LfBodyFile(DRAFT);
    const promotedBody = sha256LfBodyFile(PROMOTED);

    expect(draftFull).toBe(evidence.DRAFT_FULL_SHA256_LF);
    expect(promotedFull).toBe(evidence.PROMOTED_FULL_SHA256_LF);
    expect(draftBody).toBe(evidence.DRAFT_BODY_SHA256_LF);
    expect(promotedBody).toBe(evidence.PROMOTED_BODY_SHA256_LF);
    expect(draftBody).toBe(promotedBody);

    // Deliberate checkout-invariance: same logical draft as CRLF still matches pin.
    const draftRaw = readFileSync(DRAFT);
    const asCrlf = Buffer.from(
      normalizeLf(draftRaw).toString("binary").replace(/\n/g, "\r\n"),
      "binary",
    );
    expect(sha256LfBytes(asCrlf)).toBe(evidence.DRAFT_FULL_SHA256_LF);
    expect(
      createHash("sha256").update(bodyFromBegin(asCrlf)).digest("hex"),
    ).toBe(evidence.DRAFT_BODY_SHA256_LF);
  });

  it("promoted L4 migration exists exactly once under supabase/migrations", () => {
    const hits = readdirSync(MIGRATIONS_DIR).filter((f) =>
      f.includes("gp_student_level4_only_eligibility_guard"),
    );
    expect(hits).toEqual([
      "20260808010000_gp_student_level4_only_eligibility_guard_01.sql",
    ]);
    expect(existsSync(PROMOTED)).toBe(true);
  });

  it("quarantine MANIFEST hashes reproduce and N↔U mappings hold", () => {
    const entries = JSON.parse(readFileSync(MANIFEST, "utf8")) as ManifestEntry[];
    expect(entries).toHaveLength(4);

    for (const e of entries) {
      expect(e.hash_contract).toBe(HASH_CONTRACT);
      expect(e.production_scenario).toBe("P1-U");
      expect(e.semantic_equivalence.startsWith("PASS")).toBe(true);
      expect(existsSync(join(root, e.new_evidence_path))).toBe(true);
      expect(existsSync(join(root, e.canonical_counterpart))).toBe(true);
      expect(sha256LfFile(join(root, e.new_evidence_path))).toBe(e.sha256_lf);
      expect(sha256LfFile(join(root, e.canonical_counterpart))).toBe(
        e.canonical_sha256_lf,
      );

      // CRLF encoding of the same evidence bytes still matches the pin.
      const raw = readFileSync(join(root, e.new_evidence_path));
      const asCrlf = Buffer.from(
        normalizeLf(raw).toString("binary").replace(/\n/g, "\r\n"),
        "binary",
      );
      expect(sha256LfBytes(asCrlf)).toBe(e.sha256_lf);
    }

    const evidenceBasenames = entries.map((e) =>
      e.new_evidence_path.split("/").pop(),
    );
    expect(evidenceBasenames.sort()).toEqual([...SET_N_BASENAMES].sort());
    const canonicalBasenames = entries.map((e) =>
      e.canonical_counterpart.split("/").pop(),
    );
    expect(canonicalBasenames.sort()).toEqual([...SET_U].sort());
  });

  it("SET N remains outside supabase/migrations (executable count zero)", () => {
    const migrations = readdirSync(MIGRATIONS_DIR);
    for (const name of SET_N_BASENAMES) {
      expect(migrations).not.toContain(name);
      expect(existsSync(join(EVIDENCE_DIR, name))).toBe(true);
    }
    expect(
      migrations.filter((f) => SET_N_BASENAMES.includes(f as (typeof SET_N_BASENAMES)[number])),
    ).toHaveLength(0);
  });

  it("SET U canonical files remain present exactly once each", () => {
    const migrations = readdirSync(MIGRATIONS_DIR);
    for (const name of SET_U) {
      expect(migrations.filter((f) => f === name)).toHaveLength(1);
      expect(existsSync(join(MIGRATIONS_DIR, name))).toBe(true);
    }
  });

  it("promoted migration header declares LF contract; body starts at begin;", () => {
    const text = readFileSync(PROMOTED, "utf8");
    const header = text.slice(0, text.indexOf("begin;"));
    expect(header).toContain("HASH_CONTRACT: SHA256_LF_NORMALIZED_V1");
    expect(header).toContain(
      "Source draft BODY SHA256_LF: 9e0422f84d7b5605a63c56b12be2428e97db1cf4fe44a48d0d6b894e2d1086c3",
    );
    expect(header).not.toContain("9d85fb4b6d7cd5b1ad4c19fb99d913d13b48fce6c83fcde7fca10340a934f1d6");
    expect(text.includes("begin;")).toBe(true);
  });
});
