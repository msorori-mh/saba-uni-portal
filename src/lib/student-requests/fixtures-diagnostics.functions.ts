import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { userRoles } from "@/lib/authz.server";
import {
  B1_DETAILS_TABLES,
  getB1DetailsTableSpec,
} from "@/lib/student-requests/b1-details-preflight";

/** Fixture requests provisioned for B1 authorization testing. */
export const FIXTURE_REQUEST_NUMBER_PREFIX = "SR-20260801-13";

export type FixtureDiagnosticRow = {
  requestId: string;
  requestNumber: string;
  requestType: string;
  serviceLabelAr: string | null;
  status: string;
  activeStepKey: string | null;
  activeStepNameAr: string | null;
  activeStepOrder: number | null;
  detailsTable: string | null;
  detailsPresent: boolean;
  ready: boolean;
  issueAr: string | null;
};

export type FixturesDiagnosticsResult = {
  available: boolean;
  messageAr: string | null;
  rows: FixtureDiagnosticRow[];
  summary: { total: number; ready: number; missingDetails: number; unmapped: number };
};

export const fetchFixturesDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FixturesDiagnosticsResult> => {
    const empty = { total: 0, ready: 0, missingDetails: 0, unmapped: 0 };
    const roles = await userRoles(context.userId as string);
    if (!roles.includes("admin") && !roles.includes("system_admin")) {
      return {
        available: false,
        messageAr: "شاشة التشخيص متاحة لمسؤولي النظام فقط.",
        rows: [],
        summary: empty,
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: requests, error } = await supabaseAdmin
      .from("student_requests")
      .select("id, request_number, request_type, status")
      .like("request_number", `${FIXTURE_REQUEST_NUMBER_PREFIX}%`)
      .order("request_number", { ascending: true });

    if (error) {
      return {
        available: false,
        messageAr: `تعذّر قراءة بيانات الـfixtures: ${error.message}`,
        rows: [],
        summary: empty,
      };
    }

    const list = (requests ?? []) as Array<{
      id: string;
      request_number: string;
      request_type: string;
      status: string;
    }>;
    const ids = list.map((r) => r.id);
    if (ids.length === 0) {
      return { available: true, messageAr: null, rows: [], summary: empty };
    }

    // Existing detail rows per table.
    const present = new Set<string>();
    for (const spec of Object.values(B1_DETAILS_TABLES)) {
      const { data: rows } = await supabaseAdmin
        .from(spec.table as never)
        .select("request_id")
        .in("request_id", ids);
      for (const row of (rows ?? []) as Array<{ request_id: string | null }>) {
        if (row.request_id) present.add(`${spec.table}:${row.request_id}`);
      }
    }

    // Active workflow step per request.
    const { data: steps } = await supabaseAdmin
      .from("student_request_workflow_steps")
      .select("student_request_id, step_key, step_name_ar, step_order, status")
      .in("student_request_id", ids)
      .eq("status", "active");
    const activeByRequest = new Map<
      string,
      { step_key: string; step_name_ar: string | null; step_order: number | null }
    >();
    for (const s of (steps ?? []) as Array<{
      student_request_id: string;
      step_key: string;
      step_name_ar: string | null;
      step_order: number | null;
    }>) {
      if (!activeByRequest.has(s.student_request_id)) {
        activeByRequest.set(s.student_request_id, s);
      }
    }

    const rows: FixtureDiagnosticRow[] = list.map((r) => {
      const spec = getB1DetailsTableSpec(r.request_type);
      const active = activeByRequest.get(r.id) ?? null;
      const detailsPresent = spec ? present.has(`${spec.table}:${r.id}`) : false;
      let issueAr: string | null = null;
      if (!spec) {
        issueAr = `نوع الخدمة «${r.request_type}» غير مشمول بمصفوفة جداول التفاصيل الخمسة.`;
      } else if (!detailsPresent) {
        issueAr = `صف التفاصيل مفقود في جدول ${spec.table} — أي إجراء تقدّمي سيفشل بـ B1_DETAILS_ROW_MISSING.`;
      } else if (!active && r.status !== "completed") {
        issueAr = "لا توجد خطوة نشطة لهذا الطلب رغم أنه غير مكتمل.";
      }
      return {
        requestId: r.id,
        requestNumber: r.request_number,
        requestType: r.request_type,
        serviceLabelAr: spec?.serviceLabelAr ?? null,
        status: r.status,
        activeStepKey: active?.step_key ?? null,
        activeStepNameAr: active?.step_name_ar ?? null,
        activeStepOrder: active?.step_order ?? null,
        detailsTable: spec?.table ?? null,
        detailsPresent,
        ready: Boolean(spec) && detailsPresent,
        issueAr,
      };
    });

    return {
      available: true,
      messageAr: null,
      rows,
      summary: {
        total: rows.length,
        ready: rows.filter((r) => r.ready).length,
        missingDetails: rows.filter((r) => r.detailsTable && !r.detailsPresent).length,
        unmapped: rows.filter((r) => !r.detailsTable).length,
      },
    };
  });
