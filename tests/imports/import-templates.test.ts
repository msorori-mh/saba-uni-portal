/**
 * Review #193 — template module regressions.
 *
 *  CRITICAL-1: parseExcel must remain exported (imports.tsx and
 *       ScheduleImportPanel.tsx import it; its removal broke the build TS2305).
 *  CRITICAL-2: downloadTemplate keeps its 3-parameter signature
 *       (type, studentOverrides?, options?) — imports.tsx calls it with three
 *       arguments; the restructured 2-param version broke the build (TS2554)
 *       and silently dropped student template overrides.
 *  HIGH-3: instructions must live in a SEPARATE "Instructions" sheet — the
 *       parser reads SheetNames[0] only, so instructions merged into the data
 *       sheet turned into bogus failing rows for every downloaded template.
 *
 * Run: bun test tests/imports/import-templates.test.ts
 */
import { describe, expect, it } from "bun:test";
import * as XLSX from "xlsx";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { downloadTemplate, parseExcel } from "../../src/lib/imports/templates";

// parseExcel is browser code built on FileReader; bun (test runtime) does not
// implement FileReader, so provide a minimal Blob-backed polyfill — only when
// the runtime lacks one (browsers keep their native implementation).
class FileReaderShim {
  onload: ((e: { target?: { result?: unknown } }) => void) | null = null;
  onerror: (() => void) | null = null;
  error: unknown = null;
  readAsArrayBuffer(file: Blob) {
    file.arrayBuffer().then(
      (buf) => this.onload?.({ target: { result: buf } }),
      (err) => {
        this.error = err;
        this.onerror?.();
      },
    );
  }
}
if (typeof globalThis.FileReader === "undefined") {
  (globalThis as { FileReader?: unknown }).FileReader = FileReaderShim;
}

function tmpFile(name: string) {
  return join(mkdtempSync(join(tmpdir(), "tmpl-")), name);
}

describe("templates module surface", () => {
  it("exports parseExcel as a function (CRITICAL-1)", () => {
    expect(typeof parseExcel).toBe("function");
  });

  it("keeps the 3-parameter downloadTemplate signature (CRITICAL-2)", () => {
    // (type, studentOverrides?, options?) — no default initializers, so
    // Function.length must be 3; a 2-param restructure would read 1..2.
    expect(downloadTemplate.length).toBe(3);
  });
});

describe("template workbook structure (HIGH-3)", () => {
  it("student_academic_status: data sheet + separate Instructions sheet, exactly 2 data rows", async () => {
    const file = tmpFile("status.xlsx");
    await downloadTemplate("student_academic_status", undefined, { fileName: file });
    expect(existsSync(file)).toBe(true);

    const wb = XLSX.readFile(file);
    expect(wb.SheetNames).toHaveLength(2);
    expect(wb.SheetNames[1]).toBe("Instructions");

    const dataRows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]!]!, {
      header: 1,
    });
    // headers + sample ONLY — any instruction row here becomes a bogus import row.
    expect(dataRows).toHaveLength(2);
    expect((dataRows[0] as unknown[])[0]).toBe("academic_number");
    expect((dataRows[0] as unknown[])[4]).toBe("enrollment_status");
  });

  it("every import type keeps instructions out of the data sheet", async () => {
    const types = [
      "students",
      "faculty",
      "courses",
      "study_plans",
      "course_sections",
      "student_enrollments",
      "student_grades",
      "student_academic_status",
      "student_fees",
      "student_discounts",
      "student_eligibility",
      "student_accounts",
      "documents",
    ] as const;
    for (const type of types) {
      const file = tmpFile(`${type}.xlsx`);
      await downloadTemplate(type, undefined, { fileName: file });
      const wb = XLSX.readFile(file);
      expect(wb.SheetNames).toHaveLength(2);
      expect(wb.SheetNames[1]).toBe("Instructions");
      const dataRows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]!]!, {
        header: 1,
      });
      expect(dataRows).toHaveLength(2);
    }
  });

  it("parseExcel round-trip: only the sample row is parsed back (no instruction leakage)", async () => {
    const file = tmpFile("students.xlsx");
    await downloadTemplate("students", undefined, { fileName: file });
    const rows = await parseExcel(new File([readFileSync(file)], "students.xlsx"));
    expect(rows).toHaveLength(1);
    expect(String(rows[0]!.academic_number)).toBe("20251001");
  });
});
