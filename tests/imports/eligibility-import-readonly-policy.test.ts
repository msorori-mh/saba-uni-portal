import { describe, expect, it, mock, beforeEach } from "bun:test";
import {
  isEligibilityReadOnlyDryRun,
  shouldSkipEligibilityClientLifecycleAudit,
  shouldSkipEligibilityFinalizeServer,
} from "../../src/lib/imports/eligibility-import-policy";
import type { ImportType } from "../../src/lib/imports/types";

describe("eligibility import read-only policy", () => {
  it("skips client lifecycle audit for student_eligibility preview", () => {
    expect(shouldSkipEligibilityClientLifecycleAudit("student_eligibility")).toBe(true);
  });

  it("keeps client lifecycle audit for other import types", () => {
    const otherTypes: ImportType[] = [
      "students",
      "student_fees",
      "student_discounts",
      "student_enrollments",
      "documents",
    ];
    for (const type of otherTypes) {
      expect(shouldSkipEligibilityClientLifecycleAudit(type)).toBe(false);
    }
  });

  it("treats student_eligibility dryRun as read-only orchestration", () => {
    expect(isEligibilityReadOnlyDryRun("student_eligibility", true)).toBe(true);
    expect(shouldSkipEligibilityFinalizeServer("student_eligibility", true)).toBe(true);
  });

  it("keeps finalize and lifecycle audit for student_eligibility live import", () => {
    expect(isEligibilityReadOnlyDryRun("student_eligibility", false)).toBe(false);
    expect(shouldSkipEligibilityFinalizeServer("student_eligibility", false)).toBe(false);
  });

  it("keeps dry-run finalize for non-eligibility importers", () => {
    expect(shouldSkipEligibilityFinalizeServer("student_fees", true)).toBe(false);
    expect(isEligibilityReadOnlyDryRun("students", true)).toBe(false);
  });
});

describe("bulk import finalize orchestration guard", () => {
  const finalizeImportServer = mock(async () => ({ logId: "log-1" }));

  beforeEach(() => {
    finalizeImportServer.mockClear();
  });

  async function runFinalizeGuard(type: ImportType, dryRun: boolean) {
    if (!shouldSkipEligibilityFinalizeServer(type, dryRun)) {
      await finalizeImportServer();
    }
  }

  it("does not call finalizeImportServer for eligibility dryRun", async () => {
    await runFinalizeGuard("student_eligibility", true);
    expect(finalizeImportServer).not.toHaveBeenCalled();
  });

  it("calls finalizeImportServer for eligibility live import", async () => {
    await runFinalizeGuard("student_eligibility", false);
    expect(finalizeImportServer).toHaveBeenCalledTimes(1);
  });

  it("calls finalizeImportServer for other importers on dryRun", async () => {
    await runFinalizeGuard("student_fees", true);
    expect(finalizeImportServer).toHaveBeenCalledTimes(1);
  });
});

describe("client lifecycle audit guard", () => {
  const auditImportValidated = mock(async () => undefined);
  const auditImportStarted = mock(async () => undefined);
  const auditImportFailed = mock(async () => undefined);

  beforeEach(() => {
    auditImportValidated.mockClear();
    auditImportStarted.mockClear();
    auditImportFailed.mockClear();
  });

  it("preview for student_eligibility does not emit lifecycle audit", async () => {
    const type: ImportType = "student_eligibility";
    if (!shouldSkipEligibilityClientLifecycleAudit(type)) {
      await auditImportValidated(type, "file.xlsx", { total: 1, valid: 1, invalid: 0 });
    }
    expect(auditImportValidated).not.toHaveBeenCalled();
  });

  it("preview for students still emits lifecycle audit", async () => {
    const type: ImportType = "students";
    if (!shouldSkipEligibilityClientLifecycleAudit(type)) {
      await auditImportValidated(type, "file.xlsx", { total: 1, valid: 1, invalid: 0 });
    }
    expect(auditImportValidated).toHaveBeenCalledTimes(1);
  });

  it("dryRun for student_eligibility does not emit started/failed lifecycle audit", async () => {
    const type: ImportType = "student_eligibility";
    const dryRun = true;
    if (!isEligibilityReadOnlyDryRun(type, dryRun)) {
      await auditImportStarted(type, "file.xlsx", 1, dryRun);
    }
    if (!isEligibilityReadOnlyDryRun(type, dryRun)) {
      await auditImportFailed(type, "file.xlsx", "err");
    }
    expect(auditImportStarted).not.toHaveBeenCalled();
    expect(auditImportFailed).not.toHaveBeenCalled();
  });

  it("live import for student_eligibility still emits lifecycle audit", async () => {
    const type: ImportType = "student_eligibility";
    const dryRun = false;
    if (!isEligibilityReadOnlyDryRun(type, dryRun)) {
      await auditImportStarted(type, "file.xlsx", 1, dryRun);
    }
    expect(auditImportStarted).toHaveBeenCalledTimes(1);
  });
});
