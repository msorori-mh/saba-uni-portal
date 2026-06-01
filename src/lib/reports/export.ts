// Phase 10B: client-side export utilities for reports (CSV + XLSX).
import * as XLSX from "xlsx";
import { logReportExport } from "./report-audit.functions";

export type ExportRow = Record<string, string | number | null | undefined>;

function safeFilename(name: string) {
  return name.replace(/[^\w\u0600-\u06FF\- ]+/g, "_").slice(0, 80);
}

async function audit(reportName: string, format: "csv" | "xlsx", rows: ExportRow[]) {
  try {
    await logReportExport({
      data: { reportName, format, rowCount: rows.length },
    });
  } catch {
    // best-effort
  }
}

export async function exportCsv(reportName: string, rows: ExportRow[]) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  // BOM for Excel to detect UTF-8 (Arabic)
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, `${safeFilename(reportName)}.csv`);
  await audit(reportName, "csv", rows);
}

export async function exportXlsx(reportName: string, rows: ExportRow[]) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([buf], { type: "application/octet-stream" });
  triggerDownload(blob, `${safeFilename(reportName)}.xlsx`);
  await audit(reportName, "xlsx", rows);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
