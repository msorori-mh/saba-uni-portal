import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const canonical = new Map([
  [
    "STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql",
    "0627b142b10307e72ba0c9ffd09dc4db5c02059791273f101b71463704e4f6c0",
  ],
]);

describe("applied migration source immutability", () => {
  for (const [name, expected] of canonical) {
    it(`pins ${name}`, () => {
      const bytes = readFileSync(
        join(process.cwd(), "docs", "migration-drafts", name),
        "utf8",
      ).replace(/\r\n/g, "\n");
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(expected);
    });
  }
});
