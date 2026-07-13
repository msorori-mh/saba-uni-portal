import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  APPROVED_ARABIC_FONT_HOLD_CODE,
  PDF_RUNTIME_HOLD_CODE,
  PDF_STORAGE_GENERATOR_DECISION,
  PLANNED_STORAGE_BUCKET,
  PLANNED_TWO_PHASE_RPCS,
  evaluateApprovedArabicFontGate,
  evaluatePdfRuntimeCompatibilityGate,
  getPdfStorageGeneratorCapability,
} from "../../src/lib/student-requests/enrollment-certificate-pdf-storage-generator-contract";
import { getEnrollmentCertificateIssuanceCapability } from "../../src/lib/student-requests/enrollment-certificate-document-issuance-archive-contract";

const ROOT = join(import.meta.dir, "../..");

function countFontFiles(dir: string): number {
  if (!existsSync(dir)) return 0;
  let n = 0;
  const walk = (p: string) => {
    for (const ent of readdirSync(p, { withFileTypes: true })) {
      const full = join(p, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "node_modules" || ent.name === ".git") continue;
        walk(full);
      } else if (/\.(ttf|otf|woff2?)$/i.test(ent.name)) {
        n += 1;
      }
    }
  };
  walk(dir);
  return n;
}

describe("ENROLLMENT-CERTIFICATE-PDF-STORAGE-GENERATOR-01", () => {
  it("1 — primary decision is approved Arabic font HOLD", () => {
    expect(PDF_STORAGE_GENERATOR_DECISION).toBe(APPROVED_ARABIC_FONT_HOLD_CODE);
  });

  it("2 — capability is fail-closed (no execute / generate / upload)", () => {
    const cap = getPdfStorageGeneratorCapability({
      localCollegeLogoPresent: existsSync(join(ROOT, "src/assets/college-logo.jpg")),
      localUniversityLogoBinaryPresent: existsSync(
        join(ROOT, "src/assets/university-logo.jpeg"),
      ),
    });
    expect(cap.ready).toBe(false);
    expect(cap.canExecuteStaffIssue).toBe(false);
    expect(cap.canGeneratePdf).toBe(false);
    expect(cap.canUploadOfficialDocument).toBe(false);
    expect(cap.localArabicFontFilesPresent).toBe(false);
    expect(cap.edgeFunctionsPresent).toBe(false);
    expect(cap.officialDocumentsBucketPresent).toBe(false);
    expect(cap.blockers).toContain(APPROVED_ARABIC_FONT_HOLD_CODE);
    expect(cap.blockers).toContain(PDF_RUNTIME_HOLD_CODE);
  });

  it("3 — no vendored Arabic TTF/OTF in repo root sources", () => {
    const count =
      countFontFiles(join(ROOT, "src")) +
      countFontFiles(join(ROOT, "public")) +
      countFontFiles(join(ROOT, "assets"));
    expect(count).toBe(0);
  });

  it("4 — font gate always HOLDs when no approved local font", () => {
    const gate = evaluateApprovedArabicFontGate({
      localTtfOrOtfCount: 0,
      hasOfLicenseAdjacent: false,
      cdnOnlyUiFonts: true,
    });
    expect(gate.allowed).toBe(false);
    expect(gate.code).toBe(APPROVED_ARABIC_FONT_HOLD_CODE);
  });

  it("5 — runtime compatibility HOLDs without PDF lib spike", () => {
    const gate = evaluatePdfRuntimeCompatibilityGate({
      hasPdfLibraryDependency: false,
      hasArabicPdfSpikePassing: false,
      runtime: "cloudflare_workers_nitro",
    });
    expect(gate.allowed).toBe(false);
    expect(gate.code).toBe(PDF_RUNTIME_HOLD_CODE);
  });

  it("6 — staff issuance buttons stay disabled (linked contract)", () => {
    const issuance = getEnrollmentCertificateIssuanceCapability();
    expect(issuance.canIssueDocument).toBe(false);
    expect(issuance.canExecuteStaffIssueButtons).toBe(false);
  });

  it("7 — planned two-phase RPC names and private bucket are documented", () => {
    expect(PLANNED_TWO_PHASE_RPCS).toHaveLength(3);
    expect(PLANNED_TWO_PHASE_RPCS[0]).toContain("prepare_");
    expect(PLANNED_TWO_PHASE_RPCS[1]).toContain("finalize_");
    expect(PLANNED_TWO_PHASE_RPCS[2]).toContain("fail_");
    expect(PLANNED_STORAGE_BUCKET).toBe("official-documents");
  });

  it("8 — college logo asset exists; university binary may be missing", () => {
    expect(existsSync(join(ROOT, "src/assets/college-logo.jpg"))).toBe(true);
    expect(existsSync(join(ROOT, "src/assets/university-logo.jpeg.asset.json"))).toBe(
      true,
    );
  });

  it("9 — assert_pdf_generation_ready still present in prior contract migration", () => {
    const mig = join(
      ROOT,
      "supabase/migrations/20260713210000_enrollment_certificate_document_issuance_and_archive_contract_01.sql",
    );
    expect(existsSync(mig)).toBe(true);
    const sql = readFileSync(mig, "utf8");
    expect(sql).toContain("assert_enrollment_certificate_pdf_generation_ready");
    expect(sql).toContain("HOLD_ENROLLMENT_CERTIFICATE_PDF_GENERATION_CONTRACT_MISSING");
  });

  it("10 — package.json has qrcode but no pdf-lib/pdfkit/puppeteer", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(all.qrcode).toBeTruthy();
    expect(all["pdf-lib"]).toBeUndefined();
    expect(all.pdfkit).toBeUndefined();
    expect(all.puppeteer).toBeUndefined();
    expect(all["@react-pdf/renderer"]).toBeUndefined();
  });
});
