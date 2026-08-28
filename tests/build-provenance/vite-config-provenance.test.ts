import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Transpiler } from "bun";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const tsTranspiler = new Transpiler({ loader: "ts" });

const viteConfigSource = readFileSync(join(process.cwd(), "vite.config.ts"), "utf8");

// Extract the self-contained provenance block from vite.config.ts and
// behaviorally evaluate it with a stubbed execSync - no full build required.
// The block starts at the sentinel constant and ends right before
// `const buildSha = resolveBuildSha();`.
function loadResolveBuildSha(
  execSyncImpl: () => string,
  readFileSyncImpl: () => string = () => {
    throw new Error("no stamp file");
  },
): () => string {
  const startMarker = "const BUILD_SHA_SENTINEL";
  const endMarker = "const buildSha = resolveBuildSha();";
  const start = viteConfigSource.indexOf(startMarker);
  const end = viteConfigSource.indexOf(endMarker);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("provenance resolution block not found in vite.config.ts");
  }
  const block = tsTranspiler.transformSync(viteConfigSource.slice(start, end));
  // eslint-disable-next-line no-new-func -- deliberate: evaluates the actual config code
  const factory = new Function("execSync", "readFileSync", `${block}\nreturn resolveBuildSha;`);
  return factory(execSyncImpl, readFileSyncImpl) as () => string;
}

const ENV_KEYS = ["VITE_BUILD_SHA", "GITHUB_SHA", "CF_PAGES_COMMIT_SHA"] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

const VALID_SHA = "debf9d041f7c05794f6df33877f1dff91253625e";
const OTHER_SHA = "0123456789abcdef0123456789abcdef01234567";

describe("vite.config.ts build SHA resolution (behavioral, no build)", () => {
  test("valid VITE_BUILD_SHA wins over every other source", () => {
    process.env.VITE_BUILD_SHA = VALID_SHA;
    process.env.GITHUB_SHA = OTHER_SHA;
    const resolve = loadResolveBuildSha(() => OTHER_SHA);
    expect(resolve()).toBe(VALID_SHA);
  });

  test("falls back to GITHUB_SHA (GitHub Actions) when VITE_BUILD_SHA is absent", () => {
    process.env.GITHUB_SHA = VALID_SHA;
    const resolve = loadResolveBuildSha(() => {
      throw new Error("no git");
    });
    expect(resolve()).toBe(VALID_SHA);
  });

  test("falls back to CF_PAGES_COMMIT_SHA when higher-priority vars are absent", () => {
    process.env.CF_PAGES_COMMIT_SHA = VALID_SHA;
    const resolve = loadResolveBuildSha(() => {
      throw new Error("no git");
    });
    expect(resolve()).toBe(VALID_SHA);
  });

  test("malformed env values are rejected and fall through to the next source", () => {
    process.env.VITE_BUILD_SHA = "not-a-real-sha";
    process.env.GITHUB_SHA = VALID_SHA;
    const resolve = loadResolveBuildSha(() => {
      throw new Error("no git");
    });
    expect(resolve()).toBe(VALID_SHA);
  });

  test("missing env falls back to git rev-parse HEAD output", () => {
    const resolve = loadResolveBuildSha(() => `${VALID_SHA}\n`);
    expect(resolve()).toBe(VALID_SHA);
  });

  test("missing SHA everywhere (git fails, no stamp) degrades to unknown - build never fails", () => {
    const resolve = loadResolveBuildSha(() => {
      throw new Error("spawn git ENOENT");
    });
    expect(resolve()).toBe("unknown");
  });

  test("git-less build sandbox falls back to the committed release stamp", () => {
    const resolve = loadResolveBuildSha(
      () => {
        throw new Error("spawn git ENOENT");
      },
      () => JSON.stringify({ sha: VALID_SHA }),
    );
    expect(resolve()).toBe(VALID_SHA);
  });

  test("malformed release stamp degrades to unknown (never fails the build)", () => {
    const resolve = loadResolveBuildSha(
      () => {
        throw new Error("spawn git ENOENT");
      },
      () => "{not json",
    );
    expect(resolve()).toBe("unknown");
  });

  test("malformed git output degrades to unknown", () => {
    const resolve = loadResolveBuildSha(() => "fatal: not a git repository");
    expect(resolve()).toBe("unknown");
  });

  test("uppercase SHA from env is normalized to lowercase", () => {
    process.env.GITHUB_SHA = VALID_SHA.toUpperCase();
    const resolve = loadResolveBuildSha(() => {
      throw new Error("no git");
    });
    expect(resolve()).toBe(VALID_SHA);
  });
});

describe("vite.config.ts provenance define (static)", () => {
  test("defines import.meta.env.VITE_BUILD_SHA via vite define", () => {
    expect(viteConfigSource).toContain('"import.meta.env.VITE_BUILD_SHA"');
    expect(viteConfigSource).toContain("JSON.stringify(buildSha)");
  });

  test("git fallback is wrapped so the build can never fail", () => {
    expect(viteConfigSource).toContain('execSync("git rev-parse HEAD"');
    expect(viteConfigSource).toContain("} catch {");
    expect(viteConfigSource).toContain("BUILD_SHA_SENTINEL;");
  });

  test("allowlists exactly the public provenance and deployment-profile defines", () => {
    const definesStart = viteConfigSource.indexOf("const portalEnvironmentDefines");
    const defineUse = viteConfigSource.indexOf("define: portalEnvironmentDefines");
    const defineBlock = viteConfigSource.slice(definesStart, defineUse);
    expect(definesStart).toBeGreaterThan(-1);
    expect(defineUse).toBeGreaterThan(definesStart);
    expect(defineBlock).not.toMatch(/SERVICE_ROLE/i);
    expect(defineBlock).not.toMatch(/sb_secret_|eyJhbGciOi/i);
    expect(defineBlock).not.toContain("JSON.stringify(process.env");

    const defineKeys = Array.from(
      defineBlock.matchAll(
        /portalEnvironmentDefines\["([^"]+)"\]|"((?:import\.meta\.env|process\.env)\.[A-Z0-9_]+)"\s*:/g,
      ),
      (match) => match[1] ?? match[2],
    );
    expect(new Set(defineKeys)).toEqual(
      new Set([
        "import.meta.env.VITE_BUILD_SHA",
        "import.meta.env.VITE_PORTAL_DEPLOY_TARGET",
        "process.env.PORTAL_DEPLOY_TARGET",
        "import.meta.env.VITE_SUPABASE_URL",
        "process.env.SUPABASE_URL",
        "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY",
        "process.env.SUPABASE_PUBLISHABLE_KEY",
      ]),
    );
  });
});
