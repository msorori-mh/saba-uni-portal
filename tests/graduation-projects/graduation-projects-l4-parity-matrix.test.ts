import { describe, expect, it } from "bun:test";
import {
  isCurrentFourthAcademicLevel,
  resolveCanonicalCurrentFourthLevelEligibility,
  shouldShowStudentGpNav,
} from "@/lib/graduation-projects/eligibility";

describe("GP student Level-4 eligibility parity matrix", () => {
  it("denies levels 1-3 and allows only level 4", () => {
    expect(isCurrentFourthAcademicLevel(1)).toBe(false);
    expect(isCurrentFourthAcademicLevel(2)).toBe(false);
    expect(isCurrentFourthAcademicLevel(3)).toBe(false);
    expect(isCurrentFourthAcademicLevel(4)).toBe(true);
    expect(isCurrentFourthAcademicLevel(null)).toBe(false);
    expect(isCurrentFourthAcademicLevel(undefined)).toBe(false);
  });

  it("denies ambiguous current academic rows", () => {
    const stamp = "2026-08-01T10:00:00Z";
    const resolved = resolveCanonicalCurrentFourthLevelEligibility([
      { id: "a", updated_at: stamp, created_at: stamp, level: { level_number: 4 } },
      { id: "b", updated_at: stamp, created_at: stamp, level: { level_number: 4 } },
    ]);
    expect(resolved.eligible).toBe(false);
    expect(resolved.ambiguous).toBe(true);
    expect(shouldShowStudentGpNav(resolved.eligible)).toBe(false);
  });

  it("denies duplicate-top conflicting levels", () => {
    const stamp = "2026-08-01T10:00:00Z";
    const resolved = resolveCanonicalCurrentFourthLevelEligibility([
      { id: "a", updated_at: stamp, created_at: stamp, level: { level_number: 4 } },
      { id: "b", updated_at: stamp, created_at: stamp, level: { level_number: 3 } },
    ]);
    expect(resolved.eligible).toBe(false);
    expect(resolved.ambiguous).toBe(true);
  });

  it("allows unique current L4 and mirrors nav/route gate", () => {
    const resolved = resolveCanonicalCurrentFourthLevelEligibility([
      {
        id: "current",
        updated_at: "2026-08-10T12:00:00Z",
        created_at: "2026-01-01T00:00:00Z",
        level: { level_number: 4 },
      },
      {
        id: "older",
        updated_at: "2025-01-01T00:00:00Z",
        created_at: "2025-01-01T00:00:00Z",
        level: { level_number: 3 },
      },
    ]);
    expect(resolved.eligible).toBe(true);
    expect(resolved.levelNumber).toBe(4);
    expect(shouldShowStudentGpNav(resolved.eligible)).toBe(true);
  });
});
