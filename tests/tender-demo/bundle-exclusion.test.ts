import { describe, it, expect } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

describe("Taiz Tender Demo — Fresh Production Bundle Exclusion & Corpus Audit (05F)", () => {
  it("executes a fresh build with Demo-Off and verifies ZERO demo markers or corpus texts across ALL output JS files", () => {
    const root = join(import.meta.dir, "../..");
    const outputDir = join(root, ".output");

    // 1. Delete previous build output to guarantee fresh evaluation
    if (existsSync(outputDir)) {
      rmSync(outputDir, { recursive: true, force: true });
    }

    // 2. Execute fresh production build with Demo-Off
    console.log("[BUNDLE AUDIT 05F] Executing fresh production Demo-Off build...");
    execSync("bun run build", {
      cwd: root,
      env: { ...process.env, NODE_ENV: "production", VITE_TAIZ_TENDER_DEMO: "false" },
      stdio: "pipe"
    });

    // 3. Force directory existence check (Fail-closed: NO conditional skip, BUNDLE_SCAN_SKIPPABLE=FALSE)
    if (!existsSync(outputDir)) {
      throw new Error(`[FAIL CLOSED] Output directory does not exist at ${outputDir}. Fresh build failed to produce output.`);
    }

    // 4. Scan ALL .js and .mjs files without excluding ANY file
    const jsFiles: string[] = [];
    function scan(dir: string) {
      for (const item of readdirSync(dir)) {
        const full = join(dir, item);
        if (statSync(full).isDirectory()) {
          scan(full);
        } else if (item.endsWith(".js") || item.endsWith(".mjs")) {
          jsFiles.push(full);
        }
      }
    }
    scan(outputDir);

    expect(jsFiles.length).toBeGreaterThan(0);

    const searchMarkers = [
      "TAIZ_TENDER_DEMO_ONLY",
      "ARABIC_LEXICAL_HEURISTIC_EXTRACTIVE_POC",
      "كلية الطب والعلوم الصحية - موقع تجريبي",
      "جامعة تعز - شروط التظلم من نتائج الامتحانات",
      "doc-reg-01",
      "MultiSiteCMSScene",
      "PerformanceQAScene"
    ];

    const matchingFiles: { marker: string; file: string }[] = [];

    for (const file of jsFiles) {
      const content = readFileSync(file, "utf-8");
      for (const marker of searchMarkers) {
        if (content.includes(marker)) {
          matchingFiles.push({ marker, file: file.replace(root, "") });
        }
      }
    }

    console.log(`[BUNDLE AUDIT 05F] Fresh build complete. Scanned ${jsFiles.length} JS/MJS files. Excluded files: 0. Matches: ${matchingFiles.length}`);

    // Assert zero matches across all scanned bundle files
    expect(matchingFiles.length).toBe(0);
  }, 180000);
});
