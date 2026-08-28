import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  PRODUCTION_SUPABASE_URL,
  assertPortalRuntimeHost,
  assertPortalSupabasePublishableKey,
  assertPortalSupabaseUrl,
  portalFallbackSupabasePublishableKey,
  portalFallbackSupabaseUrl,
  resolvePortalDeployTarget,
} from "../../src/integrations/supabase/deployment-profile";
import { STAGING_SUPABASE_URL } from "../../src/integrations/supabase/staging-config";

const ROOT = resolve(import.meta.dir, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

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

describe("04E — explicit deployment target", () => {
  test("defaults missing configuration to staging and rejects unknown targets", () => {
    expect(resolvePortalDeployTarget(undefined, "")).toBe("staging");
    expect(resolvePortalDeployTarget(" STAGING ")).toBe("staging");
    expect(resolvePortalDeployTarget("production")).toBe("production");
    expect(() => resolvePortalDeployTarget("preview")).toThrow(
      /PORTAL_DEPLOYMENT_PROFILE_REQUIRED/,
    );
  });

  test("production accepts only the exact protected Supabase origin", () => {
    expect(assertPortalSupabaseUrl("production", `${PRODUCTION_SUPABASE_URL}/`)).toBe(
      PRODUCTION_SUPABASE_URL,
    );
    expect(() => assertPortalSupabaseUrl("production", STAGING_SUPABASE_URL)).toThrow(
      /PORTAL_DEPLOYMENT_PROFILE_REQUIRED/,
    );
    expect(() =>
      assertPortalSupabaseUrl("production", `${PRODUCTION_SUPABASE_URL}/rest/v1`),
    ).toThrow(/must use exactly/);
    expect(() => assertPortalSupabaseUrl("production", "")).toThrow(
      /requires an explicit Supabase URL/,
    );
  });

  test("staging still rejects the protected production project", () => {
    expect(assertPortalSupabaseUrl("staging", STAGING_SUPABASE_URL)).toBe(STAGING_SUPABASE_URL);
    expect(() => assertPortalSupabaseUrl("staging", PRODUCTION_SUPABASE_URL)).toThrow(
      /STAGING_ISOLATION_REQUIRED/,
    );
  });

  test("production has no URL or key fallback", () => {
    expect(() => portalFallbackSupabaseUrl("production")).toThrow(/has no fallback/);
    expect(() => portalFallbackSupabasePublishableKey("production")).toThrow(/has no fallback/);
    expect(portalFallbackSupabaseUrl("staging")).toBe(STAGING_SUPABASE_URL);
  });

  test("runtime accepts public publishable keys only", () => {
    const publicKey = "sb_publishable_04e_public_test_value";
    expect(assertPortalSupabasePublishableKey("production", publicKey)).toBe(publicKey);
    expect(() => assertPortalSupabasePublishableKey("production", "")).toThrow(
      /requires an explicit public Supabase publishable key/,
    );
    expect(() => assertPortalSupabasePublishableKey("production", "sb_secret_forbidden")).toThrow(
      /requires a public sb_publishable_ key/,
    );
    expect(() => assertPortalSupabasePublishableKey("production", "eyJhbGciOi.forbidden")).toThrow(
      /requires a public sb_publishable_ key/,
    );
  });
});

describe("04E — browser host matrix", () => {
  for (const host of ["quboolye.com", "www.quboolye.com"]) {
    test(`production is allowed on ${host}`, () => {
      withHostname(host, () => expect(() => assertPortalRuntimeHost("production")).not.toThrow());
    });

    test(`staging is denied on ${host}`, () => {
      withHostname(host, () =>
        expect(() => assertPortalRuntimeHost("staging")).toThrow(
          /Staging configuration cannot run on production host/,
        ),
      );
    });
  }

  test("production is denied on workers.dev", () => {
    withHostname("saba-uni-portal-staging.example.workers.dev", () =>
      expect(() => assertPortalRuntimeHost("production")).toThrow(
        /Production configuration cannot run/,
      ),
    );
  });
});

describe("04E — source and workflow contract", () => {
  const viteConfig = read("vite.config.ts");
  const stagingWorkflow = read(".github/workflows/cloudflare-staging-04d.yml");

  test("Vite requires an explicit, exact production profile", () => {
    expect(viteConfig).toContain("VITE_PORTAL_DEPLOY_TARGET");
    expect(viteConfig).toContain("PORTAL_DEPLOYMENT_PROFILE_REQUIRED");
    expect(viteConfig).toContain("PRODUCTION_SUPABASE_URL");
    expect(viteConfig).toMatch(/production requires an explicit public Supabase publishable key/);
    expect(viteConfig).not.toMatch(/sb_secret_|eyJhbGciOi/);
  });

  test("all five client construction paths use the target-aware guard", () => {
    for (const path of [
      "src/integrations/supabase/client.ts",
      "src/integrations/supabase/client.server.ts",
      "src/integrations/supabase/auth-middleware.ts",
      "src/lib/admin-users.functions.ts",
      "src/lib/councils/request-auth.server.ts",
    ]) {
      const source = read(path);
      expect(source).toContain("resolvePortalDeployTarget");
      expect(source).toContain("assertPortalSupabaseUrl");
      expect(source).not.toContain("assertStagingSupabaseUrl");
    }

    for (const path of [
      "src/integrations/supabase/client.ts",
      "src/integrations/supabase/auth-middleware.ts",
      "src/lib/admin-users.functions.ts",
      "src/lib/councils/request-auth.server.ts",
    ]) {
      expect(read(path)).toContain("assertPortalSupabasePublishableKey");
    }
  });

  test("Cloudflare staging pins the staging target and contains no production deploy", () => {
    expect(stagingWorkflow).toContain("VITE_PORTAL_DEPLOY_TARGET: staging");
    expect(stagingWorkflow).not.toMatch(/environment:\s*production|saba-uni-portal-production/i);
    expect(stagingWorkflow).not.toContain("quboolye.com");
  });
});
