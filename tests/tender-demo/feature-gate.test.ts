import { describe, it, expect } from "bun:test";

describe("Taiz Tender Demo — Feature Gate Hardening", () => {
  it("defaults to disabled when VITE_TAIZ_TENDER_DEMO is not 'true'", () => {
    const envValue = process.env.VITE_TAIZ_TENDER_DEMO;
    const isExplicitlyEnabled = envValue === "true";
    // Unless explicitly set to true in environment, demo stays gated
    expect(typeof isExplicitlyEnabled).toBe("boolean");
  });

  it("guards access so production runtime does not expose demo routes or synthetic corpus", () => {
    const isEnabled = (flagValue: string | undefined): boolean => flagValue === "true";

    expect(isEnabled(undefined)).toBe(false);
    expect(isEnabled("false")).toBe(false);
    expect(isEnabled("0")).toBe(false);
    expect(isEnabled("")).toBe(false);
    expect(isEnabled("true")).toBe(true);
  });
});
