import { afterAll, describe, expect, it } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const root = process.cwd();

const manifestPath = join(
  root,
  "docs/migration-evidence/academic-councils/MIGRATION_MANIFEST.json",
);
const hashesPath = join(root, "docs/migration-evidence/academic-councils/HASHES.txt");

const packageFiles = {
  preflight: join(root, "docs/migration-drafts/COUNCILS-C0-C9-PRODUCTION-READONLY-PREFLIGHT-01.sql"),
  applyOne: join(root, "docs/production-preflight/COUNCILS-C0-C9-APPLY-ONE-OPERATOR-PLAN-01.md"),
  partial: join(root, "docs/migration-drafts/COUNCILS-C0-C9-PARTIAL-SAFE-HOLD-STATES-01.md"),
  rollback: join(root, "docs/migration-drafts/COUNCILS-C0-C9-ROLLBACK-BY-FORWARD-01.sql"),
  fixture: join(root, "docs/migration-drafts/COUNCILS-C0-C9-TESTONLY-E2E-FIXTURE-01.sql"),
  cleanup: join(root, "docs/migration-drafts/COUNCILS-C0-C9-TESTONLY-CLEANUP-01.sql"),
  zeroResidue: join(root, "docs/migration-drafts/COUNCILS-C0-C9-ZERO-RESIDUE-VERIFIER-01.sql"),
  observability: join(root, "docs/migration-drafts/COUNCILS-C0-C9-OBSERVABILITY-READONLY-01.sql"),
  flags: join(root, "docs/migration-drafts/COUNCILS-C0-C9-FLAGS-01.md"),
  portalFeatures: join(root, "src/lib/portal-features.ts"),
};

const chain = [
  { step: "C0", migration: "supabase/migrations/20260808120000_councils_c0_write_surface_hardening_01.sql", verifier: "docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C0.sql", pass: "COUNCILS_C0_PRODUCTION_POST_VERIFIER_PASS", sha: "cca51386d7c3bfe1a3b9ce5ec2cdfb3cd124e3e5eeef01f6270e4299c715dc13" },
  { step: "C1", migration: "supabase/migrations/20260808121000_councils_c1_meeting_state_machine_01.sql", verifier: "docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C1.sql", pass: "COUNCILS_C1_PRODUCTION_POST_VERIFIER_PASS", sha: "498a8d8c274277ff3ffc96e95fa30202e859aa2a2cfd74bcfaaa9f5d39a033d5" },
  { step: "C2", migration: "supabase/migrations/20260808122000_councils_c2_topic_intake_review_01.sql", verifier: "docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C2.sql", pass: "COUNCILS_C2_PRODUCTION_POST_VERIFIER_PASS", sha: "f969c6c0f63a4758944cc59f6c78292f56f3a4ac360ae77f0b386bf72e0e364e" },
  { step: "C3", migration: "supabase/migrations/20260808130000_councils_c3_attendance_quorum_01.sql", verifier: "docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C3.sql", pass: "COUNCILS_C3_PRODUCTION_POST_VERIFIER_PASS", sha: "e7361f6c85014fb37b6f8d97bd468dc1205700748a526cb7a8063f82ff6c0de6" },
  { step: "C4", migration: "supabase/migrations/20260808140000_councils_c4_session_voting_01.sql", verifier: "docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C4.sql", pass: "COUNCILS_C4_PRODUCTION_POST_VERIFIER_PASS", sha: "d0825e1ddcce82c0e1123ea04cba2777e3b726bc0e4ae514940a714d322b05cd" },
  { step: "C5", migration: "supabase/migrations/20260808150000_councils_c5_minutes_lifecycle_01.sql", verifier: "docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C5.sql", pass: "COUNCILS_C5_PRODUCTION_POST_VERIFIER_PASS", sha: "85c5db5e273f529bac300a6f983098eea30add602ed7a51fbe4635addb353c25" },
  { step: "C6", migration: "supabase/migrations/20260808160000_councils_c6_decisions_followup_01.sql", verifier: "docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C6.sql", pass: "COUNCILS_C6_PRODUCTION_POST_VERIFIER_PASS", sha: "1051df7e816fc2e260616a9f1f9dba457e5e39e001c5ab06a91f376b84d92b43" },
  { step: "C7", migration: "supabase/migrations/20260808170000_councils_c7_audit_archive_01.sql", verifier: "docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C7.sql", pass: "COUNCILS_C7_PRODUCTION_POST_VERIFIER_PASS", sha: "3fd74518d57722b7018b06ba9ce50f7fb9033c2d8527fe515d5ad133a4081f6a" },
  { step: "C8", migration: "supabase/migrations/20260808171000_councils_c0_c8_final_security_closure_01.sql", verifier: "docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C8.sql", pass: "COUNCILS_C8_PRODUCTION_POST_VERIFIER_PASS", sha: "6cb87098f9f038d0d6174aa08c37c524b1b4d91cca49244251cbc03ab6df37c3" },
  { step: "C9", migration: "supabase/migrations/20260808180000_councils_c9_notifications_reporting_01.sql", verifier: "docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C9.sql", pass: "COUNCILS_C9_PRODUCTION_POST_VERIFIER_PASS", sha: "c15f3378d12de10a0ef04d93ce033adca06f70fd7d9d53b764a21e828c329d4e" },
] as const;

