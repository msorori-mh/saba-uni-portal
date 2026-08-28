/**
 * PORTAL_STAFF_SELF_SERVICE_LIVE_READ_SIDE_02D
 * Server-only Arabic payroll-statement PDF builder.
 * Reuses the same-deployment Cairo asset + BiDi engine — no CDN or Canvas.
 */

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { drawBidiLine } from "@/lib/documents/arabic-pdf-worker-spike";
import {
  getCairoFontBytes,
  getCollegeLogoBytes,
} from "@/lib/documents/enrollment-certificate-pdf-assets.server";

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 48;

export type StaffPayrollPdfComponent = {
  component_type: "allowance" | "deduction";
  label_ar: string;
  amount: number;
};

export type StaffPayrollPdfInput = {
  statementId: string;
  staffNameAr: string;
  employeeNumber: string | null;
  periodStart: string;
  periodEnd: string;
  currencyCode: string;
  basicSalary: number;
  allowancesTotal: number;
  deductionsTotal: number;
  netAmount: number;
  components: StaffPayrollPdfComponent[];
  accessMode: "owner" | "finance" | "administrator";
};

function money(value: number, currency: string): string {
  const formatted = new Intl.NumberFormat("ar-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    numberingSystem: "latn",
  }).format(value);
  return `${formatted} ${currency}`;
}

function arabicDate(value: string): string {
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "long",
    calendar: "gregory",
    numberingSystem: "latn",
    timeZone: "UTC",
  }).format(d);
}

function line(
  page: PDFPage,
  font: PDFFont,
  text: string,
  y: number,
  size = 11,
  color = rgb(0.08, 0.14, 0.24),
): void {
  drawBidiLine(page, text, {
    font,
    size,
    xRight: A4_WIDTH - MARGIN,
    y,
    color,
  });
}

export async function buildStaffPayrollPdfBytes(
  input: StaffPayrollPdfInput,
): Promise<Uint8Array> {
  const fontBytes = await getCairoFontBytes();
  const logoBytes = getCollegeLogoBytes();

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: true });
  const page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);

  try {
    const logo = await pdf.embedPng(logoBytes);
    const scaled = logo.scale(48 / logo.height);
    page.drawImage(logo, {
      x: MARGIN,
      y: A4_HEIGHT - MARGIN - scaled.height,
      width: scaled.width,
      height: scaled.height,
    });
  } catch {
    // Logo is decorative only; never fail the statement because of it.
  }

  let y = A4_HEIGHT - MARGIN - 12;
  line(page, font, "كلية تكنولوجيا المعلومات وعلوم الحاسوب", y, 14);
  y -= 22;
  line(page, font, "كشف راتب الموظف", y, 16, rgb(0.05, 0.28, 0.2));
  y -= 26;
  line(page, font, `الاسم: ${input.staffNameAr}`, y);
  y -= 18;
  line(page, font, `الرقم الوظيفي: ${input.employeeNumber ?? "—"}`, y);
  y -= 18;
  line(
    page,
    font,
    `فترة الاستحقاق: ${arabicDate(input.periodStart)} — ${arabicDate(input.periodEnd)}`,
    y,
  );
  y -= 26;

  line(page, font, "المكونات المالية", y, 13, rgb(0.05, 0.28, 0.2));
  y -= 20;
  line(page, font, `الراتب الأساسي: ${money(input.basicSalary, input.currencyCode)}`, y);
  y -= 18;

  const allowances = input.components.filter((c) => c.component_type === "allowance");
  const deductions = input.components.filter((c) => c.component_type === "deduction");

  line(page, font, "البدلات:", y, 12);
  y -= 16;
  if (allowances.length === 0) {
    line(page, font, "— لا توجد بدلات —", y, 10, rgb(0.4, 0.44, 0.5));
    y -= 16;
  }
  for (const item of allowances) {
    line(page, font, `${item.label_ar}: ${money(item.amount, input.currencyCode)}`, y, 10);
    y -= 15;
  }
  line(
    page,
    font,
    `إجمالي البدلات: ${money(input.allowancesTotal, input.currencyCode)}`,
    y,
  );
  y -= 22;

  line(page, font, "الاستقطاعات:", y, 12);
  y -= 16;
  if (deductions.length === 0) {
    line(page, font, "— لا توجد استقطاعات —", y, 10, rgb(0.4, 0.44, 0.5));
    y -= 16;
  }
  for (const item of deductions) {
    line(page, font, `${item.label_ar}: ${money(item.amount, input.currencyCode)}`, y, 10);
    y -= 15;
  }
  line(
    page,
    font,
    `إجمالي الاستقطاعات: ${money(input.deductionsTotal, input.currencyCode)}`,
    y,
  );
  y -= 28;

  line(
    page,
    font,
    `صافي المستحق: ${money(input.netAmount, input.currencyCode)}`,
    y,
    14,
    rgb(0.05, 0.28, 0.2),
  );
  y -= 30;

  line(
    page,
    font,
    "هذا الكشف صادر إلكترونياً من بوابة الموظفين ولا يتطلب توقيعاً يدوياً.",
    y,
    9,
    rgb(0.35, 0.4, 0.46),
  );
  y -= 14;
  line(page, font, `مرجع الكشف: ${input.statementId}`, y, 8, rgb(0.45, 0.48, 0.53));

  return pdf.save();
}
