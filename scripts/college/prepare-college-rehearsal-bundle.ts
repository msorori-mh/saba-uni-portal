// College rehearsal Worker (LOVABLE-EXIT-01, phase 6).
//
// Reuses the 04D bundle preparation (no routes, no custom domains, workers.dev
// only, Cairo font asset) and then renames the generated Worker to the
// dedicated rehearsal name. The build must target the college-owned Supabase
// project and never the legacy Lovable Cloud project.
import { readFileSync, writeFileSync } from "node:fs";

import { prepareCloudflareStagingBundle } from "../staging/cloudflare-staging-contract";
import {
  COLLEGE_REHEARSAL_WORKER_NAME,
  assertCollegeRehearsalBuildInputs,
  finalizeCollegeRehearsalConfig,
} from "./college-rehearsal-contract";

assertCollegeRehearsalBuildInputs(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  process.env.VITE_PORTAL_DEPLOY_TARGET,
);

const prepared = prepareCloudflareStagingBundle(process.cwd());
const config = JSON.parse(readFileSync(prepared.generatedConfigPath, "utf8"));
writeFileSync(
  prepared.generatedConfigPath,
  `${JSON.stringify(finalizeCollegeRehearsalConfig(config), null, 2)}\n`,
  "utf8",
);

console.log(
  JSON.stringify({
    generatedConfigPath: prepared.generatedConfigPath,
    workerName: COLLEGE_REHEARSAL_WORKER_NAME,
  }),
);
