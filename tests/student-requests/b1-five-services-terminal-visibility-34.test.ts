/**
 * PORTAL-B1-FIVE-SERVICES-TERMINAL-VISIBILITY-MINIMAL-FIX-34
 *
 * Source contract: after ordered migration replay, the terminal writer of
 * student_visible for the five B1 services must leave them hidden (false).
 * A future migration that terminally re-exposes any of the five must fail here.
 */
import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MIG_DIR = join(ROOT, "supabase/migrations");
const PREDECESSOR_HEAD = "20260801021541";
const FIX_PREFIX = "20260802070000_b1_34_five_services_terminal_visibility_false";

const FIVE = [
  "enrollment_suspension",
  "excused_absence",
  "department_transfer",
  "final_chance",
  "file_withdrawal",
] as const;

type Polarity = "true" | "false";

type VisibilityWrite = {
  file: string;
  polarity: Polarity;
};

function migrationFiles(): string[] {
  return readdirSync(MIG_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

function mentionsFive(sql: string): boolean {
  return FIVE.some((code) => sql.includes(`'${code}'`));
}

/**
 * Detect UPDATE DML that assigns student_visible on request_types and mentions
 * at least one of the five codes in the statement window (SET + WHERE).
 * Seed INSERT/UPSERT writers that mention the five codes are also counted when
 * they assign student_visible via ON CONFLICT DO UPDATE.
 */
function visibilityWrites(file: string, body: string): VisibilityWrite[] {
  const out: VisibilityWrite[] = [];
  const normalized = body.replace(/\r\n/g, "\n");

  const updateRe =
    /UPDATE\s+(?:public\.)?request_types(?:\s+AS\s+\w+)?[\s\S]{0,400}?SET\s+[\s\S]{0,300}?student_visible\s*=\s*(true|false)[\s\S]{0,800}?;/gi;
  for (const m of normalized.matchAll(updateRe)) {
    if (!mentionsFive(m[0])) continue;
    out.push({ file, polarity: m[1].toLowerCase() as Polarity });
  }

  // Seed upserts: ON CONFLICT … student_visible = true/false near five-code JSON.
  const upsertRe =
    /ON CONFLICT\s*\(\s*code\s*\)\s*DO UPDATE SET[\s\S]{0,400}?student_visible\s*=\s*(true|false)/gi;
  for (const m of normalized.matchAll(upsertRe)) {
    const window = normalized.slice(Math.max(0, (m.index ?? 0) - 4000), (m.index ?? 0) + 200);
    if (!mentionsFive(window)) continue;
    out.push({ file, polarity: m[1].toLowerCase() as Polarity });
  }

  return out;
}

function fixMigrationPath(): string {
  const match = migrationFiles().find((f) => f.startsWith(FIX_PREFIX));
  expect(match).toBeTruthy();
  return join(MIG_DIR, match!);
}

describe("B1-34 five-services terminal visibility minimal fix", () => {
  it("adds exactly one forward-only migration after the previous source head", () => {
    const files = migrationFiles();
    const fix = files.find((f) => f.startsWith(FIX_PREFIX));
    expect(fix).toBeTruthy();
    expect(fix!.localeCompare(`${PREDECESSOR_HEAD}_`) > 0).toBe(true);
    expect(files.filter((f) => f.startsWith(FIX_PREFIX))).toHaveLength(1);
    expect(files[files.length - 1].startsWith(FIX_PREFIX)).toBe(true);
    expect(existsSync(fixMigrationPath())).toBe(true);
  });

  it("migration targets exactly the five codes and fail-closes on count/missing/duplicate", () => {
    const sql = readFileSync(fixMigrationPath(), "utf8");
    for (const code of FIVE) {
      expect(sql).toContain(`'${code}'`);
    }
    // Executable body must not reference the certificate code (comments may mention it).
    const executable = sql
      .replace(/--.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    expect(executable).not.toContain("enrollment_certificate");
    expect(sql).toMatch(/student_visible\s*=\s*false/);
    expect(sql).toMatch(/updated_at\s*=\s*now\(\)/i);
    expect(sql).toContain("B1_34_TARGET_COUNT_MISMATCH");
    expect(sql).toContain("B1_34_MISSING_TARGET_CODE");
    expect(sql).toContain("B1_34_DUPLICATE_TARGET_CODE");
    expect(sql).toContain("B1_34_UPDATE_COUNT_MISMATCH");
    expect(sql).toContain("B1_34_POSTCHECK_VISIBLE_REMAINS");
    expect(sql).toMatch(/expected_rows=5|expected=5/);
    expect(executable).not.toMatch(/EXCEPTION\s+WHEN/i);
    expect(executable).not.toMatch(/\bis_active\s*=/);
    expect(executable).not.toMatch(/Gate25|gate_25/i);
  });

  it("sets only student_visible and updated_at (no other column assignments)", () => {
    const sql = readFileSync(fixMigrationPath(), "utf8");
    const update = sql.match(
      /UPDATE\s+public\.request_types[\s\S]*?WHERE[\s\S]*?;/i,
    );
    expect(update).toBeTruthy();
    const setClause = update![0];
    expect(setClause).toMatch(/SET\s+student_visible\s*=\s*false\s*,\s*updated_at\s*=\s*now\(\)/i);
    expect(setClause).not.toMatch(/\bname_ar\s*=/);
    expect(setClause).not.toMatch(/\bis_active\s*=/);
    expect(setClause).not.toMatch(/\bform_schema\s*=/);
  });

  it("documents the terminal true writers and ends the ordered chain at false", () => {
    const files = migrationFiles();
    const writes: VisibilityWrite[] = [];
    for (const file of files) {
      const body = readFileSync(join(MIG_DIR, file), "utf8");
      writes.push(...visibilityWrites(file, body));
    }

    expect(writes.length).toBeGreaterThan(0);

    // Known terminal-true writers before the fix (ordered).
    const trueWriters = writes.filter((w) => w.polarity === "true").map((w) => w.file);
    expect(trueWriters.some((f) => f.startsWith("20260727071910"))).toBe(true);
    expect(trueWriters.some((f) => f.startsWith("20260727114619"))).toBe(true);
    expect(trueWriters.some((f) => f.startsWith("20260727115111"))).toBe(true);

    const last = writes[writes.length - 1];
    expect(last.polarity).toBe("false");
    expect(last.file.startsWith(FIX_PREFIX)).toBe(true);

    // No migration after the fix may terminally re-expose the five.
    const fixIndex = files.findIndex((f) => f.startsWith(FIX_PREFIX));
    for (const file of files.slice(fixIndex + 1)) {
      const body = readFileSync(join(MIG_DIR, file), "utf8");
      const later = visibilityWrites(file, body).filter((w) => w.polarity === "true");
      expect(later).toEqual([]);
    }
  });
});
