import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const live = readFileSync("src/lib/staff-self-service-live.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260822010000_staff_self_service_storage_binding_02b.sql",
  "utf8",
);

describe("PORTAL_STAFF_SELF_SERVICE_LIVE_BINDING_02B", () => {
  test("keeps Supabase calls out of UI components behind one typed seam", () => {
    expect(live).toContain("PORTAL_STAFF_SELF_SERVICE_STORAGE_BINDING_02B");
    expect(live).toContain('from "@/integrations/supabase/client"');
    expect(live).toContain("staffServiceSubmitSchema");
    expect(live).toContain("staffServiceDecisionSchema");
    expect(live).toContain("staffAttachmentIntentSchema");
  });

  test("binds request submission and scoped decisions to atomic RPCs", () => {
    expect(live).toContain('"staff_service_submit_request"');
    expect(live).toContain('"staff_service_decide_request"');
    expect(live).toContain("p_idempotency_key");
    expect(live).not.toMatch(/\.from\([^)]+\)\.(insert|update|delete|upsert)/);
  });

  test("uses private upload, checksum, finalize, scan gate, and 300-second URLs", () => {
    expect(live).toContain('crypto.subtle.digest("SHA-256"');
    expect(live).toContain('upsert: false');
    expect(live).toContain('"staff_service_create_attachment_upload_intent"');
    expect(live).toContain('"staff_service_finalize_attachment_upload"');
    expect(live).toContain('"staff_service_authorize_attachment_download"');
    expect(live).toContain("createSignedUrl");
    expect(live).not.toMatch(/getPublicUrl|publicURL/i);
    expect(migration).toContain("scan_state = 'clean'");
  });

  test("maps backend failures to safe Arabic messages without leaking internals", () => {
    expect(live).toContain("SAFE_ERROR_MESSAGES");
    expect(live).toContain("لا تملك صلاحية معالجة هذا الطلب");
    expect(live).toContain("تعذر إكمال العملية بأمان");
    expect(live).not.toMatch(/throw\s+error\b/i);
  });
});

