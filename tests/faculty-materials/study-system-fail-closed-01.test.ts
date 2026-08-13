import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  deriveMaterialRow,
  deriveMaterialStudySystem,
  MATERIAL_DERIVATION_MESSAGES,
} from "@/lib/course-materials-scope";
import type { MaterialPlanSessionOption } from "@/lib/course-materials.shared";

const SECTION = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";

const sessions: MaterialPlanSessionOption[] = [
  {
    plan_session_id: SESSION,
    session_number: 3,
    week_number: 2,
    planned_title: "مقدمة في قواعد البيانات",
    planned_topics: "الجداول والعلاقات",
  },
];

const base = {
  scope: "lecture" as const,
  sectionId: SECTION,
  planSessionId: SESSION,
  currentPlanSessions: sessions,
};

describe("study system — fail closed on unclassified section", () => {
  it("does NOT infer 'both' from NULL / blank / unknown", () => {
    expect(deriveMaterialStudySystem(null)).toBeNull();
    expect(deriveMaterialStudySystem(undefined)).toBeNull();
    expect(deriveMaterialStudySystem("")).toBeNull();
    expect(deriveMaterialStudySystem("   ")).toBeNull();
    expect(deriveMaterialStudySystem("mystery")).toBeNull();
  });

  it("denies new material creation on an unclassified section", () => {
    const res = deriveMaterialRow({ ...base, sectionStudySystem: null });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("UNKNOWN_SECTION_STUDY_SYSTEM");
      expect(MATERIAL_DERIVATION_MESSAGES[res.reason]).toContain("نظام الدراسة للمجموعة غير محدد");
    }
  });

  it("maps section value 1:1 — general/private/both (and legacy read compatibility)", () => {
    for (const [section, expected] of [
      ["general", "general"],
      ["private", "private"],
      ["both", "both"],
      ["regular", "general"],
      ["parallel", "private"],
    ] as const) {
      const res = deriveMaterialRow({ ...base, sectionStudySystem: section });
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.value.study_system).toBe(expected);
    }
  });

  it("derives lecture metadata from the current plan session, never from the client", () => {
    const res = deriveMaterialRow({ ...base, sectionStudySystem: "private", title: "عنوان مزيف" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.title).toBe("مقدمة في قواعد البيانات");
      expect(res.value.lecture_number).toBe(3);
      expect(res.value.week_number).toBe(2);
      expect(res.value.plan_session_id).toBe(SESSION);
      expect(res.value.material_scope).toBe("lecture");
    }
  });

  it("denies a stale/foreign plan session", () => {
    const res = deriveMaterialRow({
      ...base,
      planSessionId: "33333333-3333-4333-8333-333333333333",
      sectionStudySystem: "general",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("PLAN_SESSION_NOT_IN_CURRENT_PLAN");
  });

  it("general scope still fails closed before title validation", () => {
    const res = deriveMaterialRow({
      scope: "general",
      sectionId: SECTION,
      title: "مرجع عام",
      currentPlanSessions: sessions,
      sectionStudySystem: "",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("UNKNOWN_SECTION_STUDY_SYSTEM");
  });
});

describe("migration draft — trigger fails closed too", () => {
  const sql = readFileSync(
    join(process.cwd(), "docs/migration-drafts/COURSE-MATERIALS-STUDY-SYSTEM-CANONICALIZATION-01.sql"),
    "utf8",
  );

  it("no COALESCE(..., 'both') fallback remains", () => {
    expect(sql).not.toContain("COALESCE(v_section_system, 'both')");
  });

  it("raises UNKNOWN_SECTION_STUDY_SYSTEM for NULL/blank/unknown sections", () => {
    expect(sql).toContain("UNKNOWN_SECTION_STUDY_SYSTEM");
    expect(sql).toContain("v_section_system IS NULL");
  });

  it("does not rewrite historical material rows", () => {
    expect(sql).not.toMatch(/UPDATE\s+public\.course_materials/i);
  });
});
