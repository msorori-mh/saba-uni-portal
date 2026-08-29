import {
  PRODUCTION_ORIGIN,
  PRODUCTION_WWW_ORIGIN,
  assertCanonicalProductionOrigin,
  assertNoStoreHeader,
  assertProductionBuildShaMeta,
  assertProductionVersionPayload,
  normalizeProductionReleaseSha,
} from "./production-release-contract";

const productionUrl = assertCanonicalProductionOrigin(
  process.env.PRODUCTION_DEPLOYMENT_URL ?? PRODUCTION_ORIGIN,
);
const expectedSha = normalizeProductionReleaseSha(
  process.env.EXPECTED_BUILD_SHA ?? process.argv[2] ?? "",
);

async function readOnlyFetch(url: URL, accept: string): Promise<Response> {
  return fetch(url, {
    headers: { accept, "cache-control": "no-cache" },
    method: "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
}

const versionResponse = await readOnlyFetch(
  new URL("/version.json", productionUrl),
  "application/json",
);
if (!versionResponse.ok) {
  throw new Error(
    `PRODUCTION_RELEASE_GATE_REQUIRED: /version.json returned HTTP ${versionResponse.status}`,
  );
}
assertNoStoreHeader(versionResponse.headers.get("cache-control"));
assertProductionVersionPayload(await versionResponse.json(), expectedSha);

const rootResponse = await readOnlyFetch(productionUrl, "text/html");
if (!rootResponse.ok) {
  throw new Error(
    `PRODUCTION_RELEASE_GATE_REQUIRED: production root returned HTTP ${rootResponse.status}`,
  );
}
assertProductionBuildShaMeta(await rootResponse.text(), expectedSha);

const wwwResponse = await readOnlyFetch(new URL(PRODUCTION_WWW_ORIGIN), "text/html");
if (wwwResponse.status >= 300 && wwwResponse.status < 400) {
  const location = wwwResponse.headers.get("location");
  const redirectUrl = location === null ? null : new URL(location, PRODUCTION_WWW_ORIGIN);
  if (
    redirectUrl === null ||
    redirectUrl.origin !== PRODUCTION_ORIGIN ||
    redirectUrl.pathname !== "/" ||
    redirectUrl.search !== "" ||
    redirectUrl.hash !== ""
  ) {
    throw new Error(
      "PRODUCTION_RELEASE_GATE_REQUIRED: www host does not redirect to the canonical production root",
    );
  }
} else if (wwwResponse.ok) {
  assertProductionBuildShaMeta(await wwwResponse.text(), expectedSha);
} else {
  throw new Error(
    `PRODUCTION_RELEASE_GATE_REQUIRED: www production host returned HTTP ${wwwResponse.status}`,
  );
}

console.log(
  JSON.stringify({
    decision: "PASS_04F_PRODUCTION_READBACK",
    origin: productionUrl.origin,
    sha: expectedSha,
    wwwStatus: wwwResponse.status,
  }),
);
