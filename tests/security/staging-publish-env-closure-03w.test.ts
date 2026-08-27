// STAGING-PUBLISH-ENV-CLOSURE-03W — contract tests.
//
// Verifies the staging-only publish fallback configuration:
//   - it pins the isolated staging project ref/URL and a PUBLIC publishable key
//   - it fails closed on the production hosts
//   - the five client-construction paths use the fallback + isolation guard
//   - the service-role key never gains a hardcoded fallback
//
// This file NEVER prints the publishable key value.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  STAGING_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_URL,
  STAGING_SUPABASE_PUBLISHABLE_KEY,
  stagingFallbackSupabaseUrl,
  stagingFallbackSupabasePublishableKey,
} from "../../src/integrations/supabase/staging-config";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  assertStagingSupabaseUrl,
} from "../../src/integrations/supabase/staging-isolation";

const ROOT = resolve(import.meta.dir, "../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

/** Collapse whitespace so assertions are insensitive to formatting/line breaks. */
const flat = (source: string) => source.replace(/\s+/g, " ");

const SOURCES = {
  client: flat(read("src/integrations/supabase/client.ts")),
  clientServer: flat(read("src/integrations/supabase/client.server.ts")),
  authMiddleware: flat(read("src/integrations/supabase/auth-middleware.ts")),
  adminUsers: flat(read("src/lib/admin-users.functions.ts")),
  councilAuth: flat(read("src/lib/councils/request-auth.server.ts")),
  stagingConfig: read("src/integrations/supabase/staging-config.ts"),
};

const PRODUCTION_HOSTS = ["quboolye.com", "www.quboolye.com"];

function withHostname(hostname: string, run: () => void): void {
  const g = globalThis as unknown as { window?: unknown };
  const hadWindow = Object.prototype.hasOwnProperty.call(g, "window");
  const previous = g.window;
  try {
    g.window = { location: { hostname } };
    run();
  } finally {
    if (hadWindow) g.window = previous;
    else delete g.window;
  }
}

describe("03W — staging project identity", () => {
  test("project ref is the isolated staging ref", () => {
    expect(STAGING_SUPABASE_PROJECT_REF).toBe("ldjhuutywqhjxabdotmn");
  });

  test("URL is HTTPS, matches the ref, and is a supabase.co host", () => {
    const parsed = new URL(STAGING_SUPABASE_URL);
    expect(parsed.protocol).toBe("https:");
    expect(parsed.hostname.endsWith(".supabase.co")).toBe(true);
    expect(parsed.hostname).toBe(`${STAGING_SUPABASE_PROJECT_REF}.supabase.co`);
  });

  test("staging identity never equals or contains the production ref", () => {
    expect(STAGING_SUPABASE_PROJECT_REF).not.toBe(PRODUCTION_SUPABASE_PROJECT_REF);
    expect(STAGING_SUPABASE_URL.toLowerCase().includes(PRODUCTION_SUPABASE_PROJECT_REF)).toBe(false);
  });
});

describe("03W-R1 — protected ref is assembled at runtime, not bundled literally", () => {
  const isolationSource = read("src/integrations/supabase/staging-isolation.ts");
  // Rebuilt from fragments so this test file itself carries no contiguous literal.
  const expectedProductionRef = ["wpmicq", "riltrow", "wonknox"].join("");

  test("runtime value equals the full protected ref", () => {
    expect(PRODUCTION_SUPABASE_PROJECT_REF).toBe(expectedProductionRef);
    expect(PRODUCTION_SUPABASE_PROJECT_REF.length).toBe(20);
  });

  test("staging-isolation source holds no contiguous production ref literal", () => {
    expect(isolationSource.includes(expectedProductionRef)).toBe(false);
  });

  test("guard still rejects a production URL with STAGING_ISOLATION_REQUIRED", () => {
    expect(() =>
      assertStagingSupabaseUrl(`https://${expectedProductionRef}.supabase.co`),
    ).toThrow(/STAGING_ISOLATION_REQUIRED/);
  });
});

describe("03W — publishable key shape (value never printed)", () => {
  test("key is a public sb_publishable_ key", () => {
    expect(STAGING_SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_")).toBe(true);
  });

  test("key is not a JWT and is not a service-role key", () => {
    expect(STAGING_SUPABASE_PUBLISHABLE_KEY.startsWith("eyJ")).toBe(false);
    expect(STAGING_SUPABASE_PUBLISHABLE_KEY.includes("service_role")).toBe(false);
  });
});

describe("03W — fail-closed on production hosts", () => {
  for (const host of PRODUCTION_HOSTS) {
    test(`stagingFallbackSupabaseUrl throws on ${host}`, () => {
      withHostname(host, () => {
        expect(() => stagingFallbackSupabaseUrl()).toThrow(/STAGING_ISOLATION_REQUIRED/);
      });
    });

    test(`stagingFallbackSupabasePublishableKey throws on ${host}`, () => {
      withHostname(host, () => {
        expect(() => stagingFallbackSupabasePublishableKey()).toThrow(/STAGING_ISOLATION_REQUIRED/);
      });
    });
  }

  test("fallbacks succeed in a server / no-window environment", () => {
    const g = globalThis as unknown as { window?: unknown };
    expect(Object.prototype.hasOwnProperty.call(g, "window")).toBe(false);
    expect(stagingFallbackSupabaseUrl()).toBe(STAGING_SUPABASE_URL);
    expect(stagingFallbackSupabasePublishableKey().startsWith("sb_publishable_")).toBe(true);
  });
});

describe("03W — source contracts for the five client paths", () => {
  test("client.ts: URL + publishable fallback, guard before createClient", () => {
    expect(SOURCES.client).toMatch(/stagingFallbackSupabaseUrl\(\)/);
    expect(SOURCES.client).toMatch(/stagingFallbackSupabasePublishableKey\(\)/);
    const guardAt = SOURCES.client.indexOf("assertStagingSupabaseUrl(");
    const createAt = SOURCES.client.indexOf("createClient<Database>(");
    expect(guardAt).toBeGreaterThan(-1);
    expect(createAt).toBeGreaterThan(guardAt);
  });

  test("client.server.ts: URL fallback only; service role stays process.env-only", () => {
    expect(SOURCES.clientServer).toMatch(/stagingFallbackSupabaseUrl\(\)/);
    expect(SOURCES.clientServer).not.toMatch(/stagingFallbackSupabasePublishableKey/);
    expect(SOURCES.clientServer).toMatch(
      /SUPABASE_SERVICE_ROLE_KEY\s*=\s*process\.env(?:\.SUPABASE_SERVICE_ROLE_KEY|\[\s*["'`]SUPABASE_SERVICE_ROLE_KEY["'`]\s*\])\s*;/,
    );
    expect(SOURCES.clientServer).not.toMatch(/SERVICE_ROLE_KEY[^;]*\|\|[^;]*staging/i);
    const guardAt = SOURCES.clientServer.indexOf("assertStagingSupabaseUrl(");
    const createAt = SOURCES.clientServer.indexOf("createClient<Database>(");
    expect(guardAt).toBeGreaterThan(-1);
    expect(createAt).toBeGreaterThan(guardAt);
  });

  test("auth-middleware.ts: URL + publishable fallback, guard before createClient", () => {
    expect(SOURCES.authMiddleware).toMatch(/stagingFallbackSupabaseUrl\(\)/);
    expect(SOURCES.authMiddleware).toMatch(/stagingFallbackSupabasePublishableKey\(\)/);
    const guardAt = SOURCES.authMiddleware.indexOf("assertStagingSupabaseUrl(");
    const createAt = SOURCES.authMiddleware.indexOf("createClient<Database>(");
    expect(guardAt).toBeGreaterThan(-1);
    expect(createAt).toBeGreaterThan(guardAt);
  });

  test("admin-users.functions.ts: actorSupabase uses fallbacks and the guard", () => {
    const start = SOURCES.adminUsers.indexOf("function actorSupabase(");
    expect(start).toBeGreaterThan(-1);
    const region = SOURCES.adminUsers.slice(start, start + 1200);
    expect(region).toMatch(/stagingFallbackSupabaseUrl\(\)/);
    expect(region).toMatch(/stagingFallbackSupabasePublishableKey\(\)/);
    const guardAt = region.indexOf("assertStagingSupabaseUrl(");
    const createAt = region.indexOf("createClient");
    expect(guardAt).toBeGreaterThan(-1);
    expect(createAt).toBeGreaterThan(-1);
    expect(createAt).toBeLessThan(guardAt + 200);
  });

  test("councils/request-auth.server.ts: fallbacks + guard before createClient", () => {
    expect(SOURCES.councilAuth).toMatch(/stagingFallbackSupabaseUrl\(\)/);
    expect(SOURCES.councilAuth).toMatch(/stagingFallbackSupabasePublishableKey\(\)/);
    const guardAt = SOURCES.councilAuth.indexOf("assertStagingSupabaseUrl(");
    const createAt = SOURCES.councilAuth.indexOf("createClient<Database>(");
    expect(guardAt).toBeGreaterThan(-1);
    expect(createAt).toBeGreaterThan(guardAt);
  });
});

describe("03W — staging-config hygiene", () => {
  test("no production ref or host is used as a runtime source", () => {
    const withoutImports = SOURCES.stagingConfig
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("import "))
      .join("\n");
    expect(withoutImports).not.toMatch(new RegExp(`["'\`][^"'\`]*${PRODUCTION_SUPABASE_PROJECT_REF}`));
    expect(withoutImports).not.toMatch(/https:\/\/[^"'`]*quboolye\.com/);
  });

  test("production hosts are explicitly blocked", () => {
    for (const host of PRODUCTION_HOSTS) {
      expect(SOURCES.stagingConfig).toContain(host);
    }
    expect(SOURCES.stagingConfig).toMatch(/STAGING_ISOLATION_REQUIRED/);
  });

  test("no JWT or service-role material is hardcoded", () => {
    expect(SOURCES.stagingConfig).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    expect(SOURCES.stagingConfig).not.toMatch(/sb_secret_/);
    expect(SOURCES.stagingConfig).not.toMatch(/SERVICE_ROLE_KEY\s*=/);
  });
});
