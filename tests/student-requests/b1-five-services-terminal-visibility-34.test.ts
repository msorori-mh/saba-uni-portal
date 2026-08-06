/**
 * PORTAL-B1-FIVE-SERVICES-TERMINAL-VISIBILITY-MINIMAL-FIX-34
 *
 * Source contract: after ordered migration replay, the terminal writer of
 * student_visible for the five B1 services must leave them
 * student_visible=true (officially released terminal state).
 *
 * B1-34 remains the fail-closed hide migration. The authoritative completed
 * production release (`20260806005924_…` / "Released B1 five services") is the
 * subsequent terminal writer that re-exposes all five as active +
 * student_visible=true. enrollment_certificate stays active + visible and is
 * never mutated by these writers.
 *
 * Later migrations after the official release are allowed only when they do
 * not rewrite student_visible for any of the five codes.
 */
import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MIG_DIR = join(ROOT, "supabase/migrations");
const PREDECESSOR_HEAD = "20260801021541";
const FIX_PREFIX = "20260802070000_b1_34_five_services_terminal_visibility_false";
const RELEASE_PREFIX = "20260806005924";
const FIXTURE_15_REPAIR =
  "20260803030000_b1_44_restore_sr_20260801_13000015.sql";

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
  codes: string[];
};

function migrationFiles(): string[] {
  return readdirSync(MIG_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

function codesIn(sql: string): string[] {
  return FIVE.filter((code) => sql.includes(`'${code}'`));
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
    const codes = codesIn(m[0]);
    if (codes.length === 0) continue;
    out.push({
      file,
      polarity: m[1].toLowerCase() as Polarity,
      codes,
    });
  }

  // Seed upserts: ON CONFLICT … student_visible = true/false near five-code JSON.
  const upsertRe =
    /ON CONFLICT\s*\(\s*code\s*\)\s*DO UPDATE SET[\s\S]{0,400}?student_visible\s*=\s*(true|false)/gi;
  for (const m of normalized.matchAll(upsertRe)) {
    const window = normalized.slice(
      Math.max(0, (m.index ?? 0) - 4000),
      (m.index ?? 0) + 200,
    );
    const codes = codesIn(window);
    if (codes.length === 0) continue;
    out.push({
      file,
      polarity: m[1].toLowerCase() as Polarity,
      codes,
    });
  }

  return out;
}

function fixMigrationPath(): string {
  const match = migrationFiles().find((f) => f.startsWith(FIX_PREFIX));
  expect(match).toBeTruthy();
  return join(MIG_DIR, match!);
}

function releaseMigrationPath(): string {
  const match = migrationFiles().find((f) => f.startsWith(RELEASE_PREFIX));
  expect(match).toBeTruthy();
  return join(MIG_DIR, match!);
}

function stripSqlComments(sql: string): string {
  return sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("B1-34 five-services terminal visibility minimal fix", () => {
  it("adds exactly one forward-only migration after the previous source head", () => {
    const files = migrationFiles();
    const fix = files.find((f) => f.startsWith(FIX_PREFIX));
    expect(fix).toBeTruthy();
    expect(fix!.localeCompare(`${PREDECESSOR_HEAD}_`) > 0).toBe(true);
    expect(files.filter((f) => f.startsWith(FIX_PREFIX))).toHaveLength(1);
    // B1-34 need not remain the final migration filename; later repairs and
    // the official B1 five-services release follow it.
    expect(existsSync(fixMigrationPath())).toBe(true);
  });

  it("migration targets exactly the five codes and fail-closes on count/missing/duplicate", () => {
    const sql = readFileSync(fixMigrationPath(), "utf8");
    for (const code of FIVE) {
      expect(sql).toContain(`'${code}'`);
    }
    // Executable body must not reference the certificate code (comments may mention it).
    const executable = stripSqlComments(sql);
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
    expect(setClause).toMatch(
      /SET\s+student_visible\s*=\s*false\s*,\s*updated_at\s*=\s*now\(\)/i,
    );
    expect(setClause).not.toMatch(/\bname_ar\s*=/);
    expect(setClause).not.toMatch(/\bis_active\s*=/);
    expect(setClause).not.toMatch(/\bform_schema\s*=/);
  });

  it("keeps terminal polarity true for each of the five after ordered replay", () => {
    const files = migrationFiles();
    const writes: VisibilityWrite[] = [];
    for (const file of files) {
      const body = readFileSync(join(MIG_DIR, file), "utf8");
      writes.push(...visibilityWrites(file, body));
    }

    expect(writes.length).toBeGreaterThan(0);

    // Known true writers before B1-34, plus the official release terminal writer.
    const trueWriters = writes
      .filter((w) => w.polarity === "true")
      .map((w) => w.file);
    expect(trueWriters.some((f) => f.startsWith("20260727071910"))).toBe(true);
    expect(trueWriters.some((f) => f.startsWith("20260727114619"))).toBe(true);
    expect(trueWriters.some((f) => f.startsWith("20260727115111"))).toBe(true);
    expect(trueWriters.some((f) => f.startsWith(RELEASE_PREFIX))).toBe(true);

    // B1-34 remains present as the fail-closed hide step before release.
    const falseWriters = writes
      .filter((w) => w.polarity === "false")
      .map((w) => w.file);
    expect(falseWriters.some((f) => f.startsWith(FIX_PREFIX))).toBe(true);

    const fixIndex = files.findIndex((f) => f.startsWith(FIX_PREFIX));
    const releaseIndex = files.findIndex((f) => f.startsWith(RELEASE_PREFIX));
    expect(fixIndex).toBeGreaterThanOrEqual(0);
    expect(releaseIndex).toBeGreaterThan(fixIndex);

    // Per-code: final ordered writer of student_visible must leave it true
    // via the official release migration.
    for (const code of FIVE) {
      const codeWrites = writes.filter((w) => w.codes.includes(code));
      expect(codeWrites.length).toBeGreaterThan(0);
      const last = codeWrites[codeWrites.length - 1];
      expect(last.polarity).toBe("true");
      expect(last.file.startsWith(RELEASE_PREFIX)).toBe(true);
    }

    // Aggregate chain must also end true (released terminal state).
    const last = writes[writes.length - 1];
    expect(last.polarity).toBe("true");
    expect(last.file.startsWith(RELEASE_PREFIX)).toBe(true);

    // Migrations after the official release must not rewrite the five.
    for (const file of files.slice(releaseIndex + 1)) {
      const body = readFileSync(join(MIG_DIR, file), "utf8");
      expect(visibilityWrites(file, body)).toEqual([]);
    }
  });

  it("official release preserves enrollment_certificate active + visible", () => {
    const sql = readFileSync(releaseMigrationPath(), "utf8");
    const executable = stripSqlComments(sql);

    for (const code of FIVE) {
      expect(sql).toContain(`'${code}'`);
    }
    expect(sql).toMatch(
      /SET\s+student_visible\s*=\s*true\s*,\s*updated_at\s*=\s*now\(\)/i,
    );
    expect(sql).toContain("B1_RELEASE_PRECONDITION_MISMATCH");
    expect(sql).toContain("B1_RELEASE_UPDATE_COUNT_MISMATCH");
    expect(sql).toContain("B1_RELEASE_POST_HIDDEN");
    expect(sql).toContain("B1_RELEASE_EC_STATE_CHANGED");
    expect(sql).toContain("enrollment_certificate");
    // Release must require certificate remains active AND visible.
    expect(executable).toMatch(
      /\(is_active\s+AND\s+student_visible\).*enrollment_certificate|enrollment_certificate[\s\S]{0,120}\(is_active\s+AND\s+student_visible\)/i,
    );
    // Release must not UPDATE the certificate row.
    expect(executable).not.toMatch(
      /UPDATE\s+(?:public\.)?request_types[\s\S]{0,200}enrollment_certificate/i,
    );
  });

  it("Fixture-15 repair does not write request_types / student_visible / is_active", () => {
    const files = migrationFiles();
    expect(files).toContain(FIXTURE_15_REPAIR);
    const fixIndex = files.findIndex((f) => f.startsWith(FIX_PREFIX));
    const repairIndex = files.indexOf(FIXTURE_15_REPAIR);
    expect(repairIndex).toBeGreaterThan(fixIndex);

    const sql = readFileSync(join(MIG_DIR, FIXTURE_15_REPAIR), "utf8");
    const executable = stripSqlComments(sql);

    // No DML writers against request_types (SELECT/assert-only is fine).
    expect(executable).not.toMatch(
      /\b(UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+(?:public\.)?request_types\b/i,
    );
    // No assignment writers for student_visible / is_active.
    expect(executable).not.toMatch(/\bstudent_visible\s*=/i);
    expect(executable).not.toMatch(/\bis_active\s*=/i);

    // enrollment_certificate remains excluded from mutation.
    expect(executable).not.toMatch(
      /\b(UPDATE|INSERT|DELETE)\b[\s\S]{0,80}\benrollment_certificate/i,
    );

    // Must not be counted as a visibility writer for the five.
    expect(visibilityWrites(FIXTURE_15_REPAIR, sql)).toEqual([]);
  });
});
