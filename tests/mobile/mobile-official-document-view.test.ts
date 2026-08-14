import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isDownloadableStatus,
  documentNotDownloadableMessage,
  printActionLabel,
  downloadOfficialDocumentPdf,
} from "@/lib/documents/official-document-actions";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("mobile contained document route", () => {
  test("list route is an index and detail route exists", () => {
    expect(existsSync(join(ROOT, "src/routes/mobile.student.documents.index.tsx"))).toBe(true);
    expect(existsSync(join(ROOT, "src/routes/mobile.student.documents.$id.tsx"))).toBe(true);
    expect(read("src/routes/mobile.student.documents.index.tsx")).toContain(
      'createFileRoute("/mobile/student/documents/")',
    );
    expect(read("src/routes/mobile.student.documents.$id.tsx")).toContain(
      'createFileRoute("/mobile/student/documents/$id")',
    );
  });

  test("list opens the contained route, never /document-view", () => {
    const list = read("src/routes/mobile.student.documents.index.tsx");
    expect(list).toContain('to="/mobile/student/documents/$id"');
    expect(list).not.toContain("/document-view/");
  });

  test("detail route scopes the read to the caller's own student profile", () => {
    const detail = read("src/routes/mobile.student.documents.$id.tsx");
    expect(detail).toContain('.eq("student_profile_id", profile.id)');
    expect(detail).toContain("ليس لديك صلاحية الوصول إلى هذه الوثيقة");
  });

  test("detail route has a back link to the documents list", () => {
    expect(read("src/routes/mobile.student.documents.$id.tsx")).toContain(
      'to="/mobile/student/documents"',
    );
  });
});

describe("real PDF download (no window.print for download)", () => {
  test("mobile detail route never calls window.print()", () => {
    expect(read("src/routes/mobile.student.documents.$id.tsx")).not.toContain("window.print()");
  });

  test("web document view downloads through the signed-URL action", () => {
    const web = read("src/routes/document-view.$id.tsx");
    expect(web).toContain("downloadOfficialDocumentPdf");
    expect(web).not.toMatch(/handleDownload[\s\S]{0,400}window\.print\(\)/);
  });

  test("download is authorized server-side and never builds a public URL", () => {
    const actions = read("src/lib/documents/official-document-actions.ts");
    expect(actions).not.toContain("getPublicUrl");
    expect(actions).not.toContain("/storage/v1/object/public");
    const wrapper = read("src/lib/documents/official-document-download.functions.ts");
    expect(wrapper).toContain("getEnrollmentCertificateDocumentSignedUrl as getOfficialDocumentSignedUrl");
  });
});

describe("status barrier", () => {
  test("only issued/archived are downloadable", () => {
    expect(isDownloadableStatus("issued")).toBe(true);
    expect(isDownloadableStatus("archived")).toBe(true);
    expect(isDownloadableStatus("draft")).toBe(false);
    expect(isDownloadableStatus("cancelled")).toBe(false);
    expect(isDownloadableStatus(null)).toBe(false);
  });

  test("cancelled documents get an explicit Arabic denial", () => {
    expect(documentNotDownloadableMessage("cancelled")).toContain("ملغاة");
  });

  test("download refuses non-downloadable statuses without calling the resolver", async () => {
    let called = 0;
    const res = await downloadOfficialDocumentPdf("doc-1", "cancelled", async () => {
      called += 1;
      return { signedUrl: "https://example.invalid/x", expiresInSeconds: 60 };
    });
    expect(called).toBe(0);
    expect(res.ok).toBe(false);
  });

  test("resolver failure surfaces a user-facing error, not a throw", async () => {
    const res = await downloadOfficialDocumentPdf("doc-1", "issued", async () => {
      throw new Error("DENY");
    });
    expect(res).toEqual({ ok: false, error: "DENY" });
  });

  test("print label is web-facing outside the native shell", () => {
    expect(printActionLabel(false)).toBe("طباعة");
    expect(printActionLabel(true)).toBe("فتح للطباعة");
  });
});

describe("responsive document templates", () => {
  const tpl = read("src/components/documents/DocumentTemplates.tsx");

  test("mobile padding is p-4 and print keeps p-8", () => {
    expect(tpl).toContain("p-4 sm:p-8 print:p-8");
    expect(tpl).not.toMatch(/className="bg-white text-foreground p-8/);
  });

  test("fields stack on mobile", () => {
    expect(tpl).toContain("flex flex-col gap-0.5");
    expect(tpl).toContain("sm:min-w-[140px] print:min-w-[140px]");
  });

  test("logos shrink on mobile and restore for print", () => {
    expect(tpl).toContain("h-12 w-12 sm:h-20 sm:w-20");
    expect(tpl).toContain("print:h-20 print:w-20");
  });

  test("transcript table scrolls instead of overflowing the viewport", () => {
    expect(tpl).toContain("overflow-x-auto print:overflow-visible");
  });
});
