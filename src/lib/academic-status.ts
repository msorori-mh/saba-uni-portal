import { supabase } from "@/integrations/supabase/client";

export type AcademicAuditAction =
  | "student_progress_viewed"
  | "graduation_audit_viewed"
  | "graduation_eligibility_viewed"
  | "at_risk_report_viewed"
  | "graduation_candidates_viewed";

export async function logAcademicAudit(action: AcademicAuditAction, notes: string, entityId?: string) {
  try {
    await supabase.rpc("log_audit" as any, {
      _entity_type: "academic_status",
      _entity_id: entityId ?? "00000000-0000-0000-0000-000000000000",
      _action_type: action,
      _old: null,
      _new: { notes },
      _notes: notes,
    });
  } catch { /* ignore */ }
}

import { loadXLSX } from "@/lib/xlsx-loader";

export type ExportRow = Record<string, string | number>;

export async function exportProgressXlsx({
  filename, sheetName, header, rows,
}: {
  filename: string;
  sheetName: string;
  header: Array<[string, string]>;
  rows: ExportRow[];
}) {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();
  const headerAoA = header.map(([k, v]) => [k, v]);
  const empty = [[""]];
  const data = rows.length
    ? [Object.keys(rows[0]), ...rows.map((r) => Object.values(r))]
    : [["لا توجد بيانات"]];
  const aoa = [...headerAoA, ...empty, ...data];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = (data[0] as any[]).map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

export function standingLabel(s: string): string {
  switch (s) {
    case "good_standing": return "وضع جيد";
    case "warning": return "إنذار أكاديمي";
    case "probation": return "تحت المراقبة";
    case "suspended": return "موقوف";
    case "graduated": return "متخرج";
    default: return s;
  }
}

export function standingTone(s: string): "ok" | "warn" | "bad" | "info" {
  switch (s) {
    case "good_standing": return "ok";
    case "warning": return "warn";
    case "probation":
    case "suspended": return "bad";
    case "graduated": return "info";
    default: return "info";
  }
}
