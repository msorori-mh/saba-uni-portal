/**
 * Isolated Arabic PDF spike for Cloudflare Workers / Nitro.
 * No DB, Storage, network, fs, path, DOM, Canvas, or Chromium.
 *
 * Shaping: pdf-lib CustomFontEmbedder uses fontkit.layout (OpenType GSUB)
 * on logical Arabic — do NOT convert to Presentation Forms first.
 *
 * BiDi: draw directional runs separately so digits / Latin stay LTR.
 */

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import bidiFactory from "bidi-js";
import QRCode from "qrcode";

export const SPIKE_FIXTURE = {
  universityNameAr: "جامعة إقليم سبأ",
  collegeNameAr: "كلية الحاسوب وتقنية المعلومات",
  titleAr: "شهادة قيد",
  studentNameAr: "طالب الاختبار",
  academicNumber: "TEST-2026-001",
  departmentAr: "قسم تكنولوجيا المعلومات",
  programAr: "البكالوريوس في تكنولوجيا المعلومات",
  academicYear: "2025-2026",
  semesterAr: "الفصل الأول",
  levelAr: "المستوى الأول",
  documentNumber: "USR-SPIKE-2026-000001",
  issuedAtLabelAr: "تاريخ الإصدار",
  issuedAtValue: "١٣ يوليو ٢٠٢٦",
  bodyParagraphAr:
    "تشهد الكلية بأن الطالب المذكور بياناته أدناه مقيد لديها وفق الحالة الأكاديمية الظاهرة في هذه الشهادة التجريبية. هذه الوثيقة ناتج تقني تجريبي ولا تحمل قيمة رسمية.",
  mixedArabic: "شهادة قيد",
  mixedEnglish: "Enrollment Certificate",
  verificationUrl: "https://example.invalid/verify-document?code=SPIKEDEMO01",
} as const;

export type EnrollmentCertificateSpikeInputs = {
  fontBytes: Uint8Array;
  logoBytes: Uint8Array;
  fixture?: typeof SPIKE_FIXTURE;
};

export type EnrollmentCertificateSpikeResult = {
  pdfBytes: Uint8Array;
  pageCount: number;
  byteLength: number;
  startsWithPdfHeader: boolean;
  usedNetwork: false;
  usedDatabase: false;
  usedStorage: false;
  shaping: "fontkit.layout+bidi-js-runs";
  engine: "pdf-lib+@pdf-lib/fontkit";
};

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 48;

const bidi = bidiFactory();

export type BidiRun = {
  text: string;
  level: number;
  dir: "rtl" | "ltr";
};

/** Split logical text into contiguous BiDi embedding runs (UAX #9 levels). */
export function segmentBidiRuns(logical: string, baseDirection: "rtl" | "ltr" = "rtl"): BidiRun[] {
  if (!logical) return [];
  const { levels } = bidi.getEmbeddingLevels(logical, baseDirection);
  const runs: BidiRun[] = [];
  let start = 0;
  for (let i = 1; i <= logical.length; i++) {
    if (i === logical.length || levels[i] !== levels[start]) {
      const level = levels[start] ?? 0;
      runs.push({
        text: logical.slice(start, i),
        level,
        dir: level % 2 === 1 ? "rtl" : "ltr",
      });
      start = i;
    }
  }
  return runs;
}

/**
 * Visual run helpers exported for tests.
 */
export function visualRunOrder(runs: BidiRun[], baseDirection: "rtl" | "ltr"): BidiRun[] {
  return baseDirection === "rtl" ? [...runs].reverse() : [...runs];
}

/** Prove OpenType shaping produces joined glyph sequences for Arabic. */
export function assertArabicOpenTypeShaping(fontBytes: Uint8Array, sample = "طالب"): void {
  const font = fontkit.create(fontBytes);
  const run = font.layout(sample);
  if (run.glyphs.length < 2) {
    throw new Error("fontkit.layout returned too few glyphs for Arabic sample");
  }
  // Isolated Beh is typically id for U+0628; shaped forms differ.
  const isolatedBeh = font.glyphForCodePoint(0x0628).id;
  const hasNonIsolated = run.glyphs.some((g) => g.id !== isolatedBeh);
  if (!hasNonIsolated && sample.length > 1) {
    throw new Error("fontkit.layout did not apply Arabic joining forms");
  }
}

