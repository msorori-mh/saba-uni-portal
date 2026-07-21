/**
 * LEARNING-MATERIALS-SECURE-ACTIVATION-01 — PG17 verifier runner (disposable).
 *
 * Boots a throwaway PostgreSQL 17 cluster (embedded-postgres), then applies:
 *   1) tests/materials/postgres-minimal-schema.sql
 *   2) docs/drafts/20260721000000_materials_secure_activation.draft.sql
 *   3) tests/materials/postgres-secure-activation-verifier.sql
 *
 * The verifier file raises CHECK FAILED on the first failing invariant and ends
 * with ROLLBACK; nothing persists. Exit code 0 = all checks passed.
 *
 * Prereq (local only, not a repo dependency):
 *   npm install embedded-postgres@17 pg
 * Run:
 *   node tests/materials/run-postgres-verifier.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

const files = [
  join(here, "postgres-minimal-schema.sql"),
  join(root, "docs", "drafts", "20260721000000_materials_secure_activation.draft.sql"),
  join(here, "postgres-secure-activation-verifier.sql"),
];

const cluster = new EmbeddedPostgres({
  databaseDir: join(here, ".pg-verifier-data"),
  user: "postgres",
  password: "postgres",
  port: 55442,
  persistent: false,
});

async function main() {
  await cluster.initialise();
  await cluster.start();
  const client = new pg.Client({
    host: "127.0.0.1",
    port: 55442,
    user: "postgres",
    password: "postgres",
    database: "postgres",
  });
  await client.connect();
  try {
    const version = await client.query("show server_version");
    console.log(`postgres ${version.rows[0].server_version}`);
    for (const file of files) {
      const sql = readFileSync(file, "utf8");
      await client.query(sql);
      console.log(`applied: ${file}`);
    }
    console.log("VERIFIER PASS");
  } finally {
    await client.end().catch(() => {});
    await cluster.stop().catch(() => {});
  }
}

main().catch((error) => {
  console.error("VERIFIER FAIL:", error?.message ?? error);
  process.exitCode = 1;
});
