import { describe, expect, it } from "bun:test";
import {
  MobileApiError,
  mapUnknownToMobileError,
  sanitizeClientMessage,
  MOBILE_API_ERROR_FAMILIES,
} from "@/lib/mobile-api/errors";
import {
  isDownloadableOfficialDocumentStatus,
  evaluateDownloadAuthorization,
  CANCELLED_DOCUMENT_DOWNLOAD_ERROR_MESSAGE_AR,
} from "@/lib/student-requests/enrollment-certificate-pdf-storage-generator-contract";
import {
  MOBILE_CAPABILITIES,
  listMobileCapabilities,
} from "@/lib/mobile-api/capabilities";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

describe("mobile-api error contract", () => {
  it("defines required error families", () => {
    for (const f of [
      "AUTH_REQUIRED",
      "STUDENT_CONTEXT_REQUIRED",
      "NOT_FOUND",
      "NOT_ALLOWED",
      "INVALID_STATE",
      "VALIDATION_ERROR",
      "SERVICE_UNAVAILABLE",
      "RATE_LIMITED",
    ]) {
      expect(MOBILE_API_ERROR_FAMILIES).toContain(f);
    }
  });

  it("sanitizes SQL / stack / service_role leakage", () => {
    expect(sanitizeClientMessage("permission denied for relation \"x\"", "safe")).toBe("safe");
    expect(sanitizeClientMessage("SUPABASE_SERVICE_ROLE_KEY=abc", "safe")).toBe("safe");
    expect(
      sanitizeClientMessage("Error: boom\n    at Object.handler (/app/x.ts:1:1)", "safe"),
    ).toBe("safe");
    expect(sanitizeClientMessage("PGRST116", "safe")).toBe("safe");
    expect(sanitizeClientMessage("الوثيقة ملغاة", "safe")).toBe("الوثيقة ملغاة");
  });

  it("maps auth and cross-student denials", () => {
    expect(mapUnknownToMobileError(new Error("Unauthorized: Invalid token")).family).toBe(
      "AUTH_REQUIRED",
    );
    expect(mapUnknownToMobileError(new Error("غير مصرح بتنزيل هذه الوثيقة")).family).toBe(
      "NOT_ALLOWED",
    );
    expect(mapUnknownToMobileError(new Error("Student profile not found")).family).toBe(
      "STUDENT_CONTEXT_REQUIRED",
    );
    expect(
      mapUnknownToMobileError(new Error("الوثيقة ملغاة وغير صالحة للتنزيل")).family,
    ).toBe("INVALID_STATE");
  });

  it("never returns raw stack in MobileApiError body", () => {
    const err = mapUnknownToMobileError(
      new Error("Error: fail\n    at Object.<anonymous> (/secret/path.ts:10:5)"),
    );
    const body = err.toBody();
    expect(body.error.message).not.toContain("/secret/");
    expect(body.error.message).not.toMatch(/at Object/);
  });
});

describe("official document download policy", () => {
  it("allows issued and archived only", () => {
    expect(isDownloadableOfficialDocumentStatus("issued")).toBe(true);
    expect(isDownloadableOfficialDocumentStatus("archived")).toBe(true);
    expect(isDownloadableOfficialDocumentStatus("draft")).toBe(false);
    expect(isDownloadableOfficialDocumentStatus("cancelled")).toBe(false);
    expect(isDownloadableOfficialDocumentStatus(null)).toBe(false);
  });

  it("owner allow / non-owner deny matrix (authorization helper)", () => {
    expect(
      evaluateDownloadAuthorization({
        isOwner: true,
        isStaffAuthorized: false,
        isAdmin: false,
      }),
    ).toBe(true);
    expect(
      evaluateDownloadAuthorization({
        isOwner: false,
        isStaffAuthorized: false,
        isAdmin: false,
      }),
    ).toBe(false);
  });

  it("cancelled message is stable Arabic", () => {
    expect(CANCELLED_DOCUMENT_DOWNLOAD_ERROR_MESSAGE_AR).toContain("ملغاة");
  });

  it("mobile download service enforces studentSelfOnly and path validation", () => {
    const src = readFileSync(
      join(root, "src/lib/mobile-api/official-document-download.service.ts"),
      "utf8",
    );
    expect(src).toContain("studentSelfOnly");
    expect(src).toContain("CROSS_STUDENT_DENIED");
    expect(src).toContain("DOCUMENT_DRAFT");
    expect(src).toContain("DOCUMENT_CANCELLED");
    expect(src).toContain("createSignedUrl");
    expect(src).not.toMatch(/public:\s*true/);
  });
});

