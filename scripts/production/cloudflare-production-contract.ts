export const PRODUCTION_WORKER_NAME = "saba-uni-portal-production";
export const CUTOVER_SUPABASE_URL = "https://cldpnartkfnmllrkjaoi.supabase.co";
export const PRODUCTION_CUSTOM_DOMAINS = ["quboolye.com", "www.quboolye.com"] as const;

type JsonRecord = Record<string, unknown>;

export function assertProductionBuildInputs(url?: string, key?: string, target?: string): void {
  if (url?.trim() !== CUTOVER_SUPABASE_URL || target?.trim() !== "production") {
    throw new Error("PRODUCTION_CUTOVER_HOLD: exact production backend and production profile required");
  }
  if (!key?.startsWith("sb_publishable_") || key.length < 24 || /sb_secret_|service_role|^eyJ/i.test(key)) {
    throw new Error("PRODUCTION_CUTOVER_HOLD: explicit public sb_publishable_ key required");
  }
}

export function finalizeProductionConfig(config: JsonRecord): JsonRecord {
  if ("route" in config || "routes" in config) {
    throw new Error("PRODUCTION_CUTOVER_HOLD: unexpected routes in generated bundle");
  }
  const flags = Array.isArray(config.compatibility_flags)
    ? config.compatibility_flags.filter((flag): flag is string => typeof flag === "string")
    : [];
  for (const flag of ["nodejs_compat", "nodejs_compat_populate_process_env"]) {
    if (!flags.includes(flag)) flags.push(flag);
  }
  const next: JsonRecord = {
    ...config,
    name: PRODUCTION_WORKER_NAME,
    workers_dev: false,
    compatibility_flags: flags,
    routes: PRODUCTION_CUSTOM_DOMAINS.map((pattern) => ({ pattern, custom_domain: true })),
  };
  delete next.account_id;
  return next;
}

export function assertProductionSmokeResponse(path: string, status: number, body: string, sha: string): void {
  if (!/^[0-9a-f]{40}$/.test(sha) || status !== 200) {
    throw new Error(`PRODUCTION_CUTOVER_HOLD: ${path} must return HTTP 200 for a full build SHA`);
  }
  if (path === "/version.json" && JSON.parse(body)?.sha !== sha) {
    throw new Error("PRODUCTION_CUTOVER_HOLD: deployed SHA differs from candidate SHA");
  }
}
