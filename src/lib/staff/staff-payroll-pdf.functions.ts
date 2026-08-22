/**
 * PORTAL_STAFF_SELF_SERVICE_LIVE_READ_SIDE_02D
 * Secure payroll-statement PDF server function.
 *
 * The caller only supplies a statement id; authorization is re-evaluated
 * server-side by the SECURITY DEFINER RPC (owner / finance / administrator).
 * No staff_profile_id can be chosen by the client, and no public URL is issued.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({ statementId: z.string().uuid() });

const contractSchema = z.object({
  statement_id: z.string().uuid(),
  access_mode: z.enum(["owner", "finance", "administrator"]),
  staff_name_ar: z.string().min(1),
  employee_number: z.string().nullable(),
  period_start: z.string().min(1),
  period_end: z.string().min(1),
  currency_code: z.string().min(1),
  basic_salary: z.coerce.number(),
  allowances_total: z.coerce.number(),
  deductions_total: z.coerce.number(),
  net_amount: z.coerce.number(),
  components: z.array(
    z.object({
      component_type: z.enum(["allowance", "deduction"]),
      label_ar: z.string().min(1),
      amount: z.coerce.number(),
    }),
  ),
});

export const generateStaffPayrollStatementPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: raw, error } = await supabase.rpc(
      "staff_service_authorize_payroll_statement_download" as never,
      { p_statement_id: data.statementId } as never,
    );
    if (error) {
      throw new Error("STAFF_SERVICE_PAYROLL_ACCESS_DENIED");
    }

    const contract = contractSchema.parse(raw);
    const { buildStaffPayrollPdfBytes } = await import(
      "@/lib/staff/staff-payroll-pdf.server"
    );

    const bytes = await buildStaffPayrollPdfBytes({
      statementId: contract.statement_id,
      staffNameAr: contract.staff_name_ar,
      employeeNumber: contract.employee_number,
      periodStart: contract.period_start,
      periodEnd: contract.period_end,
      currencyCode: contract.currency_code,
      basicSalary: contract.basic_salary,
      allowancesTotal: contract.allowances_total,
      deductionsTotal: contract.deductions_total,
      netAmount: contract.net_amount,
      components: contract.components,
      accessMode: contract.access_mode,
    });

    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);

    return {
      fileName: `payroll-${contract.period_start}-${contract.period_end}.pdf`,
      contentType: "application/pdf" as const,
      base64: btoa(binary),
    };
  });
