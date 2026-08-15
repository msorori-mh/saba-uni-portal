import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertStableRegister,
  generatedRegisterFooter,
  validateGeneratedRegister,
} from "../../scripts/validate-tanstack-route-tree-register";

const ROOT = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const REGISTER_PATH = "src/types/tanstack-start-register.d.ts";
const ROUTE_TREE_PATH = "src/routeTree.gen.ts";
// Re-pinned during PORTAL_REFORM_P1_STUDENT_SERVICES_SOURCE_CLOSURE_02 after the
// approved lecture-monitoring parity report route was added. Drift verified:
// 150 fullPaths (was 148), all unique, exactly one "/" claimant, and the only
// delta is /faculty-portal/lecture-monitoring plus its /parity child.
const ROUTE_SEMANTIC_SHA256 =
  "6daad828bfd6acc8aaceac808a73ce90e5bcaf34d6fa4708a6f5d141262a883a";


const FROZEN_GP_FULL_PATHS = [
  "/student/graduation-projects",
  "/student/graduation-projects/$projectId",
  "/faculty-portal/graduation-projects",
  "/faculty-portal/graduation-projects/$projectId",
  "/admin/graduation-projects",
  "/admin/graduates-affairs",
] as const;

function routeSemanticHash(routeTree: string): string {
  const semanticLines = routeTree
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^(id|path|fullPath|parentRoute|getParentRoute):/.test(line))
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
    expect(register).toContain("config: Awaited<ReturnType<typeof startInstance.getOptions>>");
  });

  it("accepts only an absent or one exact terminal generated augmentation", () => {
    const routeTree = read(ROUTE_TREE_PATH);
    expect(routeTree).toContain("This file was automatically generated");
    expect(["absent", "present"]).toContain(validateGeneratedRegister(routeTree));
  });

  it("includes the stable declaration in TypeScript compilation", () => {
    expect(read("tsconfig.json")).toContain('"src/**/*.ts"');
  });

  it("validates generated output without rewriting routeTree during build", () => {
    const packageJson = read("package.json");
    const validator = read("scripts/validate-tanstack-route-tree-register.ts");

    expect(packageJson).toContain(
      "vite build && bun run scripts/validate-tanstack-route-tree-register.ts",
    );
    expect(packageJson).not.toContain("normalize-tanstack-route-tree-register");
    expect(validator).not.toContain("writeFile");
    expect(validator).toContain("firstMatch !== normalized.lastIndexOf(generatedRegisterFooter)");
    expect(validator).toContain(
      "firstMatch + generatedRegisterFooter.length !== normalized.length",
    );
    expect(validator).not.toMatch(/\bid:\s*['"]/);
    expect(validator).not.toMatch(/\bpath:\s*['"]/);
    expect(validator).not.toContain("getParentRoute");
  });

  it("accepts both legal generated-footer fixtures without changing input", () => {
    const clean = "export const routeTree = rootRouteImport\n";
    const withFooter = clean + generatedRegisterFooter;
    expect(validateGeneratedRegister(clean)).toBe("absent");
    expect(validateGeneratedRegister(withFooter)).toBe("present");
    expect(clean).toBe("export const routeTree = rootRouteImport\n");
    expect(withFooter).toBe(clean + generatedRegisterFooter);
  });

  it("fails closed on altered types, duplicate, and non-suffix augmentation", () => {
    const clean = "export const routeTree = rootRouteImport\n";
    const altered = generatedRegisterFooter.replace("interface Register", "interface  Register");

    expect(() => validateGeneratedRegister(clean + altered)).toThrow();
    expect(() =>
      validateGeneratedRegister(clean + generatedRegisterFooter + generatedRegisterFooter),
    ).toThrow();
    expect(() =>
      validateGeneratedRegister(clean + generatedRegisterFooter + "export const drift = true\n"),
    ).toThrow();
  });

  it("fails closed on changed imports and extra augmentation", () => {
    const clean = "export const routeTree = rootRouteImport\n";
    const changedImport = generatedRegisterFooter.replace("from './router.tsx'", "from './router'");
    const extraAugmentation = "declare module '@tanstack/react-start' { interface Register {} }\n";

    expect(() => validateGeneratedRegister(clean + changedImport)).toThrow();
    expect(() =>
      validateGeneratedRegister(clean + extraAugmentation + generatedRegisterFooter),
    ).toThrow();
  });

  it("fails closed when the stable Register declaration is incomplete", () => {
    expect(() => assertStableRegister(read(REGISTER_PATH))).not.toThrow();
    expect(() => assertStableRegister("declare module only")).toThrow();
  });

  it("pins route ids, paths, full paths and parent relationships", () => {
    const routeTree = read(ROUTE_TREE_PATH);
    expect(routeTree).toContain(
      "This file was automatically generated by TanStack Router.",
    );
    for (const fullPath of FROZEN_GP_FULL_PATHS) {
      expect(routeTree).toContain(`fullPath: '${fullPath}'`);
    }
    // Layout index children are generated with the frozen list/detail routes.
    expect(routeTree).toContain("fullPath: '/student/graduation-projects/'");
    expect(routeTree).toContain(
      "fullPath: '/faculty-portal/graduation-projects/'",
    );
    expect(routeSemanticHash(routeTree)).toBe(ROUTE_SEMANTIC_SHA256);
  });
});
