/**
 * DATA_MINING_DETAIL_PARITY
 *
 * Read-only parity check between the department/college monitoring aggregate
 * (cdp_delivery_monitoring, term scope) and the per-course detail page source
 * (cdp_get_section_plan). Both sides are read through the same authorized
 * RPCs — this function only compares what they return and reports the rows
 * that differ. No writes, no reconciliation.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { DeliveryMonitoring, SectionDeliveryPlan } from "@/lib/lecture-execution.functions";

export const PARITY_METRICS = [
  "planned_count",
  "executed_count",
  "compensated_count",
  "postponed_count",
  "cancelled_count",
  "hindered_count",
] as const;

export type ParityMetric = (typeof PARITY_METRICS)[number];

export const PARITY_METRIC_LABELS: Record<ParityMetric, string> = {
  planned_count: "عدد المحاضرات المخططة",
  executed_count: "المنفذة",
  compensated_count: "المعوّضة",
  postponed_count: "المؤجلة",
  cancelled_count: "الملغاة",
  hindered_count: "المتعذرة",
};

export type ParityDiff = {
  metric: ParityMetric;
  monitoring_value: number;
  detail_value: number;
};

export type ParitySectionResult = {
  course_section_id: string;
  course_code: string;
  course_name_ar: string;
  section_code: string;
  faculty_name: string;
  department_name_ar: string | null;
  plan_status: string;
  status: "match" | "mismatch" | "unreadable";
  error: string | null;
  diffs: ParityDiff[];
};

export type ParityReport = {
  checked_at: string;
  scope: "college" | "department";
  period: "term";
  totals: { sections: number; matched: number; mismatched: number; unreadable: number };
  sections: ParitySectionResult[];
};

export const getDataMiningDetailParity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ParityReport> => {
    const { data: monitoring, error } = await context.supabase.rpc("cdp_delivery_monitoring", {
      p_period: "term",
    });
    if (error) throw new Error(error.message);
    const m = monitoring as unknown as DeliveryMonitoring;

    const sections: ParitySectionResult[] = [];

    for (const row of m.rows) {
      const base = {
        course_section_id: row.course_section_id,
        course_code: row.course_code,
        course_name_ar: row.course_name_ar,
        section_code: row.section_code,
        faculty_name: row.faculty_name,
        department_name_ar: row.department_name_ar,
        plan_status: row.plan_status,
      };

      const { data: planData, error: planError } = await context.supabase.rpc(
        "cdp_get_section_plan",
        { p_course_section_id: row.course_section_id },
      );

      if (planError) {
        sections.push({
          ...base,
          status: "unreadable",
          error: planError.message,
          diffs: [],
        });
        continue;
      }

      const plan = planData as unknown as SectionDeliveryPlan;
      const detail = {
        planned_count: plan.sessions.length,
        executed_count: plan.sessions.filter((s) => s.status === "executed").length,
        compensated_count: plan.sessions.filter((s) => s.status === "compensated").length,
        postponed_count: plan.sessions.filter((s) => s.status === "postponed").length,
        cancelled_count: plan.sessions.filter((s) => s.status === "cancelled").length,
        hindered_count: plan.sessions.filter((s) => s.status === "hindered").length,
      } satisfies Record<ParityMetric, number>;

      const diffs: ParityDiff[] = [];
      for (const metric of PARITY_METRICS) {
        const monitoringValue = Number(row[metric] ?? 0);
        const detailValue = detail[metric];
        if (monitoringValue !== detailValue) {
          diffs.push({ metric, monitoring_value: monitoringValue, detail_value: detailValue });
        }
      }

      sections.push({
        ...base,
        status: diffs.length === 0 ? "match" : "mismatch",
        error: null,
        diffs,
      });
    }

    return {
      checked_at: new Date().toISOString(),
      scope: m.scope,
      period: "term",
      totals: {
        sections: sections.length,
        matched: sections.filter((s) => s.status === "match").length,
        mismatched: sections.filter((s) => s.status === "mismatch").length,
        unreadable: sections.filter((s) => s.status === "unreadable").length,
      },
      sections,
    };
  });
