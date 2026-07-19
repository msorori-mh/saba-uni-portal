import { readFileSync } from "node:fs";
import { join } from "node:path";

const routeTreePath = join(process.cwd(), "src", "routeTree.gen.ts");
const stableRegisterPath = join(
  process.cwd(),
  "src",
  "types",
  "tanstack-start-register.d.ts",
);

export const generatedRegisterFooter = `
import type { getRouter } from './router.tsx'
import type { startInstance } from './start.ts'
declare module '@tanstack/react-start' {
  interface Register {
    ssr: true
    router: Awaited<ReturnType<typeof getRouter>>
    config: Awaited<ReturnType<typeof startInstance.getOptions>>
  }
}
`;

const generatedRegisterMarkers = [
  "@tanstack/react-start",
  "startInstance.getOptions",
  "ReturnType<typeof getRouter>",
  "import type { getRouter } from './router.tsx'",
  "import type { startInstance } from './start.ts'",
];

export type GeneratedRegisterState = "absent" | "present";

export function validateGeneratedRegister(source: string): GeneratedRegisterState {
  const normalized = source.replaceAll("\r\n", "\n");
  const firstMatch = normalized.indexOf(generatedRegisterFooter);

  if (firstMatch === -1) {
    if (generatedRegisterMarkers.some((marker) => normalized.includes(marker))) {
      throw new Error(
        "Unknown TanStack Register augmentation shape found in generated route tree",
      );
    }
    return "absent";
  }

  if (
    firstMatch !== normalized.lastIndexOf(generatedRegisterFooter) ||
    firstMatch + generatedRegisterFooter.length !== normalized.length
  ) {
    throw new Error(
      "TanStack Register footer is duplicated or is not the exact generated suffix",
    );
  }

  const routeTreeBody = normalized.slice(0, firstMatch);
  if (generatedRegisterMarkers.some((marker) => routeTreeBody.includes(marker))) {
    throw new Error("Unexpected TanStack Register markers precede the legal footer");
  }

  return "present";
}

export function assertStableRegister(source: string): void {
  for (const marker of [
    'declare module "@tanstack/react-start"',
    'import type { getRouter } from "../router"',
    'import type { startInstance } from "../start"',
    "router: Awaited<ReturnType<typeof getRouter>>",
    "config: Awaited<ReturnType<typeof startInstance.getOptions>>",
  ]) {
    if (!source.includes(marker)) {
      throw new Error(`Stable TanStack Register declaration is missing: ${marker}`);
    }
  }
}

if (import.meta.main) {
  assertStableRegister(readFileSync(stableRegisterPath, "utf8"));
  const state = validateGeneratedRegister(readFileSync(routeTreePath, "utf8"));
  console.log(`TanStack generated Register footer: ${state}`);
}
