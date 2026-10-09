import { assertProductionSmokeResponse } from "./cloudflare-production-contract";

const sha = process.env.EXPECTED_BUILD_SHA ?? "";
if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("PRODUCTION_CUTOVER_HOLD: full expected SHA required");

// Custom-domain DNS/TLS activation can lag behind the Worker deployment.
// One shared ten-minute deadline covers all three checks and request timeouts.
const RETRY_INTERVAL_MS = 15_000;
const deadline = Date.now() + 10 * 60_000;
let lastFailure = "production deployment did not become ready";
let verified = false;

while (Date.now() < deadline) {
  try {
    for (const path of ["/version.json", "/", "/portal-login"]) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("verification deadline exceeded");
      const response = await fetch(`https://quboolye.com${path}`, {
        method: "GET",
        redirect: "manual",
        headers: { "cache-control": "no-cache" },
        signal: AbortSignal.timeout(Math.min(15_000, remaining)),
      });
      assertProductionSmokeResponse(path, response.status, await response.text(), sha);
    }
    if (Date.now() > deadline) throw new Error("verification deadline exceeded");
    verified = true;
    break;
  } catch (error) {
    lastFailure = String(error);
    const remaining = deadline - Date.now();
    if (remaining > 0) await Bun.sleep(Math.min(RETRY_INTERVAL_MS, remaining));
  }
}

if (!verified) {
  throw new Error(`PRODUCTION_CUTOVER_HOLD: verification failed within ten minutes: ${lastFailure}`);
}
console.log(JSON.stringify({ decision: "PASS_PRODUCTION_CUTOVER", sha, origin: "https://quboolye.com" }));
