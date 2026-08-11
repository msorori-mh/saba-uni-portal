import { afterAll, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync, spawnSync } from "node:child_process";
import { mapGraduationProjectDetail } from "@/routes/-graduation-projects-adapter";

const root = process.cwd();
const minimalSchemaPath = join(root, "tests/graduation-projects/postgres-minimal-schema.sql");
const a1Path = join(root, "supabase/migrations/20260806235348_8f36000d-c62c-416f-a84b-eeee7d400dd8.sql");
const a2Path = join(root, "supabase/migrations/20260807000230_a6771356-c3f3-4cba-9b90-e3f70afbb72b.sql");
const a3Path = join(root, "supabase/migrations/20260807001114_c22e6009-1472-43ef-9443-b002872bbba5.sql");
const storageFixPath = join(root, "supabase/migrations/20260807023229_7adcb3fb-73a1-483c-8ca2-4c93645fb84b.sql");
const l4Path = join(root, "supabase/migrations/20260808010000_gp_student_level4_only_eligibility_guard_01.sql");
const identityPath = join(
  root,
  "supabase/migrations/20260811010000_gp_identity_options_and_revision_notes_01.sql",
);
const remediationPath = join(
  root,
  "supabase/migrations/20260811020000_gp_independent_security_audit_remediation_02.sql",
);
const verifierPath = join(
  root,
  "tests/graduation-projects/postgres-gp-independent-security-audit-remediation-02-verifier.sql",
);

const remediation = readFileSync(remediationPath, "utf8");
const identity = readFileSync(identityPath, "utf8");
const verifier = readFileSync(verifierPath, "utf8");

const container = `gp-sec-remediation-02-${Date.now()}`;
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

