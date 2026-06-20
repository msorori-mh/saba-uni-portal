// Client-side import audit helpers (validation lifecycle only).
// All DB writes run via imports.functions.ts → engine.server.ts.
import { supabase } from "@/integrations/supabase/client";
import type { ImportReport, ImportType } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

async function safeAudit(action: string, entityId: string | null, payload: Record<string, unknown>) {
  try {
    await sb.rpc("log_audit", {
      _entity_type: "import",
      _entity_id: entityId,
      _action_type: action,
      _old: null,
      _new: payload,
      _notes: null,
    });
  } catch {
    // best-effort
  }
}

export async function auditImportStarted(type: ImportType, fileName: string, rowsTotal: number, dryRun: boolean) {
  await safeAudit("import_started", null, { import_type: type, file_name: fileName, rows_total: rowsTotal, dry_run: dryRun });
}

export async function auditImportValidated(type: ImportType, fileName: string, totals: { total: number; valid: number; invalid: number }) {
  await safeAudit("import_validated", null, {
    import_type: type, file_name: fileName,
    rows_total: totals.total, rows_success: totals.valid, rows_failed: totals.invalid,
  });
}

export async function auditImportFailed(type: ImportType, fileName: string, error: string) {
  await safeAudit("import_failed", null, { import_type: type, file_name: fileName, error });
}

export function emptyReport(): ImportReport {
  return { rows_total: 0, rows_success: 0, rows_failed: 0, rows_created: 0, rows_updated: 0, errors: [] };
}
