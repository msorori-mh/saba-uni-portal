import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  console.log("===============================================================");
  console.log("PLAYWRIGHT REAL E2E SUITE — TWO PHASE EXECUTION (05F)");
  console.log("===============================================================");

  // 1. Run Phase 1 (Demo-Off)
  const p1Path = path.join(__dirname, "run-phase1.mjs");
  const p1Out = execSync(`node "${p1Path}"`, { encoding: "utf-8", timeout: 180000 });
  console.log(p1Out);

  // 2. Run Phase 2 (Demo-On)
  const p2Path = path.join(__dirname, "run-phase2.mjs");
  const p2Out = execSync(`node "${p2Path}"`, { encoding: "utf-8", timeout: 180000 });
  console.log(p2Out);

  console.log("===============================================================");
  console.log("PLAYWRIGHT REAL SERVER E2E COMPLETED SUCCESSFULLY!");
  console.log("===============================================================");
}

run().catch((err) => {
  console.error("Playwright Suite Error:", err);
  process.exit(1);
});
