import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole, OPERATIONS_ROLES } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BUCKETS = [
  "department-images", "events-images", "faculty-images", "news-images",
  "research-pdfs", "payment-receipts", "student-request-attachments",
] as const;

async function assertOperationsAccess(userId: string) {
  await assertAnyRole(
    userId,
    OPERATIONS_ROLES,
    "ليس لديك صلاحية عرض مركز العمليات",
  );
}

async function safeCount(
  table: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filter?: (q: any) => any,
): Promise<number> {
  try {
    const adminDb = supabaseAdmin as unknown as { from: (table: string) => any };
    let q = adminDb.from(table).select("id", { count: "exact", head: true });
    if (filter) q = filter(q);
    const { count, error } = await q;
    if (error) return -1;
    return count ?? 0;
  } catch {
    return -1;
  }
}

async function lastEvent(
  table: string,
  dateCol = "created_at",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filter?: (q: any) => any,
): Promise<string | null> {
  try {
    const adminDb = supabaseAdmin as unknown as { from: (table: string) => any };
    let q = adminDb.from(table).select(dateCol).order(dateCol, { ascending: false }).limit(1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error || !data?.length) return null;
    return (data[0] as unknown as Record<string, string>)[dateCol] ?? null;
  } catch {
    return null;
  }
}

async function fetchOperationsOverview() {
  const adminRpc = supabaseAdmin as unknown as {
    rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown | null }>;
  };
  const [
    tables, functions, audits, audits24, notifs, notifsUnread,
    lastAudit, lastFinance, lastDoc,
    studentReqFailed, importsFailed, receiptsPending,
  ] = await Promise.all([
    adminRpc.rpc("get_table_count").then((r) => r.data ?? null).catch(() => null),
    adminRpc.rpc("get_function_count").then((r) => r.data ?? null).catch(() => null),
    safeCount("audit_logs"),
    safeCount("audit_logs", (q) => q.gte("created_at", new Date(Date.now() - 86400000).toISOString())),
    safeCount("notifications"),
    safeCount("notifications", (q) => q.eq("is_read", false)),
    lastEvent("audit_logs"),
    lastEvent("student_payments"),
    lastEvent("official_documents", "issued_at"),
    safeCount("student_requests", (q) => q.eq("status", "rejected")),
    safeCount("import_logs", (q) => q.eq("status", "failed")),
    safeCount("payment_receipts", (q) => q.eq("status", "submitted")),
  ]);

  const dbReachable = audits >= 0;

  const buckets: Array<{
    id: string; public: boolean; size_limit: number | null;
    mime_types: string[] | null; file_count: number; exists: boolean;
  }> = [];
  try {
    const { data: bk } = await supabaseAdmin.storage.listBuckets();
    const map = new Map((bk ?? []).map((b) => [b.id, b]));
    for (const id of BUCKETS) {
      const b = map.get(id);
      if (!b) {
        buckets.push({ id, public: false, size_limit: null, mime_types: null, file_count: -1, exists: false });
        continue;
      }
      let count = -1;
      try {
        const { data: files } = await supabaseAdmin.storage.from(id).list("", { limit: 100 });
        count = files?.length ?? 0;
      } catch { /* ignore */ }
      buckets.push({
        id, public: !!b.public, size_limit: b.file_size_limit ?? null,
        mime_types: b.allowed_mime_types ?? null, file_count: count, exists: true,
      });
    }
  } catch { /* ignore */ }

  const [adminCount, sysAdminCount, mustChange] = await Promise.all([
    safeCount("user_roles", (q) => q.eq("role", "admin")),
    safeCount("user_roles", (q) => q.eq("role", "system_admin")),
    safeCount("faculty_profiles", (q) => q.eq("must_change_password", true)),
  ]);

  type HardeningStatus = {
    password_hibp_enabled?: boolean;
    signup_disabled?: boolean;
    anonymous_disabled?: boolean;
  };
  let hardening: HardeningStatus | null = null;
  try {
    const { data } = await supabaseAdmin.rpc("get_hardening_status");
    hardening = (data ?? null) as HardeningStatus | null;
  } catch { /* ignore */ }

  const [docsAll, docsCancelled, feesAll, paymentsAll] = await Promise.all([
    safeCount("official_documents"),
    safeCount("official_documents", (q) => q.eq("status", "cancelled")),
    safeCount("student_fees"),
    safeCount("student_payments"),
  ]);

  const reportExports = await safeCount("audit_logs",
    (q) => q.eq("entity_type", "report").eq("action_type", "report_exported"));

  return {
    db: {
      reachable: dbReachable, tables, functions,
      audits, audits24, notifs, notifsUnread,
      lastAudit, lastFinance, lastDoc,
    },
    storage: buckets,
    auth: {
      adminCount, sysAdminCount, mustChange,
      hibp: hardening?.password_hibp_enabled ?? null,
      signupDisabled: hardening?.signup_disabled ?? null,
      anonDisabled: hardening?.anonymous_disabled ?? null,
    },
    docs: { all: docsAll, cancelled: docsCancelled },
    finance: { fees: feesAll, payments: paymentsAll, receiptsPending },
    reports: { exports: reportExports },
    issues: { studentReqFailed, importsFailed, receiptsPending },
  };
}

export type OperationsOverview = Awaited<ReturnType<typeof fetchOperationsOverview>>;

export const getOperationsOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOperationsAccess(context.userId);
    return fetchOperationsOverview();
  });
