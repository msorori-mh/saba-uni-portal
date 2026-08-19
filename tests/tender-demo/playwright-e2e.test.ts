import { describe, it, expect } from "bun:test";
import { execSync } from "node:child_process";
import { join } from "node:path";

describe("Taiz Tender Demo — Real Playwright E2E & Live Server Browser Audit (05F)", () => {
  it("executes real Playwright Chromium browser against live Demo-Off and Demo-On servers with live query and axe scan", () => {
    const runnerPath = join(import.meta.dir, "playwright-runner.mjs");
    const output = execSync(`node "${runnerPath}"`, { encoding: "utf-8", timeout: 300000 });

    console.log(output);
    expect(output).toContain("DEMO_OFF_VIEW=SECURE_NOT_AVAILABLE_VIEW");
    expect(output).toContain("DEMO_ON_INTERACTIVE=PASS_3_SCENES_INTERACTIVE");
    expect(output).toContain("RAG_UI_QUERY_EXECUTED=PASS_CITATION_VERIFIED");
    expect(output).toContain("AXE_RUN_AGAINST_REAL_APP=TRUE");
    expect(output).toContain("AXE_VIOLATIONS=0");
    expect(output).toContain("EXTERNAL_REQUESTS_OBSERVED=0");
    expect(output).toContain("PLAYWRIGHT REAL SERVER E2E COMPLETED SUCCESSFULLY!");
  }, 300000);
});
