import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migrationPath = join(
  import.meta.dir,
  "../../supabase/migrations/20260714010000_enrollment_certificate_pdf_storage_saga_completion_01.sql",
);

const sql = readFileSync(migrationPath, "utf8");

test("G3 migration uses valid PL/pgSQL exception conditions", () => {
  expect(sql).not.toMatch(/\bundefined_schema\b/);

  const correctedHandlers =
    sql.match(/WHEN\s+undefined_function\s+OR\s+invalid_schema_name\s+THEN/g) ?? [];

  expect(correctedHandlers).toHaveLength(2);
  expect(sql).toContain("_ec_new_verification_token");
  expect(sql).toContain("_ec_sha256_hex");

  const tokenFn = sql.slice(
    sql.indexOf("public._ec_new_verification_token"),
    sql.indexOf("public._ec_sha256_hex"),
  );
  const shaFn = sql.slice(sql.indexOf("public._ec_sha256_hex"));

  expect(tokenFn).toMatch(/WHEN\s+undefined_function\s+OR\s+invalid_schema_name\s+THEN/);
  expect(shaFn).toMatch(/WHEN\s+undefined_function\s+OR\s+invalid_schema_name\s+THEN/);
});
