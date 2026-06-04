// Lazy-loaded Excel export. xlsx is imported on demand only when the user
// clicks an export button so it stays out of the initial bundle.
import { loadXLSX } from "@/lib/xlsx-loader";

export type ExcelColumn<T> = {
  header: string;
  accessor: (row: T) => string | number | null | undefined;
  width?: number; // characters
};

export type ExcelExportOptions<T> = {
  filename: string; // without extension
  sheetName?: string;
  columns: ExcelColumn<T>[];
  rows: T[];
};

function todayStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function buildFilename(base: string, ext: "xlsx" | "pdf"): string {
  return `${base}_${todayStamp()}.${ext}`;
}

export async function exportToExcel<T>(opts: ExcelExportOptions<T>): Promise<void> {
  const XLSX = await loadXLSX();
  const headers = opts.columns.map((c) => c.header);
  const data = opts.rows.map((r) =>
    opts.columns.map((c) => {
      const v = c.accessor(r);
      return v === null || v === undefined ? "" : v;
    }),
  );
  const aoa = [headers, ...data];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // RTL view for Arabic
  (ws as any)["!views"] = [{ RTL: true }];
  ws["!cols"] = opts.columns.map((c) => ({ wch: c.width ?? 18 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, opts.sheetName || "Report");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${opts.filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
