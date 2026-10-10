/**
 * IMPORT-PAGINATION-01 — import validators must read whole tables, not the
 * first PostgREST page (max-rows 1000). A truncated enrollments map made 3119
 * valid grade rows fail with "الطالب غير مسجل في هذه المجموعة".
 */
import { describe, expect, it } from "bun:test";
import { IMPORT_PAGE_SIZE, selectAllRows } from "../../src/lib/imports/import-db";

function pagedClient(total: number, failAtFrom: number | null = null) {
  const calls: Array<{ table: string; columns: string; from: number; to: number; order: string }> =
    [];
  const client = {
    from: (table: string) => ({
      select: (columns: string) => ({
        order: (order: string) => ({
          range: async (from: number, to: number) => {
            calls.push({ table, columns, from, to, order });
            if (failAtFrom === from) return { data: null, error: { message: "boom" } };
            const rows = [];
            for (let i = from; i <= Math.min(to, total - 1); i++) rows.push({ id: i });
            return { data: rows, error: null };
          },
        }),
      }),
    }),
  };
  return { client, calls };
}

describe("selectAllRows", () => {
  it("reads every page beyond the 1000-row cap, ordered by id", async () => {
    const total = IMPORT_PAGE_SIZE * 5 + 425; // e.g. 5425 enrollments
    const { client, calls } = pagedClient(total);
    const { data } = await selectAllRows<{ id: number }>(client, "student_enrollments", "id");
    expect(data.length).toBe(total);
    expect(new Set(data.map((r) => r.id)).size).toBe(total);
    expect(calls.length).toBe(6);
    expect(calls.every((c) => c.order === "id")).toBe(true);
    expect(calls[1]).toMatchObject({ from: IMPORT_PAGE_SIZE, to: 2 * IMPORT_PAGE_SIZE - 1 });
  });

  it("issues one extra empty read when the total is an exact multiple of the page", async () => {
    const { client, calls } = pagedClient(IMPORT_PAGE_SIZE * 2);
    const { data } = await selectAllRows(client, "student_academic_status", "id");
    expect(data.length).toBe(IMPORT_PAGE_SIZE * 2);
    expect(calls.length).toBe(3);
  });

  it("fails loudly instead of validating against a partial table", async () => {
    const { client } = pagedClient(IMPORT_PAGE_SIZE * 3, IMPORT_PAGE_SIZE);
    await expect(selectAllRows(client, "student_grades", "id")).rejects.toThrow("student_grades");
  });
});
