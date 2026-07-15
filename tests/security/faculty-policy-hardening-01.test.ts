import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
const queriesSrc = readFileSync(join(root, "src/lib/queries.ts"), "utf8");

const migrationsDir = join(root, "supabase/migrations");
const migrationFile = readdirSync(migrationsDir)
  .filter((f) => f.includes("faculty_public_safe_rpc") || f.includes("faculty-public-safe-rpc") || f.includes("policy_hardening"))
  .sort()
  .pop() ??
  readdirSync(migrationsDir)
    .filter((f) => {
      const p = join(migrationsDir, f);
      try {
        const c = readFileSync(p, "utf8");
        return c.includes("get_public_faculty_directory") && c.includes("get_public_faculty_count");
      } catch { return false; }
    })
    .sort()
    .pop();

if (!migrationFile) throw new Error("faculty hardening migration not found");
const migration = readFileSync(join(migrationsDir, migrationFile), "utf8");

describe("faculty policy hardening — client queries", () => {
  const facultyBlockStart = queriesSrc.indexOf("facultyQuery");
  const facultyBlock = queriesSrc.slice(facultyBlockStart, facultyBlockStart + 600);
  const liveCountsStart = queriesSrc.indexOf("liveCountsQuery");
  const liveCountsBlock = queriesSrc.slice(liveCountsStart, liveCountsStart + 800);

  it("facultyQuery uses safe RPC, not direct faculty table read", () => {
    expect(facultyBlock).not.toMatch(/from\(["']faculty["']\)/);
    expect(facultyBlock).toContain('rpc("get_public_faculty_directory")');
  });

  it("liveCountsQuery uses count RPC, not direct faculty table read", () => {
    expect(liveCountsBlock).not.toMatch(/from\(["']faculty["']\)/);
    expect(liveCountsBlock).toContain('rpc("get_public_faculty_count")');
  });
});

describe("faculty policy hardening — migration", () => {
  it("creates both RPCs with SECURITY DEFINER and fixed search_path", () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.get_public_faculty_directory/);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.get_public_faculty_count/);
    expect(migration).toMatch(/SECURITY DEFINER/);
    expect(migration).toMatch(/SET search_path = public, pg_temp/);
  });

  it("does not expose sensitive columns in RPC return type or body", () => {
    // Strip comments then check body/return type.
    const stripped = migration.replace(/COMMENT ON [^;]+;/g, "");
    const bodyStart = stripped.indexOf("CREATE OR REPLACE FUNCTION public.get_public_faculty_directory");
    const bodyEnd = stripped.indexOf("REVOKE ALL ON FUNCTION");
    const body = stripped.slice(bodyStart, bodyEnd);
    expect(body).not.toMatch(/\bemail\b/i);
    expect(body).not.toMatch(/\bphone\b/i);
    expect(body).not.toMatch(/created_at|updated_at/);
  });

  it("does not use SELECT *", () => {
    expect(migration).not.toMatch(/SELECT\s+\*/i);
  });

  it("revokes EXECUTE from PUBLIC and grants only to anon+authenticated", () => {
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.get_public_faculty_directory\(\) FROM PUBLIC/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.get_public_faculty_count\(\) FROM PUBLIC/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_public_faculty_directory\(\) TO anon, authenticated/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_public_faculty_count\(\) TO anon, authenticated/);
  });

  it("drops the public faculty SELECT policy and revokes direct SELECT", () => {
    expect(migration).toMatch(/DROP POLICY IF EXISTS "Public can view active faculty" ON public\.faculty/);
    expect(migration).toMatch(/REVOKE SELECT ON TABLE public\.faculty FROM (PUBLIC|anon, authenticated)/);
  });

  it("does not touch admin policies", () => {
    expect(migration).not.toMatch(/DROP POLICY IF EXISTS "Admins can/);
    expect(migration).not.toMatch(/CREATE POLICY "Admins can/);
  });
});
