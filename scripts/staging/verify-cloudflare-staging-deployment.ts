import {
  assertCloudflareStagingUrl,
  assertVersionPayload,
  normalizeFullSha,
} from "./cloudflare-staging-contract";

const deploymentUrl = assertCloudflareStagingUrl(process.env.STAGING_DEPLOYMENT_URL ?? "");
const expectedSha = normalizeFullSha(process.env.EXPECTED_BUILD_SHA ?? "");
const versionUrl = new URL("/version.json", deploymentUrl);

async function fetchWithTimeout(url: URL, accept: string): Promise<Response> {
  return fetch(url, {
    headers: { accept, "cache-control": "no-cache" },
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
}

async function waitForVersion(): Promise<void> {
  let lastFailure = "deployment did not become ready";

  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      const response = await fetchWithTimeout(versionUrl, "application/json");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      assertVersionPayload(payload, expectedSha);
      return;
    } catch (error) {
      lastFailure = String(error);
      if (attempt < 12) await Bun.sleep(5_000);
    }
  }

  throw new Error(`STAGING_DEPLOYMENT_HOLD: version verification failed: ${lastFailure}`);
}

await waitForVersion();

const rootResponse = await fetchWithTimeout(deploymentUrl, "text/html");
if (!rootResponse.ok) {
  throw new Error(`STAGING_DEPLOYMENT_HOLD: public root returned HTTP ${rootResponse.status}`);
}
const html = await rootResponse.text();
const escapedSha = expectedSha.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const shaMetaPattern = new RegExp(
  `<meta\\s+[^>]*(?:name=["']build-sha["'][^>]*content=["']${escapedSha}["']|content=["']${escapedSha}["'][^>]*name=["']build-sha["'])[^>]*>`,
  "i",
);
if (!shaMetaPattern.test(html)) {
  throw new Error("STAGING_DEPLOYMENT_HOLD: root HTML does not expose the exact build-sha meta");
}

console.log(
  JSON.stringify({
    decision: "PASS_04D_PUBLIC_SMOKE",
    sha: expectedSha,
    url: deploymentUrl.origin,
  }),
);
