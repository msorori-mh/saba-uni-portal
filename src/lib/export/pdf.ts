// PDF export via the browser print pipeline.
//
// Rationale: jsPDF + autotable do not ship Arabic glyphs by default and
// require bundling a heavy Arabic-capable font file. Opening a new window
// with an RTL HTML document and triggering window.print() lets the user
// save the report as PDF with perfect Arabic shaping using the browser's
// own text engine. Zero extra dependencies, zero bundle cost.

export type PdfColumn<T> = {
  header: string;
  accessor: (row: T) => string | number | null | undefined;
  width?: string; // CSS width, e.g. "12%"
};

export type PdfExportOptions<T> = {
  filename: string; // without extension; used to set document title
  title: string;
  subtitle?: string;
  exportedBy?: string | null;
  logoUrl?: string | null;
  columns: PdfColumn<T>[];
  rows: T[];
};

function esc(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function exportToPdf<T>(opts: PdfExportOptions<T>): Promise<void> {
  const now = new Date();
  const dateStr = now.toLocaleString("ar", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const head = opts.columns
    .map(
      (c) =>
        `<th style="width:${c.width || "auto"}">${esc(c.header)}</th>`,
    )
    .join("");

  const body = opts.rows
    .map((r) => {
      const tds = opts.columns
        .map((c) => `<td>${esc(c.accessor(r))}</td>`)
        .join("");
      return `<tr>${tds}</tr>`;
    })
    .join("");

  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>${esc(opts.filename)}</title>
  <style>
    @page { size: A4 landscape; margin: 14mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Noto Naskh Arabic", "Segoe UI", Tahoma, "Arial", sans-serif;
      color: #111;
      direction: rtl;
      margin: 0;
      padding: 0;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      border-bottom: 2px solid #1e40af;
      padding-bottom: 10px;
      margin-bottom: 14px;
    }
    header img { height: 56px; width: auto; object-fit: contain; }
    .titles h1 { font-size: 18pt; margin: 0 0 4px; color: #1e40af; }
    .titles p { font-size: 10pt; margin: 0; color: #555; }
    .meta {
      display: flex;
      justify-content: space-between;
      font-size: 9pt;
      color: #555;
      margin-bottom: 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
      table-layout: fixed;
    }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    th, td {
      border: 1px solid #d4d4d8;
      padding: 6px 8px;
      text-align: right;
      vertical-align: middle;
      word-wrap: break-word;
      overflow-wrap: anywhere;
    }
    th { background: #eff6ff; color: #1e3a8a; font-weight: 700; }
    tbody tr:nth-child(even) td { background: #fafafa; }
    footer {
      margin-top: 14px;
      font-size: 8pt;
      color: #777;
      text-align: center;
    }
    @media print { .no-print { display: none !important; } }
  </style>
</head>
<body>
  <header>
    <div class="titles">
      <h1>${esc(opts.title)}</h1>
      ${opts.subtitle ? `<p>${esc(opts.subtitle)}</p>` : ""}
    </div>
    ${opts.logoUrl ? `<img src="${esc(opts.logoUrl)}" alt="logo" />` : ""}
  </header>
  <div class="meta">
    <span>تاريخ التصدير: ${esc(dateStr)}</span>
    <span>عدد السجلات: ${opts.rows.length}</span>
    ${opts.exportedBy ? `<span>المصدِّر: ${esc(opts.exportedBy)}</span>` : ""}
  </div>
  <table>
    <thead><tr>${head}</tr></thead>
    <tbody>${body || `<tr><td colspan="${opts.columns.length}" style="text-align:center;color:#888;padding:24px">لا توجد بيانات</td></tr>`}</tbody>
  </table>
  <footer>تم إنشاء هذا التقرير بواسطة بوابة الكلية</footer>
  <div class="no-print" style="position:fixed;top:8px;left:8px;">
    <button onclick="window.print()" style="padding:8px 14px;background:#1e40af;color:#fff;border:0;border-radius:6px;cursor:pointer;font-size:12pt">طباعة / حفظ PDF</button>
  </div>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.focus(); window.print(); }, 350);
    });
  </script>
</body>
</html>`;

  const w = window.open("", "_blank", "width=1100,height=800");
  if (!w) {
    throw new Error("تعذّر فتح نافذة الطباعة. الرجاء السماح بالنوافذ المنبثقة.");
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
