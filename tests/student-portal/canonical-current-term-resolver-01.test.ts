import { describe, expect, it } from "bun:test";
import {
  fetchCanonicalCurrentTerm,
  resolveCanonicalCurrentTerm,
} from "../../src/lib/current-term";

describe("canonical current-term resolver", () => {
  it("returns the only current semester when it belongs to the only current year", () => {
    expect(
      resolveCanonicalCurrentTerm(
        [{ id: "year-1", name: "2026/2027" }],
        [{ id: "semester-1", name: "First", academic_year_id: "year-1" }],
      ),
    ).toEqual({
      year: { id: "year-1", name: "2026/2027" },
      semester: { id: "semester-1", name: "First", academic_year_id: "year-1" },
    });
  });

  it.each([
    [[], []],
    [[{ id: "year-1", name: "2026/2027" }], []],
    [
      [{ id: "year-1", name: "2026/2027" }],
      [{ id: "semester-1", name: "First", academic_year_id: "year-2" }],
    ],
    [
      [
        { id: "year-1", name: "2026/2027" },
        { id: "year-2", name: "2027/2028" },
      ],
      [{ id: "semester-1", name: "First", academic_year_id: "year-1" }],
    ],
  ])("fails closed for missing, ambiguous, or mismatched current-term rows", (years, semesters) => {
    expect(resolveCanonicalCurrentTerm(years, semesters)).toBeNull();
  });

  it("queries at most two current rows and rejects read errors", async () => {
    const calls: string[] = [];
    const client = {
      from(table: string) {
        return {
          select(columns: string) {
            calls.push(`${table}:${columns}`);
            return {
              eq(column: string, value: boolean) {
                calls.push(`${column}:${value}`);
                return {
                  async limit(count: number) {
                    calls.push(`limit:${count}`);
                    if (table === "academic_years") {
                      return { data: null, error: { message: "year read failed" } };
                    }
                    return { data: [], error: null };
                  },
                };
              },
            };
          },
        };
      },
    };

    await expect(fetchCanonicalCurrentTerm(client)).rejects.toThrow("year read failed");
    expect(calls).toContain("limit:2");
  });
});
