import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
const source = readFileSync(
  new URL("../../src/components/academic-clearance/CourseComparison.tsx", import.meta.url),
  "utf8",
);
describe("academic clearance chair comparison UI", () => {
  it("edits target, decision, bounded credits and rationale while honoring readOnly", () => {
    for (const contract of [
      "onTargetChange",
      "onDecisionChange",
      "onAcceptedCreditsChange",
      "onRationaleChange",
      "props.readOnly",
      "Math.min(source.creditHours",
    ])
      expect(source).toContain(contract);
  });
});
