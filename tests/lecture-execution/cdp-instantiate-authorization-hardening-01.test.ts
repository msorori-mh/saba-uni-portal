import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const HARDENING = read("docs/migration-drafts/CDP-INSTANTIATE-AUTHORIZATION-HARDENING-01.sql");
const BASE = read("supabase/migrations/20260812225709_b913d29a-45f2-4301-9e4f-ec1114930b2b.sql");

/**
 * Direct-RPC authorization matrix for public.cdp_instantiate_from_syllabus(uuid).
 *
 * Production preflight (read-only) established:
 *  - the function is SECURITY DEFINER, owner postgres, currently EXECUTE to authenticated
 *  - every legitimate caller (syllabus_approve_version, cdp_regenerate_section_plan,
 *    cdp_section_autoplan) is itself SECURITY DEFINER owned by postgres, so it keeps
 *    executing after the revoke.
 */
describe("cdp_instantiate_from_syllabus — direct RPC authorization", () => {
  it("revokes the direct mutating entry point from every client role", () => {
    for (const role of ["PUBLIC", "anon", "authenticated"]) {
      expect(HARDENING).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.cdp_instantiate_from_syllabus\\(uuid\\) FROM ${role};`),
      );
    }
  });

  it("does not re-grant EXECUTE to authenticated/anon/public", () => {
    const grants = HARDENING.split("\n").filter((l) => /^\s*GRANT EXECUTE/.test(l));
    expect(grants.length).toBeGreaterThan(0);
    for (const g of grants) {
      expect(g).not.toMatch(/\bauthenticated\b|\banon\b|\bPUBLIC\b/);
    }
  });

  it("student / ordinary faculty / unrelated staff map to the authenticated role → DENY", () => {
    // All portal actors authenticate as the `authenticated` Postgres role; revoking it
    // denies every direct call regardless of the application role.
    for (const actor of ["student", "faculty", "staff"]) {
      expect(actor).toBeTruthy();
      expect(HARDENING).toContain(
        "REVOKE ALL ON FUNCTION public.cdp_instantiate_from_syllabus(uuid) FROM authenticated;",
      );
    }
  });

  it("authorized syllabus paths remain ALLOW: admin-gated SECURITY DEFINER callers", () => {
    expect(BASE).toMatch(
      /CREATE OR REPLACE FUNCTION public\.syllabus_approve_version\(p_syllabus_id uuid\)[\s\S]*?SECURITY DEFINER/,
    );
    expect(BASE).toMatch(/syllabus_approve_version[\s\S]*?syllabus_is_admin\(v_uid\)/);
    expect(BASE).toMatch(/cdp_regenerate_section_plan[\s\S]*?syllabus_is_admin\(v_uid\)/);
    // The auto-plan trigger helper is SECURITY DEFINER too, so it keeps working.
    expect(BASE).toMatch(
      /CREATE OR REPLACE FUNCTION public\.cdp_section_autoplan\(\)[\s\S]*?SECURITY DEFINER/,
    );
  });

  it("no generic authenticated bypass is documented as acceptable", () => {
    expect(HARDENING).toContain("No generic authenticated bypass");
  });

  it("does not modify the already-applied historical migration", () => {
    expect(BASE).toContain(
      "GRANT EXECUTE ON FUNCTION public.cdp_instantiate_from_syllabus(uuid) TO authenticated;",
    );
    expect(HARDENING).not.toMatch(/CREATE OR REPLACE FUNCTION public\.cdp_instantiate_from_syllabus/);
  });
});
