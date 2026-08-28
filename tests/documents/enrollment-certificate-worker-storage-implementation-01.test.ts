/**
 * Regression tests for WORKER_STORAGE_IMPLEMENTATION_01 (B1/B2/B3/B5).
 *
 * Pure static/unit checks — no DB, no Storage, no Worker invoke, no PDF
 * bytes uploaded anywhere. Safe to run in any environment.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  loadCollegeLogoBytes,
  sha256Hex,
  buildEnrollmentCertificatePdfBytes,
} from "@/lib/documents/enrollment-certificate-pdf";
import { readCairoFontFromCloudflareAssets } from "@/lib/documents/enrollment-certificate-pdf-assets.server";
import { resolvePublicAppOrigin } from "@/lib/student-requests/enrollment-certificate-pdf-storage-saga.functions";
import {
  buildEnrollmentCertificateIdempotencyKey,
  shouldShowEnrollmentCertificateIssueButton,
} from "@/components/student-requests/EnrollmentCertificateIssueButton";

const ROOT = join(import.meta.dir, "../..");

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

describe("B1 — production PDF path is Cloudflare-Workers safe", () => {
  const pdfSrc = read("src/lib/documents/enrollment-certificate-pdf.ts");
  const assetsSrc = read("src/lib/documents/enrollment-certificate-pdf-assets.server.ts");
  const sagaSrc = read(
    "src/lib/student-requests/enrollment-certificate-pdf-storage-saga.functions.ts",
  );

  it("does not import node:fs or node:path or use process.cwd/readFileSync", () => {
    for (const src of [pdfSrc, assetsSrc, sagaSrc]) {
      expect(src).not.toMatch(/from ["']node:fs["']/);
      expect(src).not.toMatch(/from ["']node:path["']/);
      expect(src).not.toMatch(/\breadFileSync\b/);
      expect(src).not.toMatch(/process\.cwd\s*\(/);
    }
  });

  it("uses a non-empty local Cairo fixture and bundled logo", () => {
    const font = new Uint8Array(
      readFileSync(join(ROOT, "src/assets/fonts/cairo/Cairo-Variable.ttf")),
    );
    const logo = loadCollegeLogoBytes();
    expect(font).toBeInstanceOf(Uint8Array);
    expect(logo).toBeInstanceOf(Uint8Array);
    expect(font.byteLength).toBeGreaterThan(100_000);
    expect(logo.byteLength).toBeGreaterThan(1_000);
  });

  it("loads Cairo through the same-deployment Cloudflare ASSETS binding", async () => {
    let requested = "";
    const font = await readCairoFontFromCloudflareAssets({
      async fetch(input) {
        requested = String(input);
        return new Response(new Uint8Array([0, 1, 2, 3]));
      },
    });
    expect(requested).toBe("https://assets.local/__worker-assets/Cairo-Variable.ttf");
    expect(Array.from(font)).toEqual([0, 1, 2, 3]);
  });

  it("builds a valid PDF from fixture snapshot with correct SHA length", async () => {
    const built = await buildEnrollmentCertificatePdfBytes({
      snapshot: {
        student_name_ar: "طالب الاختبار",
        academic_number: "TEST-2026-001",
        department_name_ar: "قسم تكنولوجيا المعلومات",
        program_name_ar: "بكالوريوس تكنولوجيا المعلومات",
        academic_year_name: "2025-2026",
        semester_name: "الفصل الأول",
        level_name: "المستوى الأول",
      },
      documentNumber: "TEST-DOC-0001",
      verificationUrl: "https://quboolye.com/verify-document?code=TESTONLY",
      fontBytes: new Uint8Array(
        readFileSync(join(ROOT, "src/assets/fonts/cairo/Cairo-Variable.ttf")),
      ),
    });
    expect(built.byteLength).toBeGreaterThan(5_000);
    expect(built.pdfBytes[0]).toBe(0x25); // %
    expect(built.pdfBytes[1]).toBe(0x50); // P
    expect(built.pdfBytes[2]).toBe(0x44); // D
    expect(built.pdfBytes[3]).toBe(0x46); // F
    expect(built.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex(built.pdfBytes)).toBe(built.sha256);
  });
});

describe("B3 — SITE_URL is server-only and fail-closed", () => {
  const sagaSrc = read(
    "src/lib/student-requests/enrollment-certificate-pdf-storage-saga.functions.ts",
  );

  it("saga file does not reference VITE_PUBLIC_APP_URL or example.invalid", () => {
    expect(sagaSrc).not.toMatch(/VITE_PUBLIC_APP_URL/);
    expect(sagaSrc).not.toMatch(/example\.invalid/);
  });

  it("resolvePublicAppOrigin accepts a valid https URL and strips trailing slash", () => {
    expect(resolvePublicAppOrigin({ SITE_URL: "https://quboolye.com/" })).toBe(
      "https://quboolye.com",
    );
    expect(resolvePublicAppOrigin({ SITE_URL: "https://quboolye.com" })).toBe(
      "https://quboolye.com",
    );
  });

  it("throws when SITE_URL is missing", () => {
    expect(() => resolvePublicAppOrigin({ SITE_URL: undefined })).toThrow(/SITE_URL/);
    expect(() => resolvePublicAppOrigin({ SITE_URL: "" })).toThrow(/SITE_URL/);
  });

  it("throws on invalid URL", () => {
    expect(() => resolvePublicAppOrigin({ SITE_URL: "not a url" })).toThrow();
  });

  it("throws on non-http(s) protocol", () => {
    expect(() => resolvePublicAppOrigin({ SITE_URL: "ftp://foo" })).toThrow();
  });

  it("throws on http in production", () => {
    expect(() =>
      resolvePublicAppOrigin({ SITE_URL: "http://foo.test", NODE_ENV: "production" }),
    ).toThrow(/https/);
  });
});

describe("B2 — attachSupabaseAuth stays registered in start.ts", () => {
  const src = read("src/start.ts");
  it("registers attachSupabaseAuth in functionMiddleware", () => {
    // Canonical module is auth-attacher; production wiring may use the
    // project-local refresh-aware replacement (auth-attacher.local).
    expect(src).toMatch(
      /from ["']@\/integrations\/supabase\/auth-attacher(?:\.local)?["']/,
    );
    expect(src).toMatch(/functionMiddleware:\s*\[[^\]]*attachSupabaseAuth[^\]]*\]/);
  });
});

describe("B5 — issue button gating & idempotency key", () => {
  const base = {
    requestId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    requestTypeCode: "enrollment_certificate",
    currentStep: {
      id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      stepKey: "document_issuance",
      status: "current" as const,
      isPreview: false,
    },
    hasActiveOfficialDocument: false,
    canActOnIssueDocument: true,
  };

  it("shows the button only when every condition is met", () => {
    expect(shouldShowEnrollmentCertificateIssueButton(base)).toBe(true);
  });

  it("hides the button for the blocked pilot request", () => {
    expect(
      shouldShowEnrollmentCertificateIssueButton({
        ...base,
        requestId: "93807768-a281-42de-bfb4-0c0c03786b20",
      }),
    ).toBe(false);
  });

  it("hides for wrong request type / step / status / preview / missing id", () => {
    expect(
      shouldShowEnrollmentCertificateIssueButton({ ...base, requestTypeCode: "other" }),
    ).toBe(false);
    expect(
      shouldShowEnrollmentCertificateIssueButton({
        ...base,
        currentStep: { ...base.currentStep, stepKey: "dean_signature" },
      }),
    ).toBe(false);
    expect(
      shouldShowEnrollmentCertificateIssueButton({
        ...base,
        currentStep: { ...base.currentStep, status: "upcoming" },
      }),
    ).toBe(false);
    expect(
      shouldShowEnrollmentCertificateIssueButton({
        ...base,
        currentStep: { ...base.currentStep, isPreview: true },
      }),
    ).toBe(false);
    expect(
      shouldShowEnrollmentCertificateIssueButton({
        ...base,
        currentStep: { ...base.currentStep, id: null },
      }),
    ).toBe(false);
    expect(
      shouldShowEnrollmentCertificateIssueButton({
        ...base,
        hasActiveOfficialDocument: true,
      }),
    ).toBe(false);
    expect(
      shouldShowEnrollmentCertificateIssueButton({
        ...base,
        canActOnIssueDocument: false,
      }),
    ).toBe(false);
  });

  it("idempotency key is deterministic and within 8..120 length", () => {
    const k1 = buildEnrollmentCertificateIdempotencyKey(base.requestId, base.currentStep.id);
    const k2 = buildEnrollmentCertificateIdempotencyKey(base.requestId, base.currentStep.id);
    expect(k1).toBe(k2);
    expect(k1.startsWith("enrollment-certificate:")).toBe(true);
    expect(k1.endsWith(":v1")).toBe(true);
    expect(k1.length).toBeGreaterThanOrEqual(8);
    expect(k1.length).toBeLessThanOrEqual(120);
  });

  it("UI button component references the saga server function", () => {
    const btn = read("src/components/student-requests/EnrollmentCertificateIssueButton.tsx");
    expect(btn).toMatch(/executeEnrollmentCertificatePdfStorageSaga/);
    // No client-side Storage writes:
    expect(btn).not.toMatch(/supabase\.storage/);
    expect(btn).not.toMatch(/\.upload\(/);
  });

  it("StaffRequestDetailPanel mounts the issue button", () => {
    const src = read("src/components/student-requests/StaffRequestDetailPanel.tsx");
    expect(src).toMatch(/EnrollmentCertificateIssueButton/);
  });
});
