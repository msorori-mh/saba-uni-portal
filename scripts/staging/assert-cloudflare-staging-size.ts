import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  STAGING_WORKER_MAX_GZIP_KIB,
  assertCloudflareWorkerGzipSize,
} from "./cloudflare-staging-contract";

const logPath = process.argv[2];
if (!logPath) {
  throw new Error("Usage: assert-cloudflare-staging-size.ts <wrangler-dry-run.log>");
}

const gzipKiB = assertCloudflareWorkerGzipSize(readFileSync(resolve(logPath), "utf8"));
console.log(
  JSON.stringify({
    gzipKiB,
    maxGzipKiB: STAGING_WORKER_MAX_GZIP_KIB,
    status: "PASS_CLOUDFLARE_STAGING_SIZE_GATE",
  }),
);
