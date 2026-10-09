import { assertProductionSmokeResponse } from "./cloudflare-production-contract";

const sha = process.env.EXPECTED_BUILD_SHA ?? "";
if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("PRODUCTION_CUTOVER_HOLD: full expected SHA required");
for (const path of ["/version.json", "/", "/portal-login"]) {
  const response = await fetch(`https://quboolye.com${path}`, {
    method: "GET",
    redirect: "manual",
    headers: { "cache-control": "no-cache" },
    signal: AbortSignal.timeout(15_000),
  });
  assertProductionSmokeResponse(path, response.status, await response.text(), sha);
}
console.log(JSON.stringify({ decision: "PASS_PRODUCTION_CUTOVER", sha, origin: "https://quboolye.com" }));
