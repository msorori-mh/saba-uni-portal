/**
 * Server-only builder for the approved (locked) council minutes PDF.
 * Pure pdf-lib + fontkit with a same-deployment font asset — no DOM or CDN.
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

export type CouncilMinutesPdfInput = {
  councilName: string;
  meetingTitle: string;
  meetingNumber: number;
  scheduledAt: string | null;
  location: string | null;
  approvedAt: string | null;
  lockedAt: string | null;
  body: string;
  fingerprint: string | null;
};

function formatArabicDateTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "long",
    timeStyle: "short",
    calendar: "gregory",
    numberingSystem: "latn",
    timeZone: "Asia/Riyadh",
  }).format(d);
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const words = rawLine.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
      } else {
        if (current) out.push(current);
        current = word;
      }
    }
    if (current) out.push(current);
  }
  return out;
}

export async function buildCouncilMinutesPdf(
  input: CouncilMinutesPdfInput,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(await getCairoFontBytes(), { subset: true });

  const logoBytes = getCollegeLogoBytes();
  let logo;
  try {
    logo = await pdfDoc.embedJpg(logoBytes);
  } catch {
    logo = await pdfDoc.embedPng(logoBytes);
  }

  const contentWidth = A4_WIDTH - MARGIN * 2;
  const xRight = A4_WIDTH - MARGIN;
  let page: PDFPage = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
  let y = A4_HEIGHT - MARGIN;

  const newPage = () => {
    page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    y = A4_HEIGHT - MARGIN;
  };
  const line = (text: string, size = 11, color = rgb(0.08, 0.12, 0.2), gap = 8) => {
    if (y < MARGIN + 40) newPage();
    drawBidiLine(page, text, { font, size, xRight, y, color });
    y -= size + gap;
  };

  const logoW = 54;
  const logoH = (logo.height / logo.width) * logoW;
  page.drawImage(logo, {
    x: A4_WIDTH / 2 - logoW / 2,
    y: y - logoH,
    width: logoW,
    height: logoH,
  });
  y -= logoH + 16;

  line("جامعة إقليم سبأ", 14);
  line("كلية تكنولوجيا المعلومات وعلوم الحاسوب", 12, rgb(0.25, 0.3, 0.4));
  y -= 6;
  line("محضر اجتماع معتمد", 16, rgb(0.05, 0.25, 0.45), 14);

  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: xRight, y },
    thickness: 1,
    color: rgb(0.8, 0.84, 0.9),
  });
  y -= 18;

  line(`المجلس: ${input.councilName}`, 11);
  line(`عنوان الاجتماع: ${input.meetingTitle}`, 11);
  line(`رقم الاجتماع: ${input.meetingNumber}`, 11);
  line(`تاريخ الاجتماع: ${formatArabicDateTime(input.scheduledAt)}`, 11);
  line(`المكان: ${input.location || "—"}`, 11);
  line(`تاريخ الاعتماد: ${formatArabicDateTime(input.approvedAt ?? input.lockedAt)}`, 11);
  y -= 8;

  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: xRight, y },
    thickness: 1,
    color: rgb(0.8, 0.84, 0.9),
  });
  y -= 20;

  line("نص المحضر", 13, rgb(0.05, 0.25, 0.45), 12);
  for (const l of wrap(input.body || "لا يوجد نص محضر.", font, 11, contentWidth)) {
    if (!l) {
      y -= 8;
      continue;
    }
    line(l, 11, rgb(0.1, 0.14, 0.22), 6);
  }

  y -= 16;
  if (y < MARGIN + 60) newPage();
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: xRight, y },
    thickness: 1,
    color: rgb(0.8, 0.84, 0.9),
  });
  y -= 18;
  line("هذا المحضر معتمد ومقفل رقمياً ولا يجوز تعديله.", 10, rgb(0.3, 0.35, 0.45));
  if (input.fingerprint) {
    line(`بصمة التوثيق SHA-256: ${input.fingerprint}`, 9, rgb(0.3, 0.35, 0.45));
  }

  return await pdfDoc.save();
}