function drawLogicalRtlLine(
  page: PDFPage,
  text: string,
  opts: {
    font: PDFFont;
    size: number;
    xRight: number;
    y: number;
    color?: ReturnType<typeof rgb>;
  },
): number {
  const width = opts.font.widthOfTextAtSize(text, opts.size);
  page.drawText(text, {
    x: Math.max(MARGIN, opts.xRight - width),
    y: opts.y,
    size: opts.size,
    font: opts.font,
    color: opts.color ?? rgb(0.05, 0.12, 0.22),
  });
  return opts.font.heightAtSize(opts.size);
}

/**
 * Draw mixed AR/EN/digit line using BiDi runs and fontkit shaping per run.
 * Runs are placed starting from the right (RTL frame): first logical run
 * sits on the right edge so Arabic labels remain right-aligned.
 */
export function drawBidiLine(
  page: PDFPage,
  logical: string,
  opts: {
    font: PDFFont;
    size: number;
    xRight: number;
    y: number;
    color?: ReturnType<typeof rgb>;
    baseDirection?: "rtl" | "ltr";
  },
): number {
  const base = opts.baseDirection ?? "rtl";
  const runs = segmentBidiRuns(logical, base);
  let xCursor = opts.xRight;
  for (const run of runs) {
    const w = opts.font.widthOfTextAtSize(run.text, opts.size);
    xCursor -= w;
    page.drawText(run.text, {
      x: Math.max(MARGIN, xCursor),
      y: opts.y,
      size: opts.size,
      font: opts.font,
      color: opts.color ?? rgb(0.05, 0.12, 0.22),
    });
  }
  return opts.font.heightAtSize(opts.size);
}

function wrapArabicLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Generate a single-page A4 spike PDF. Caller supplies font/logo bytes
 * (must already be in memory — no fetch).
 */
