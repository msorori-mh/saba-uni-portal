import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const routeTreePath = join(process.cwd(), "src", "routeTree.gen.ts");
const generatedRegisterFooter = `
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

const source = readFileSync(routeTreePath, "utf8").replaceAll("\r\n", "\n");
const firstMatch = source.indexOf(generatedRegisterFooter);

if (firstMatch === -1) {
  process.exit(0);
}

if (
  firstMatch !== source.lastIndexOf(generatedRegisterFooter) ||
  firstMatch + generatedRegisterFooter.length !== source.length
) {
  throw new Error(
    "TanStack Register footer is duplicated or is not the exact generated suffix",
  );
}

writeFileSync(routeTreePath, source.slice(0, firstMatch), "utf8");
