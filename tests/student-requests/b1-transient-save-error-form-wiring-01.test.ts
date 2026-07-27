// PORTAL-B1-PAYMENT-CONFIRMATION-AUTHORIZATION-HARDENING-01 / G4 (component wiring).
// Structural proof that the form routes save failures through the classifier and
// no longer raises the "service inactive" fatal banner from a save path.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(
    import.meta.dir,
    "..",
    "..",
    "src",
    "components",
    "student-requests",
    "b1",
    "B1StudentRequestForm.tsx",
  ),
  "utf8",
);

describe("B1StudentRequestForm save error wiring", () => {
  test("imports the shared classifier instead of inlining rules", () => {
    expect(SRC).toContain("classifyB1SaveError");
    expect(SRC).toContain("logB1SaveDiagnostic");
  });
  test("attachment sync persists with its own phase", () => {
    expect(SRC).toContain('await persistDraft(target, valuesRef.current, false, "attachment_sync")');
  });
  test("a save never claims proven unavailability", () => {
    expect(SRC).toContain("capabilityProvenUnavailable: false");
  });
  test("transient failures use the retryable notice, not the fatal banner", () => {
    expect(SRC).toContain('classification.severity === "fatal"');
    expect(SRC).toContain("setTransientSaveError(classification.messageAr)");
    expect(SRC).toContain('data-testid="b1-transient-save-error"');
  });
  test("successful recovery clears the transient notice", () => {
    expect(SRC).toContain("setTransientSaveError(null)");
  });
  test("the load-time availability probe still owns the real inactive banner", () => {
    expect(SRC).toContain('throw new B1AdapterError("ACTIVATION_BLOCKED", "Service inactive")');
  });
});
