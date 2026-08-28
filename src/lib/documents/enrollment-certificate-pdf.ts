/**
 * Production enrollment-certificate PDF builder (Cairo + BiDi, no CDN/Canvas).
 * Wraps the Worker-proven spike engine with real snapshot fields.
 *
 * Runtime target: Cloudflare Workers (Nitro). The font comes from the same
 * deployment's ASSETS binding and the logo from a server-only sibling module
 * — no runtime filesystem access, CDN, or external network.
 */

import { createHash } from "node:crypto";
import {
  SPIKE_FIXTURE,
  generateEnrollmentCertificateSpikePdf,
} from "@/lib/documents/arabic-pdf-worker-spike";
import {
  getCairoFontBytes,
  getCollegeLogoBytes,
} from "@/lib/documents/enrollment-certificate-pdf-assets.server";

export type EnrollmentCertificateSnapshot = {
  student_name_ar: string;
  academic_number: string;
  department_name_ar: string;
  program_name_ar: string;
  academic_year_name: string;
  semester_name: string;
  level_name: string;
};

export type BuildEnrollmentCertificatePdfInput = {
  snapshot: EnrollmentCertificateSnapshot;
  documentNumber: string;
  verificationUrl: string;
  issuedAtLabelAr?: string;
  issuedAtValue?: string;
  fontBytes?: Uint8Array;
  logoBytes?: Uint8Array;
};

/** Public API retained for saga + tests. Reads same-deployment assets, never disk. */
export async function loadCairoFontBytes(): Promise<Uint8Array> {
  return getCairoFontBytes();
}

export function loadCollegeLogoBytes(): Uint8Array {
  return getCollegeLogoBytes();
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function buildEnrollmentCertificatePdfBytes(
  input: BuildEnrollmentCertificatePdfInput,
): Promise<{ pdfBytes: Uint8Array; sha256: string; byteLength: number }> {
  const fontBytes = input.fontBytes ?? (await loadCairoFontBytes());
  const logoBytes = input.logoBytes ?? loadCollegeLogoBytes();
  const fixture = {
    ...SPIKE_FIXTURE,
    studentNameAr: input.snapshot.student_name_ar,
    academicNumber: input.snapshot.academic_number,
    departmentAr: input.snapshot.department_name_ar,
    programAr: input.snapshot.program_name_ar,
    academicYear: input.snapshot.academic_year_name,
    semesterAr: input.snapshot.semester_name,
    levelAr: input.snapshot.level_name,
    documentNumber: input.documentNumber,
    issuedAtLabelAr: input.issuedAtLabelAr ?? SPIKE_FIXTURE.issuedAtLabelAr,
    issuedAtValue: input.issuedAtValue ?? new Date().toLocaleDateString("ar-EG"),
    verificationUrl: input.verificationUrl,
    bodyParagraphAr:
      "تشهد الكلية بأن الطالب المذكور بياناته أدناه مقيد لديها وفق الحالة الأكاديمية الظاهرة في هذه الشهادة.",
  };

  const result = await generateEnrollmentCertificateSpikePdf({
    fontBytes,
    logoBytes,
    fixture,
  });
  const sha256 = sha256Hex(result.pdfBytes);
  return {
    pdfBytes: result.pdfBytes,
    sha256,
    byteLength: result.byteLength,
  };
}
