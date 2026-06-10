import { loadXLSX } from "@/lib/xlsx-loader";
import type { ImportType, ValidationResult, ValidatedRow, ImportReport } from "./types";

const TYPE_LABEL: Record<ImportType, string> = {
  students: "students",
  faculty: "faculty",
  staff: "staff",
  courses: "courses",
  study_plans: "study_plans",
  departments: "departments",
  programs: "programs",
  levels: "levels",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = ValidatedRow<any>;

export async function downloadValidationReport(
  type: ImportType,
  fileName: string,
  validation: ValidationResult<unknown>,
) {
  const XLSX = await loadXLSX();
  const rows: Array<Record<string, string | number>> = [];
  for (const r of validation.rows as Row[]) {
    if (r.errors.length === 0) {
      rows.push({ row_number: r.rowNumber, status: "valid", column: "", error_message: "" });
    } else {
      for (const e of r.errors) {
        rows.push({
          row_number: r.rowNumber,
          status: "invalid",
          column: e.column ?? "",
          error_message: e.message,
        });
      }
    }
  }

  const wb = XLSX.utils.book_new();
  const summary = [
    ["تقرير التحقق من ملف الاستيراد"],
    ["نوع الاستيراد", TYPE_LABEL[type]],
    ["اسم الملف", fileName],
    ["تاريخ التقرير", new Date().toLocaleString("ar-EG")],
    ["إجمالي الصفوف", validation.totalRows],
    ["صفوف صالحة", validation.validRows],
    ["صفوف بأخطاء", validation.invalidRows],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summary);
  wsSummary["!cols"] = [{ wch: 22 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

  const ws = XLSX.utils.json_to_sheet(rows, {
    header: ["row_number", "status", "column", "error_message"],
  });
  ws["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 22 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, ws, "Validation");

  const base = fileName.replace(/\.[^.]+$/, "");
  XLSX.writeFile(wb, `validation_${TYPE_LABEL[type]}_${base}.xlsx`);
}

export async function downloadImportReport(
  type: ImportType,
  fileName: string,
  report: ImportReport,
) {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();
  const summary = [
    ["تقرير تنفيذ الاستيراد"],
    ["نوع الاستيراد", TYPE_LABEL[type]],
    ["اسم الملف", fileName],
    ["تاريخ التقرير", new Date().toLocaleString("ar-EG")],
    ["إجمالي الصفوف", report.rows_total],
    ["نجح", report.rows_success],
    ["فشل", report.rows_failed],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summary);
  wsSummary["!cols"] = [{ wch: 22 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

  const errRows = report.errors.map((e) => ({
    row_number: e.row,
    status: "failed",
    column: e.column ?? "",
    error_message: e.message,
  }));
  const ws = XLSX.utils.json_to_sheet(
    errRows.length ? errRows : [{ row_number: "", status: "—", column: "", error_message: "لا توجد أخطاء" }],
    { header: ["row_number", "status", "column", "error_message"] },
  );
  ws["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 22 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, ws, "Errors");

  const base = fileName.replace(/\.[^.]+$/, "");
  XLSX.writeFile(wb, `import_report_${TYPE_LABEL[type]}_${base}.xlsx`);
}
