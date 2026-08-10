import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { userRoles } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasActiveProcessingAssignmentForUser } from "@/lib/student-requests/processing-assignment-identity.server";

export type RequestAuditLogEntry = {
  id: string;
  requestId: string;
  requestNumber: string | null;
  requestTypeCode: string | null;
  stepKey: string;
  stepNameAr: string | null;
  stepOrder: number | null;
  status: string;
  decision: string | null;
  enteredAt: string | null;
  completedAt: string | null;
  completedByName: string | null;
  comment: string | null;
};

export type FetchRequestAuditLogResult = {
  available: boolean;
  scope: "all" | "participated" | "none";
  entries: RequestAuditLogEntry[];
  messageAr: string | null;
};

const inputSchema = z
  .object({
    search: z.string().trim().max(120).optional(),
    limit: z.number().int().min(1).max(500).optional(),
  })
  .optional();

async function resolveNames(userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (userIds.length === 0) return out;

  const tables = ["staff_profiles", "faculty_profiles", "student_profiles"] as const;
  for (const table of tables) {
    const { data } = await supabaseAdmin
      .from(table)
      .select("user_id, full_name_ar")
      .in("user_id", userIds);
    for (const row of (data ?? []) as Array<{ user_id: string | null; full_name_ar: string | null }>) {
      if (row.user_id && row.full_name_ar && !out.has(row.user_id)) {
        out.set(row.user_id, row.full_name_ar);
      }
    }
  }
  return out;
}

export const fetchRequestAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }): Promise<FetchRequestAuditLogResult> => {
    const userId = context.userId as string;
    const roles = await userRoles(userId);
    const isFullRead = roles.includes("admin") || roles.includes("system_admin");
    const limit = data?.limit ?? 200;

    let requestIds: string[] | null = null;

    if (!isFullRead) {
      const isActor = await hasActiveProcessingAssignmentForUser(userId);
      if (!isActor) {
        return {
          available: false,
          scope: "none",
          entries: [],
          messageAr: "ليس لديك صلاحية للاطلاع على سجل التدقيق.",
        };
      }

      // Scope: only requests this user participated in (acted on or is assigned to).
      const [{ data: completedRows }, { data: assignedRows }] = await Promise.all([
        supabaseAdmin
          .from("student_request_workflow_steps")
          .select("student_request_id")
          .eq("completed_by", userId)
          .limit(2000),
        supabaseAdmin
          .from("student_request_workflow_steps")
          .select("student_request_id")
          .eq("assigned_user_id", userId)
          .limit(2000),
      ]);

      const ids = new Set<string>();
      for (const r of [...(completedRows ?? []), ...(assignedRows ?? [])] as Array<{
        student_request_id: string | null;
      }>) {
        if (r.student_request_id) ids.add(r.student_request_id);
      }
      requestIds = [...ids];
      if (requestIds.length === 0) {
        return { available: true, scope: "participated", entries: [], messageAr: null };
      }
    }

    let query = supabaseAdmin
      .from("student_request_workflow_steps")
      .select(
        "id, student_request_id, step_key, step_name_ar, step_order, status, decision, entered_at, completed_at, completed_by, comment",
      )
      .order("completed_at", { ascending: false, nullsFirst: false })
      .order("entered_at", { ascending: false, nullsFirst: false })
      .limit(limit);

    if (requestIds) query = query.in("student_request_id", requestIds);

    const { data: steps, error } = await query;
    if (error) {
      return {
        available: false,
        scope: isFullRead ? "all" : "participated",
        entries: [],
        messageAr: "تعذر تحميل سجل التدقيق. يرجى المحاولة لاحقاً.",
      };
    }

    const rows = (steps ?? []) as Array<Record<string, unknown>>;
    const reqIds = [...new Set(rows.map((r) => String(r.student_request_id ?? "")).filter(Boolean))];

    const requestMeta = new Map<string, { number: string | null; typeCode: string | null }>();
    if (reqIds.length > 0) {
      const { data: reqs } = await supabaseAdmin
        .from("student_requests")
        .select("id, request_number, request_type")
        .in("id", reqIds);
      for (const r of (reqs ?? []) as Array<{
        id: string;
        request_number: string | null;
        request_type: string | null;
      }>) {
        requestMeta.set(r.id, { number: r.request_number, typeCode: r.request_type });
      }
    }

    const names = await resolveNames(
      [...new Set(rows.map((r) => (r.completed_by ? String(r.completed_by) : "")).filter(Boolean))],
    );

    const search = data?.search?.toLowerCase() ?? "";

    const entries: RequestAuditLogEntry[] = rows.map((r) => {
      const requestId = String(r.student_request_id ?? "");
      const meta = requestMeta.get(requestId);
      const completedBy = r.completed_by ? String(r.completed_by) : null;
      return {
        id: String(r.id),
        requestId,
        requestNumber: meta?.number ?? null,
        requestTypeCode: meta?.typeCode ?? null,
        stepKey: String(r.step_key ?? ""),
        stepNameAr: (r.step_name_ar as string | null) ?? null,
        stepOrder: (r.step_order as number | null) ?? null,
        status: String(r.status ?? ""),
        decision: (r.decision as string | null) ?? null,
        enteredAt: (r.entered_at as string | null) ?? null,
        completedAt: (r.completed_at as string | null) ?? null,
        completedByName: completedBy ? (names.get(completedBy) ?? null) : null,
        comment: (r.comment as string | null) ?? null,
      };
    });

    const filtered = search
      ? entries.filter((e) =>
          [e.requestNumber, e.stepNameAr, e.stepKey, e.completedByName, e.status]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(search)),
        )
      : entries;

    return {
      available: true,
      scope: isFullRead ? "all" : "participated",
      entries: filtered,
      messageAr: null,
    };
  });
