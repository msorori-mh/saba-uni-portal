import { describe, expect, it } from "bun:test";
import { filterActiveCurrentTermSections } from "../../src/lib/current-term";

const term = {
  year: { id: "year-1", name: "2026/2027" },
  semester: { id: "semester-1", name: "First", academic_year_id: "year-1" },
};

function row(
  id: string,
  values: Partial<{
    sectionStatus: string;
    offeringStatus: string;
    yearId: string;
    semesterId: string;
  }> = {},
) {
  return {
    id,
    section: {
      status: values.sectionStatus ?? "active",
      offering: {
        status: values.offeringStatus ?? "active",
        academic_year_id: values.yearId ?? "year-1",
        semester_id: values.semesterId ?? "semester-1",
      },
    },
  };
}

describe("current-term schedule filters", () => {
  it("keeps only active sections and offerings matching both current-term identifiers", () => {
    const rows = [
      row("matching"),
      row("inactive-section", { sectionStatus: "inactive" }),
      row("inactive-offering", { offeringStatus: "inactive" }),
      row("old-year", { yearId: "year-0" }),
      row("old-semester", { semesterId: "semester-0" }),
    ];

    expect(filterActiveCurrentTermSections(rows, term).map((item) => item.id)).toEqual([
      "matching",
    ]);
  });

  it("fails closed when the canonical current term is unavailable", () => {
    expect(filterActiveCurrentTermSections([row("matching")], null)).toEqual([]);
  });

  it("returns an empty result when a valid term has no active matching rows", () => {
    expect(
      filterActiveCurrentTermSections(
        [row("inactive", { sectionStatus: "inactive" }), row("historical", { yearId: "year-0" })],
        term,
      ),
    ).toEqual([]);
  });
});
