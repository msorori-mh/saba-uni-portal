import { describe, it, expect } from "bun:test";
import { execSync } from "node:child_process";
import { join } from "node:path";

describe("Taiz Tender Demo — Real Playwright E2E & Browser Hydration Audit", () => {
  it("executes real Playwright Chromium browser and AxeBuilder with color-contrast via Node runner", () => {
    const runnerPath = join(import.meta.dir, "playwright-runner.mjs");
    const output = execSync(`node "${runnerPath}"`, { encoding: "utf-8" });

    console.log(output);
    expect(output).toContain("State A Passed: 404 security view rendered cleanly with zero corpus exposure.");
    expect(output).toContain("State B Passed: All 3 scenes interactive, AxeBuilder verified 0 violations!");
    expect(output).toContain("PLAYWRIGHT_E2E_STATE_A_DISABLED=PASS_404_SECURE_VIEW");
    expect(output).toContain("PLAYWRIGHT_E2E_STATE_B_ENABLED=PASS_3_SCENES_INTERACTIVE");
    expect(output).toContain("PLAYWRIGHT_AXE_VIOLATIONS=0");
  });
});
