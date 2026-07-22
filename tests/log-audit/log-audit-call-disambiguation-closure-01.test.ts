/**
 * LOG-AUDIT-CALL-DISAMBIGUATION-CLOSURE-01 — static guards.
 *
 * Scans supabase/migrations/** and docs/migration-drafts/** for log_audit
 * call sites and definitions, and guards the closure draft:
 *   1. the closure draft exists and contains its required clauses
 *      (preflight guards for both overload signatures + audit_logs shape,
 *      DROP of the legacy 6-arg overload, REVOKE PUBLIC/anon/authenticated,
 *      GRANT service_role) and never re-creates any overload;
 *   2. no file under docs/migration-drafts/** re-creates ANY log_audit
 *      overload (in particular not the legacy 6-arg one);
 *   3. no uncast 3-6-arg log_audit call exists in docs/migration-drafts/**
 *      (against the canonical-only end state these draft redefinitions must
 *      follow the fully-cast 7-arg contract);
 *   4. every uncast 3-6-arg call in supabase/migrations/** lives in the
 *      known-legacy allowlist (a NEW such call outside the allowlist fails
 *      this test) — these are the live 42725 hotspots the closure draft
 *      remediates at the database level;
 *   5. log_audit definitions in supabase/migrations/** exist only in the
 *      three known definition migrations.
 */

import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

const ROOT = process.cwd();
const DRAFT_REL =
  "docs/migration-drafts/LOG-AUDIT-CALL-DISAMBIGUATION-CLOSURE-01.sql";

/** Files (per recon at main 45148e09) allowed to contain uncast 3-6-arg calls. */
const KNOWN_LEGACY_FLAGGED_FILES = new Set([
  "20260601013349_41b22c03-d622-444a-84b0-d2996d023e7b.sql",
  "20260601032017_c7a67189-eca5-4169-943e-c1bd660121a7.sql",
  "20260601034915_43f17a05-77c1-403b-9f1a-eaf8f17fc21f.sql",
  "20260602165703_ec81e9c4-7823-45a5-a415-3c37442c98dc.sql",
  "20260611214143_7a655bbe-00fd-4f8b-9a60-8dd3a9cad97e.sql",
  "20260615210858_452ec2a0-9b6a-4a65-85c7-066e8e7014a7.sql",
  "20260615230455_7ae84651-78ec-49e9-8ad4-9a897b6d1237.sql",
  "20260615233203_b6f6d391-b29d-49db-9c36-4d238f5c8dda.sql",
  "20260622004034_478f7cc5-53dd-46c7-bf92-c918d5b59bce.sql",
  "20260628120000_official_transcript_readiness_guard.sql",
  "20260710180000_student_request_actor_rpc_rls.sql",
  "20260713100000_enrollment_certificate_post_zero_fee_execution_contract_remediation_01.sql",
  "20260713210000_enrollment_certificate_document_issuance_and_archive_contract_01.sql",
  "20260714234724_a38255eb-b41f-4410-b8dd-740b3f6132dc.sql",
]);

const SIX_ARG_DEF_FILES = new Set([
  "20260601013349_41b22c03-d622-444a-84b0-d2996d023e7b.sql",
]);
const SEVEN_ARG_DEF_FILES = new Set([
  "20260621022558_496f7dcd-6e27-42c0-9bea-c858f9e3c1c0.sql",
  "20260624140000_student_requests_workflow_foundation.sql",
]);

type SiteKind = "call" | "definition" | "reference";
interface Site {
  file: string;
  kind: SiteKind;
  argCount: number;
  allArgsCasted: boolean;
  snippet: string;
}

function listSql(relDir: string): string[] {
  const abs = join(ROOT, relDir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => join(relDir, f));
}

/**
 * Removes line comments, block comments and single-quoted string literals
 * (replaced by '') so that signature strings such as
 * 'public.log_audit(text,uuid,...)' inside to_regprocedure(...) cannot be
 * mistaken for call sites. Dollar-quoted bodies are intentionally kept:
 * they carry the plpgsql source we must scan.
 */