const predecessors = [
  "tests/academic-councils/postgres-minimal-schema.sql",
  "supabase/migrations/20260703192337_3ef2f7b2-cf46-4407-9f1a-60c25b46c211.sql",
  "supabase/migrations/20260703194033_cccf45a9-50ed-4a72-bb11-7e5d1627b5a2.sql",
  "supabase/migrations/20260704200326_b0736829-500e-456c-aa9b-6dc7ccd10012.sql",
  "supabase/migrations/20260705232119_84b04a88-50be-4c5c-b9c3-11aeb54fa119.sql",
] as const;

function sha256Lf(path: string): string {
  const raw = readFileSync(path);
  const out: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    const b = raw[i]!;
    if (b === 0x0d) {
      if (i + 1 < raw.length && raw[i + 1] === 0x0a) i++;
      out.push(0x0a);
    } else {
      out.push(b);
    }
  }
  return createHash("sha256").update(Buffer.from(out)).digest("hex");
}

const container = `councils-prod-ready-${Date.now()}`;

const dockerReady = (() => {
  try {
    execSync("docker --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

function teardownContainer() {
  try {
    execSync(`docker rm -f ${container}`, { stdio: "ignore" });
  } catch {
    /* ignore */
  }
}

function psql(sql: string, vars: string[] = []): { ok: boolean; out: string } {
  const args = ["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", ...vars, "-U", "postgres", "-d", "postgres"];
  const res = spawnSync("docker", args, {
    input: sql,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
  return { ok: res.status === 0, out: `${res.stdout || ""}\n${res.stderr || ""}` };
}

function psqlFile(filePath: string, vars: string[] = []): { ok: boolean; out: string } {
  return psql(readFileSync(filePath, "utf8"), vars);
}

async function waitReady(): Promise<boolean> {
  for (let i = 0; i < 60; i++) {
    const r = spawnSync("docker", ["exec", container, "pg_isready", "-U", "postgres"], {
      encoding: "utf8",
    });
    if (r.status === 0 && psql("select 1;").ok) return true;
    await Bun.sleep(500);
  }
  return false;
}

afterAll(() => {
  teardownContainer();
});

describe("Academic Councils C0-C9 production readiness package", () => {
  it("ships manifest, hashes, and all package artifacts", () => {
    expect(existsSync(manifestPath)).toBe(true);
    expect(existsSync(hashesPath)).toBe(true);
    for (const [name, path] of Object.entries(packageFiles)) {
      expect(existsSync(path), name).toBe(true);
    }
    for (const step of chain) {
      expect(existsSync(join(root, step.migration)), step.step).toBe(true);
      expect(existsSync(join(root, step.verifier)), step.step).toBe(true);
    }

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(manifest.hash_contract).toBe("SHA256_LF_NORMALIZED_V1");
    expect(manifest.mission).toBe("ACADEMIC-COUNCILS-LEGACY-PRODUCTION-TO-C0-C9-FORWARD-RECONCILIATION-LONGRUN-13");
    expect(manifest.base_pr).toBe(306);
    expect(manifest.base_sha).toBe("1f50e7dcc8042cf15780c7817ecefa579c49f431");
    expect(manifest.release_qualification?.postgrest_http_auth_matrix).toBe(true);
    expect(manifest.release_qualification?.legacy_reconciliation_test).toBe(
      "tests/academic-councils/councils-legacy-production-to-c0-c9-reconciliation.test.ts",
    );
    expect(manifest.max_migrations_per_apply_session).toBe(1);
    expect(manifest.promoted_chain).toHaveLength(10);
    expect(manifest.production_apply).toBe(false);
    expect(manifest.legacy_reconciliation?.supported_prestate).toBe("LEGACY_SUPPORTED");
    expect(manifest.preflight_sha256_lf).toBeDefined();

    const c9Verifier = readFileSync(join(root, "docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C9.sql"), "utf8");
    expect(c9Verifier).toContain("INTERNAL_ONLY");
    expect(c9Verifier).toContain("C9_INTERNAL_RPC_ACL_PASS");
    expect(c9Verifier).toContain("still client-executable");
  });

  it("pins LF-normalized FULL hashes for every promoted migration", () => {
    const hashesTxt = readFileSync(hashesPath, "utf8");
    expect(hashesTxt).toContain("SHA256_LF_NORMALIZED_V1");
    for (const step of chain) {
      const actual = sha256Lf(join(root, step.migration));
      expect(actual, step.step).toBe(step.sha);
      expect(hashesTxt).toContain(step.sha);
    }
  });

  it("keeps unique timestamps and apply-one STOP gates", () => {
    const stamps = chain.map((s) => s.migration.match(/\/(\d{14})_/)?.[1]);
    expect(new Set(stamps).size).toBe(stamps.length);
    const plan = readFileSync(packageFiles.applyOne, "utf8");
    expect(plan).toContain("ONE migration per session");
    expect(plan).toContain("STOP");
    for (const step of chain) {
      expect(plan).toContain(step.pass);
    }
  });

  it("documents partial HOLD states and rollback-by-forward without DROP TABLE", () => {
    const partial = readFileSync(packageFiles.partial, "utf8");
    for (const label of [
      "SAFE_HOLD_AFTER_C0",
      "SAFE_HOLD_AFTER_C1",
      "SAFE_HOLD_AFTER_C2",
      "SAFE_HOLD_AFTER_C3",
      "SAFE_HOLD_AFTER_C4",
      "SAFE_HOLD_AFTER_C5",
      "SAFE_HOLD_AFTER_C6",
      "SAFE_HOLD_AFTER_C7",
      "SAFE_HOLD_BEFORE_C9",
    ]) {
      expect(partial).toContain(label);
    }
    const rb = readFileSync(packageFiles.rollback, "utf8");
    expect(rb).toContain("No DROP TABLE");
    expect(rb).toMatch(/SAFE_HOLD_AFTER_C0|RECOVERY_STATE_SAFE/);
    expect(rb).not.toMatch(/^\s*DROP\s+TABLE\b/im);
  });

  it("ships TEST_ONLY E2E dry-run default, cleanup exact IDs, zero residue, observability", () => {
    const fixture = readFileSync(packageFiles.fixture, "utf8");
    expect(fixture).toContain("TEST_ONLY_COUNCILS_C0_C9_E2E_01");
    expect(fixture).toContain("councils.pkg_dry_run");
    expect(fixture).toContain("councils.test_only.execute");
    expect(fixture).toContain("chair");
    expect(fixture).toContain("secretary");
    expect(fixture).toContain("responsible");
    expect(fixture).toContain("DRY RUN");
    expect(fixture).toContain("COUNCILS_TESTONLY_E2E_FIXTURE_EXECUTE_COMPLETE");
    expect(fixture).not.toContain("EXECUTE_HANDOFF");

    const cleanup = readFileSync(packageFiles.cleanup, "utf8");
    expect(cleanup).toContain("p_dry_run boolean DEFAULT true");
    expect(cleanup).toContain("councils.pkg_dry_run");
    expect(cleanup).toContain("c0c90000-0000-4000-8000-000000000001");
    expect(cleanup).toContain("c0c90000-0000-4000-8000-ffffffffffff");
    expect(cleanup).not.toMatch(/WHERE[\s\S]{0,80}LIKE\s+'%TEST%/i);
    expect(cleanup).not.toMatch(/DELETE[\s\S]{0,120}LIKE\s+'/i);

    const zero = readFileSync(packageFiles.zeroResidue, "utf8");
    expect(zero).toContain("COUNCILS_ZERO_RESIDUE_VERIFIER_PASS");
    expect(zero).toContain("ZERO_RESIDUE_SENTINEL");
    expect(zero).toContain("TEST_ONLY_RESIDUE_TOTAL");

    const obs = readFileSync(packageFiles.observability, "utf8");
    expect(obs).toContain("OBS_MEETING_LIFECYCLE");
    expect(obs).toContain("OBS_QUORUM");
    expect(obs).toContain("OBS_VOTES");
    expect(obs).toContain("OBS_MINUTES");
    expect(obs).toContain("OBS_DECISIONS");
    expect(obs).toContain("OBS_NOTIFICATIONS");
    expect(obs).toContain("OBS_AUDIT");
    expect(obs).toContain("OBS_ARCHIVE");
    expect(obs).toContain("OBS_REPORTS");
  });

  it("identifies academicCouncils flag contract as absent/ungated and not enabled", () => {
    const flags = readFileSync(packageFiles.flags, "utf8");
    expect(flags).toContain("ABSENT");
    expect(flags).toContain("UNGATED");
    expect(flags).toContain("DO NOT");
    const features = readFileSync(packageFiles.portalFeatures, "utf8");
    expect(features).not.toMatch(/academicCouncils\s*:\s*true/);
    expect(features).not.toContain("adminAcademicCouncils: true");
    expect(features).not.toContain("facultyAcademicCouncils: true");
  });

  it("preflight and post-verifiers are read-only catalog scripts", () => {
    const preflight = readFileSync(packageFiles.preflight, "utf8");
    expect(preflight).toContain("READY_FOR_APPLY_C0");
    expect(preflight).toContain("v_expected_policies");
    expect(preflight).toContain("can_schedule_council_meeting");
    const preflightBody = preflight
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n")
      .toLowerCase();
    expect(preflightBody).not.toMatch(/\binsert\s+into\b/);
    expect(preflightBody).not.toMatch(/\bdelete\s+from\b/);
    expect(preflightBody).not.toMatch(/\btruncate\b/);
    expect(preflightBody).not.toMatch(/\bdrop\s+table\b/);
    expect(preflightBody).not.toMatch(/\bupdate\s+public\./);
    for (const step of chain) {
      const v = readFileSync(join(root, step.verifier), "utf8");
      expect(v).toContain(step.pass);
      expect(v.toLowerCase()).not.toMatch(/\b(insert into|update |delete from|truncate|drop table)\b/);
    }
  });

  it("PG17 rehearsal: predecessors → preflight → C0-C9 apply-one + verifiers → dry-run fixture/cleanup → zero residue → observability", async () => {
    if (!dockerReady) {
      throw new Error("docker is required for the PG17 disposable harness");
    }

    teardownContainer();
    execSync(
      `docker run -d --name ${container} -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17`,
      { stdio: "ignore" },
    );
    expect(await waitReady()).toBe(true);
    await Bun.sleep(1000);
    expect(await waitReady()).toBe(true);

    for (const pred of predecessors) {
      const r = psqlFile(join(root, pred));
      if (!r.ok) throw new Error(`predecessor ${pred} failed:\n${r.out}`);
    }

    const pre = psqlFile(packageFiles.preflight);
    if (!pre.ok) throw new Error(`preflight failed:\n${pre.out}`);
    expect(pre.out).toContain("READY_FOR_APPLY_C0");

    for (const step of chain) {
      const applied = psqlFile(join(root, step.migration));
      if (!applied.ok) throw new Error(`${step.step} apply failed:\n${applied.out}`);
      const verified = psqlFile(join(root, step.verifier));
      if (!verified.ok) throw new Error(`${step.step} post-verifier failed:\n${verified.out}`);
      expect(verified.out).toContain(step.pass);
    }

    // Behavioral positives (existing local verifiers — never for production)
    const behavioralC9 = psqlFile(
      join(root, "tests/academic-councils/postgres-c9-notifications-reporting-verifier.sql"),
    );
    if (!behavioralC9.ok) {
      throw new Error(`behavioral C9 verifier failed:\n${behavioralC9.out}`);
    }
    expect(behavioralC9.out).toContain("ACADEMIC_COUNCILS_C9_NOTIFICATIONS_REPORTING_VERIFIER_PASS");

    const fixture = psqlFile(packageFiles.fixture);
    if (!fixture.ok) throw new Error(`fixture dry-run failed:\n${fixture.out}`);
    expect(fixture.out).toContain("COUNCILS_TESTONLY_E2E_FIXTURE_DRY_RUN_COMPLETE");

    const cleanup = psqlFile(packageFiles.cleanup);
    if (!cleanup.ok) throw new Error(`cleanup dry-run failed:\n${cleanup.out}`);
    expect(cleanup.out).toMatch(/CLEANUP_DRY_RUN|COUNCILS_TESTONLY_CLEANUP_DRY_RUN_COMPLETE/);

    const zero = psqlFile(packageFiles.zeroResidue);
    if (!zero.ok) throw new Error(`zero residue failed:\n${zero.out}`);
    expect(zero.out).toContain("COUNCILS_ZERO_RESIDUE_VERIFIER_PASS");

    const obs = psqlFile(packageFiles.observability);
    if (!obs.ok) throw new Error(`observability failed:\n${obs.out}`);
    expect(obs.out).toContain("COUNCILS_OBSERVABILITY_READONLY_PASS");

    const rb = psqlFile(packageFiles.rollback);
    if (!rb.ok) throw new Error(`rollback classifier failed:\n${rb.out}`);
    expect(rb.out).toMatch(/RECOVERY_STATE_SAFE|COUNCILS_ROLLBACK_BY_FORWARD_CLASSIFIER_COMPLETE/);
  }, 600_000);
});
