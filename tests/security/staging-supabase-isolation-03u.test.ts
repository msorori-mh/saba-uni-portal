// 03U_STAGING_SUPABASE_FAIL_CLOSED — staging Supabase isolation guard.
//
// Source-only test: no network, no database, no secrets. It verifies the pure
// guard function and asserts, by reading source files, that no production
// fallback URL / embedded key survives and that every client-construction
// path calls the guard.

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  assertStagingSupabaseUrl,
} from "../../src/integrations/supabase/staging-isolation";

const read = (p: string) => readFileSync(p, "utf-8");

describe("assertStagingSupabaseUrl", () => {
  it("rejects the production project ref", () => {
    expect(() =>
      assertStagingSupabaseUrl(`https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`),
    ).toThrow(/STAGING_ISOLATION_REQUIRED/);
  });

  it("rejects an empty or missing URL", () => {
    expect(() => assertStagingSupabaseUrl("")).toThrow(/STAGING_ISOLATION_REQUIRED/);
    expect(() => assertStagingSupabaseUrl("   ")).toThrow(/STAGING_ISOLATION_REQUIRED/);
    expect(() => assertStagingSupabaseUrl(undefined)).toThrow(/STAGING_ISOLATION_REQUIRED/);
    expect(() => assertStagingSupabaseUrl(null)).toThrow(/STAGING_ISOLATION_REQUIRED/);
  });

  it("rejects an invalid URL", () => {
    expect(() => assertStagingSupabaseUrl("not-a-url")).toThrow(/STAGING_ISOLATION_REQUIRED/);
  });

  it("rejects an arbitrary host", () => {
    expect(() => assertStagingSupabaseUrl("https://evil.example.com")).toThrow(
      /not an allowed staging host/,
    );
    expect(() => assertStagingSupabaseUrl("https://supabase.co.attacker.dev")).toThrow(
      /not an allowed staging host/,
    );
  });

  it("rejects non-HTTPS for remote hosts", () => {
    expect(() => assertStagingSupabaseUrl("http://ldjhuutywqhjxabdotmn.supabase.co")).toThrow(
      /must use HTTPS/,
    );
  });

  it("accepts a different Supabase project and strips trailing slashes", () => {
    expect(assertStagingSupabaseUrl("https://ldjhuutywqhjxabdotmn.supabase.co/")).toBe(
      "https://ldjhuutywqhjxabdotmn.supabase.co",
    );
  });

  it("accepts local development hosts over HTTP", () => {
    expect(assertStagingSupabaseUrl("http://localhost:54321")).toBe("http://localhost:54321");
    expect(assertStagingSupabaseUrl("http://127.0.0.1:54321/")).toBe("http://127.0.0.1:54321");
    expect(assertStagingSupabaseUrl("http://[::1]:54321")).toBe("http://[::1]:54321");
  });
});

describe("vite.config.ts has no production fallback", () => {
  const config = read("vite.config.ts");

  it("no FALLBACK_SUPABASE_* constants", () => {
    expect(config).not.toContain("FALLBACK_SUPABASE_URL");
    expect(config).not.toContain("FALLBACK_SUPABASE_PUBLISHABLE_KEY");
  });

  it("no embedded JWT key", () => {
    expect(config).not.toContain("eyJhbGciOi");
  });

  it("fails the build on the production ref", () => {
    expect(config).toContain("STAGING_ISOLATION_REQUIRED");
    expect(config).toContain(PRODUCTION_SUPABASE_PROJECT_REF);
  });
});

describe("guard is wired into every client-construction path", () => {
  const files = [
    "src/integrations/supabase/client.ts",
    "src/integrations/supabase/client.server.ts",
    "src/integrations/supabase/auth-middleware.ts",
    "src/lib/admin-users.functions.ts",
    "src/lib/councils/request-auth.server.ts",
  ];

  for (const file of files) {
    it(`${file} calls assertStagingSupabaseUrl`, () => {
      const src = read(file);
      expect(src).toContain("assertStagingSupabaseUrl");
      expect(src.indexOf("assertStagingSupabaseUrl(")).toBeGreaterThan(-1);
    });
  }
});
