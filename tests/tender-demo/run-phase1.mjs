import { chromium } from "playwright";
import { startSsrServer } from "./ssr-server.mjs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../..");

async function main() {
  console.log("=== PHASE 1: DEMO-OFF REAL SERVER AUDIT ===");
  console.log("[PHASE 1] Executing fresh Demo-Off build (VITE_TAIZ_TENDER_DEMO=false)...");
  execSync("bun run build", {
    cwd: root,
    env: { ...process.env, NODE_ENV: "production", VITE_TAIZ_TENDER_DEMO: "false" },
    stdio: "pipe"
  });
  console.log("[PHASE 1] Demo-Off build completed.");

  const server = await startSsrServer(3195);
  console.log("[PHASE 1] Production SSR Server listening on http://127.0.0.1:3195");

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"]
  });

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    const externalRequests = [];
    page.on("request", (req) => {
      const url = req.url();
      if (url.includes("openai") || url.includes("anthropic") || url.includes("generativelanguage") || url.includes("cohere")) {
        externalRequests.push(url);
      }
    });

    console.log("[PHASE 1] Navigating to http://127.0.0.1:3195/tender-demo...");
    const res = await page.goto("http://127.0.0.1:3195/tender-demo", { waitUntil: "networkidle" });
    const statusCode = res ? res.status() : 0;
    console.log(`[PHASE 1] HTTP Response Status: ${statusCode}`);

    const content = await page.content();
    const hasNotAvailable = content.includes("404") && content.includes("الصفحة غير متوفرة");
    const hasCorpus = content.includes("TAIZ_TENDER_DEMO_ONLY") || content.includes("doc-reg-01");

    if (!hasNotAvailable) {
      throw new Error("[PHASE 1 FAILED] Expected SECURE_NOT_AVAILABLE_VIEW but view text was missing.");
    }
    if (hasCorpus) {
      throw new Error("[PHASE 1 FAILED] Security leak: Corpus found in Demo-Off view!");
    }
    if (externalRequests.length > 0) {
      throw new Error(`[PHASE 1 FAILED] External network requests observed: ${externalRequests.join(", ")}`);
    }

    console.log(`DEMO_OFF_HTTP_STATUS=${statusCode}`);
    console.log(`DEMO_OFF_VIEW=SECURE_NOT_AVAILABLE_VIEW`);
    console.log(`DEMO_OFF_CORPUS_EXPOSURE=NONE`);
    console.log(`DEMO_OFF_EXTERNAL_REQUESTS=0`);
    console.log("[PHASE 1] PASSED_SECURE_NOT_AVAILABLE_VIEW");
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
    console.log("[PHASE 1] Closed server.");
  }
}

main().catch((err) => {
  console.error("Phase 1 Error:", err);
  process.exit(1);
});
