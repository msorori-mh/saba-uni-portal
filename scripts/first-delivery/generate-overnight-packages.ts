/**
 * SOURCE-ONLY generator for first-delivery overnight packages.
 * Reads PROMOTION-MAP.json and emits prompts + operator-pack skeletons.
 * Does NOT touch Production.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const root = process.cwd();
const map = JSON.parse(
  readFileSync(join(root, "docs/migration-drafts/b1-backend-verifiers/PROMOTION-MAP.json"), "utf8"),
) as Array<{
  order: number;
  canonical_order_label?: string;
  migration: string;
  migration_sha_lf: string;
  preflight: string;
  post_verifier: string;
  apply_status?: string;
  note?: string;
  prerequisite_non_migration?: string;
}>;

function lfSha(path: string): string {
  const bytes = readFileSync(path);
  const lf = Buffer.from(Array.from(bytes).filter((b) => b !== 13));
  return createHash("sha256").update(lf).digest("hex");
}

function stripTrailingWs(s: string): string {
  return s
    .split(/\r?\n/)
    .map((l) => l.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n+$/g, "\n");
}

function write(path: string, body: string) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, stripTrailingWs(body), "utf8");
}

const protectedRecords = [
  "SR-20260716-26BAD4C8",
  "SR-20260715-FEDCB3E1",
  "SR-20260713-2DE64041",
  "USR-2026-000001",
  "USR-2026-000002",
];

const five = [
  "enrollment_suspension",
  "excused_absence",
  "department_transfer",
  "final_chance",
  "file_withdrawal",
];

// Validate SHAs for applyable migrations
const issues: string[] = [];
for (const e of map) {
  const abs = join(root, e.migration);
  if (!existsSync(abs)) {
    issues.push(`MISSING ${e.migration}`);
    continue;
  }
  const actual = lfSha(abs);
  if (actual !== e.migration_sha_lf) {
    issues.push(`SHA_MISMATCH order=${e.order} expected=${e.migration_sha_lf} actual=${actual}`);
  }
  for (const side of [e.preflight, e.post_verifier]) {
    if (!existsSync(join(root, side))) issues.push(`MISSING_VERIFIER ${side}`);
  }
}
if (issues.length) {
  console.error(issues.join("\n"));
  process.exit(1);
}

const applyable = map.filter((e) => e.apply_status !== "SUPERSEDED_NOT_FOR_LOVABLE_CLOUD_APPLY");
// Deduplicate 19/20 bridge (same migration file)
const seenMig = new Set<string>();
const uniqueApply = applyable.filter((e) => {
  if (seenMig.has(e.migration)) return false;
  seenMig.add(e.migration);
  return true;
});

const promptsDir = join(root, "docs/production-prompts");
mkdirSync(promptsDir, { recursive: true });

for (const e of uniqueApply) {
  const label = e.canonical_order_label ?? String(e.order);
  const seqTag = label === "7B" ? "07b" : String(e.order).padStart(2, "0");
  const file = join(promptsDir, `b1-seq${seqTag}-production-readonly-then-single-apply.md`);
  const title = label === "7B" ? "SEQ07-B" : `SEQ${String(e.order).padStart(2, "0")}`;
  write(
    file,
    `# ${title} — Lovable Production Prompt (DOCUMENTATION ONLY — DO NOT RUN FROM THIS TRACK)

**NOT AUTHORIZED BY THE OVERNIGHT SOURCE TRACK.** Requires separate human approvals.

Production ref: \`wpmicqriltrowwonknox\`
TEST marker: \`TEST_ONLY_FIRST_DELIVERY_5_SERVICES\`

## Binding identity

| Field | Value |
|---|---|
| Order | ${label} |
| File | \`${e.migration}\` |
| LF SHA-256 | \`${e.migration_sha_lf}\` |
| Preflight | \`${e.preflight}\` |
| Post-verifier | \`${e.post_verifier}\` |

${e.prerequisite_non_migration ? `## Prerequisite (non-migration)\n\n${e.prerequisite_non_migration}\n` : ""}
## Step A — Read-only preflight (ROLLBACK)

1. Confirm Production project ref = \`wpmicqriltrowwonknox\`.
2. Run ONLY the preflight SQL (READ ONLY / ends with ROLLBACK).
3. Confirm:
   - predecessor objects present
   - this version not already applied with different bytes
   - five services still hidden (\`draft\` / inactive / not student_visible)
   - five-service request counts = 0
   - protected records unchanged: ${protectedRecords.join(", ")}
   - no anon privileges / no public bucket / no broad bypass
4. STOP if any check fails.

## Step B — Single migration apply (separate approval)

1. Apply **exactly one** file: \`${e.migration.split("/").pop()}\`
2. Forbid: \`--include-all\`, batch, next migration, Gate 25, activation, \`student_visible\`, Deploy/Publish, repair, manual history insert.
3. History must gain this version once (for SQL migrations).

## Step C — Post-verifier + stop

1. Run post-verifier (READ ONLY / ROLLBACK).
2. Re-check protected records + hidden services.
3. **STOP.** Do not apply the next migration in the same session.

## Notes

${e.note ?? "Forward-only. Remediation by reviewed forward package only."}
`,
  );
}

// Operator pack
const packDir = join(root, "docs/first-delivery-operator-pack");
mkdirSync(packDir, { recursive: true });

const seq07b = map.find((e) => e.order === 7.5)!;
const seq07 = map.find((e) => e.order === 7)!;
const seq08to20 = uniqueApply.filter((e) => e.order >= 8 && e.order <= 20);
const seq21to24 = uniqueApply.filter((e) => e.order >= 21 && e.order <= 24);

write(
  join(packDir, "01-PRODUCTION-BASELINE.md"),
  `# 01 — Production baseline (read-only)

| Field | Value |
|---|---|
| Project ref | \`wpmicqriltrowwonknox\` |
| Marker | \`TEST_ONLY_FIRST_DELIVERY_5_SERVICES\` |
| Protected | ${protectedRecords.join(", ")} |
| Five services | ${five.join(", ")} — must remain hidden until Gate 25 |
| Protected live service | \`enrollment_certificate\` |

## Required RO proofs before any apply

- Original SEQ07 (\`${seq07.migration_sha_lf}\`) not applied / not falsely APPLIED
- SEQ07-B (\`${seq07b.migration_sha_lf}\`) not applied
- Bucket \`student-request-secure-attachments\` absent (or exact private contract only after B0)
- No partial attachment objects/functions/policies
- SEQ08→24 absent
- Five-service requests = 0
- Digests of protected records stable

PASS code: \`PASS_FIRST_DELIVERY_PRODUCTION_BASELINE_RO\`
HOLD prefix: \`HOLD_FIRST_DELIVERY_BASELINE_\`
`,
);

write(
  join(packDir, "02-SEQ07B-B0-BUCKET.md"),
  `# 02 — SEQ07-B B0 private bucket (Storage tool)

| Field | Value |
|---|---|
| Channel | Lovable Storage tool (non-migration) |
| Bucket | \`student-request-secure-attachments\` |
| public | \`false\` |
| file_size_limit | \`5242880\` |
| MIME | application/pdf, image/jpeg, image/png |
| Source SHA pin (package) | SEQ07-B package / addendum |
| Separate approval | YES — does not authorize B1 |

Pre-check: bucket absent OR already exact private contract.
Post-check: exact contract; no public URL; no broad policies; uploads table still absent.
Idempotency: re-assert exact private contract.
Stop: public=true, wrong MIME/size, broad policies, any SQL apply in same session.
Remediation: Storage tool only; forward-only; no SQL DELETE of production data.

PASS: \`PASS_SEQ07B_B0_BUCKET\`
`,
);

write(
  join(packDir, "03-SEQ07B-B1-MIGRATION.md"),
  `# 03 — SEQ07-B B1 SQL-only migration

| Field | Value |
|---|---|
| File | \`${seq07b.migration}\` |
| Version | \`20260725110050\` |
| LF SHA-256 | \`${seq07b.migration_sha_lf}\` |
| Preflight | \`${seq07b.preflight}\` |
| Post-verifier | \`${seq07b.post_verifier}\` |
| Superseded (do not apply) | \`${seq07.migration}\` / \`${seq07.migration_sha_lf}\` |
| Separate approval | YES — does not authorize SEQ08 |

Expected history: \`20260725110050\` once; \`20260725110000\` absent.
Hidden services: still hidden.
Protected records: unchanged.
Second-run: refuse / fail closed.
PASS: \`PASS_SEQ07B_B1_APPLIED\`
`,
);

write(
  join(packDir, "04-SEQ08-20.md"),
  `# 04 — SEQ08→SEQ20 (one migration per approval)

${seq08to20
  .map(
    (e) =>
      `## Order ${e.order === 19 ? "19/20 bridge" : e.order}\n\n- File: \`${e.migration}\`\n- LF SHA: \`${e.migration_sha_lf}\`\n- Preflight: \`${e.preflight}\`\n- Post: \`${e.post_verifier}\`\n- Prompt: \`docs/production-prompts/b1-seq${String(e.order).padStart(2, "0")}-production-readonly-then-single-apply.md\`\n- Batch: FORBIDDEN\n- Duplicate apply of 19/20 bridge file: FORBIDDEN\n`,
  )
  .join("\n")}

PASS: \`PASS_SEQ08_20_OPERATOR_PACK\`
`,
);

write(
  join(packDir, "05-SEQ21-24.md"),
  `# 05 — SEQ21→SEQ24 (one migration per approval)

${seq21to24
  .map(
    (e) =>
      `## Order ${e.order}\n\n- File: \`${e.migration}\`\n- LF SHA: \`${e.migration_sha_lf}\`\n- Preflight: \`${e.preflight}\`\n- Post: \`${e.post_verifier}\`\n- Prompt: \`docs/production-prompts/b1-seq${e.order}-production-readonly-then-single-apply.md\`\n`,
  )
  .join("\n")}

Gate 25 is NOT included here.
PASS: \`PASS_SEQ21_24_OPERATOR_PACK\`
`,
);

write(
  join(packDir, "06-AUTHORIZATION-MATRIX.md"),
  `# 06 — Authorization matrix gate

| Requirement | Binding |
|---|---|
| Positive cells | 24 (exact assignee / unit / role / legal action) |
| Negative cells | 528 |
| Zero-mutation on deny | 528 |
| FAIL allowed | 0 |
| Proof channel | Direct RPC (not UI-only) |
| Local harness | \`tests/b1-five-services-authorization/run-full-matrix.ps1\` |
| Bypass | No admin / registrar / dean general bypass |

PASS: \`PASS_AUTHORIZATION_MATRIX_24_528_0\`
`,
);

write(
  join(packDir, "07-GATE25.md"),
  `# 07 — Gate 25 activation (non-migration)

| Field | Value |
|---|---|
| Kind | Operational activation gate — NOT a migration |
| After | SEQ07-B + SEQ08→24 all verified |
| Separate approval | HARD YES |
| student_visible | Separate approval; never bundled |
| Local simulation only in overnight track | \`tests/b1-rpc-matrix/pg/30-pre-activation-assert.sql\` + \`35-activate-workflows-local-only.sql\` |

Forbidden in migration sessions. Production activation not authorized by source PRs.

PASS: \`PASS_GATE25_OPERATOR_BOUNDARY_DOCUMENTED\`
`,
);

write(
  join(packDir, "08-DEPLOY-AND-SMOKE.md"),
  `# 08 — Deploy and smoke

| Field | Value |
|---|---|
| After | Gate 25 evidence |
| Separate approval | YES |
| Smoke | Five activated services; staff inbox; attachment deny matrix; payment confirm simplified; no public attachment URLs; enrollment_certificate regression |

No Deploy from overnight source track.

PASS: \`PASS_DEPLOY_SMOKE_OPERATOR_BOUNDARY_DOCUMENTED\`
`,
);

write(
  join(packDir, "09-STOP-CONDITIONS.md"),
  `# 09 — Stop conditions

- Any preflight failure
- Any apply error / PARTIAL / AMBIGUOUS history vs objects
- Protected-record drift
- Unexpected service visibility
- Public bucket / anon privilege / broad bypass
- Attempt to apply superseded SEQ07 \`20260725110000\` after SEQ07-B
- Batch / next-migration in same session
- Gate 25 or Deploy bundled with migrations

On stop: halt sequence; forward-only remediation only.
`,
);

write(
  join(packDir, "10-FORWARD-ONLY-REMEDIATION.md"),
  `# 10 — Forward-only remediation

| Forbidden | Allowed |
|---|---|
| migration repair | reviewed forward migration |
| manual schema_migrations insert | official runner history only |
| delete/reset/cleanup of production data | Storage-tool contract correction for B0 only |
| down migrations | replace/revoke via forward package |
| re-apply same version with different bytes | never |

Every remediation requires its own approval boundary.
`,
);

console.log(
  JSON.stringify(
    {
      prompts: uniqueApply.length,
      operator_pack_files: 10,
      sha_issues: 0,
      unique_migrations: uniqueApply.map((e) => e.migration),
    },
    null,
    2,
  ),
);
