import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const inventory = readFileSync("docs/GRADUATION-PROJECTS-GP07-RPC-AUTHORIZATION-INVENTORY.md", "utf8");
const portalFunctions = readFileSync("src/lib/graduation-projects/portal.functions.ts", "utf8");
const client = readFileSync("src/lib/graduation-projects/rpc.ts", "utf8");
const matrix = readFileSync("tests/graduation-projects/postgres-authorization-matrix-verifier.sql", "utf8");
const m7 = readFileSync(
  "supabase/migrations/20260730100006_b953bddf-de2d-43f6-9d3d-10755d8a9da6.sql",
  "utf8",
);

describe("GP-07 inventory completeness", () => {
  test("every RPC called by the client is documented in the inventory", () => {
    const rpcNames = [...client.matchAll(/this\.call<[^>]+>\("([a-z_]+)"/g)].map((m) => m[1]);
    expect(rpcNames.length).toBeGreaterThan(25);
    for (const name of new Set(rpcNames)) {
      expect(inventory, name).toContain(name);
    }
  });

  test("every server function is documented", () => {
    const fnNames = [...portalFunctions.matchAll(/export const (\w+) = createServerFn/g)].map(
      (m) => m[1],
    );
    expect(fnNames.length).toBeGreaterThan(20);
    for (const name of fnNames) {
      expect(inventory, name).toContain(`\`${name}\``);
    }
  });
});

describe("GP-07 server-function hard gates", () => {
  test("all server functions require auth and strict input validation", () => {
    const blocks = portalFunctions.split(/export const \w+ = createServerFn\(\{ method: "POST" \}\)/);
    expect(blocks.length).toBeGreaterThan(20);
    for (const block of blocks.slice(1)) {
      const segment = block.slice(0, block.indexOf(".handler"));
      expect(segment).toContain("requireSupabaseAuth");
      expect(segment).toContain(".inputValidator(");
      expect(segment.includes(".parse(") || segment.includes("emptyInput")).toBe(true);
    }
  });

  test("no server function schema accepts actor user ids", () => {
    const schemas = [...portalFunctions.matchAll(/z\s*\n?\s*\.object\(\{[^}]+\}\)/gs)].map((m) => m[0]);
    for (const schema of schemas) {
      expect(schema).not.toMatch(/userId|actorId|studentUserId/);
    }
  });
});

describe("GP-07 M7 evaluation completeness guard", () => {
  test("conclude requires every panel member of the held discussion finalized", () => {
    expect(m7).toContain("create or replace function public.conclude_graduation_project_result");
    expect(m7).toContain("and not exists(select 1 from public.graduation_project_evaluations e");
    expect(m7).toContain("d.state='held'");
    expect(m7.match(/raise exception 'evaluations not finalized'/g)?.length).toBe(2);
  });

  test("signature, grants and outcome literals are unchanged", () => {
    expect(m7).toContain("p_outcome not in ('completed','corrections_required')");
    expect(m7).not.toContain("revoke");
    expect(m7).not.toContain("grant");
  });
});

describe("GP-07 matrix harness", () => {
  test("matrix counts failures and raises unless fail_rows = 0", () => {
    expect(matrix).toContain("AUTHORIZATION MATRIX FAILED: % of % rows failed");
    expect(matrix).toContain("AUTHORIZATION MATRIX PASS: % rows, fail_rows=0");
  });

  test("matrix exercises grant walls as the authenticated role, not superuser", () => {
    expect(matrix).toContain("set local role authenticated;");
    expect(matrix.match(/'42501'/g)?.length).toBeGreaterThanOrEqual(3);
  });

  test("matrix covers the required negative families", () => {
    for (const fragment of [
      "other-department student",
      "forged project id",
      "unknown literal review action",
      "idempotent replay",
      "archived project",
      "co_supervisor cannot write",
      "second panel chair",
      "finalize another member",
      "department head of B cannot",
      "before all finalized",
    ]) {
      expect(matrix, fragment).toContain(fragment);
    }
  });
});
