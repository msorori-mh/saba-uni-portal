// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { loadEnv } from "vite";

import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Staging isolation (03U_STAGING_SUPABASE_FAIL_CLOSED).
// NO fallback URL and NO embedded key: staging must be configured explicitly
// with its own isolated backend, and the build fails closed if it is ever
// pointed at the production project ref.
const PRODUCTION_SUPABASE_PROJECT_REF = "wpmicqriltrowwonknox";

const viteEnvironment = loadEnv(
  process.env.NODE_ENV === "development" ? "development" : "production",
  process.cwd(),
  "",
);

const supabaseUrl = (
  process.env.VITE_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  viteEnvironment.VITE_SUPABASE_URL ??
  viteEnvironment.SUPABASE_URL ??
  ""
).trim();

const supabasePublishableKey = (
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  viteEnvironment.VITE_SUPABASE_PUBLISHABLE_KEY ??
  viteEnvironment.SUPABASE_PUBLISHABLE_KEY ??
  ""
).trim();

if (supabaseUrl.toLowerCase().includes(PRODUCTION_SUPABASE_PROJECT_REF)) {
  throw new Error(
    `STAGING_ISOLATION_REQUIRED: Supabase URL points at the production project ref "${PRODUCTION_SUPABASE_PROJECT_REF}". This staging build must never target production.`,
  );
}

// ---------------------------------------------------------------------------
// Build provenance (track F - RUNTIME-DEPLOYED-SHA-PROVENANCE-SOURCE-01)
//
// Inject the ACTUAL commit SHA of the code being built so the deployed value
// can be read back from quboolye.com and compared against the source SHA.
// Resolution order (first VALID value wins):
//   1. VITE_BUILD_SHA        - explicit override for any build platform
//   2. GITHUB_SHA            - implicit on GitHub Actions runners
//   3. CF_PAGES_COMMIT_SHA   - Cloudflare-native builds (belt-and-braces)
//   4. `git rev-parse HEAD`  - works wherever the build sandbox has .git
//   5. "unknown" sentinel    - NEVER fail the build, NEVER guess
// Malformed candidates are rejected (fall through to the next source).
// The value is public in the client bundle by design: a commit SHA is not a
// credential. Only the SHA is injected here - no other env var, no secrets.
// ---------------------------------------------------------------------------
const BUILD_SHA_SENTINEL = "unknown";
const BUILD_SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

function normalizeShaCandidate(candidate: string | undefined): string | null {
  if (typeof candidate !== "string") return null;
  const normalized = candidate.trim().toLowerCase();
  return BUILD_SHA_PATTERN.test(normalized) ? normalized : null;
}

function readStampedSha(): string | null {
  // Committed release stamp: the ONLY fallback that survives a build sandbox
  // without a .git directory (Lovable publish). Public data (a commit SHA).
  try {
    const raw = readFileSync("build-sha.generated.json", "utf-8");
    return normalizeShaCandidate((JSON.parse(raw) as { sha?: string })?.sha);
  } catch {
    return null;
  }
}

function resolveBuildSha(): string {
  const fromEnv =
    normalizeShaCandidate(process.env.VITE_BUILD_SHA) ??
    normalizeShaCandidate(process.env.GITHUB_SHA) ??
    normalizeShaCandidate(process.env.CF_PAGES_COMMIT_SHA);
  if (fromEnv !== null) return fromEnv;

  try {
    const fromGit = execSync("git rev-parse HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    return normalizeShaCandidate(fromGit) ?? readStampedSha() ?? BUILD_SHA_SENTINEL;
  } catch {
    // No .git in the build sandbox (the case on Lovable publish) - use the
    // committed release stamp before degrading to the sentinel.
    return readStampedSha() ?? BUILD_SHA_SENTINEL;
  }
}


const buildSha = resolveBuildSha();

const stagingEnvironmentDefines: Record<string, string> = {
  "import.meta.env.VITE_BUILD_SHA": JSON.stringify(buildSha),
};

if (supabaseUrl) {
  stagingEnvironmentDefines["import.meta.env.VITE_SUPABASE_URL"] = JSON.stringify(supabaseUrl);
}

if (supabasePublishableKey) {
  stagingEnvironmentDefines["import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY"] = JSON.stringify(supabasePublishableKey);
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    define: stagingEnvironmentDefines,
  },
});
