import { describe, expect, it, mock } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getErrorRecoveryHomePath,
  isChunkLoadError,
  retryRouteError,
} from "../../src/lib/route-error-recovery";

const root = join(import.meta.dir, "../..");

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("academic operations naming conflict fix", () => {
  const source = readSrc("src/routes/admin/academic-operations.tsx");

  it("aliases server setters so they do not collide with local handlers", () => {
    expect(source).toContain("setCurrentAcademicYear as setCurrentAcademicYearServer");
    expect(source).toContain("setCurrentSemester as setCurrentSemesterServer");
    expect(source).toContain("useServerFn(setCurrentAcademicYearServer)");
    expect(source).toContain("useServerFn(setCurrentSemesterServer)");
  });

  it("uses distinct UI handlers instead of shadowing server imports", () => {
    expect(source).toContain("handleSetCurrentYear");
    expect(source).toContain("handleSetCurrentSemester");
    expect(source).toContain("onValueChange={handleSetCurrentYear}");
    expect(source).toContain("onValueChange={handleSetCurrentSemester}");
    expect(source).not.toMatch(/const\s+setCurrentSemester\s*=/);
    expect(source).not.toMatch(/const\s+setCurrentYear\s*=/);
    expect(source).not.toMatch(/useServerFn\(\s*setCurrentSemester\s*\)/);
    expect(source).not.toMatch(/useServerFn\(\s*setCurrentAcademicYear\s*\)/);
  });

  it("keeps AcademicOpsPage free of TDZ-prone local/import name collision", () => {
    // The previous bug: import setCurrentSemester + local const setCurrentSemester
    // caused ReferenceError during render before the page could mount.
    const importBlock = source.slice(0, source.indexOf("function AcademicOpsPage"));
    expect(importBlock).toMatch(/setCurrentSemester\s+as\s+setCurrentSemesterServer/);
    expect(source).toMatch(/function AcademicOpsPage\(/);
    expect(source).not.toMatch(/throw\s+context\./);
    expect(source).not.toMatch(/throw\s+kpis\./);
  });
});

describe("academic operations query error fallbacks", () => {
  const source = readSrc("src/routes/admin/academic-operations.tsx");

  it("renders an in-page context error fallback without throwing", () => {
    expect(source).toContain("context.isError");
    expect(source).toContain('data-testid="aops-context-error"');
    expect(source).toContain("إعادة تحميل البيانات");
    expect(source).toContain("context.refetch()");
    expect(source).toContain('to="/admin"');
    expect(source).toContain("العودة إلى لوحة الإدارة");
  });

  it("keeps KPI failures local so the rest of the page stays usable", () => {
    expect(source).toContain("kpis.isError");
    expect(source).toContain('data-testid="aops-kpis-error"');
    expect(source).toContain("kpis.refetch()");
    expect(source).toContain("روابط سريعة");
  });
});

describe("error recovery home path", () => {
  it("routes admin failures back to /admin", () => {
    expect(getErrorRecoveryHomePath("/admin")).toBe("/admin");
    expect(getErrorRecoveryHomePath("/admin/academic-operations")).toBe("/admin");
    expect(getErrorRecoveryHomePath("/admin/login")).toBe("/admin");
  });

  it("routes public failures back to /", () => {
    expect(getErrorRecoveryHomePath("/")).toBe("/");
    expect(getErrorRecoveryHomePath("/news")).toBe("/");
    expect(getErrorRecoveryHomePath("/departments/cs")).toBe("/");
  });
});

describe("retryRouteError", () => {
  it("calls reset before invalidate", async () => {
    const order: string[] = [];
    await retryRouteError({
      reset: () => order.push("reset"),
      invalidate: () => {
        order.push("invalidate");
      },
    });
    expect(order).toEqual(["reset", "invalidate"]);
  });

  it("reloads only for chunk-load errors", async () => {
    const reload = mock(() => {});
    await retryRouteError({
      reset: () => {},
      invalidate: () => {},
      error: new Error("Failed to fetch dynamically imported module: /assets/x.js"),
      reload,
    });
    expect(reload).toHaveBeenCalledTimes(1);

    const reload2 = mock(() => {});
    await retryRouteError({
      reset: () => {},
      invalidate: () => {},
      error: new Error("something else"),
      reload: reload2,
    });
    expect(reload2).not.toHaveBeenCalled();
  });

  it("detects common chunk load messages", () => {
    expect(isChunkLoadError(new Error("Loading chunk 12 failed"))).toBe(true);
    expect(isChunkLoadError(new Error("Importing a module script failed"))).toBe(true);
    expect(isChunkLoadError(new Error("network timeout"))).toBe(false);
  });
});

describe("error fallbacks never sign out", () => {
  it("admin errorComponent does not call signOut and links to /admin", () => {
    const source = readSrc("src/routes/admin.tsx");
    const errorStart = source.indexOf("function AdminErrorComponent");
    expect(errorStart).toBeGreaterThan(-1);
    const errorBlock = source.slice(errorStart);
    expect(errorBlock).toContain('to="/admin"');
    expect(errorBlock).toContain("العودة إلى لوحة الإدارة");
    expect(errorBlock).toContain("retryRouteError");
    expect(errorBlock).not.toContain("signOut");
    expect(errorBlock).not.toContain('href="/"');
  });

  it("root ErrorComponent uses recovery home path and does not sign out", () => {
    const source = readSrc("src/routes/__root.tsx");
    const errorStart = source.indexOf("function ErrorComponent");
    expect(errorStart).toBeGreaterThan(-1);
    const errorBlock = source.slice(errorStart, source.indexOf("export const Route"));
    expect(errorBlock).toContain("getErrorRecoveryHomePath");
    expect(errorBlock).toContain("retryRouteError");
    expect(errorBlock).toContain("<Link");
    expect(errorBlock).not.toContain("signOut");
    expect(errorBlock).not.toMatch(/<a\s+href="\/"/);
  });
});
