import { describe, expect, it } from "bun:test";
import {
  getB1UiAdapter,
  isB1UiMockEnabled,
  isB1UiMockEnabledForFlags,
} from "@/lib/student-requests/b1-ui/index";
import { B1AdapterError } from "@/lib/student-requests/b1-ui/adapter.types";

describe("B1 UI adapter selection", () => {
  it("enables the mock only for dev sessions with VITE_B1_UI_MOCK=1", () => {
    expect(isB1UiMockEnabledForFlags(true, "1")).toBe(true);
    expect(isB1UiMockEnabledForFlags(true, "0")).toBe(false);
    expect(isB1UiMockEnabledForFlags(true, undefined)).toBe(false);
    expect(isB1UiMockEnabledForFlags(false, "1")).toBe(false);
    expect(isB1UiMockEnabledForFlags(false, undefined)).toBe(false);
  });

  it("exposes a boolean mock flag for UI badges", () => {
    expect(typeof isB1UiMockEnabled()).toBe("boolean");
  });

  it("returns a memoized adapter instance per kind", () => {
    const first = getB1UiAdapter();
    const second = getB1UiAdapter();
    expect(first).toBe(second);
    for (const fn of [
      "getAvailableB1RequestTypes",
      "getB1RequestFormOptions",
      "createB1RequestDraft",
      "getB1RequestDraft",
      "saveB1RequestDraft",
      "uploadB1RequestAttachment",
      "removeB1RequestAttachment",
      "submitB1Request",
      "getB1RequestDetails",
      "getAssignedB1Requests",
      "getAssignedB1RequestDetails",
      "actOnB1RequestStep",
      "confirmB1RevenueReceipt",
    ] as const) {
      expect(typeof first[fn]).toBe("function");
    }
  });

  it("live adapter keeps unwired read/draft methods fail-closed (when mock is off)", async () => {
    if (isB1UiMockEnabled()) return; // mock explicitly enabled in this env — nothing to assert
    const adapter = getB1UiAdapter();
    try {
      await adapter.getB1RequestFormOptions("enrollment_suspension");
      throw new Error("expected the live adapter to reject unwired methods");
    } catch (error) {
      expect(error).toBeInstanceOf(B1AdapterError);
      expect((error as B1AdapterError).code).toBe("BACKEND_CONTRACT_PENDING");
      expect((error as B1AdapterError).message).toContain("getB1RequestFormOptions");
    }
  });
});