function sanitize(sql: string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const two = sql.slice(i, i + 2);
    if (two === "--") {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? sql.length : nl + 1;
      out += "\n";
      continue;
    }
    if (two === "/*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }
    if (sql[i] === "'") {
      out += "''";
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    out += sql[i];
    i += 1;
  }
  return out;
}

/** Splits a top-level comma-separated argument list. */
function splitTopLevel(args: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of args) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim().length > 0 || parts.length > 0) parts.push(cur);
  return parts.filter((p) => p.trim().length > 0);
}

function classifyLookback(before: string): SiteKind {
  // ACL / DDL references to the function signature (never calls):
  //   ... ON FUNCTION public.log_audit(...
  //   COMMENT ON FUNCTION public.log_audit(...
  //   DROP FUNCTION [IF EXISTS] public.log_audit(...
  if (
    /on\s+function\s+public\s*\.\s*$/i.test(before) ||
    /comment\s+on\s+function\s+public\s*\.\s*$/i.test(before) ||
    /drop\s+function\s+(if\s+exists\s+)?public\s*\.\s*$/i.test(before)
  ) {
    return "reference";
  }
  // CREATE [OR REPLACE] FUNCTION public.log_audit(...
  if (/function\s+public\s*\.\s*$/i.test(before)) return "definition";
  return "call";
}

function extractSites(relFile: string, raw: string): Site[] {
  const sql = sanitize(raw);
  const sites: Site[] = [];
  const re = /\blog_audit\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const openIdx = m.index + m[0].lastIndexOf("(");
    // balanced-paren extraction
    let depth = 0;
    let closeIdx = -1;
    for (let i = openIdx; i < sql.length; i++) {
      if (sql[i] === "(") depth += 1;
      if (sql[i] === ")") {
        depth -= 1;
        if (depth === 0) {
          closeIdx = i;
          break;
        }
      }
    }
    if (closeIdx === -1) continue; // unbalanced -> ignore (should not happen in valid SQL)
    const inner = sql.slice(openIdx + 1, closeIdx);
    const args = splitTopLevel(inner);
    const before = sql.slice(Math.max(0, m.index - 80), m.index);
    const kind = classifyLookback(before);
    sites.push({
      file: relFile,
      kind,
      argCount: args.length,
      allArgsCasted: args.length > 0 && args.every((a) => a.includes("::")),
      snippet: sql.slice(m.index, Math.min(closeIdx + 1, m.index + 120)),
    });
  }
  return sites;
}

function scanDir(relDir: string): Site[] {
  return listSql(relDir).flatMap((f) =>
    extractSites(f, readFileSync(join(ROOT, f), "utf8")),
  );
}

const isFlagged = (s: Site) =>
  s.kind === "call" && s.argCount >= 3 && s.argCount <= 6 && !s.allArgsCasted;

describe("LOG-AUDIT-CALL-DISAMBIGUATION-CLOSURE-01 draft", () => {
  const draftPath = join(ROOT, DRAFT_REL);

  it("exists and is marked source-only / not applied", () => {
    expect(existsSync(draftPath)).toBe(true);
    const sql = readFileSync(draftPath, "utf8");
    expect(sql).toContain("DRAFT ONLY — NOT APPLIED");
    expect(sql).toContain("LOG-AUDIT-CALL-DISAMBIGUATION-CLOSURE-01");
  });

  it("contains preflight guards for both overload signatures and audit_logs shape", () => {
    const sql = readFileSync(draftPath, "utf8");
    expect(sql).toContain(
      "to_regprocedure('public.log_audit(text,uuid,text,jsonb,jsonb,text)')",
    );
    expect(sql).toContain(
      "to_regprocedure('public.log_audit(text,uuid,text,jsonb,jsonb,text,uuid)')",
    );
    expect(sql).toContain("LOGAUDIT_CLOSURE_01_SEVEN_ARG_MISSING");
    expect(sql).toContain("LOGAUDIT_CLOSURE_01_UNEXPECTED_OVERLOAD_COUNT_");
    expect(sql).toContain("LOGAUDIT_CLOSURE_01_AUDIT_LOGS_SHAPE_MISMATCH");
  });

  it("drops the legacy 6-arg overload with an explicit qualified signature", () => {
    const sql = readFileSync(draftPath, "utf8");
    expect(sql).toContain(
      "DROP FUNCTION IF EXISTS public.log_audit(text, uuid, text, jsonb, jsonb, text);",
    );
  });

  it("aligns grants to server-only without any new client EXECUTE", () => {
    const sql = readFileSync(draftPath, "utf8");
    expect(sql).toContain(
      "REVOKE EXECUTE ON FUNCTION public.log_audit(text, uuid, text, jsonb, jsonb, text, uuid) FROM PUBLIC, anon, authenticated;",
    );
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.log_audit(text, uuid, text, jsonb, jsonb, text, uuid) TO service_role;",
    );
    // never grants EXECUTE to a client role
    expect(sql).not.toMatch(
      /GRANT\s+EXECUTE[^;]*log_audit[^;]*TO\s+(PUBLIC|anon|authenticated)\b/i,
    );
  });

  it("never (re-)creates any log_audit overload", () => {
    const sql = sanitize(readFileSync(draftPath, "utf8"));
    expect(sql).not.toMatch(
      /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\s*\.\s*log_audit/i,
    );
  });

  it("documents its relationship to REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01", () => {
    const sql = readFileSync(draftPath, "utf8");
    expect(sql).toContain("REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01");
    expect(sql).toMatch(/SUPERSEDES\/EXTENDS/i);
  });
});

