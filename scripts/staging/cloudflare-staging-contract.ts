import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

export const STAGING_WORKER_NAME = "saba-uni-portal-staging";
export const STAGING_SUPABASE_PROJECT_REF = "ldjhuutywqhjxabdotmn";
export const STAGING_SUPABASE_URL = `https://${STAGING_SUPABASE_PROJECT_REF}.supabase.co`;

const PRODUCTION_HOSTS = new Set(["quboolye.com", "www.quboolye.com"]);
const PRODUCTION_SUPABASE_PROJECT_REF = ["wpmicq", "riltrow", "wonknox"].join("");
const SHA_PATTERN = /^[0-9a-f]{40}$/;

type JsonRecord = Record<string, unknown>;

export interface PreparedCloudflareBundle {
  assetsDirectory: string;
  generatedConfigPath: string;
  mainPath: string;
  workerName: string;
}

function fail(message: string): never {
  throw new Error(`STAGING_DEPLOYMENT_HOLD: ${message}`);
}

function readJsonObject(path: string): JsonRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`cannot parse ${path}: ${String(error)}`);
  }

  if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
    fail(`${path} must contain one JSON object`);
  }

  return parsed as JsonRecord;
}

function assertInside(parent: string, candidate: string, label: string): void {
  const relation = relative(parent, candidate);
  if (relation === "" || (!relation.startsWith(`..${sep}`) && relation !== "..")) {
    return;
  }
  fail(`${label} escapes its allowed directory`);
}

function resolveExistingFile(
  baseDirectory: string,
  configuredPath: unknown,
  allowedDirectory: string,
  label: string,
): string {
  if (typeof configuredPath !== "string" || configuredPath.trim() === "") {
    fail(`${label} is missing from the generated Wrangler configuration`);
  }

  const resolvedPath = resolve(baseDirectory, configuredPath);
  assertInside(allowedDirectory, resolvedPath, label);
  if (!existsSync(resolvedPath)) fail(`${label} does not exist: ${resolvedPath}`);
  const realAllowedDirectory = realpathSync(allowedDirectory);
  const realPath = realpathSync(resolvedPath);
  assertInside(realAllowedDirectory, realPath, label);
  return realPath;
}

function assertNoRoutes(config: JsonRecord): void {
  if ("route" in config || "routes" in config) {
    fail("generated Wrangler configuration must not contain routes or custom domains");
  }
}

function assertCompatibilityDate(config: JsonRecord): void {
  if (
    typeof config.compatibility_date !== "string" ||
    !/^20\d{2}-\d{2}-\d{2}$/.test(config.compatibility_date)
  ) {
    fail("generated Wrangler configuration has no valid compatibility_date");
  }
}

export function normalizeFullSha(candidate: string): string {
  const normalized = candidate.trim().toLowerCase();
  if (!SHA_PATTERN.test(normalized))
    fail("candidate SHA must be exactly 40 hexadecimal characters");
  return normalized;
}

export function assertStagingBuildInputs(supabaseUrl: string, publishableKey?: string): void {
  const normalizedUrl = supabaseUrl.trim();
  if (normalizedUrl !== STAGING_SUPABASE_URL) {
    fail(`Supabase URL must equal the isolated staging URL ${STAGING_SUPABASE_URL}`);
  }
  if (normalizedUrl.toLowerCase().includes(PRODUCTION_SUPABASE_PROJECT_REF)) {
    fail("Supabase URL contains the protected production project ref");
  }

  if (publishableKey !== undefined) {
    const normalizedKey = publishableKey.trim();
    if (!normalizedKey.startsWith("sb_publishable_") || normalizedKey.length < 24) {
      fail("staging key must be a public sb_publishable_ key");
    }
    if (/sb_secret_|service_role|^eyJ/i.test(normalizedKey)) {
      fail("server-role, secret, and legacy JWT keys are forbidden in the staging build");
    }
  }
}

export function prepareCloudflareStagingBundle(repositoryRoot: string): PreparedCloudflareBundle {
  const root = realpathSync(repositoryRoot);
  const redirectPath = resolve(root, ".wrangler/deploy/config.json");
  if (!existsSync(redirectPath)) {
    fail("Nitro did not generate .wrangler/deploy/config.json");
  }

  const redirectConfig = readJsonObject(redirectPath);
  if (Object.keys(redirectConfig).length !== 1 || typeof redirectConfig.configPath !== "string") {
    fail("Wrangler redirect must contain only configPath");
  }

  const configuredGeneratedPath = resolve(dirname(redirectPath), redirectConfig.configPath);
  const generatedConfigDirectory = resolve(root, ".output/server");
  assertInside(generatedConfigDirectory, configuredGeneratedPath, "generated configPath");
  if (!existsSync(configuredGeneratedPath)) {
    fail(`generated Wrangler configuration does not exist: ${configuredGeneratedPath}`);
  }
  const generatedConfigPath = realpathSync(configuredGeneratedPath);
  assertInside(realpathSync(generatedConfigDirectory), generatedConfigPath, "generated configPath");

  const generatedConfig = readJsonObject(generatedConfigPath);
  assertNoRoutes(generatedConfig);
  assertCompatibilityDate(generatedConfig);

  const mainPath = resolveExistingFile(
    dirname(generatedConfigPath),
    generatedConfig.main,
    generatedConfigDirectory,
    "Worker main",
  );

  const assets = generatedConfig.assets;
  if (assets === null || Array.isArray(assets) || typeof assets !== "object") {
    fail("generated Wrangler configuration has no assets object");
  }
  const assetsDirectory = resolveExistingFile(
    dirname(generatedConfigPath),
    (assets as JsonRecord).directory,
    resolve(root, ".output/public"),
    "assets directory",
  );

  generatedConfig.name = STAGING_WORKER_NAME;
  generatedConfig.workers_dev = true;
  delete generatedConfig.account_id;

  writeFileSync(generatedConfigPath, `${JSON.stringify(generatedConfig, null, 2)}\n`, "utf8");

  return {
    assetsDirectory,
    generatedConfigPath,
    mainPath,
    workerName: STAGING_WORKER_NAME,
  };
}

export function assertCloudflareStagingUrl(candidate: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(candidate.trim());
  } catch {
    fail("Cloudflare deployment URL is invalid");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    fail("Cloudflare deployment URL must be credential-free HTTPS");
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    fail("Cloudflare deployment URL must be an origin URL");
  }
  if (PRODUCTION_HOSTS.has(hostname) || hostname.endsWith(".quboolye.com")) {
    fail("production host is forbidden for the staging deployment");
  }
  if (!hostname.endsWith(".workers.dev")) {
    fail("04D accepts only the dedicated Cloudflare workers.dev staging origin");
  }

  return parsed;
}

export function assertVersionPayload(payload: unknown, expectedSha: string): void {
  const sha = normalizeFullSha(expectedSha);
  if (payload === null || Array.isArray(payload) || typeof payload !== "object") {
    fail("version endpoint did not return a JSON object");
  }
  if ((payload as JsonRecord).sha !== sha) {
    fail(`version endpoint SHA does not equal ${sha}`);
  }
}
