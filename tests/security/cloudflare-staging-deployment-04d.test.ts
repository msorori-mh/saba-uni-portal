import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

import {
  STAGING_SUPABASE_URL,
  STAGING_WORKER_NAME,
  assertCloudflareStagingUrl,
  assertStagingBuildInputs,
  assertVersionPayload,
  prepareCloudflareStagingBundle,
} from "../../scripts/staging/cloudflare-staging-contract";

const ROOT = resolve(import.meta.dir, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

function createGeneratedBundle(route?: unknown): string {
  const root = mkdtempSync(resolve(tmpdir(), "usr-04d-cloudflare-"));
  const redirectPath = resolve(root, ".wrangler/deploy/config.json");
  const configPath = resolve(root, ".output/server/wrangler.json");
  const mainPath = resolve(root, ".output/server/index.mjs");
  const assetsPath = resolve(root, ".output/public");
  mkdirSync(dirname(redirectPath), { recursive: true });
  mkdirSync(dirname(configPath), { recursive: true });
  mkdirSync(assetsPath, { recursive: true });
  writeFileSync(redirectPath, JSON.stringify({ configPath: "../../.output/server/wrangler.json" }));
  writeFileSync(mainPath, "export default { fetch() { return new Response('ok') } };\n");
  writeFileSync(resolve(assetsPath, "index.html"), "<!doctype html>\n");
  writeFileSync(
    configPath,
    JSON.stringify({
      name: "auto-generated-name",
      main: "index.mjs",
      compatibility_date: "2026-08-28",
      assets: { directory: "../public" },
      ...(route === undefined ? {} : { route }),
    }),
  );
  return root;
}

describe("04D — Cloudflare staging build contract", () => {
  test("pins the isolated staging URL and accepts only the public key shape", () => {
    expect(() =>
      assertStagingBuildInputs(STAGING_SUPABASE_URL, "sb_publishable_12345678901234567890"),
    ).not.toThrow();
    expect(() =>
      assertStagingBuildInputs(
        "https://wpmicqriltrowwonknox.supabase.co",
        "sb_publishable_12345678901234567890",
      ),
    ).toThrow(/STAGING_DEPLOYMENT_HOLD/);
    expect(() => assertStagingBuildInputs(STAGING_SUPABASE_URL, "sb_secret_forbidden")).toThrow(
      /STAGING_DEPLOYMENT_HOLD/,
    );
  });

  test("rewrites only the generated config to the dedicated workers.dev target", () => {
    const root = createGeneratedBundle();
    try {
      const prepared = prepareCloudflareStagingBundle(root);
      const generated = JSON.parse(readFileSync(prepared.generatedConfigPath, "utf8"));
      expect(generated.name).toBe(STAGING_WORKER_NAME);
      expect(generated.workers_dev).toBe(true);
      expect(generated.route).toBeUndefined();
      expect(generated.routes).toBeUndefined();
      expect(prepared.mainPath.endsWith("/.output/server/index.mjs")).toBe(true);
      expect(prepared.assetsDirectory.endsWith("/.output/public")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects every custom route before deployment", () => {
    const root = createGeneratedBundle("quboolye.com/*");
    try {
      expect(() => prepareCloudflareStagingBundle(root)).toThrow(
        /must not contain routes or custom domains/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("04D — live verification contract", () => {
  test("accepts only a credential-free HTTPS workers.dev origin", () => {
    expect(
      assertCloudflareStagingUrl("https://saba-uni-portal-staging.example.workers.dev").origin,
    ).toBe("https://saba-uni-portal-staging.example.workers.dev");
    expect(() => assertCloudflareStagingUrl("https://quboolye.com")).toThrow(
      /production host is forbidden/,
    );
    expect(() => assertCloudflareStagingUrl("http://portal.example.workers.dev")).toThrow(
      /credential-free HTTPS/,
    );
    expect(() => assertCloudflareStagingUrl("https://workers.dev.evil.example")).toThrow(
      /only the dedicated Cloudflare workers.dev/,
    );
  });

  test("requires an exact full SHA from version.json", () => {
    const sha = "13e23637c14be587c4fe0e4fbcf640b842bd2a83";
    expect(() => assertVersionPayload({ sha }, sha)).not.toThrow();
    expect(() =>
      assertVersionPayload({ sha: "7375fb99ad2662d0cc500b1dd1e225cd6dfdd5ca" }, sha),
    ).toThrow(/does not equal/);
    expect(() => assertVersionPayload({ sha: "13e2363" }, sha)).toThrow(/does not equal/);
  });
});

describe("04D — workflow policy", () => {
  const workflow = read(".github/workflows/cloudflare-staging-04d.yml");

  test("deploy is manual, main-only, environment-protected, and read-only to GitHub", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("environment: staging");
    expect(workflow).toContain("contents: read");
    expect(workflow).not.toMatch(/schedule:|pull_request_target:/);
  });

  test("pins target, build identity, secrets, dry-run, smoke, and rollback", () => {
    expect(workflow).toContain(`STAGING_WORKER_NAME: ${STAGING_WORKER_NAME}`);
    expect(workflow).toContain(`STAGING_SUPABASE_URL: ${STAGING_SUPABASE_URL}`);
    expect(workflow).toContain("STAGING_SUPABASE_PUBLISHABLE_KEY");
    expect(workflow).toContain("CLOUDFLARE_API_TOKEN");
    expect(workflow).toContain("CLOUDFLARE_ACCOUNT_ID");
    expect(workflow).toContain("deploy --dry-run");
    expect(workflow).toContain("verify-cloudflare-staging-deployment.ts");
    expect(workflow).toContain("wrangler rollback");
    expect(workflow).toContain(
      "cloudflare/wrangler-action@ebbaa1584979971c8614a24965b4405ff95890e0",
    );
  });

  test("contains no database, migration, Lovable, or production deployment action", () => {
    expect(workflow).not.toMatch(/supabase\s+(?:db|migration|functions)|lovable|quboolye\.com/i);
    expect(workflow).not.toMatch(/service[_-]?role|sb_secret_/i);
  });
});
