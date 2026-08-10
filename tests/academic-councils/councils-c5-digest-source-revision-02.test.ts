/**
 * PORTAL-COUNCILS-C5-DIGEST-SEARCH-PATH-SOURCE-REVISION-LONGRUN-13
 * Dedicated PG17 C0→C5 Rev02 digest/search_path verifier.
 */

import { afterAll, describe, expect, it } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const root = process.cwd();

const V1 = "supabase/migrations/20260808150000_councils_c5_minutes_lifecycle_01.sql";
const V2 = "supabase/migrations/20260810180000_councils_c5_minutes_lifecycle_02.sql";
const V1_SHA = "85c5db5e273f529bac300a6f983098eea30add602ed7a51fbe4635addb353c25";
const V2_SHA = "0d945a6a886ea2b8be15de6dbd0b4a2a5f15b8bdf16e7b68a2ef2bb4644212e8";

const predecessors = [
  "tests/academic-councils/postgres-minimal-schema.sql",
  "supabase/migrations/20260703192337_3ef2f7b2-cf46-4407-9f1a-60c25b46c211.sql",
  "supabase/migrations/20260703194033_cccf45a9-50ed-4a72-bb11-7e5d1627b5a2.sql",
  "supabase/migrations/20260704200326_b0736829-500e-456c-aa9b-6dc7ccd10012.sql",
  "supabase/migrations/20260705232119_84b04a88-50be-4c5c-b9c3-11aeb54fa119.sql",
] as const;

const chainToC5 = [
  "supabase/migrations/20260808120000_councils_c0_write_surface_hardening_01.sql",
  "supabase/migrations/20260808121000_councils_c1_meeting_state_machine_01.sql",
  "supabase/migrations/20260808122000_councils_c2_topic_intake_review_01.sql",
  "supabase/migrations/20260808130000_councils_c3_attendance_quorum_01.sql",
  "supabase/migrations/20260808140000_councils_c4_session_voting_01.sql",
  V2,
] as const;

function sha256Lf(path: string): string {
  const raw = readFileSync(path);
  const out: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    const b = raw[i]!;
    if (b === 0x0d) {
      if (i + 1 < raw.length && raw[i + 1] === 0x0a) i++;
      out.push(0x0a);
    } else {
      out.push(b);
    }
  }
  return createHash("sha256").update(Buffer.from(out)).digest("hex");
}

function normalizeSemantic(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .replace(/\s+/g, " ")
    .trim();
}

const container = `councils-c5-rev02-${Date.now()}`;
const dockerReady = (() => {
  try {
    execSync("docker --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

function teardownContainer() {
  try {
    execSync(`docker rm -f ${container}`, { stdio: "ignore" });
  } catch {
    /* ignore */
  }
}

function psql(sql: string): { ok: boolean; out: string } {
  const res = spawnSync(
    "docker",
    ["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { input: sql, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 },
  );
  return { ok: res.status === 0, out: `${res.stdout || ""}\n${res.stderr || ""}` };
}

function psqlFile(filePath: string): { ok: boolean; out: string } {
  return psql(readFileSync(filePath, "utf8"));
}

async function waitReady(): Promise<boolean> {
  for (let i = 0; i < 60; i++) {
    const r = spawnSync("docker", ["exec", container, "pg_isready", "-U", "postgres"], {
      encoding: "utf8",
    });
    if (r.status === 0 && psql("select 1;").ok) return true;
    await Bun.sleep(500);
  }
  return false;
}

afterAll(() => {
  teardownContainer();
});

describe("C5 Rev02 digest search_path source revision", () => {
  it("freezes V1 and pins V2 with permitted semantic delta only", () => {
    expect(existsSync(join(root, V1))).toBe(true);
    expect(existsSync(join(root, V2))).toBe(true);
    expect(sha256Lf(join(root, V1))).toBe(V1_SHA);
    expect(sha256Lf(join(root, V2))).toBe(V2_SHA);

    const v1 = readFileSync(join(root, V1), "utf8");
    const v2 = readFileSync(join(root, V2), "utf8");
    expect(v1).toContain("encode(digest(");
    expect(v1).not.toContain("extensions.digest(");
    expect(v2).toContain("encode(extensions.digest(");
    expect(v2).toContain("to_regprocedure('extensions.digest(text,text)')");
    expect(v2).toContain("SET search_path = public, pg_temp");
    expect(v2).not.toMatch(/SET search_path = public,\s*extensions/i);
    expect(v2).not.toMatch(/^\s*CREATE\s+EXTENSION\b/im);
    expect(v2).toContain("CREATE EXTENSION is forbidden");

    const v1n = normalizeSemantic(v1).replace(
      "encode(digest(p_meeting_id::text",
      "encode(extensions.digest(p_meeting_id::text",
    );
    const prereq =
      "IF to_regprocedure('extensions.digest(text,text)') IS NULL THEN RAISE EXCEPTION 'C5 minutes lifecycle requires extensions.digest(text,text); CREATE EXTENSION is forbidden in this migration'; END IF; ";
    const v2n = normalizeSemantic(v2).replace(prereq, "");
    expect(v1n).toBe(v2n);

    const plan = readFileSync(
      join(root, "docs/production-preflight/COUNCILS-C0-C9-APPLY-ONE-OPERATOR-PLAN-01.md"),
      "utf8",
    );
    expect(plan).toContain("SUPERSEDED_DO_NOT_APPLY");
    expect(plan).toContain("CANONICAL_APPLY_CANDIDATE");
    expect(plan).toContain(V2);
  });

  it("PG17: defect repro + C0→C5 Rev02 + lock fingerprint + auth negatives", async () => {
    if (!dockerReady) {
      throw new Error("docker is required for the PG17 disposable harness");
    }

    teardownContainer();
    execSync(
      `docker run -d --name ${container} -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17`,
      { stdio: "ignore" },
    );
    expect(await waitReady()).toBe(true);
    await Bun.sleep(1000);
    expect(await waitReady()).toBe(true);

    for (const pred of predecessors) {
      const r = psqlFile(join(root, pred));
      if (!r.ok) throw new Error(`predecessor ${pred} failed:\n${r.out}`);
    }
    for (const step of chainToC5) {
      const r = psqlFile(join(root, step));
      if (!r.ok) throw new Error(`apply ${step} failed:\n${r.out}`);
    }

    const post = psqlFile(
      join(root, "docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C5.sql"),
    );
    if (!post.ok) throw new Error(`C5 post-verifier failed:\n${post.out}`);
    expect(post.out).toContain("COUNCILS_C5_PRODUCTION_POST_VERIFIER_PASS");

    const behavioral = psqlFile(
      join(root, "tests/academic-councils/postgres-c5-rev02-digest-verifier.sql"),
    );
    if (!behavioral.ok) throw new Error(`C5 Rev02 behavioral verifier failed:\n${behavioral.out}`);
    expect(behavioral.out).toContain("C5_REV02_DEFECT_REPRODUCED_42883");
    expect(behavioral.out).toContain("C5_REV02_QUALIFIED_DIGEST_OK");
    expect(behavioral.out).toContain("C5_REV02_AUTHORIZATION_MATRIX_PASS");
    expect(behavioral.out).toContain("C5_REV02_LOCK_FINGERPRINT_PASS");
    expect(behavioral.out).toContain("C5_REV02_LOCK_IMMUTABILITY_PASS");
    expect(behavioral.out).toContain("COUNCILS_C5_REV02_DIGEST_VERIFIER_PASS");
  }, 600_000);
});
