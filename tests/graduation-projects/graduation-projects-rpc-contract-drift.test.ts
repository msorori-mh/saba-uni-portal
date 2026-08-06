import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FROZEN_READ_RPCS,
  FROZEN_WRITE_RPCS,
  PACKAGE_A_SIGNATURE_DEPENDENCIES,
} from "../../src/lib/graduation-projects/rpc";
import { GP_PRIVATE_BUCKET } from "../../src/lib/graduation-projects/domain";

const ROOT = join(import.meta.dir, "../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const a1 = read("docs/migration-drafts/GRADUATION-PROJECTS-MVP-PACKAGE-A1-FOUNDATION-01.sql");
const a2 = read("docs/migration-drafts/GRADUATION-PROJECTS-MVP-PACKAGE-A2-STORAGE-01.sql");
const a3 = read("docs/migration-drafts/GRADUATION-PROJECTS-MVP-PACKAGE-A3-LIFECYCLE-01.sql");
const migA2 = read("supabase/migrations/20260806120100_gp_mvp_package_a2_storage_01.sql");
const rpcTs = read("src/lib/graduation-projects/rpc.ts");
const serviceTs = read("src/lib/graduation-projects/service.ts");
const adapterTs = read("src/routes/-graduation-projects-adapter.ts");

/** Extract create function public.<name>(...params...) parameter text from SQL. */
function extractParams(sql: string, name: string): string | null {
  const re = new RegExp(
    `create function public\\.${name}\\s*\\(([\\s\\S]*?)\\)\\s*returns`,
    "i",
  );
  const m = sql.match(re);
  return m?.[1]?.replace(/\s+/g, " ").trim() ?? null;
}

function paramNames(paramList: string): string[] {
  if (!paramList) return [];
  return paramList
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.split(/\s+/)[0]!)
    .filter((n) => n.startsWith("p_"));
}

