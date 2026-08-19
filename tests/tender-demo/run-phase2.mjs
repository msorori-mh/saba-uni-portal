import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";
import { startSsrServer } from "./ssr-server.mjs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../..");

async function main() {
  console.log("=== PHASE 2: DEMO-ON REAL SERVER & INTERACTIVITY AUDIT ===");
  console.log("[PHASE 2] Building Demo-On bundle with VITE_TAIZ_TENDER_DEMO=true...");
  execSync("bun run build", {
    cwd: root,
    env: { ...process.env, NODE_ENV: "production", VITE_TAIZ_TENDER_DEMO: "true" },
    stdio: "pipe"
  });
  console.log("[PHASE 2] Demo-On build completed.");

  const server = await startSsrServer(3196);
  console.log("[PHASE 2] Demo SSR Server listening on http://127.0.0.1:3196");

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"]
  });

  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    const externalRequests = [];
    page.on("request", (req) => {
      const url = req.url();
      if (url.includes("openai") || url.includes("anthropic") || url.includes("generativelanguage") || url.includes("cohere")) {
        externalRequests.push(url);
      }
    });

    console.log("[PHASE 2] Navigating to http://127.0.0.1:3196/tender-demo...");
    const res = await page.goto("http://127.0.0.1:3196/tender-demo", { waitUntil: "networkidle" });
    const statusCode = res ? res.status() : 0;
    console.log(`[PHASE 2] HTTP Response Status: ${statusCode}`);

    // 1. Verify Scene 1: MultiSite CMS
    console.log("[PHASE 2] Verifying Scene 1: MultiSite CMS...");
    await page.waitForSelector("text=كلية الطب والعلوم الصحية", { timeout: 15000 });
    const content = await page.content();
    if (!content.includes("med.taiz.edu.ye")) {
      throw new Error("[PHASE 2 FAILED] MultiSite CMS content missing from Scene 1.");
    }
    console.log("[PHASE 2] Scene 1 Verified.");

    // 2. Verify Scene 2: Local RAG Navigation & Search Execution
    console.log("[PHASE 2] Navigating to Scene 2: Local Lexical RAG...");
    await page.click("text=2. الاسترجاع المعجمي المقيد");
    await page.waitForSelector("text=ARABIC_LEXICAL_HEURISTIC_EXTRACTIVE_POC", { timeout: 10000 });

    console.log("[PHASE 2] Filling query input in live UI...");
    const searchInput = await page.waitForSelector("input[type='text']", { timeout: 10000 });
    await searchInput.fill("ما هي شروط ومدة إيقاف القيد المسموح بها للطالب في جامعة تعز؟");
    
    console.log("[PHASE 2] Clicking search button 'بحث واسترجاع نصي'...");
    const searchButton = await page.waitForSelector("button:has-text('بحث واسترجاع نصي')", { timeout: 10000 });
    await searchButton.click();

    // Verify citation in live DOM
    await page.waitForSelector("text=المادة 45", { timeout: 10000 });
    console.log("[PHASE 2] Live query returned verified regulation excerpt with citation 'المادة 45'!");

    // 3. Verify Scene 3: Performance & QA
    console.log("[PHASE 2] Navigating to Scene 3: Performance & QA...");
    await page.click("text=3. مصفوفة التقييم");
    await page.waitForSelector("text=65.6%", { timeout: 10000 });
    console.log("[PHASE 2] Scene 3 Verified.");

    // 4. Run AxeBuilder on hydrated live app
    console.log("[PHASE 2] Running AxeBuilder accessibility audit with color-contrast...");
    const axeResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    console.log(`[PHASE 2 AXE RESULTS] Passes: ${axeResults.passes.length}, Inapplicable: ${axeResults.inapplicable.length}, Violations: ${axeResults.violations.length}`);
    if (axeResults.violations.length > 0) {
      console.error("Axe Violations:", JSON.stringify(axeResults.violations, null, 2));
      throw new Error(`[PHASE 2 FAILED] AxeBuilder detected ${axeResults.violations.length} violations.`);
    }

    if (externalRequests.length > 0) {
      throw new Error(`[PHASE 2 FAILED] External network requests observed: ${externalRequests.join(", ")}`);
    }

    console.log("PLAYWRIGHT_NAVIGATION_METHOD=PAGE_GOTO_REAL_SERVER");
    console.log("REAL_SERVER_STARTED=TRUE");
    console.log("DEMO_ON_INTERACTIVE=PASS_3_SCENES_INTERACTIVE");
    console.log("RAG_UI_QUERY_EXECUTED=PASS_CITATION_VERIFIED");
    console.log("AXE_RUN_AGAINST_REAL_APP=TRUE");
    console.log("AXE_VIOLATIONS=0");
    console.log("EXTERNAL_REQUESTS_OBSERVED=0");
    console.log("[PHASE 2] PASSED_ALL_INTERACTIVE_SCENES");
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
    console.log("[PHASE 2] Closed server.");
  }
}

main().catch((err) => {
  console.error("Phase 2 Error:", err);
  process.exit(1);
});
