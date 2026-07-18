import { describe, expect, it } from "bun:test";
import {
  fetchCanonicalCurrentTerm,
  resolveCanonicalCurrentTerm,
} from "../../src/lib/current-term";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type MockResult = { data: unknown[] | null; error: { message?: string } | null };

function currentTermClient(results: Record<string, MockResult>, calls: string[] = []) {
  return {
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
                  return results[table] ?? { data: [], error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

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
    [
      [{ id: "year-1", name: "2026/2027" }],
      [
        { id: "semester-1", name: "First", academic_year_id: "year-1" },
        { id: "semester-2", name: "Second", academic_year_id: "year-1" },
      ],
    ],
  ])("fails closed for missing, ambiguous, or mismatched current-term rows", (years, semesters) => {
    expect(resolveCanonicalCurrentTerm(years, semesters)).toBeNull();
  });

  it("queries at most two current rows and rejects read errors", async () => {
    const calls: string[] = [];
    const client = currentTermClient(
      {
        academic_years: { data: null, error: { message: "year read failed" } },
        semesters: { data: [], error: null },
      },
      calls,
    );

    await expect(fetchCanonicalCurrentTerm(client)).rejects.toThrow("year read failed");
    expect(calls).toContain("limit:2");
  });

  it("rejects semester read errors", async () => {
    const client = currentTermClient({
      academic_years: { data: [{ id: "year-1", name: "2026/2027" }], error: null },
      semesters: { data: null, error: { message: "semester read failed" } },
    });

    await expect(fetchCanonicalCurrentTerm(client)).rejects.toThrow("semester read failed");
  });

  it("fetches a matching term and returns null for zero or mismatched rows", async () => {
    const matching = currentTermClient({
      academic_years: { data: [{ id: "year-1", name: "2026/2027" }], error: null },
      semesters: {
        data: [{ id: "semester-1", name: "First", academic_year_id: "year-1" }],
        error: null,
      },
    });
    const empty = currentTermClient({});
    const mismatched = currentTermClient({
      academic_years: { data: [{ id: "year-1", name: "2026/2027" }], error: null },
      semesters: {
        data: [{ id: "semester-1", name: "First", academic_year_id: "year-2" }],
        error: null,
      },
    });

    expect(await fetchCanonicalCurrentTerm(matching)).toEqual({
      year: { id: "year-1", name: "2026/2027" },
      semester: { id: "semester-1", name: "First", academic_year_id: "year-1" },
    });
    expect(await fetchCanonicalCurrentTerm(empty)).toBeNull();
    expect(await fetchCanonicalCurrentTerm(mismatched)).toBeNull();
  });

  it("preserves the hook contract and makes the mobile grades consumer handle top-level null", () => {
    const root = join(import.meta.dir, "..", "..");
    const referenceData = readFileSync(join(root, "src/lib/reference-data.ts"), "utf8");
    const mobileGrades = readFileSync(join(root, "src/routes/mobile.student.grades.tsx"), "utf8");

    expect(referenceData).toContain("queryFn: () => fetchCanonicalCurrentTerm(sb)");
    expect(mobileGrades).toContain(
      "const currentTerm = await fetchCanonicalCurrentTerm(supabase as unknown as CurrentTermClient)",
    );
    expect(mobileGrades).toContain("const cy = currentTerm?.year ?? null");
    expect(mobileGrades).toContain("const cs = currentTerm?.semester ?? null");
    expect(mobileGrades).not.toContain('from("academic_years").select("id, name").eq("is_current", true)');
  });
});
