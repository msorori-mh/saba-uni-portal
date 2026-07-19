import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertStableRegister,
  generatedRegisterFooter,
  normalizeRouteTreeRegister,
} from "../../scripts/normalize-tanstack-route-tree-register";

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
    expect(routeTree).not.toContain(
      "declare module '@tanstack/react-start'",
    );
    expect(routeTree).not.toContain(
      'declare module "@tanstack/react-start"',
    );
    expect(routeTree).not.toContain("startInstance.getOptions");
    expect(routeTree).not.toContain("ReturnType<typeof getRouter>");
  });

  it("includes the stable declaration in TypeScript compilation", () => {
    expect(read("tsconfig.json")).toContain('"src/**/*.ts"');
  });

  it("normalizes only the exact generated React Start footer after build", () => {
    const packageJson = read("package.json");
    const normalizer = read(
      "scripts/normalize-tanstack-route-tree-register.ts",
    );

    expect(packageJson).toContain(
      "vite build && bun run scripts/normalize-tanstack-route-tree-register.ts",
    );
    expect(normalizer).toContain(
      "firstMatch !== normalized.lastIndexOf(generatedRegisterFooter)",
    );
    expect(normalizer).toContain(
      "firstMatch + generatedRegisterFooter.length !== normalized.length",
    );
    expect(normalizer).not.toMatch(/\bid:\s*['\"]/);
    expect(normalizer).not.toMatch(/\bpath:\s*['\"]/);
    expect(normalizer).not.toContain("getParentRoute");
  });

  it("accepts clean output and strips the exact generated suffix", () => {
    const clean = "export const routeTree = rootRouteImport\n";
    expect(normalizeRouteTreeRegister(clean)).toBe(clean);
    expect(normalizeRouteTreeRegister(clean + generatedRegisterFooter)).toBe(
      clean,
    );
  });

  it("fails closed on altered, duplicate, and non-suffix augmentation", () => {
    const clean = "export const routeTree = rootRouteImport\n";
    const altered = generatedRegisterFooter.replace(
      "interface Register",
      "interface  Register",
    );

    expect(() => normalizeRouteTreeRegister(clean + altered)).toThrow();
    expect(() =>
      normalizeRouteTreeRegister(
        clean + generatedRegisterFooter + generatedRegisterFooter,
      ),
    ).toThrow();
    expect(() =>
      normalizeRouteTreeRegister(
        clean + generatedRegisterFooter + "export const drift = true\n",
      ),
    ).toThrow();
  });

  it("fails closed when the stable Register declaration is incomplete", () => {
    expect(() => assertStableRegister(read(REGISTER_PATH))).not.toThrow();
    expect(() => assertStableRegister("declare module only")).toThrow();
  });

  it("pins route ids, paths, full paths and parent relationships", () => {
    expect(routeSemanticHash(read(ROUTE_TREE_PATH))).toBe(
      ROUTE_SEMANTIC_SHA256,
    );
  });
});
