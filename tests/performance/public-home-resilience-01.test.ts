import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync("src/routes/index.tsx", "utf8");

describe("PERFORMANCE_RECOVERY_01 public home contract", () => {
  it("does not suspend or block its route loader on public Supabase reads", () => {
    expect(source).not.toContain("useSuspenseQuery");
    expect(source).not.toContain("ensureQueryData(");
    expect(source).not.toMatch(/loader\s*:\s*/);
  });

  it("keeps safe render defaults for every dynamic home section", () => {
    expect(source).toContain("data: programs = []");
    expect(source).toContain("programs: 4, faculty: 0, research: 0, news: 0");
    expect(source).toContain("data: settings = {}");
    expect(source).toContain("data: news = []");
    expect(source).toContain("data: events = []");
  });
});
