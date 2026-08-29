import {
  PRODUCTION_SUPABASE_URL,
  assertPortalSupabasePublishableKey,
  assertPortalSupabaseUrl,
  resolvePortalDeployTarget,
} from "../../src/integrations/supabase/deployment-profile";

export const PRODUCTION_ORIGIN = "https://quboolye.com" as const;
export const PRODUCTION_WWW_ORIGIN = "https://www.quboolye.com" as const;
export const PRODUCTION_DEPLOY_APPROVAL = "APPROVED_PRODUCTION_DEPLOY_04F" as const;
export const PRODUCTION_PUBLISH_APPROVAL = "APPROVED_PRODUCTION_PUBLISH_04F" as const;

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DEPLOYMENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{5,127}$/;

type JsonRecord = Record<string, unknown>;

export interface ProductionBuildInputs {
  buildSha: string;
  deployTarget: string;
  publishableKey: string;
  supabaseUrl: string;
}

export interface ValidatedProductionBuild {
  buildSha: string;
  deployTarget: "production";
  supabaseUrl: typeof PRODUCTION_SUPABASE_URL;
}

function fail(reason: string): never {
  throw new Error(`PRODUCTION_RELEASE_GATE_REQUIRED: ${reason}`);
}

export function normalizeProductionReleaseSha(candidate: string): string {
  const normalized = candidate.trim().toLowerCase();
  if (!SHA_PATTERN.test(normalized)) {
    fail("candidate SHA must be exactly 40 lowercase hexadecimal characters");
  }
  return normalized;
}

export function assertCanonicalProductionOrigin(candidate: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(candidate.trim());
  } catch {
    return fail("production URL is invalid");
  }

  if (
    parsed.origin !== PRODUCTION_ORIGIN ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    return fail(`production verification must use exactly ${PRODUCTION_ORIGIN}`);
  }

  return parsed;
}

export function assertProductionBuildInputs(
  inputs: ProductionBuildInputs,
): ValidatedProductionBuild {
  let target: "staging" | "production";
  let safeUrl: string;

  try {
    target = resolvePortalDeployTarget(inputs.deployTarget);
    safeUrl = assertPortalSupabaseUrl(target, inputs.supabaseUrl);
    assertPortalSupabasePublishableKey(target, inputs.publishableKey);
  } catch (error) {
    return fail(`runtime profile rejected the production inputs: ${String(error)}`);
  }

  if (target !== "production") {
    return fail("deploy target must be production");
  }
  if (safeUrl !== PRODUCTION_SUPABASE_URL) {
    return fail(`Supabase URL must equal ${PRODUCTION_SUPABASE_URL}`);
  }

  return Object.freeze({
    buildSha: normalizeProductionReleaseSha(inputs.buildSha),
    deployTarget: target,
    supabaseUrl: PRODUCTION_SUPABASE_URL,
  });
}

export function assertProductionVersionPayload(payload: unknown, expectedSha: string): void {
  const sha = normalizeProductionReleaseSha(expectedSha);
  if (payload === null || Array.isArray(payload) || typeof payload !== "object") {
    fail("version endpoint did not return one JSON object");
  }

  const record = payload as JsonRecord;
  if (Object.keys(record).length !== 1 || record.sha !== sha) {
    fail(`version endpoint must return only the exact candidate SHA ${sha}`);
  }
}

export function assertNoStoreHeader(cacheControl: string | null): void {
  const directives = (cacheControl ?? "")
    .split(",")
    .map((directive) => directive.trim().toLowerCase());
  if (!directives.includes("no-store")) {
    fail("version endpoint must send Cache-Control: no-store");
  }
}

export function assertProductionBuildShaMeta(html: string, expectedSha: string): void {
  const sha = normalizeProductionReleaseSha(expectedSha);
  const escapedSha = sha.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `<meta\\s+[^>]*(?:name=["']build-sha["'][^>]*content=["']${escapedSha}["']|content=["']${escapedSha}["'][^>]*name=["']build-sha["'])[^>]*>`,
    "i",
  );
  if (!pattern.test(html)) {
    fail("root HTML does not expose the exact candidate SHA in meta[name=build-sha]");
  }
}

export function normalizeRollbackDeploymentId(candidate: string): string {
  const normalized = candidate.trim();
  if (!DEPLOYMENT_ID_PATTERN.test(normalized)) {
    fail("previous healthy deployment ID is missing or malformed");
  }
  return normalized;
}

export function assertApprovalToken(
  candidate: string,
  expected: typeof PRODUCTION_DEPLOY_APPROVAL | typeof PRODUCTION_PUBLISH_APPROVAL,
): void {
  if (candidate.trim() !== expected) {
    fail(`explicit approval ${expected} is required`);
  }
}