function psql(sql: string): { ok: boolean; out: string } {
  const res = spawnSync(
    "docker",
    ["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { input: sql, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
  return { ok: res.status === 0, out: `${res.stdout ?? ""}${res.stderr ?? ""}` };
}

function psqlFile(filePath: string): { ok: boolean; out: string } {
  return psql(readFileSync(filePath, "utf8"));
}

async function waitReady(timeoutMs = 60_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const probe = psql("select 1;");
    if (probe.ok) return true;
    await Bun.sleep(1000);
  }
  return false;
}

afterAll(() => teardownContainer());

describe("GP independent security audit remediation 02", () => {
  it("ships forward-only remediation migration with explicit R7 strategy", () => {
    expect(remediation).toContain("PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION");
    expect(remediation).toContain("PORTAL-GP-INDEPENDENT-SECURITY-AUDIT-FINDINGS-REMEDIATION-02");
    expect(remediation).toContain("evaluation_round");
    expect(remediation).toContain("program department mismatch");
    expect(remediation).toContain("viewer_is_leader");
    expect(remediation).toContain("'archive'");
    expect(remediation).toContain("required_count");
    expect(remediation).toContain("when v_dec = 'revisions_required' then v_round + 1");
    expect(remediation).not.toMatch(/drop table public\.graduation_projects/i);
    expect(identity).toContain("PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION");
    expect(identity).toContain("identity_options");
  });

  it("verifier covers H-01/M-01/M-02/M-03/H-03/L-01 executable markers", () => {
    expect(verifier).toMatch(/^\s*begin;/im);
    expect(verifier).toMatch(/^\s*rollback;/im);
    expect(verifier).not.toMatch(/^\s*commit;/im);
    expect(verifier).toContain("STALE_EVALUATION_DIRECT_RPC_NEGATIVE_PASS");
    expect(verifier).toContain("M01_PROGRAM_DEPARTMENT_NEGATIVE_PASS");
    expect(verifier).toContain("H03_IDENTITY_OPTIONS_SCOPE_PASS");
    expect(verifier).toContain("M02_COMMITTEE_COUNT_MATRIX_PASS");
    expect(verifier).toContain("ARCHIVE_DETAIL_PASS");
    expect(verifier).toContain("L01_LEADER_ROLE_UI_BACKEND_PARITY_PASS");
    expect(verifier).toContain("GP_INDEPENDENT_SECURITY_AUDIT_REMEDIATION_02_VERIFIER_PASS");
  });

  it("L-01 adapter derives leader only from viewer_is_leader, not teammate leader row", () => {
    const memberDetail = mapGraduationProjectDetail({
      project_id: "p1",
      title: "GP",
      lifecycle_state: "draft",
      viewer_roles: ["student"],
      viewer_is_leader: false,
      team: [
        { assignment_id: "a1", user_id: "leader-user", is_leader: true, active: true },
        { assignment_id: "a2", user_id: "member-user", is_leader: false, active: true },
      ],
    });
    expect(memberDetail.viewer).toBe("member");

    const leaderDetail = mapGraduationProjectDetail({
      project_id: "p1",
      title: "GP",
      lifecycle_state: "draft",
      viewer_roles: ["student"],
      viewer_is_leader: true,
      team: [
        { assignment_id: "a1", user_id: "leader-user", is_leader: true, active: true },
        { assignment_id: "a2", user_id: "member-user", is_leader: false, active: true },
      ],
    });
    expect(leaderDetail.viewer).toBe("leader");
  });

  it("M-03 adapter maps safe archive projection without storage paths", () => {
    const detail = mapGraduationProjectDetail({
      project_id: "p1",
      title: "Archived GP",
      lifecycle_state: "archived",
      viewer_roles: ["coordinator"],
      viewer_is_leader: false,
      archive: {
        archive_id: "ar1",
        archived_at: "2026-08-11T00:00:00Z",
        final_decision: "passed",
        average_score: 90,
        final_file_id: "file-1",
        summary: "Archived GP",
      },
      evaluation_aggregate: { submitted_count: 2, required_count: 2 },
      defense: { committee_count: 2, state: "held" },
    });
    expect(detail.archive?.archivedAt).toBe("2026-08-11T00:00:00Z");
    expect(detail.archive?.file?.id).toBe("file-1");
    expect(detail.evaluation.requiredCount).toBe(2);
    expect(JSON.stringify(detail.archive)).not.toContain("object_key");
  });

  it("M-02 adapter does not hardcode requiredCount=2 when backend omits aggregate", () => {
    const detail = mapGraduationProjectDetail({
      project_id: "p1",
      title: "GP",
      lifecycle_state: "evaluating",
      viewer_roles: ["coordinator"],
      defense: { committee_count: 3, state: "held" },
      evaluation_aggregate: { submitted_count: 1, required_count: 3 },
    });
    expect(detail.evaluation.requiredCount).toBe(3);
    expect(detail.evaluation.submittedCount).toBe(1);
  });

  it("launches disposable PG17 and proves remediation negatives", async () => {
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

    const chain: Array<[string, string]> = [
      ["minimal-schema", minimalSchemaPath],
      ["U1-A1", a1Path],
      ["U2-A2", a2Path],
      ["U3-A3", a3Path],
      ["U4-storage-fix", storageFixPath],
      ["L4", l4Path],
      ["identity", identityPath],
      ["remediation-02", remediationPath],
    ];

    for (const [label, path] of chain) {
      let result = psqlFile(path);
      if (!result.ok) {
        await Bun.sleep(1500);
        if (!(await waitReady())) {
          throw new Error(`${label} failed (postgres not ready):\n${result.out}`);
        }
        result = psqlFile(path);
      }
      if (!result.ok) {
        throw new Error(`${label} failed:\n${result.out}`);
      }
    }

    const noticeCheck = psqlFile(verifierPath);
    if (!noticeCheck.ok) {
      throw new Error(`remediation verifier failed:\n${noticeCheck.out}`);
    }
    expect(noticeCheck.out).toContain("STALE_EVALUATION_DIRECT_RPC_NEGATIVE_PASS");
    expect(noticeCheck.out).toContain("M01_PROGRAM_DEPARTMENT_NEGATIVE_PASS");
    expect(noticeCheck.out).toContain("H03_IDENTITY_OPTIONS_SCOPE_PASS");
    expect(noticeCheck.out).toContain("M02_COMMITTEE_COUNT_MATRIX_PASS");
    expect(noticeCheck.out).toContain("M02_COMMITTEE3_COUNT_MATRIX_PASS");
    expect(noticeCheck.out).toContain("ARCHIVE_DETAIL_PASS");
    expect(noticeCheck.out).toContain("L01_LEADER_ROLE_UI_BACKEND_PARITY_PASS");
    expect(noticeCheck.out).toContain(
      "GP_INDEPENDENT_SECURITY_AUDIT_REMEDIATION_02_VERIFIER_PASS",
    );
  }, 300_000);
});
