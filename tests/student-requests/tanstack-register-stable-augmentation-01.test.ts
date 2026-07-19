import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const REGISTER_PATH = "src/types/tanstack-start-register.d.ts";
const ROUTE_TREE_PATH = "src/routeTree.gen.ts";
const ROUTE_SEMANTIC_SHA256 =
  "7a1f5fd65a1716e5e5e09cb85ce240ba5ec7c1f6af0e04cf1d2c7d8bef6669b5";

function routeSemanticHash(routeTree: string): string {
  const semanticLines = routeTree
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) =>
      /^(id|path|fullPath|parentRoute|getParentRoute):/.test(line),
    )
    .join("\n");

  return createHash("sha256").update(semanticLines).digest("hex");
}

describe("B1 TanStack Register stable augmentation remediation 01", () => {
  it("keeps the React Start Register augmentation in a stable source file", () => {
    const register = read(REGISTER_PATH);
    expect(register).toContain('declare module "@tanstack/react-start"');
    expect(register).toContain('import type { getRouter } from "../router"');
    expect(register).toContain('import type { startInstance } from "../start"');
    expect(register).toContain("router: Awaited<ReturnType<typeof getRouter>>");
    expect(register).toContain(
      "config: Awaited<ReturnType<typeof startInstance.getOptions>>",
    );
  });

  it("keeps generated routeTree free from manual module augmentation", () => {
    const routeTree = read(ROUTE_TREE_PATH);
    expect(routeTree).toContain("This file was automatically generated");
    expect(routeTree).not.toContain("declare module");
    expect(routeTree).not.toContain("startInstance.getOptions");
    expect(routeTree).not.toContain("ReturnType<typeof getRouter>");
  });

  it("includes the stable declaration in TypeScript compilation", () => {
    expect(read("tsconfig.json")).toContain('"src/**/*.ts"');
  });

  it("pins route ids, paths, full paths and parent relationships", () => {
    expect(routeSemanticHash(read(ROUTE_TREE_PATH))).toBe(
      ROUTE_SEMANTIC_SHA256,
    );
  });
});
