import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  SPIKE_FIXTURE,
  assertArabicOpenTypeShaping,
  generateEnrollmentCertificateSpikePdf,
  segmentBidiRuns,
} from "../../src/lib/documents/arabic-pdf-worker-spike";

const ROOT = join(import.meta.dir, "../..");
const FONT = join(ROOT, "src/assets/fonts/cairo/Cairo-Variable.ttf");
const OFL = join(ROOT, "src/assets/fonts/cairo/OFL.txt");
const README = join(ROOT, "src/assets/fonts/cairo/README.md");
const LOGO = join(ROOT, "src/assets/college-logo.jpg");
const EXPECTED_SHA = "667C987182391C91F4E57A2F455B1794FB5E3EE6CA4EF3383E86BB690FA9C964";

describe("ENROLLMENT-CERTIFICATE-ARABIC-PDF-WORKER-SPIKE-01", () => {
  it("1 — Cairo font file is vendored locally", () => {
    expect(existsSync(FONT)).toBe(true);
    expect(readFileSync(FONT).byteLength).toBeGreaterThan(100_000);
  });

  it("2 — OFL license file is present", () => {
    const ofl = readFileSync(OFL, "utf8");
    expect(ofl).toContain("SIL Open Font License");
    expect(ofl).toContain("Version 1.1");
  });

  it("3 — documented SHA-256 matches file bytes", () => {
    const hash = createHash("sha256").update(readFileSync(FONT)).digest("hex").toUpperCase();
    expect(hash).toBe(EXPECTED_SHA);
    const readme = readFileSync(README, "utf8");
    expect(readme).toContain(EXPECTED_SHA);
    expect(readme).toContain("OFL-1.1");
    expect(readme).toContain("google/fonts");
  });

  it("4 — generator / docs do not load fonts from CDN", () => {
    const spike = readFileSync(join(ROOT, "src/lib/documents/arabic-pdf-worker-spike.ts"), "utf8");
    expect(spike).not.toMatch(/fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr.*cairo/i);
    expect(spike).not.toMatch(/fetch\s*\(\s*['`].*Cairo/i);
    const readme = readFileSync(README, "utf8");
    expect(readme).toMatch(/must load this local file|Do \*\*not\*\* fetch Cairo/i);
  });

  it("5 — fontkit OpenType layout shapes Arabic joining forms", () => {
    expect(() => assertArabicOpenTypeShaping(new Uint8Array(readFileSync(FONT)))).not.toThrow();
    const runs = segmentBidiRuns("شهادة قيد — TEST-2026-001", "rtl");
    expect(runs.some((r) => r.dir === "rtl")).toBe(true);
    expect(runs.some((r) => r.dir === "ltr" && r.text.includes("TEST"))).toBe(true);
  });

  it("6–10 — generate PDF: header, non-empty, size, fixture, no real student ids", async () => {
    const result = await generateEnrollmentCertificateSpikePdf({
      fontBytes: new Uint8Array(readFileSync(FONT)),
      logoBytes: new Uint8Array(readFileSync(LOGO)),
    });
    expect(result.startsWithPdfHeader).toBe(true);
    expect(String.fromCharCode(...result.pdfBytes.slice(0, 4))).toBe("%PDF");
    expect(result.byteLength).toBeGreaterThan(5_000);
    expect(result.byteLength).toBeLessThan(2_500_000);
    expect(result.pageCount).toBe(1);
    expect(result.usedNetwork).toBe(false);
    expect(result.usedDatabase).toBe(false);
    expect(result.usedStorage).toBe(false);
    expect(result.shaping).toBe("fontkit.layout+bidi-js-runs");
    expect(SPIKE_FIXTURE.academicNumber).toBe("TEST-2026-001");
    expect(SPIKE_FIXTURE.studentNameAr).toBe("طالب الاختبار");
    const asText = Buffer.from(result.pdfBytes).toString("latin1");
    expect(asText).not.toContain("93807768");
    expect(asText).not.toContain("wadeh@");

    const outDir = join(ROOT, ".tmp");
    mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, "enrollment-certificate-arabic-pdf-worker-spike.pdf");
    writeFileSync(outPath, result.pdfBytes);
    expect(existsSync(outPath)).toBe(true);
  });

  it("11 — QR and logo inputs are required (not empty)", async () => {
    await expect(
      generateEnrollmentCertificateSpikePdf({
        fontBytes: new Uint8Array(readFileSync(FONT)),
        logoBytes: new Uint8Array(),
      }),
    ).rejects.toThrow(/Logo/);
  });

  it("12 — package.json includes pdf-lib + fontkit + bidi (no puppeteer / no CDN font libs)", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(all["pdf-lib"]).toBeTruthy();
    expect(all["@pdf-lib/fontkit"]).toBeTruthy();
    expect(all["bidi-js"]).toBeTruthy();
    expect(all.qrcode).toBeTruthy();
    expect(all.puppeteer).toBeUndefined();
  });

  it("13 — assert_enrollment_certificate_pdf_generation_ready still holds issuance", () => {
    const mig = readFileSync(
      join(
        ROOT,
        "supabase/migrations/20260713210000_enrollment_certificate_document_issuance_and_archive_contract_01.sql",
      ),
      "utf8",
    );
    expect(mig).toContain("assert_enrollment_certificate_pdf_generation_ready");
  });

  it("14 — generator source has no DB/Storage/network imports", () => {
    const spike = readFileSync(join(ROOT, "src/lib/documents/arabic-pdf-worker-spike.ts"), "utf8");
    expect(spike).not.toMatch(/from ['\"]@\/integrations\/supabase/);
    expect(spike).not.toMatch(/supabaseAdmin|createClient|storage\.from/);
    expect(spike).not.toMatch(/\bfetch\s*\(/);
    expect(spike).not.toMatch(/from ['\"]node:fs['\"]|from ['\"]fs['\"]/);
    expect(SPIKE_FIXTURE.studentNameAr).toBe("طالب الاختبار");
  });
});
