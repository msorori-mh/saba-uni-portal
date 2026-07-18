import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mutateCourseMaterialAtomically } from "../../src/lib/materials-atomic-mutation";

describe("materials atomic authorization mutation", () => {
  it("uses the authenticated RPC contract and preserves optimistic/idempotent guards", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const client = {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        return {
          data: [
            {
              material_id: "material-1",
              course_section_id: "section-1",
              study_system: "regular",
              title: "Lecture",
              status: "published",
              updated_at: "2026-07-18T00:00:00Z",
              changed: true,
            },
          ],
          error: null,
        };
      },
    };

    const result = await mutateCourseMaterialAtomically(client as never, {
      action: "publish",
      materialId: "material-1",
      expectedUpdatedAt: "2026-07-17T00:00:00Z",
      idempotencyKey: "mutation-1",
    });

    expect(result.changed).toBeTrue();
    expect(calls).toEqual([
      {
        name: "faculty_mutate_course_material_atomic",
        args: {
          p_action: "publish",
          p_material_id: "material-1",
          p_section_id: null,
          p_expected_updated_at: "2026-07-17T00:00:00Z",
          p_idempotency_key: "mutation-1",
          p_patch: {},
        },
      },
    ]);
  });

  it("fails closed on RPC errors or an empty result", async () => {
    await expect(
      mutateCourseMaterialAtomically(
        {
          rpc: async () => ({ data: null, error: { message: "AUTHORIZATION_DENIED" } }),
        } as never,
        {
          action: "archive",
          materialId: "material-1",
          expectedUpdatedAt: "v1",
          idempotencyKey: "mutation-2",
        },
      ),
    ).rejects.toThrow("AUTHORIZATION_DENIED");

    await expect(
      mutateCourseMaterialAtomically(
        {
          rpc: async () => ({ data: [], error: null }),
        } as never,
        {
          action: "archive",
          materialId: "material-1",
          expectedUpdatedAt: "v1",
          idempotencyKey: "mutation-3",
        },
      ),
    ).rejects.toThrow("returned no row");
  });

  it("draft binds exact owner and target under row locks with no generic admin bypass", () => {
    const root = join(import.meta.dir, "..", "..");
    const sql = readFileSync(
      join(
        root,
        "docs/migration-drafts/20260718000000_materials_atomic_authorization_mutation.sql",
      ),
      "utf8",
    );
    const source = readFileSync(join(root, "src/lib/faculty-materials.functions.ts"), "utf8");

    expect(sql).toContain("v_uid uuid := auth.uid()");
    expect(sql).toContain("fp.user_id = v_uid and fp.status = 'active'");
    expect(sql).toContain("m.faculty_profile_id = v_fp.id");
    expect(sql).toContain("cs.faculty_profile_id = v_fp.id");
    expect(sql).toContain("for update of m");
    expect(sql).toContain("STALE_MATERIAL_VERSION");
    expect(sql).toContain("IMMUTABLE_TARGET_VIOLATION");
    expect(sql).toContain("CURRENT_ACTIVE_SECTION_REQUIRED");
    expect(sql).toContain("se.course_section_id = v_material.course_section_id");
    expect(sql).toContain("se.enrollment_status = 'enrolled'");
    expect(sql).not.toContain("student_academic_status");
    expect(sql).toContain("revoke all on function");
    expect(sql).toContain("from public, anon, service_role");
    expect(sql).not.toContain("has_any_role");
    expect(source.match(/mutateCourseMaterialAtomically\(/g)).toHaveLength(4);
    expect(source).not.toContain('.from("course_materials").update');
    expect(source).not.toContain('.from("notifications").insert');
  });
});