describe("mobile capabilities registry", () => {
  it("marks certificate PDF generation HOLD and others ready/source", () => {
    expect(MOBILE_CAPABILITIES.certificate_pdf_generation.status).toBe("HOLD");
    expect(MOBILE_CAPABILITIES.official_document_download.status).toBe("READY_PUBLIC_API");
    expect(MOBILE_CAPABILITIES.academic_progress.status).toBe("READY_PUBLIC_API");
    expect(MOBILE_CAPABILITIES.unofficial_transcript.status).toBe("READY_PUBLIC_API");
    expect(MOBILE_CAPABILITIES.course_materials.status).toBe("READY_PUBLIC_API");
    expect(MOBILE_CAPABILITIES.push_token_registration.status).toBe("SOURCE_READY");
    const listed = listMobileCapabilities();
    expect(listed.version).toBe("v1");
    expect(listed.capabilities.length).toBe(6);
  });
});

describe("mobile API route + docs surface", () => {
  const routes = [
    "src/routes/api.mobile.v1.official-documents.download.ts",
    "src/routes/api.mobile.v1.academic-progress.ts",
    "src/routes/api.mobile.v1.unofficial-transcript.ts",
    "src/routes/api.mobile.v1.course-materials.ts",
    "src/routes/api.mobile.v1.course-materials.download.ts",
    "src/routes/api.mobile.v1.capabilities.ts",
  ];

  it("ships stable /api/mobile/v1 routes (not createServerFn names)", () => {
    for (const r of routes) {
      expect(existsSync(join(root, r))).toBe(true);
      const src = readFileSync(join(root, r), "utf8");
      expect(src).toContain("/api/mobile/v1/");
      expect(src).not.toContain("createServerFn");
    }
  });

  it("docs + flutter contract exist without secrets", () => {
    const md = readFileSync(join(root, "docs/mobile/MOBILE-PUBLIC-API-V1.md"), "utf8");
    const json = readFileSync(
      join(root, "docs/mobile/MOBILE-PUBLIC-API-V1-FLUTTER-CONTRACT.json"),
      "utf8",
    );
    expect(md).toContain("READY_PUBLIC_API");
    expect(md).toContain("HOLD");
    expect(json).toContain("official_document_download");
    // No credential material — advisory mentions of service_role denial are OK
    expect(json).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY\s*=/);
    expect(json).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\./);
    expect(md).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\./);
  });

  it("academic progress reuses computeStudentProgress export", () => {
    const academic = readFileSync(join(root, "src/lib/academic-status.functions.ts"), "utf8");
    const mobile = readFileSync(
      join(root, "src/lib/mobile-api/academic-progress.service.ts"),
      "utf8",
    );
    expect(academic).toContain("export async function computeStudentProgress");
    expect(mobile).toContain("computeStudentProgress");
  });

  it("transcript mobile path never accepts foreign studentProfileId", () => {
    const src = readFileSync(
      join(root, "src/lib/mobile-api/unofficial-transcript.service.ts"),
      "utf8",
    );
    expect(src).toContain("resolveOwnStudentProfile");
    expect(src).not.toMatch(/studentProfileId.*input/);
  });

  it("course materials enforce enrollment audience + clean scan", () => {
    const src = readFileSync(
      join(root, "src/lib/mobile-api/course-materials.service.ts"),
      "utf8",
    );
    expect(src).toContain("canAccessPublishedMaterial");
    expect(src).toContain("isMaterialFileDownloadable");
    expect(src).toContain("MATERIAL_ACCESS_DENIED");
  });
});

describe("certificate PDF generation HOLD", () => {
  it("does not expose a mobile generation endpoint", () => {
    const cap = MOBILE_CAPABILITIES.certificate_pdf_generation;
    expect(cap.status).toBe("HOLD");
    expect(cap.operation).toBeNull();
    expect(existsSync(join(root, "src/routes/api.mobile.v1.certificate-pdf.ts"))).toBe(false);
  });
});

describe("push token migration source contract", () => {
  const migPath = join(
    root,
    "supabase/migrations/20260812010000_mobile_push_token_registration_01.sql",
  );

  it("defines table + SECURITY DEFINER RPCs with search_path and grants", () => {
    const sql = readFileSync(migPath, "utf8");
    expect(sql).toContain("mobile_device_push_tokens");
    expect(sql).toContain("register_mobile_push_token");
    expect(sql).toContain("revoke_mobile_push_token");
    expect(sql).toContain("touch_mobile_push_token");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path TO 'public', 'pg_temp'");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.register_mobile_push_token");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.register_mobile_push_token");
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    // no unauthenticated grants
    expect(sql).not.toMatch(/GRANT EXECUTE.*TO anon/);
    expect(sql).not.toMatch(/GRANT INSERT ON TABLE public.mobile_device_push_tokens TO authenticated/);
  });
});