const PACKAGE_A_CLIENT_RPCS: Array<{ name: string; source: "a2" | "a3"; requiredArgs: string[] }> = [
  {
    name: "create_graduation_project_file_upload_intent",
    source: "a2",
    requiredArgs: ["p_project_id", "p_category", "p_original_name", "p_byte_size", "p_correlation_id"],
  },
  {
    name: "register_graduation_project_file",
    source: "a2",
    requiredArgs: ["p_project_id", "p_category", "p_original_name", "p_byte_size", "p_correlation_id"],
  },
  {
    name: "finalize_graduation_project_file",
    source: "a2",
    requiredArgs: ["p_file_id", "p_correlation_id"],
  },
  {
    name: "mark_graduation_project_file_scan_state",
    source: "a2",
    requiredArgs: ["p_file_id", "p_scan_state", "p_correlation_id"],
  },
  {
    name: "create_graduation_project_signed_download",
    source: "a2",
    requiredArgs: ["p_file_id", "p_correlation_id"],
  },
  {
    name: "create_graduation_project_team",
    source: "a3",
    requiredArgs: [
      "p_department_id",
      "p_leader_student_profile_id",
      "p_leader_user_id",
      "p_program_id",
      "p_academic_year_id",
      "p_semester_id",
      "p_correlation_id",
    ],
  },
  {
    name: "add_graduation_project_team_member",
    source: "a3",
    requiredArgs: ["p_project_id", "p_student_profile_id", "p_student_user_id", "p_correlation_id"],
  },
  {
    name: "remove_graduation_project_team_member",
    source: "a3",
    requiredArgs: ["p_project_id", "p_assignment_id", "p_correlation_id"],
  },
  {
    name: "upsert_graduation_project_proposal",
    source: "a3",
    requiredArgs: [
      "p_project_id",
      "p_title",
      "p_problem_statement",
      "p_objectives",
      "p_summary",
      "p_expected_version",
      "p_correlation_id",
    ],
  },
  {
    name: "submit_graduation_project_proposal",
    source: "a3",
    requiredArgs: ["p_project_id", "p_expected_version", "p_correlation_id"],
  },
  {
    name: "resubmit_graduation_project_proposal",
    source: "a3",
    requiredArgs: ["p_project_id", "p_expected_version", "p_correlation_id"],
  },
  {
    name: "review_graduation_project_proposal",
    source: "a3",
    requiredArgs: ["p_project_id", "p_action", "p_reason", "p_expected_version", "p_correlation_id"],
  },
  {
    name: "assign_graduation_project_supervisor",
    source: "a3",
    requiredArgs: ["p_project_id", "p_faculty_profile_id", "p_user_id", "p_correlation_id"],
  },
  {
    name: "respond_graduation_project_supervision",
    source: "a3",
    requiredArgs: ["p_project_id", "p_response", "p_expected_version", "p_correlation_id"],
  },
  {
    name: "submit_graduation_project_progress",
    source: "a3",
    requiredArgs: ["p_project_id", "p_summary", "p_file_id", "p_correlation_id"],
  },
  {
    name: "review_graduation_project_progress",
    source: "a3",
    requiredArgs: ["p_entry_id", "p_action", "p_comments", "p_correlation_id"],
  },
  {
    name: "submit_graduation_project_final",
    source: "a3",
    requiredArgs: ["p_project_id", "p_file_id", "p_expected_version", "p_correlation_id"],
  },
  {
    name: "review_graduation_project_final",
    source: "a3",
    requiredArgs: ["p_project_id", "p_action", "p_comments", "p_expected_version", "p_correlation_id"],
  },
  {
    name: "schedule_graduation_project_defense",
    source: "a3",
    requiredArgs: ["p_project_id", "p_starts_at", "p_venue", "p_expected_version", "p_correlation_id"],
  },
  {
    name: "assign_graduation_project_committee_member",
    source: "a3",
    requiredArgs: ["p_project_id", "p_faculty_profile_id", "p_user_id", "p_correlation_id"],
  },
  {
    name: "mark_graduation_project_defense_held",
    source: "a3",
    requiredArgs: ["p_project_id", "p_expected_version", "p_correlation_id"],
  },
  {
    name: "submit_graduation_project_evaluation",
    source: "a3",
    requiredArgs: ["p_project_id", "p_score", "p_notes", "p_correlation_id"],
  },
  {
    name: "conclude_graduation_project_result",
    source: "a3",
    requiredArgs: ["p_project_id", "p_decision", "p_expected_version", "p_correlation_id"],
  },
  {
    name: "archive_graduation_project",
    source: "a3",
    requiredArgs: ["p_project_id", "p_expected_version", "p_correlation_id"],
  },
  { name: "list_my_graduation_projects", source: "a3", requiredArgs: [] },
  {
    name: "get_graduation_project_detail",
    source: "a3",
    requiredArgs: ["p_project_id"],
  },
  {
    name: "list_administration_graduation_projects_overview",
    source: "a3",
    requiredArgs: [],
  },
];

