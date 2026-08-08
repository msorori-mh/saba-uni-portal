/**
 * PORTAL-GA-CANONICAL-RELEASE-CONTRACT-AND-OWNER-GATE-LONGRUN-15
 *
 * Pins SHA256_LF_NORMALIZED_V1 FULL vs BODY distinction for the three
 * promoted GA migrations and proves semantic-core equivalence to #291 drafts.
 * Never compares FULL_FILE hashes to BODY hashes.
 */
import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const HASH_CONTRACT = "SHA256_LF_NORMALIZED_V1";
const MANIFEST = join(
  root,
  "docs/migration-evidence/graduates-affairs/GA_RELEASE_HASH_MANIFEST.txt",
);
const SCRIPT = join(root, "scripts/sha256_lf_normalized_v1.py");

const MIGRATIONS = [
  {
    key: "FOUNDATION",
    draft: "docs/migration-drafts/GRADUATES-AFFAIRS-MVP-FOUNDATION-01.sql",
    promoted: "supabase/migrations/20260808210000_ga_mvp_foundation_01.sql",
    lockNeedle: null as string | null,
  },
  {
    key: "COMPLETION",
    draft: "docs/migration-drafts/GRADUATES-AFFAIRS-MVP-COMPLETION-01.sql",
    promoted: "supabase/migrations/20260808210100_ga_mvp_completion_01.sql",
    lockNeedle: null as string | null,
  },
  {
    key: "AUTH04",
    draft: "docs/migration-drafts/GRADUATES-AFFAIRS-AUTHORIZATION-04.sql",
    promoted: "supabase/migrations/20260808210200_ga_authorization_04.sql",
    lockNeedle: "graduate_affairs_lock_authorized_staff_profile_id",
  },
] as const;

function normalizeLf(raw: Buffer): Buffer {
  const s = raw.toString("binary").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return Buffer.from(s, "binary");
}

function sha256LfBytes(raw: Buffer): string {
  return createHash("sha256").update(normalizeLf(raw)).digest("hex");
}

function bodyFromBegin(raw: Buffer): Buffer {
  const norm = normalizeLf(raw);
  const idx = norm.indexOf(Buffer.from("begin;"));
  if (idx < 0) throw new Error("begin; not found");
  return norm.subarray(idx);
}

function semanticCore(raw: Buffer): Buffer {
  const norm = normalizeLf(raw);
  const text = norm.toString("binary");
  const patterns = [
    "CREATE TYPE ",
    "CREATE OR REPLACE FUNCTION ",
    "CREATE TABLE ",
    "CREATE FUNCTION ",
  ];
  let best = -1;
  for (const p of patterns) {
    const i = text.indexOf(p);
    if (i >= 0 && (best < 0 || i < best)) best = i;
  }
  if (best < 0) throw new Error("no CREATE marker for semantic core");
  let core = norm.subarray(best);
  const suffixes = ["\ncommit;\n", "\nCOMMIT;\n", "\ncommit;", "\nCOMMIT;"];
  for (const s of suffixes) {
    const b = Buffer.from(s, "binary");
    if (core.subarray(core.length - b.length).equals(b)) {
      core = core.subarray(0, core.length - b.length);
      break;
    }
  }
  return core;
}

function parseManifest(text: string): Record<string, string> {
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

describe("GA release hash contract (SHA256_LF_NORMALIZED_V1)", () => {
  const evidence = parseManifest(readFileSync(MANIFEST, "utf8"));

  it("script self-test passes", () => {
    const r = spawnSync("python", [SCRIPT, "--self-test"], {
      encoding: "utf8",
      cwd: root,
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`${HASH_CONTRACT} self-test PASS`);
  });

  it("closes the FULL-vs-BODY terminology exception", () => {
    expect(evidence.HASH_EXCEPTION_STATUS).toBe("CLOSED");
    expect(evidence.AUTH04_FULL_FILE_SHA256_LF).toBe(
      "212865fb7c4077ce313a9b4707700520be275360b54470fd62fc08edd539060c",
    );
    expect(evidence.AUTH04_BODY_SHA256_LF).toBe(
      "3a85f54dbe5bcf249349d16cdcef5a921e4d8be28a5099965691e65ce4c3dffd",
    );
    expect(evidence.AUTH04_FULL_FILE_SHA256_LF).not.toBe(
      evidence.AUTH04_BODY_SHA256_LF,
    );
  });

  for (const m of MIGRATIONS) {
    it(`${m.key}: pins FULL, BODY, source body, and semantic equivalence`, () => {
      const draftRaw = readFileSync(join(root, m.draft));
      const promotedRaw = readFileSync(join(root, m.promoted));

      const promotedFull = sha256LfBytes(promotedRaw);
      const promotedBody = createHash("sha256")
        .update(bodyFromBegin(promotedRaw))
        .digest("hex");
      const draftBody = createHash("sha256")
        .update(semanticCore(draftRaw))
        .digest("hex");
      const promotedCore = createHash("sha256")
        .update(semanticCore(promotedRaw))
        .digest("hex");

      expect(promotedFull).toBe(evidence[`${m.key}_FULL_FILE_SHA256_LF`]);
      expect(promotedBody).toBe(evidence[`${m.key}_BODY_SHA256_LF`]);
      expect(draftBody).toBe(evidence[`${m.key}_SOURCE_DRAFT_BODY_SHA256_LF`]);
      expect(promotedCore).toBe(
        evidence[`${m.key}_PROMOTED_SEMANTIC_CORE_SHA256_LF`],
      );
      expect(draftBody).toBe(promotedCore);
      expect(evidence[`${m.key}_SEMANTIC_EQUIVALENCE`]).toBe("EQUIVALENT");

      // FULL must never equal BODY for these promoted wrappers (header + begin).
      expect(promotedFull).not.toBe(promotedBody);

      if (m.lockNeedle) {
        expect(normalizeLf(draftRaw).toString("utf8")).toContain(m.lockNeedle);
        expect(normalizeLf(promotedRaw).toString("utf8")).toContain(
          m.lockNeedle,
        );
        expect(normalizeLf(promotedRaw).toString("utf8")).toContain(
          "FOR SHARE",
        );
      }
    });
  }

  it("script --body matches pinned AUTH04 BODY", () => {
    const r = spawnSync(
      "python",
      [SCRIPT, join(root, MIGRATIONS[2].promoted), "--body"],
      { encoding: "utf8", cwd: root },
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(
      `BODY_SHA256_LF=${evidence.AUTH04_BODY_SHA256_LF}`,
    );
  });
});
