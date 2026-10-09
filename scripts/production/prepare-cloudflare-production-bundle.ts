// Local preparation only. Deployment is exclusively the manual production workflow.
import { readFileSync, writeFileSync } from "node:fs";
import { prepareCloudflareStagingBundle } from "../staging/cloudflare-staging-contract";
import { assertProductionBuildInputs, finalizeProductionConfig, PRODUCTION_WORKER_NAME } from "./cloudflare-production-contract";

assertProductionBuildInputs(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  process.env.VITE_PORTAL_DEPLOY_TARGET,
);
// Reuse only route-free filesystem/bundle validation and Cairo asset preparation.
const prepared = prepareCloudflareStagingBundle(process.cwd());
const config = JSON.parse(readFileSync(prepared.generatedConfigPath, "utf8"));
writeFileSync(prepared.generatedConfigPath, `${JSON.stringify(finalizeProductionConfig(config), null, 2)}\n`, "utf8");
console.log(JSON.stringify({ generatedConfigPath: prepared.generatedConfigPath, workerName: PRODUCTION_WORKER_NAME }));
