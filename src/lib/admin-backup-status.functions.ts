import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole } from "@/lib/authz.server";

const BACKUP_ROLES = ["system_admin", "admin"] as const;

export const BACKUP_CHECK_KINDS = [
  "backup_snapshot",
  "pitr",
  "restore_drill",
  "storage_coverage",
] as const;
export type BackupCheckKind = (typeof BACKUP_CHECK_KINDS)[number];

export const BACKUP_RESULTS = ["pass", "pass_with_notes", "fail"] as const;
export type BackupResult = (typeof BACKUP_RESULTS)[number];

export type BackupBucketStat = {
  bucketId: string;
  objectCount: number;
  totalBytes: number;
  lastObjectAt: string | null;
};

export type BackupOverview = {
  databaseBytes: number;
  publicTableCount: number;
  buckets: BackupBucketStat[];
  storageObjectCount: number;
  storageTotalBytes: number;
  latestMigrationVersion: string | null;
  lastAuditEventAt: string | null;
  auditEventCount: number;
  generatedAt: string;
  lastVerification: BackupVerificationRow | null;
  daysSinceLastVerification: number | null;
};

export type BackupVerificationRow = {
  id: string;
  verifiedAt: string;
  checkKind: BackupCheckKind;
  result: BackupResult;
  observedRtoMinutes: number | null;
  observedRpoMinutes: number | null;
  checklistItems: string[];
  notes: string | null;
  performedBy: string | null;
  performedByName: string | null;
};

type RawVerification = {
  id: string;
  verified_at: string;
  check_kind: string;
  result: string;
  observed_rto_minutes: number | null;
  observed_rpo_minutes: number | null;
  checklist_items: string[] | null;
  notes: string | null;
  performed_by: string | null;
};

function mapVerification(
  row: RawVerification,
  names: Map<string, string>,
): BackupVerificationRow {
  return {
    id: row.id,
    verifiedAt: row.verified_at,
    checkKind: row.check_kind as BackupCheckKind,
    result: row.result as BackupResult,
    observedRtoMinutes: row.observed_rto_minutes,
    observedRpoMinutes: row.observed_rpo_minutes,
    checklistItems: row.checklist_items ?? [],
    notes: row.notes,
    performedBy: row.performed_by,
    performedByName: row.performed_by ? (names.get(row.performed_by) ?? null) : null,
  };
}

async function resolveActorNames(userIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (unique.length === 0) return map;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, full_name")
    .in("user_id", unique);
  for (const row of data ?? []) {
    if (row.user_id && row.full_name) map.set(row.user_id, row.full_name);
  }
  return map;
}

export const getBackupStatusOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BackupOverview> => {
    await assertAnyRole(
      context.userId,
      BACKUP_ROLES,
      "ليس لديك صلاحية عرض حالة النسخ الاحتياطي",
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // The RPC authorizes via auth.uid(), so it must be called with the signed-in
    // user's client — the service-role client has no auth.uid() and always fails.
    const { data: stats, error: statsError } = await context.supabase.rpc(
      "get_backup_infrastructure_stats",
    );
    if (statsError) throw new Error(statsError.message);
    const s = (stats ?? {}) as Record<string, any>;

    const buckets: BackupBucketStat[] = Array.isArray(s["buckets"])
      ? s["buckets"].map((b: any) => ({
          bucketId: String(b.bucket_id),
          objectCount: Number(b.object_count ?? 0),
          totalBytes: Number(b.total_bytes ?? 0),
          lastObjectAt: b.last_object_at ?? null,
        }))
      : [];

    const { data: lastRows } = await supabaseAdmin
      .from("backup_verifications")
      .select(
        "id, verified_at, check_kind, result, observed_rto_minutes, observed_rpo_minutes, checklist_items, notes, performed_by",
      )
      .order("verified_at", { ascending: false })
      .limit(1);

    const raw = (lastRows ?? [])[0] as RawVerification | undefined;
    const names = await resolveActorNames(raw?.performed_by ? [raw.performed_by] : []);
    const lastVerification = raw ? mapVerification(raw, names) : null;

    const daysSince = lastVerification
      ? Math.floor(
          (Date.now() - new Date(lastVerification.verifiedAt).getTime()) / 86_400_000,
        )
      : null;

    return {
      databaseBytes: Number(s["database_bytes"] ?? 0),
      publicTableCount: Number(s["public_table_count"] ?? 0),
      buckets,
      storageObjectCount: buckets.reduce((a, b) => a + b.objectCount, 0),
      storageTotalBytes: buckets.reduce((a, b) => a + b.totalBytes, 0),
      latestMigrationVersion: s["latest_migration_version"] ?? null,
      lastAuditEventAt: s["last_audit_event_at"] ?? null,
      auditEventCount: Number(s["audit_event_count"] ?? 0),
      generatedAt: s["generated_at"] ?? new Date().toISOString(),
      lastVerification,
      daysSinceLastVerification: daysSince,
    };
  });

