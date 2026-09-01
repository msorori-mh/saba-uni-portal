import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ARABIC_PDF_WORKER_SPIKE_DECISION,
  APPROVED_ARABIC_FONT_HOLD_CODE,
  PDF_RUNTIME_HOLD_CODE,
  PDF_STORAGE_GENERATOR_DECISION,
  PDF_STORAGE_SAGA_DECISION,
  PLANNED_STORAGE_BUCKET,
  PLANNED_TWO_PHASE_RPCS,
  SAGA_RPCS,
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

describe("ENROLLMENT-CERTIFICATE-PDF-STORAGE-GENERATOR-01 (saga-complete)", () => {
  it("1 — storage saga decision is PASS; spike PASS recorded", () => {
    expect(PDF_STORAGE_GENERATOR_DECISION).toBe(PDF_STORAGE_SAGA_DECISION);
    expect(PDF_STORAGE_SAGA_DECISION).toBe(
      "PASS_ENROLLMENT_CERTIFICATE_PDF_STORAGE_SAGA_CONTRACT_READY",
    );
    expect(ARABIC_PDF_WORKER_SPIKE_DECISION).toBe(
      "PASS_ARABIC_PDF_WORKER_SPIKE_READY_FOR_STORAGE_SAGA_IMPLEMENTATION",
    );
  });

  it("2 — capability fail-closed without bucket/worker env", () => {
    const fontPresent = existsSync(join(ROOT, "src/assets/fonts/cairo/Cairo-Variable.ttf"));
    const cap = getPdfStorageGeneratorCapability({
      localCollegeLogoPresent: existsSync(join(ROOT, "src/assets/college-logo.jpg")),
      localUniversityLogoBinaryPresent: existsSync(join(ROOT, "src/assets/university-logo.jpeg")),
      localArabicFontFilesPresent: fontPresent,
    });
    expect(cap.ready).toBe(false);
    expect(cap.canExecuteStaffIssue).toBe(false);
    expect(cap.localArabicFontFilesPresent).toBe(true);
    expect(cap.edgeFunctionsPresent).toBe(false);
    expect(cap.officialDocumentsBucketPresent).toBe(false);
    expect(cap.sagaRpcsDefined).toBe(true);
    expect(cap.arabicPdfWorkerSpikeDecision).toBe(ARABIC_PDF_WORKER_SPIKE_DECISION);
  });

  it("3 — Cairo TTF is vendored under src/assets/fonts", () => {
    const count =
      countFontFiles(join(ROOT, "src")) +
      countFontFiles(join(ROOT, "public")) +
      countFontFiles(join(ROOT, "assets"));
    expect(count).toBeGreaterThanOrEqual(1);
    expect(existsSync(join(ROOT, "src/assets/fonts/cairo/Cairo-Variable.ttf"))).toBe(true);
    expect(existsSync(join(ROOT, "src/assets/fonts/cairo/OFL.txt"))).toBe(true);
  });

  it("4 — font gate allows when local TTF + OFL present", () => {
    const gate = evaluateApprovedArabicFontGate({
      localTtfOrOtfCount: 1,
      hasOfLicenseAdjacent: true,
      cdnOnlyUiFonts: true,
    });
    expect(gate.allowed).toBe(true);
    expect(gate.code).toBe("font_ok");
    const deny = evaluateApprovedArabicFontGate({
      localTtfOrOtfCount: 0,
      hasOfLicenseAdjacent: false,
      cdnOnlyUiFonts: true,
    });
    expect(deny.allowed).toBe(false);
    expect(deny.code).toBe(APPROVED_ARABIC_FONT_HOLD_CODE);
  });

  it("5 — runtime gate allows when pdf-lib + Arabic spike pass", () => {
    const gate = evaluatePdfRuntimeCompatibilityGate({
      hasPdfLibraryDependency: true,
      hasArabicPdfSpikePassing: true,
      runtime: "cloudflare_workers_nitro",
    });
    expect(gate.allowed).toBe(true);
    expect(gate.code).toBe("runtime_ok");
    const deny = evaluatePdfRuntimeCompatibilityGate({
      hasPdfLibraryDependency: false,
      hasArabicPdfSpikePassing: false,
      runtime: "cloudflare_workers_nitro",
    });
    expect(deny.allowed).toBe(false);
    expect(deny.code).toBe(PDF_RUNTIME_HOLD_CODE);
  });

  it("6 — staff issuance buttons stay disabled without env (linked contract)", () => {
    const issuance = getEnrollmentCertificateIssuanceCapability();
    expect(issuance.canIssueDocument).toBe(false);
    expect(issuance.canExecuteStaffIssueButtons).toBe(false);
  });

  it("7 — saga RPC names and private bucket documented", () => {
    expect(SAGA_RPCS.length).toBeGreaterThanOrEqual(5);
    expect(PLANNED_TWO_PHASE_RPCS).toEqual(SAGA_RPCS);
    expect(SAGA_RPCS.some((r) => r.includes("prepare_"))).toBe(true);
    expect(SAGA_RPCS.some((r) => r.includes("finalize_"))).toBe(true);
    expect(SAGA_RPCS.some((r) => r.includes("fail_"))).toBe(true);
    expect(PLANNED_STORAGE_BUCKET).toBe("official-documents");
  });

  it("8 — college and university logo assets exist locally", () => {
    expect(existsSync(join(ROOT, "src/assets/college-logo.jpg"))).toBe(true);
    expect(existsSync(join(ROOT, "src/assets/university-logo.jpeg"))).toBe(true);
    expect(existsSync(join(ROOT, "src/assets/university-logo.jpeg.asset.json"))).toBe(true);
  });

  it("9 — assert still present in prior migration; saga replace assert with bucket gate", () => {
    const prior = join(
      ROOT,
      "supabase/migrations/20260713210000_enrollment_certificate_document_issuance_and_archive_contract_01.sql",
    );
    expect(existsSync(prior)).toBe(true);
    const priorSql = readFileSync(prior, "utf8");
    expect(priorSql).toContain("assert_enrollment_certificate_pdf_generation_ready");
    expect(priorSql).toContain("HOLD_ENROLLMENT_CERTIFICATE_PDF_GENERATION_CONTRACT_MISSING");

    const saga = join(
      ROOT,
      "supabase/migrations/20260714010000_enrollment_certificate_pdf_storage_saga_completion_01.sql",
    );
    expect(existsSync(saga)).toBe(true);
    const sagaSql = readFileSync(saga, "utf8");
    expect(sagaSql).toContain("HOLD_ENROLLMENT_CERTIFICATE_PDF_STORAGE_BUCKET_MISSING");
  });

  it("10 — package.json includes pdf-lib stack; no puppeteer", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(all["pdf-lib"]).toBeTruthy();
    expect(all["@pdf-lib/fontkit"]).toBeTruthy();
    expect(all.qrcode).toBeTruthy();
    expect(all.puppeteer).toBeUndefined();
  });
});
