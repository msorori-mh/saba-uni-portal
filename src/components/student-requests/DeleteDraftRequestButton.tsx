import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type RpcResult = { data: unknown; error: { message?: string; code?: string } | null };
type RpcFn = (fn: string, args?: Record<string, unknown>) => Promise<RpcResult>;

/** Arabic message for a failed delete_my_student_request_draft call. */
export function draftDeleteErrorMessage(error: { message?: string; code?: string }): string {
  const message = error.message ?? "";
  if (message.includes("SR_DRAFT_DELETE_NOT_A_DRAFT")) {
    return "هذا الطلب لم يعد مسودة، ولا يمكن حذفه.";
  }
  if (message.includes("SR_DRAFT_DELETE_HAS_HISTORY")) {
    return "لا يمكن حذف هذا الطلب لأن عليه إجراءات مسجلة.";
  }
  if (message.includes("SR_DRAFT_DELETE_NOT_FOUND")) {
    return "المسودة غير موجودة. حدّث الصفحة.";
  }
  if (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /could not find the function|does not exist/i.test(message)
  ) {
    return "حذف المسودات قيد التفعيل. حاول لاحقًا.";
  }
  return "تعذر حذف المسودة. حاول مرة أخرى.";
}

async function deleteDraft(requestId: string): Promise<void> {
  const { error } = await (supabase.rpc as unknown as RpcFn).call(
    supabase,
    "delete_my_student_request_draft",
    { p_request_id: requestId },
  );
  if (error) throw new Error(draftDeleteErrorMessage(error));
}

/**
 * Two-step delete for a student's own request draft. Only drafts are deletable;
 * ownership and status are enforced by the RPC, not by showing this button.
 */
export function DeleteDraftRequestButton({
  requestId,
  compact = false,
}: {
  requestId: string;
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation({
    mutationFn: () => deleteDraft(requestId),
    onSuccess: async () => {
      setConfirming(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["student-affairs"] }),
        queryClient.invalidateQueries({ queryKey: ["mobile-student"] }),
      ]);
    },
  });

  const base = compact
    ? "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold"
    : "inline-flex min-h-10 items-center justify-center gap-1 rounded-lg px-3 text-sm font-bold";

  if (!confirming) {
    return (
      <button
        type="button"
        data-testid="delete-draft-request"
        onClick={() => {
          remove.reset();
          setConfirming(true);
        }}
        className={`${base} border border-destructive/40 text-destructive hover:bg-destructive/10`}
      >
        <Trash2 className="h-3.5 w-3.5" />
        حذف المسودة
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2" role="group" aria-label="تأكيد حذف المسودة">
      <button
        type="button"
        data-testid="confirm-delete-draft-request"
        disabled={remove.isPending}
        onClick={() => remove.mutate()}
        className={`${base} bg-destructive text-destructive-foreground disabled:opacity-60`}
      >
        {remove.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        تأكيد الحذف نهائيًا
      </button>
      <button
        type="button"
        disabled={remove.isPending}
        onClick={() => setConfirming(false)}
        className={`${base} border border-border text-muted-foreground`}
      >
        تراجع
      </button>
      {remove.error ? (
        <span role="alert" className="w-full text-xs text-destructive">
          {remove.error.message}
        </span>
      ) : null}
    </span>
  );
}
