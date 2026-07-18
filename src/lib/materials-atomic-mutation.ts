import type { StudySystemTag } from "@/lib/course-materials.shared";

export type AtomicMaterialAction = "create" | "update" | "publish" | "archive";

export type AtomicMaterialMutationInput = {
  action: AtomicMaterialAction;
  materialId?: string | null;
  sectionId?: string | null;
  expectedUpdatedAt?: string | null;
  idempotencyKey: string;
  patch?: {
    title?: string;
    description?: string | null;
    lecture_number?: number | null;
    study_system?: StudySystemTag;
  };
};

export type AtomicMaterialMutationResult = {
  material_id: string;
  course_section_id: string;
  study_system: StudySystemTag;
  title: string;
  status: "draft" | "published" | "archived";
  updated_at: string;
  changed: boolean;
};

type RpcClient = {
  rpc: (
    name: "faculty_mutate_course_material_atomic",
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

/**
 * Calls the forward, authenticated RPC. Authorization and the write happen in
 * one database transaction; this adapter must never receive a service-role client.
 */
export async function mutateCourseMaterialAtomically(
  sessionClient: RpcClient,
  input: AtomicMaterialMutationInput,
): Promise<AtomicMaterialMutationResult> {
  const { data, error } = await sessionClient.rpc("faculty_mutate_course_material_atomic", {
    p_action: input.action,
    p_material_id: input.materialId ?? null,
    p_section_id: input.sectionId ?? null,
    p_expected_updated_at: input.expectedUpdatedAt ?? null,
    p_idempotency_key: input.idempotencyKey,
    p_patch: input.patch ?? {},
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") throw new Error("Atomic material mutation returned no row");
  return row as AtomicMaterialMutationResult;
}