export const listBackupVerifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number } | undefined) => ({
    limit: Math.min(Math.max(input?.limit ?? 50, 1), 200),
  }))
  .handler(async ({ context, data }): Promise<BackupVerificationRow[]> => {
    await assertAnyRole(
      context.userId,
      BACKUP_ROLES,
      "ليس لديك صلاحية عرض سجل التحقق من النسخ الاحتياطي",
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("backup_verifications")
      .select(
        "id, verified_at, check_kind, result, observed_rto_minutes, observed_rpo_minutes, checklist_items, notes, performed_by",
      )
      .order("verified_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as RawVerification[];
    const names = await resolveActorNames(list.map((r) => r.performed_by ?? ""));
    return list.map((r) => mapVerification(r, names));
  });

export const recordBackupVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      verifiedAt?: string;
      checkKind: string;
      result: string;
      observedRtoMinutes?: number | null;
      observedRpoMinutes?: number | null;
      checklistItems?: string[];
      notes?: string | null;
    }) => {
      if (!BACKUP_CHECK_KINDS.includes(input.checkKind as BackupCheckKind)) {
        throw new Error("نوع الفحص غير صالح");
      }
      if (!BACKUP_RESULTS.includes(input.result as BackupResult)) {
        throw new Error("نتيجة الفحص غير صالحة");
      }
      const clamp = (v: number | null | undefined) =>
        v === null || v === undefined || Number.isNaN(v)
          ? null
          : Math.min(Math.max(Math.round(v), 0), 100_000);
      return {
        verifiedAt: input.verifiedAt || new Date().toISOString(),
        checkKind: input.checkKind as BackupCheckKind,
        result: input.result as BackupResult,
        observedRtoMinutes: clamp(input.observedRtoMinutes),
        observedRpoMinutes: clamp(input.observedRpoMinutes),
        checklistItems: (input.checklistItems ?? []).slice(0, 20).map((s) => String(s)),
        notes: (input.notes ?? "").trim().slice(0, 2000) || null,
      };
    },
  )
  .handler(async ({ context, data }): Promise<{ id: string }> => {
    await assertAnyRole(
      context.userId,
      BACKUP_ROLES,
      "ليس لديك صلاحية تسجيل عمليات التحقق من النسخ الاحتياطي",
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { primaryActorRole } = await import("@/lib/authz.server");

    const { data: inserted, error } = await supabaseAdmin
      .from("backup_verifications")
      .insert({
        verified_at: data.verifiedAt,
        check_kind: data.checkKind,
        result: data.result,
        observed_rto_minutes: data.observedRtoMinutes,
        observed_rpo_minutes: data.observedRpoMinutes,
        checklist_items: data.checklistItems,
        notes: data.notes,
        performed_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const role = await primaryActorRole(context.userId);
    await supabaseAdmin.from("audit_logs").insert({
      actor_user_id: context.userId,
      actor_role: role,
      entity_type: "backup_verification",
      entity_id: inserted.id,
      action_type: "backup_verification_recorded",
      notes: `تسجيل تحقق: ${data.checkKind} — ${data.result}`,
      new_values: {
        check_kind: data.checkKind,
        result: data.result,
        observed_rto_minutes: data.observedRtoMinutes,
        observed_rpo_minutes: data.observedRpoMinutes,
        checklist_items: data.checklistItems,
      },
    });

    return { id: inserted.id };
  });