export async function generateEnrollmentCertificateSpikePdf(
  input: EnrollmentCertificateSpikeInputs,
): Promise<EnrollmentCertificateSpikeResult> {
  const fixture = input.fixture ?? SPIKE_FIXTURE;
  if (!input.fontBytes?.byteLength) {
    throw new Error("Cairo font bytes are required");
  }
  if (!input.logoBytes?.byteLength) {
    throw new Error("Logo bytes are required");
  }

  assertArabicOpenTypeShaping(input.fontBytes);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  // Body intended as Regular (~400). Variable wght instances are not reliably
  // selectable via pdf-lib embedFont; titles use larger size for emphasis.
  const font = await pdfDoc.embedFont(input.fontBytes, { subset: true });
  const titleFont = font;

  let logo;
  try {
    logo = await pdfDoc.embedJpg(input.logoBytes);
  } catch {
    logo = await pdfDoc.embedPng(input.logoBytes);
  }

  // Build QR as a module matrix (no Canvas / DOM) then paint rectangles.
  const qrModel = QRCode.create(fixture.verificationUrl, {
    errorCorrectionLevel: "M",
  });
  const modules = qrModel.modules;
  const moduleCount = modules.size;

  const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
  let y = A4_HEIGHT - MARGIN;

  const logoW = 56;
  const logoH = (logo.height / logo.width) * logoW;
  page.drawImage(logo, {
    x: A4_WIDTH / 2 - logoW / 2,
    y: y - logoH,
    width: logoW,
    height: logoH,
  });
  y -= logoH + 14;

  drawLogicalRtlLine(page, fixture.universityNameAr, {
    font: titleFont,
    size: 16,
    xRight: A4_WIDTH - MARGIN,
    y,
  });
  y -= 22;
  drawLogicalRtlLine(page, fixture.collegeNameAr, {
    font,
    size: 12,
    xRight: A4_WIDTH - MARGIN,
    y,
  });
  y -= 28;

  page.drawRectangle({
    x: MARGIN,
    y: y - 6,
    width: A4_WIDTH - MARGIN * 2,
    height: 28,
    color: rgb(0.85, 0.72, 0.35),
  });
  drawLogicalRtlLine(page, fixture.titleAr, {
    font: titleFont,
    size: 18,
    xRight: A4_WIDTH - MARGIN - 8,
    y: y + 2,
    color: rgb(0.05, 0.12, 0.22),
  });
  y -= 40;

  const maxTextW = A4_WIDTH - MARGIN * 2;
  for (const line of wrapArabicLines(fixture.bodyParagraphAr, font, 10, maxTextW)) {
    drawLogicalRtlLine(page, line, {
      font,
      size: 10,
      xRight: A4_WIDTH - MARGIN,
      y,
    });
    y -= 14;
  }
  y -= 10;

  const rows: Array<{ label: string; value: string; valueDir: "rtl" | "ltr" }> = [
    { label: "اسم الطالب", value: fixture.studentNameAr, valueDir: "rtl" },
    { label: "الرقم الأكاديمي", value: fixture.academicNumber, valueDir: "ltr" },
    { label: "القسم", value: fixture.departmentAr, valueDir: "rtl" },
    { label: "البرنامج", value: fixture.programAr, valueDir: "rtl" },
    { label: "العام الأكاديمي", value: fixture.academicYear, valueDir: "ltr" },
    { label: "الفصل الدراسي", value: fixture.semesterAr, valueDir: "rtl" },
    { label: "المستوى", value: fixture.levelAr, valueDir: "rtl" },
    { label: "رقم الوثيقة", value: fixture.documentNumber, valueDir: "ltr" },
  ];

  for (const row of rows) {
    page.drawRectangle({
      x: MARGIN,
      y: y - 4,
      width: A4_WIDTH - MARGIN * 2,
      height: 18,
      borderColor: rgb(0.75, 0.78, 0.82),
      borderWidth: 0.5,
    });
    drawLogicalRtlLine(page, `${row.label}:`, {
      font,
      size: 10,
      xRight: A4_WIDTH - MARGIN - 6,
      y,
    });
    if (row.valueDir === "ltr") {
      page.drawText(row.value, {
        x: MARGIN + 6,
        y,
        size: 10,
        font,
        color: rgb(0.05, 0.12, 0.22),
      });
    } else {
      const labelW = font.widthOfTextAtSize(`${row.label}: `, 10);
      drawLogicalRtlLine(page, row.value, {
        font,
        size: 10,
        xRight: A4_WIDTH - MARGIN - 6 - labelW,
        y,
      });
    }
    y -= 22;
  }

  y -= 8;
  drawLogicalRtlLine(page, `${fixture.issuedAtLabelAr}:`, {
    font,
    size: 10,
    xRight: A4_WIDTH - MARGIN,
    y,
  });
  const dateLabelW = font.widthOfTextAtSize(`${fixture.issuedAtLabelAr}: `, 10);
  drawLogicalRtlLine(page, fixture.issuedAtValue, {
    font,
    size: 10,
    xRight: A4_WIDTH - MARGIN - dateLabelW,
    y,
  });
  y -= 20;

  const mixed = `${fixture.mixedArabic} — ${fixture.mixedEnglish} — ${fixture.academicNumber}`;
  drawBidiLine(page, mixed, {
    font,
    size: 9,
    xRight: A4_WIDTH - MARGIN,
    y,
  });
  y -= 28;

  const qrSize = 72;
  const quiet = 2;
  const cell = qrSize / (moduleCount + quiet * 2);
  const qrX = MARGIN;
  const qrY = y - qrSize;
  page.drawRectangle({
    x: qrX,
    y: qrY,
    width: qrSize,
    height: qrSize,
    color: rgb(1, 1, 1),
  });
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (!modules.get(row, col)) continue;
      page.drawRectangle({
        x: qrX + (col + quiet) * cell,
        y: qrY + qrSize - (row + 1 + quiet) * cell,
        width: cell,
        height: cell,
        color: rgb(0, 0, 0),
      });
    }
  }
  drawLogicalRtlLine(page, "رمز التحقق التجريبي", {
    font,
    size: 9,
    xRight: A4_WIDTH - MARGIN,
    y: y - 12,
  });

  page.drawText("SPIKE — NOT AN OFFICIAL DOCUMENT", {
    x: MARGIN,
    y: 24,
    size: 8,
    font: await pdfDoc.embedFont(StandardFonts.Helvetica),
    color: rgb(0.55, 0.2, 0.2),
  });

  const pdfBytes = await pdfDoc.save();
  const header = String.fromCharCode(...pdfBytes.slice(0, 4));

  return {
    pdfBytes,
    pageCount: pdfDoc.getPageCount(),
    byteLength: pdfBytes.byteLength,
    startsWithPdfHeader: header === "%PDF",
    usedNetwork: false,
    usedDatabase: false,
    usedStorage: false,
    shaping: "fontkit.layout+bidi-js-runs",
    engine: "pdf-lib+@pdf-lib/fontkit",
  };
}
