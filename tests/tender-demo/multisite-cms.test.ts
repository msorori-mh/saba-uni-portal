import { describe, it, expect } from "bun:test";
import { TAIZ_COLLEGES } from "@/lib/tender-demo/synthetic-data";

describe("Taiz Tender Demo — Multi-Site CMS Demonstrator", () => {
  it("manages exactly 25 distinct college & center subdomains", () => {
    expect(TAIZ_COLLEGES.length).toBe(25);
    const subdomains = TAIZ_COLLEGES.map(c => c.subdomain);
    const uniqueSubdomains = new Set(subdomains);
    expect(uniqueSubdomains.size).toBe(25);
    expect(subdomains).toContain("med.taiz.edu.ye");
    expect(subdomains).toContain("eng.taiz.edu.ye");
    expect(subdomains).toContain("sci.taiz.edu.ye");
  });

  it("provides unique code and theme configuration for every college", () => {
    const codes = new Set(TAIZ_COLLEGES.map(c => c.code));
    expect(codes.size).toBe(25);
    TAIZ_COLLEGES.forEach(c => {
      expect(c.themeColor).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(c.establishedYear).toBeGreaterThanOrEqual(1985);
    });
  });
});
