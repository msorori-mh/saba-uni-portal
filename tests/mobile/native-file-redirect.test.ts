import { describe, expect, test } from "bun:test";
import { validateSignedStorageUrl, buildFileRedirectUrl } from "../../src/lib/native/file-redirect";
import { Route } from "../../src/routes/api/public/file-redirect";

const OK = "https://cldpnartkfnmllrkjaoi.supabase.co/storage/v1/object/sign/course-materials/a/b.pdf?token=abc";
const handler = (Route as any).options.server.handlers.GET;
const call = (u: string) => handler({ request: new Request(`https://saba-uni-portal.lovable.app/api/public/file-redirect?u=${encodeURIComponent(u)}`) });

describe("native file redirect", () => {
  test("accepts allowed buckets", () => {
    expect(validateSignedStorageUrl(OK)).toBe(OK);
    expect(validateSignedStorageUrl(OK.replace("course-materials", "official-documents"))).not.toBeNull();
  });
  test.each([
    "https://evil.com/storage/v1/object/sign/course-materials/a?token=x",
    "http://cldpnartkfnmllrkjaoi.supabase.co/storage/v1/object/sign/course-materials/a?token=x",
    "https://cldpnartkfnmllrkjaoi.supabase.co/storage/v1/object/public/course-materials/a?token=x",
    "https://cldpnartkfnmllrkjaoi.supabase.co/storage/v1/object/sign/payment-receipts/a?token=x",
    "https://cldpnartkfnmllrkjaoi.supabase.co/storage/v1/object/sign/course-materials/a",
    "https://cldpnartkfnmllrkjaoi.supabase.co.evil.com/storage/v1/object/sign/course-materials/a?token=x",
    "javascript:alert(1)",
    "",
  ])("rejects %s", async (u) => {
    expect(validateSignedStorageUrl(u)).toBeNull();
    const res = await call(u);
    expect(res.status).toBe(400);
  });
  test("302 with no-store + no-referrer", async () => {
    const res = await call(OK);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(OK);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
  });
  test("redirect host is outside Capacitor allowNavigation", async () => {
    const cfg = (await import("../../capacitor.config")).default;
    expect(cfg.server?.allowNavigation).not.toContain("saba-uni-portal.lovable.app");
    expect(buildFileRedirectUrl(OK).startsWith("https://saba-uni-portal.lovable.app/api/public/file-redirect?u=")).toBe(true);
  });
});
