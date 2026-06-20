import { loadXLSX } from "@/lib/xlsx-loader";
import {
  IMPORT_TYPE_LABEL_AR,
  REPORT_STATUS_AR,
  VALIDATION_REPORT_HEADERS,
  getReportStatLabels,
} from "./labels";
import type { ImportType, ValidationResult, ValidatedRow, ImportReport } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = ValidatedRow<any>;

function validationRows(validation: ValidationResult<unknown>) {
  const rows: Array<Record<string, string | number>> = [];
  for (const r of validation.rows as Row[]) {
    if (r.errors.length === 0) {
      rows.push({
        [VALIDATION_REPORT_HEADERS.row_number]: r.rowNumber,
        [VALIDATION_REPORT_HEADERS.status]: REPORT_STATUS_AR.valid,
        [VALIDATION_REPORT_HEADERS.column]: "",
        [VALIDATION_REPORT_HEADERS.error_message]: "",
      });
    } else {
      for (const e of r.errors) {
        rows.push({
          [VALIDATION_REPORT_HEADERS.row_number]: r.rowNumber,
          [VALIDATION_REPORT_HEADERS.status]: REPORT_STATUS_AR.invalid,
          [VALIDATION_REPORT_HEADERS.column]: e.column ?? "",
          [VALIDATION_REPORT_HEADERS.error_message]: e.message,
        });
      }
    }
  }
  return rows;
}

export async function downloadValidationReport(
  type: ImportType,
  fileName: string,
  validation: ValidationResult<unknown>,
) {
  const XLSX = await loadXLSX();
  const rows = validationRows(validation);

  const wb = XLSX.utils.book_new();
  const summary: (string | number)[][] = [
    ["تقرير التحقق من ملف الاستيراد"],
    ["نوع الاستيراد", IMPORT_TYPE_LABEL_AR[type]],
    ["اسم الملف", fileName],
    ["تاريخ التقرير", new Date().toLocaleString("ar-EG")],
    ["إجمالي الصفوف", validation.totalRows],
    ["صفوف صالحة", validation.validRows],
    ["صفوف بأخطاء", validation.invalidRows],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summary);
  wsSummary["!cols"] = [{ wch: 22 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "ملخص");

  const headers = Object.values(VALIDATION_REPORT_HEADERS);
  const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
  ws["!cols"] = [{ wch: 12 }, { wch: 12 }, { wch: 22 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, ws, "التحقق");

  const base = fileName.replace(/\.[^.]+$/, "");
  const slug = type.replace(/_/g, "-");
  XLSX.writeFile(wb, `تقرير_تحقق_${slug}_${base}.xlsx`);
}

export async function downloadImportReport(
  type: ImportType,
  fileName: string,
  report: ImportReport,
  opts?: { dryRun?: boolean; durationMs?: number | null },
) {
  const XLSX = await loadXLSX();
  const dryRun = opts?.dryRun ?? false;
  const statLabels = getReportStatLabels(type, dryRun);
  const wb = XLSX.utils.book_new();

  const summary: (string | number)[][] = [
    [dryRun ? "تقرير التشغيل التجريبي" : "تقرير تنفيذ الاستيراد"],
    ["نوع الاستيراد", IMPORT_TYPE_LABEL_AR[type]],
    ["اسم الملف", fileName],
    ["تاريخ التقرير", new Date().toLocaleString("ar-EG")],
    ["الوضع", dryRun ? "تجريبي (بدون تغييرات)" : "تنفيذ فعلي"],
    ["إجمالي الصفوف", report.rows_total],
    ["نجح", report.rows_success],
    ["فشل", report.rows_failed],
  ];
  if (report.rows_created != null) {
    summary.push([statLabels.created, report.rows_created]);
  }
  if (statLabels.showUpdated && report.rows_updated != null) {
    summary.push([statLabels.updated, report.rows_updated]);
  }
  if (opts?.durationMs != null) {
    summary.push(["الزمن (مللي ثانية)", opts.durationMs]);
  }

  const wsSummary = XLSX.utils.aoa_to_sheet(summary);
  wsSummary["!cols"] = [{ wch: 28 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "ملخص");

  const errRows = report.errors.map((e) => ({
    [VALIDATION_REPORT_HEADERS.row_number]: e.row,
    [VALIDATION_REPORT_HEADERS.status]: REPORT_STATUS_AR.failed,
    [VALIDATION_REPORT_HEADERS.column]: e.column ?? "",
    [VALIDATION_REPORT_HEADERS.error_message]: e.message,
  }));
  const headers = Object.values(VALIDATION_REPORT_HEADERS);
  const ws = XLSX.utils.json_to_sheet(
    errRows.length
      ? errRows
      : [{
          [VALIDATION_REPORT_HEADERS.row_number]: "",
          [VALIDATION_REPORT_HEADERS.status]: REPORT_STATUS_AR.none,
          [VALIDATION_REPORT_HEADERS.column]: "",
          [VALIDATION_REPORT_HEADERS.error_message]: "لا توجد أخطاء",
        }],
    { header: headers },
  );
  ws["!cols"] = [{ wch: 12 }, { wch: 12 }, { wch: 22 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, ws, "الأخطاء");

  const base = fileName.replace(/\.[^.]+$/, "");
  const slug = type.replace(/_/g, "-");
  const prefix = dryRun ? "تقرير_تجريبي" : "تقرير_استيراد";
  XLSX.writeFile(wb, `${prefix}_${slug}_${base}.xlsx`);
}