describe("Package B ↔ Package A RPC contract drift guard", () => {
  test("canonical bucket id is graduation-projects everywhere in B/C runtime", () => {
    expect(GP_PRIVATE_BUCKET).toBe("graduation-projects");
    expect(serviceTs).toContain('GP_PRIVATE_BUCKET');
    expect(serviceTs).not.toContain("graduation-projects-files");
    expect(rpcTs).not.toContain("graduation-projects-files");
    expect(adapterTs).toContain("@/lib/graduation-projects");
    expect(adapterTs).not.toContain("prepare_graduation_project_private_upload");
    expect(adapterTs).not.toContain("list_my_graduation_projects_mvp");
    expect(adapterTs).not.toContain("getPublicUrl");
  });

  test("A2 never mutates storage.buckets and asserts private prerequisite", () => {
    for (const sql of [a2, migA2]) {
      expect(sql).not.toMatch(/insert\s+into\s+storage\.buckets/i);
      expect(sql).not.toMatch(/update\s+storage\.buckets/i);
      expect(sql).toContain("graduation-projects private bucket missing or public");
      expect(sql).toContain("Lovable storage_create_bucket");
    }
  });

  test("every Package B client RPC name exists in Package A migrations with matching p_* args", () => {
    const sqlBySource = { a2, a3 } as const;
    for (const rpc of PACKAGE_A_CLIENT_RPCS) {
      const params = extractParams(sqlBySource[rpc.source], rpc.name);
      expect(params, `missing create function public.${rpc.name}`).not.toBeNull();
      const names = paramNames(params!);
      for (const arg of rpc.requiredArgs) {
        expect(names, `${rpc.name} missing ${arg}`).toContain(arg);
      }
      // Drift: TypeScript must not send invented arg names for this RPC.
      if (rpc.name === "conclude_graduation_project_result") {
        expect(rpcTs).toContain('p_decision:');
        expect(rpcTs).not.toMatch(
          /conclude_graduation_project_result[\s\S]{0,200}p_final_decision/,
        );
      }
      if (rpc.name === "finalize_graduation_project_file") {
        expect(rpcTs).toContain('p_sha256:');
        expect(rpcTs).not.toMatch(
          /finalize_graduation_project_file[\s\S]{0,120}p_project_id/,
        );
      }
      if (rpc.name === "register_graduation_project_file") {
        expect(rpcTs).not.toContain("p_object_key:");
        expect(rpcTs).not.toContain("p_media_type:");
      }
      if (rpc.name === "review_graduation_project_progress") {
        expect(rpcTs).toContain("p_entry_id:");
      }
      if (rpc.name === "create_graduation_project_signed_download") {
        expect(rpcTs).toMatch(
          /create_graduation_project_signed_download",\s*\{\s*p_file_id:/,
        );
      }
    }
  });

  test("PACKAGE_A_SIGNATURE_DEPENDENCIES matches extracted Package A parameter names", () => {
    const sqlAll = a1 + a2 + a3;
    for (const [name, declared] of Object.entries(PACKAGE_A_SIGNATURE_DEPENDENCIES)) {
      if (declared === "(no args)") {
        const params = extractParams(sqlAll, name);
        expect(params === null || params === "", name).toBe(true);
        continue;
      }
      const params = extractParams(sqlAll, name);
      expect(params, name).not.toBeNull();
      const names = paramNames(params!);
      const declaredNames = declared
        .split(",")
        .map((p) => p.trim().replace(/\?.*$/, "").replace(/\s*\(.*$/, "").trim())
        .filter((p) => p.startsWith("p_"));
      for (const arg of declaredNames) {
        expect(names, `${name} drift on ${arg}`).toContain(arg);
      }
    }
  });

  test("frozen inventory RPCs are present in rpc.ts call sites", () => {
    for (const name of [...FROZEN_WRITE_RPCS, ...FROZEN_READ_RPCS]) {
      if (name === "cleanup_graduation_project_test_artifacts") {
        // Package D TEST_ONLY — may be absent from A1/A2/A3; still must be callable from B.
        expect(rpcTs).toContain(`"${name}"`);
        continue;
      }
      expect(a2 + a3).toContain(`create function public.${name}`);
      expect(rpcTs).toContain(`"${name}"`);
    }
  });

  test("upload contract: sha256 required at finalize; nullable only while pending", () => {
    expect(a2).toContain("sha256 required at finalize");
    expect(a2).toContain("p_sha256 text default null");
    expect(serviceTs).toContain("sha256 required");
    expect(serviceTs).toContain("uploadPrivateFile");
    expect(serviceTs).toContain("createFileUploadIntent");
    expect(rpcTs).toContain("create_graduation_project_file_upload_intent");
    expect(rpcTs).toContain("mark_graduation_project_file_scan_state");
  });
});
