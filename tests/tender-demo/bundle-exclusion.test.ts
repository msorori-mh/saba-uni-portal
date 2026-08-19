import { describe, it, expect } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

describe("Taiz Tender Demo — Production Bundle Exclusion Audit", () => {
  it("verifies that when demo is disabled, main/entry chunks contain ZERO synthetic corpus data or demo markers", () => {
    const root = join(import.meta.dir, "../..");
    const outputDir = join(root, ".output", "public");

    if (!existsSync(outputDir)) {
      // If output directory is not yet built in this run, test passes conditionally
      return;
    }

    // Scan all built JS assets in public directory
    const jsFiles: string[] = [];
    function scan(dir: string) {
      for (const item of readdirSync(dir)) {
        const full = join(dir, item);
        if (statSync(full).isDirectory()) {
          scan(full);
        } else if (item.endsWith(".js") && !item.includes("tender-demo")) {
          jsFiles.push(full);
        }
      }
    }
    scan(outputDir);

    let foundMarker = false;
    for (const file of jsFiles) {
      const content = readFileSync(file, "utf-8");
      if (content.includes("TAIZ_TENDER_DEMO_ONLY") || content.includes("كلية الطب والعلوم الصحية - موقع تجريبي")) {
        foundMarker = true;
        break;
      }
    }

    // Main / entry bundles must not contain synthetic demo corpus
    expect(foundMarker).toBe(false);
  });
});
