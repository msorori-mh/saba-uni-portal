import {
  STAGING_SUPABASE_URL,
  assertStagingBuildInputs,
  prepareCloudflareStagingBundle,
} from "./cloudflare-staging-contract";

const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

assertStagingBuildInputs(
  process.env.VITE_SUPABASE_URL ?? STAGING_SUPABASE_URL,
  publishableKey === "" ? undefined : publishableKey,
);

if (process.env.REQUIRE_STAGING_PUBLISHABLE_KEY === "1" && !publishableKey) {
  throw new Error(
    "STAGING_DEPLOYMENT_HOLD: STAGING_SUPABASE_PUBLISHABLE_KEY is required for apply",
  );
}

const prepared = prepareCloudflareStagingBundle(process.cwd());
console.log(
  JSON.stringify({
    assetsDirectory: prepared.assetsDirectory,
    generatedConfigPath: prepared.generatedConfigPath,
    mainPath: prepared.mainPath,
    workerName: prepared.workerName,
  }),
);
