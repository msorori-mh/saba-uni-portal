import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  GraduationProjectDetail,
  GraduationProjectSummary,
  PrivateFile,
  UiAction,
} from "@/components/graduation-projects/mvp-ui";

type RpcError = { message: string; code?: string };
type RpcPort = {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<{ data: unknown; error: RpcError | null }>;
};
const rpcPort = supabase as unknown as RpcPort;
export const GP_UNAVAILABLE = "خدمة مشاريع التخرج قيد التجهيز حالياً. حاول مرة أخرى لاحقاً.";

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await rpcPort.rpc(name, args);
  if (error) {
    if (error.code === "42883" || /does not exist|schema cache|could not find/i.test(error.message))
      throw new Error(GP_UNAVAILABLE);
    throw new Error(error.message || "تعذر تنفيذ العملية.");
  }
  return data as T;
}

export function useGraduationProjectList(scope: "assigned" | "administration") {
  return useQuery({
    queryKey: ["graduation-projects", scope],
    queryFn: () =>
      rpc<GraduationProjectSummary[]>(
        scope === "administration"
          ? "list_graduation_projects_administration_overview"
          : "list_my_graduation_projects_mvp",
      ),
    retry: false,
  });
}

export function useGraduationProject(projectId: string) {
  return useQuery({
    queryKey: ["graduation-projects", "detail", projectId],
    queryFn: () =>
      rpc<GraduationProjectDetail>("get_my_graduation_project_workspace", {
        p_project_id: projectId,
      }),
    retry: false,
  });
}

const ACTION_RPC: Partial<Record<UiAction["type"], string>> = {
  member_add: "add_graduation_project_team_member",
  member_remove: "remove_graduation_project_team_member",
  proposal_save: "upsert_graduation_project_proposal",
  proposal_submit: "submit_graduation_project_proposal",
  proposal_decide: "review_graduation_project_proposal_mvp",
  supervisor_assign: "assign_graduation_project_supervisor",
  supervisor_respond: "respond_graduation_project_supervision",
  progress_submit: "submit_graduation_project_progress",
  progress_review: "review_graduation_project_progress",
  final_review: "review_graduation_project_final",
  defense_schedule: "schedule_graduation_project_defense",
  committee_assign: "assign_graduation_project_committee",
  defense_held: "mark_graduation_project_defense_held",
  evaluation_submit: "submit_own_graduation_project_evaluation",
  result_record: "record_graduation_project_final_decision",
  archive: "archive_graduation_project",
};

function actionArgs(
  projectId: string,
  action: Exclude<UiAction, { type: "upload" | "download" }>,
): Record<string, unknown> {
  const { type: _type, ...payload } = action;
  return { p_project_id: projectId, p_payload: payload };
}

async function uploadPrivate(projectId: string, category: PrivateFile["category"], file: File) {
  const prepared = await rpc<{ upload_url: string; upload_token: string }>(
    "prepare_graduation_project_private_upload",
    {
      p_project_id: projectId,
      p_category: category,
      p_original_name: file.name,
      p_media_type: file.type || "application/octet-stream",
      p_byte_size: file.size,
    },
  );
  const response = await fetch(prepared.upload_url, {
    method: "PUT",
    headers: { "content-type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!response.ok) throw new Error("تعذر رفع الملف الخاص.");
  await rpc("finalize_graduation_project_private_upload", {
    p_project_id: projectId,
    p_upload_token: prepared.upload_token,
  });
}

async function runAction(projectId: string, action: UiAction) {
  if (action.type === "upload") return uploadPrivate(projectId, action.category, action.file);
  if (action.type === "download") {
    const result = await rpc<{ signed_url: string }>(
      "create_graduation_project_authorized_download",
      { p_project_id: projectId, p_file_id: action.fileId },
    );
    window.location.assign(result.signed_url);
    return;
  }
  const name = ACTION_RPC[action.type];
  if (!name) throw new Error("هذا الإجراء غير متاح حالياً.");
  await rpc(name, actionArgs(projectId, action));
}

export function useGraduationProjectAction(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (action: UiAction) => runAction(projectId, action),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["graduation-projects"] });
    },
  });
}
