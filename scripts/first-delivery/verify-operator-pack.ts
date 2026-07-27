import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const packDir = join(root, "docs/first-delivery-operator-pack");
const promptsDir = join(root, "docs/production-prompts");
const map = JSON.parse(
  readFileSync(join(root, "docs/migration-drafts/b1-backend-verifiers/PROMOTION-MAP.json"), "utf8"),
) as Array<{
  order: number;
  migration: string;
  migration_sha_lf: string;
  preflight: string;
  post_verifier: string;
  apply_status?: string;
  canonical_order_label?: string;
}>;

function lfSha(path: string): string {
  const bytes = readFileSync(path);
  const lf = Buffer.from(Array.from(bytes).filter((b) => b !== 13));
  return createHash("sha256").update(lf).digest("hex");
}

const errors: string[] = [];

for (let i = 1; i <= 10; i++) {
  const prefix = String(i).padStart(2, "0");
  const hits = readdirSync(packDir).filter((f) => f.startsWith(prefix + "-"));
  if (hits.length !== 1) errors.push(`operator pack missing unique ${prefix}-*`);
}

const seen = new Set<string>();
let sawBridge = false;
for (const e of map) {
  if (!existsSync(join(root, e.migration))) errors.push(`missing migration ${e.migration}`);
  else if (lfSha(join(root, e.migration)) !== e.migration_sha_lf) {
    errors.push(`sha mismatch ${e.migration}`);
  }
  if (!existsSync(join(root, e.preflight))) errors.push(`missing preflight ${e.preflight}`);
  if (!existsSync(join(root, e.post_verifier))) errors.push(`missing post ${e.post_verifier}`);
  if (e.order === 19 || e.order === 20) {
    if (seen.has(e.migration)) sawBridge = true;
  }
  seen.add(e.migration);
}

if (!sawBridge) {
  const o19 = map.find((e) => e.order === 19);
  const o20 = map.find((e) => e.order === 20);
  if (!o19 || !o20 || o19.migration !== o20.migration) {
    errors.push("19/20 bridge not documented as same migration file");
  } else {
    sawBridge = true;
  }
}

const pack20 = readFileSync(join(packDir, "04-SEQ08-20.md"), "utf8");
if (!/19\/20 bridge|order 19.*20|bridge/i.test(pack20)) {
  errors.push("operator pack missing 19/20 bridge note");
}
const gate = readFileSync(join(packDir, "07-GATE25.md"), "utf8");
if (!/NOT a migration|non-migration/i.test(gate)) {
  errors.push("Gate25 must be documented as non-migration");
}

const prompts = readdirSync(promptsDir).filter((f) => f.endsWith(".md"));
if (prompts.length < 17) errors.push(`expected >=17 production prompts, got ${prompts.length}`);

// No duplicate apply instructions for superseded SEQ07
const b1 = readFileSync(join(packDir, "03-SEQ07B-B1-MIGRATION.md"), "utf8");
if (!/20260725110050/.test(b1) || !/do not apply/i.test(b1)) {
  errors.push("B1 pack must pin 10050 and ban superseded apply");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      decision: "PASS_OPERATOR_PACK_VERIFIER",
      prompts: prompts.length,
      unique_migrations: seen.size,
      bridge_19_20: true,
      gate25_non_migration: true,
    },
    null,
    2,
  ),
);
