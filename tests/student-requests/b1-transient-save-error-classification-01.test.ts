// PORTAL-B1-PAYMENT-CONFIRMATION-AUTHORIZATION-HARDENING-01 / G4.
// A transient draft-save failure during an attachment upload/refetch must never
// be reported as "هذه الخدمة غير مفعّلة حالياً".
import { describe, expect, test } from "bun:test";
import { B1AdapterError } from "@/lib/student-requests/b1-ui/adapter.types";
import {
  B1_TRANSIENT_SAVE_MESSAGE_AR,
  classifyB1SaveError,
  logB1SaveDiagnostic,
  sanitizeB1DiagnosticCode,
} from "@/lib/student-requests/b1-ui/save-error-classification";

const INACTIVE_AR = "هذه الخدمة غير مفعّلة حالياً.";

describe("transient save failure during upload", () => {
  test("ACTIVATION_BLOCKED from a save is transient, not the inactive banner", () => {
    const result = classifyB1SaveError(
      new B1AdapterError("ACTIVATION_BLOCKED", "SECURE_ATTACHMENTS_RUNTIME_NOT_AVAILABLE"),
      "attachment_sync",
    );
    expect(result.severity).toBe("transient");
    expect(result.retryable).toBe(true);
    expect(result.messageAr).toBe(B1_TRANSIENT_SAVE_MESSAGE_AR);
    expect(result.messageAr).not.toBe(INACTIVE_AR);
  });

  test("network failure stays transient with the network message", () => {
    const result = classifyB1SaveError(
      new B1AdapterError("NETWORK_ERROR", "Failed to fetch"),
      "attachment_sync",
    );
    expect(result.severity).toBe("transient");
    expect(result.messageAr).toContain("تعذر الاتصال بالخادم");
  });

  test("unknown non-adapter errors are transient, never silently swallowed", () => {
    const result = classifyB1SaveError(new Error("boom"), "manual_save");
    expect(result.severity).toBe("transient");
    expect(result.messageAr.length).toBeGreaterThan(0);
  });
});

describe("capability genuinely unavailable", () => {
  test("proven unavailability keeps the inactive banner fatal", () => {
    const result = classifyB1SaveError(
      new B1AdapterError("ACTIVATION_BLOCKED", "Service inactive"),
      "manual_save",
      { capabilityProvenUnavailable: true },
    );
    expect(result.severity).toBe("fatal");
    expect(result.retryable).toBe(false);
    expect(result.messageAr).toBe(INACTIVE_AR);
  });
});

describe("precise errors stay precise", () => {
  const fatalCases = [
    ["STALE_VERSION", "B1_STALE_REQUEST_VERSION"],
    ["PERMISSION_DENIED", "B1_DRAFT_ACCESS_DENIED"],
    ["VALIDATION_ERROR", "B1_INPUT_VALIDATION_FAILED"],
    ["NOT_FOUND", "P0002"],
    ["ELIGIBILITY_BLOCKED", "غير مؤهل"],
    ["BACKEND_CONTRACT_PENDING", "PENDING"],
  ] as const;
  for (const [code, message] of fatalCases) {
    test(`${code} remains fatal and not the inactive banner`, () => {
      const result = classifyB1SaveError(new B1AdapterError(code, message), "attachment_sync");
      expect(result.severity).toBe("fatal");
      if (code !== "ACTIVATION_BLOCKED") expect(result.messageAr).not.toBe(INACTIVE_AR);
    });
  }
  test("stale updatedAt reports the reload message", () => {
    const result = classifyB1SaveError(
      new B1AdapterError("STALE_VERSION", "B1_STALE_REQUEST_VERSION"),
      "attachment_sync",
    );
    expect(result.messageAr).toContain("أعد تحميل الصفحة");
  });
});

describe("safe diagnostics", () => {
  test("uuids, urls and file paths never reach the diagnostic code", () => {
    const raw =
      "B1_DRAFT_SAVE_FAILED: request 57e805dc-1111-2222-3333-444455556666 at https://x.example/storage/v1/object/secure/student-request-secure-attachments/a.pdf";
    const code = sanitizeB1DiagnosticCode(raw);
    expect(code).toContain("B1_DRAFT_SAVE_FAILED");
    expect(code).not.toMatch(/57e805dc|https?:|\.pdf|student-request-secure-attachments/);
  });
  test("arabic prose yields no code rather than leaking text", () => {
    expect(sanitizeB1DiagnosticCode("تعذر الحفظ للطالب أحمد")).toBe("NO_CODE");
  });
  test("log sink receives only sanitized fields", () => {
    const seen: Record<string, string>[] = [];
    logB1SaveDiagnostic(
      "attachment_sync",
      classifyB1SaveError(
        new B1AdapterError("ACTIVATION_BLOCKED", "SECURE_ATTACHMENTS_RUNTIME_NOT_AVAILABLE"),
        "attachment_sync",
      ),
      (payload) => seen.push(payload),
    );
    expect(seen).toHaveLength(1);
    expect(Object.keys(seen[0]).sort()).toEqual(["code", "diagnostic", "phase", "severity"]);
    expect(JSON.stringify(seen[0])).not.toMatch(/[\u0600-\u06FF]/);
  });
});

describe("retry success clears the notice", () => {
  test("a transient classification is retryable so the UI can recover", () => {
    const first = classifyB1SaveError(
      new B1AdapterError("ACTIVATION_BLOCKED", "transient"),
      "attachment_sync",
    );
    expect(first.retryable).toBe(true);
    // The form clears transientSaveError on the next successful persistDraft;
    // asserted structurally in the component source test below.
  });
});