describe("log_audit call sites vs canonical-only end state", () => {
  const migrationSites = scanDir("supabase/migrations");
  const draftSites = scanDir("docs/migration-drafts");

  it("no migration draft re-creates ANY log_audit overload (6-arg or otherwise)", () => {
    const defs = draftSites.filter((s) => s.kind === "definition");
    expect(defs.map((d) => `${d.file}: ${d.snippet}`)).toEqual([]);
  });

  it("no uncast 3-6-arg log_audit call exists in migration drafts", () => {
    const flagged = draftSites.filter(isFlagged);
    expect(flagged.map((s) => `${s.file}: ${s.snippet}`)).toEqual([]);
  });

  it("uncast 3-6-arg calls in applied migrations are confined to the known-legacy allowlist", () => {
    const flaggedByFile = new Map<string, number>();
    for (const s of migrationSites.filter(isFlagged)) {
      const f = basename(s.file);
      flaggedByFile.set(f, (flaggedByFile.get(f) ?? 0) + 1);
    }
    const outsideAllowlist = [...flaggedByFile.keys()].filter(
      (f) => !KNOWN_LEGACY_FLAGGED_FILES.has(f),
    );
    expect(outsideAllowlist).toEqual([]);
  });

  it("every known-legacy file present on disk is actually detected as flagged (scanner sanity)", () => {
    const present = listSql("supabase/migrations").map((f) => basename(f));
    const flaggedFiles = new Set(
      migrationSites.filter(isFlagged).map((s) => basename(s.file)),
    );
    const shouldBeFlagged = present.filter(
      (f) =>
        KNOWN_LEGACY_FLAGGED_FILES.has(f) &&
        // files whose only legacy call sites were later superseded still
        // contain those call texts in the migration source -> still flagged
        true,
    );
    for (const f of shouldBeFlagged) {
      expect(flaggedFiles.has(f)).toBe(true);
    }
  });

  it("finds a non-trivial number of legacy ambiguous calls (scanner is not vacuous)", () => {
    const flagged = migrationSites.filter(isFlagged);
    expect(flagged.length).toBeGreaterThanOrEqual(20);
  });

  it("log_audit definitions exist only in the known definition migrations", () => {
    const defs = migrationSites.filter((s) => s.kind === "definition");
    const sixArgDefFiles = defs
      .filter((d) => d.argCount === 6)
      .map((d) => basename(d.file));
    const sevenArgDefFiles = defs
      .filter((d) => d.argCount === 7)
      .map((d) => basename(d.file));
    for (const f of sixArgDefFiles) expect(SIX_ARG_DEF_FILES.has(f)).toBe(true);
    for (const f of sevenArgDefFiles)
      expect(SEVEN_ARG_DEF_FILES.has(f)).toBe(true);
    expect(defs.some((d) => d.argCount !== 6 && d.argCount !== 7)).toBe(false);
    // sanity: both overload definitions are observed in the tree
    expect(sixArgDefFiles.length).toBeGreaterThanOrEqual(1);
    expect(sevenArgDefFiles.length).toBeGreaterThanOrEqual(1);
  });
});
