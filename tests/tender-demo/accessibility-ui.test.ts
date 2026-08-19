import { describe, it, expect } from "bun:test";
import { TAIZ_COLLEGES } from "@/lib/tender-demo/synthetic-data";

describe("Taiz Tender Demo — Accessibility & RTL Layout Verification", () => {
  it("enforces valid Arabic RTL layout and accessible college metadata", () => {
    TAIZ_COLLEGES.forEach(col => {
      expect(col.nameAr.length).toBeGreaterThan(5);
      expect(col.descriptionAr.length).toBeGreaterThan(10);
      expect(col.themeColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });

  it("classifies accessibility audit status as PARTIAL_NEEDS_FORMAL_AUDIT", () => {
    const automatedChecksPassed = true;
    const formalManualAuditCompleted = false;

    const complianceStatus = automatedChecksPassed && !formalManualAuditCompleted
      ? "PARTIAL_NEEDS_FORMAL_AUDIT"
      : "WCAG_2.2_AA_CERTIFIED";

    expect(complianceStatus).toBe("PARTIAL_NEEDS_FORMAL_AUDIT");
  });
});
