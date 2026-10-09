// Contract for the college rehearsal Worker (LOVABLE-EXIT-01, phase 6).
//
// The rehearsal runs the portal on Cloudflare workers.dev against the
// college-owned Supabase project, before any DNS change. It is built with the
// "staging" deploy profile, which already refuses the legacy Lovable Cloud
// project ref and refuses to run on quboolye.com.

export const COLLEGE_REHEARSAL_WORKER_NAME = "saba-uni-portal-college";
export const COLLEGE_SUPABASE_PROJECT_REF = "pwapivqjofdsevycegph";
export const COLLEGE_SUPABASE_URL = `https://${COLLEGE_SUPABASE_PROJECT_REF}.supabase.co`;

const LEGACY_SUPABASE_PROJECT_REF = ["wpmicq", "riltrow", "wonknox"].join("");

type JsonRecord = Record<string, unknown>;

function fail(message: string): never {
  throw new Error(`COLLEGE_REHEARSAL_HOLD: ${message}`);
}

export function assertCollegeRehearsalBuildInputs(
  supabaseUrl: string | undefined,
  publishableKey: string | undefined,
  deployTarget: string | undefined,
): void {
  const url = (supabaseUrl ?? "").trim();
  if (url !== COLLEGE_SUPABASE_URL) {
    fail(`Supabase URL must equal ${COLLEGE_SUPABASE_URL}`);
  }
  if (url.toLowerCase().includes(LEGACY_SUPABASE_PROJECT_REF)) {
    fail("Supabase URL contains the legacy Lovable Cloud project ref");
  }
  if ((deployTarget ?? "").trim().toLowerCase() !== "staging") {
    fail("the rehearsal must be built with the staging deploy profile");
  }

  const key = (publishableKey ?? "").trim();
  if (!key.startsWith("sb_publishable_") || key.length < 24) {
    fail("the browser key must be the public sb_publishable_ key of the college project");
  }
  if (/sb_secret_|service_role|^eyJ/i.test(key)) {
    fail("secret, service-role and legacy JWT keys are forbidden in the browser build");
  }
}

export function finalizeCollegeRehearsalConfig(config: JsonRecord): JsonRecord {
  if ("route" in config || "routes" in config) {
    fail("the rehearsal Worker must not carry routes or custom domains");
  }

  const flags = Array.isArray(config.compatibility_flags)
    ? config.compatibility_flags.filter((flag): flag is string => typeof flag === "string")
    : [];
  for (const required of ["nodejs_compat", "nodejs_compat_populate_process_env"]) {
    if (!flags.includes(required)) flags.push(required);
  }

  const next: JsonRecord = { ...config };
  next.name = COLLEGE_REHEARSAL_WORKER_NAME;
  next.workers_dev = true;
  next.compatibility_flags = flags;
  delete next.account_id;
  return next;
}
