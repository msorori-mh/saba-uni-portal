// FACULTY_ACCOUNTS_EXISTING_EMAIL_UPDATE_IMPORTER_REMEDIATION_01
// Explicit "UPDATE_EXISTING_FACULTY_ACCOUNT_EMAILS" server functions.
// - Preview (dry-run): read-only classification of each row.
// - Execute: only touches Auth email + faculty.email + faculty_profiles.updated_at
//   for rows the preview classified as READY_*. Never resets password,
//   never mutates roles, assignments, must_change_password, or employee_number.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertAnyRole, primaryActorRole } from "@/lib/authz.server";
import { enforceRateLimit, SERVER_RATE_LIMIT_POLICIES } from "@/lib/rate-limit.server";
import {
  classifyEmailUpdate,
  isReadyOutcome,
  maskEmail,
  normalizeEmail,
  type EmailUpdateOutcome,
} from "@/lib/faculty-accounts-email-update.core";

const WRITE_ROLES = ["admin", "system_admin", "hr_officer"] as const;
async function assertWrite(userId: string): Promise<void> {
  await assertAnyRole(userId, WRITE_ROLES, "ليس لديك صلاحية");
}

const RowSchema = z.object({
  row_number: z.number().int().min(1).optional(),
  employee_number: z.string().trim().min(1).max(40),
  email: z.string().trim().min(1).max(160),
});
type RowInput = z.infer<typeof RowSchema>;

type PreviewRow = {
  row_number: number;
  employee_number: string;
  full_name_ar: string | null;
  current_faculty_email_masked: string;
  current_auth_email_masked: string;
  new_email: string;
  outcome: EmailUpdateOutcome;
  message?: string;
  needs_auth_update: boolean;
  needs_faculty_update: boolean;
  warnings: string[];
  profile_id: string | null;
  user_id: string | null;
};

async function findAuthByEmail(email: string) {
  for (let page = 1; page <= 40; page++) {
    const { data } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    const list = data?.users ?? [];
    const hit = list.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (list.length < 200) break;
  }
  return null;
}

async function classifyOneRow(raw: RowInput, rowNum: number): Promise<PreviewRow> {
  const employeeNumber = raw.employee_number.trim();
  const newEmail = normalizeEmail(raw.email);

  const { data: profiles } = await supabaseAdmin
    .from("faculty_profiles")
    .select("id, user_id, employee_number, full_name_ar")
    .eq("employee_number", employeeNumber);
  const profileList = (profiles ?? []) as Array<{
    id: string; user_id: string | null; employee_number: string; full_name_ar: string;
  }>;
  const primary = profileList[0] ?? null;

  let linkedAuth: { id: string; email: string | null } | null = null;
  if (primary?.user_id) {
    const { data: au } = await supabaseAdmin.auth.admin.getUserById(primary.user_id);
    if (au?.user) linkedAuth = { id: au.user.id, email: au.user.email ?? null };
  }

  let facultyTableEmail: string | null = null;
  if (primary) {
    // faculty_profiles.faculty_id → public.faculty.email
    const { data: prof } = await supabaseAdmin
      .from("faculty_profiles").select("faculty_id").eq("id", primary.id).maybeSingle();
    const facultyRef = (prof as any)?.faculty_id as string | null;
    if (facultyRef) {
      const { data: f } = await supabaseAdmin
        .from("faculty").select("email").eq("id", facultyRef).maybeSingle();
      facultyTableEmail = (f as any)?.email ?? null;
    }
  }

  const owner = await findAuthByEmail(newEmail);
  let ownerProfile: { id: string; employee_number: string } | null = null;
  if (owner && (!linkedAuth || owner.id !== linkedAuth.id)) {
    const { data: op } = await supabaseAdmin
      .from("faculty_profiles").select("id, employee_number").eq("user_id", owner.id).maybeSingle();
    ownerProfile = (op as any) ?? null;
  }

  const classified = classifyEmailUpdate({
    employeeNumberRaw: employeeNumber,
    newEmailRaw: newEmail,
    profiles: profileList,
    linkedAuth,
    emailOwnerAuth: owner ? { id: owner.id, email: owner.email ?? null } : null,
    emailOwnerProfile: ownerProfile,
    facultyTableEmail,
  });

  const warnings: string[] = [];
  if (classified.needsAuthUpdate) {
    warnings.push(
      "قد يُلزم مزود Auth بإعادة تأكيد البريد أو إنهاء الجلسات الحالية للحساب بعد التغيير.",
    );
  }

  return {
    row_number: rowNum,
    employee_number: employeeNumber,
    full_name_ar: primary?.full_name_ar ?? null,
    current_faculty_email_masked: maskEmail(facultyTableEmail),
    current_auth_email_masked: maskEmail(linkedAuth?.email ?? null),
    new_email: classified.newEmail,
    outcome: classified.outcome,
    message: classified.message,
    needs_auth_update: classified.needsAuthUpdate,
    needs_faculty_update: classified.needsFacultyUpdate,
    warnings,
    profile_id: primary?.id ?? null,
    user_id: primary?.user_id ?? null,
  };
}

function summarize(rows: PreviewRow[]) {
  const totals = {
    total: rows.length,
    ready_auth_and_faculty: 0,
    ready_faculty_backfill: 0,
    already_matched: 0,
    email_conflict: 0,
    faculty_not_found: 0,
    faculty_duplicate: 0,
    auth_user_not_found: 0,
    account_link_ambiguous: 0,
    invalid_email: 0,
    failed: 0,
  };
  for (const r of rows) {
    switch (r.outcome) {
      case "READY_AUTH_AND_FACULTY_EMAIL_UPDATE": totals.ready_auth_and_faculty++; break;
      case "READY_FACULTY_EMAIL_BACKFILL_ONLY": totals.ready_faculty_backfill++; break;
      case "ALREADY_MATCHED": totals.already_matched++; break;
      case "EMAIL_CONFLICT": totals.email_conflict++; break;
      case "FACULTY_NOT_FOUND": totals.faculty_not_found++; break;
      case "FACULTY_DUPLICATE": totals.faculty_duplicate++; break;
      case "AUTH_USER_NOT_FOUND": totals.auth_user_not_found++; break;
      case "ACCOUNT_LINK_AMBIGUOUS": totals.account_link_ambiguous++; break;
      case "INVALID_EMAIL": totals.invalid_email++; break;
      case "FAILED": totals.failed++; break;
    }
  }
  return totals;
}

async function logAudit(actor: string, action: string, entityId: string | null, notes: string, payload: any) {
  const role = await primaryActorRole(actor);
  await supabaseAdmin.from("audit_logs").insert({
    actor_user_id: actor,
    actor_role: role,
    entity_type: "faculty_account_email_update",
    entity_id: entityId,
    action_type: action,
    notes,
    new_values: payload,
  } as any);
}

async function logImport(params: {
  actor: string;
  fileName: string;
  rowsTotal: number;
  rowsSuccess: number;
  rowsFailed: number;
  status: string;
  notes: string;
}) {
  try {
    await supabaseAdmin.from("import_logs").insert({
      created_by: params.actor,
      import_type: "faculty_account_email_update",
      file_name: params.fileName,
      rows_total: params.rowsTotal,
      rows_success: params.rowsSuccess,
      rows_failed: params.rowsFailed,
      status: params.status,
      notes: params.notes,
    } as any);
  } catch {
    // best-effort; never break the response
  }
}

// ---------------- Preview (Dry Run) ----------------
export const previewFacultyAccountEmailUpdates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { rows: unknown[]; file_name?: string }) =>
    z.object({
      rows: z.array(z.any()).max(2000),
      file_name: z.string().max(200).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertWrite(context.userId);
    await enforceRateLimit(`admin:${context.userId}`, SERVER_RATE_LIMIT_POLICIES.accountImport);

    const rows: PreviewRow[] = [];
    for (let i = 0; i < data.rows.length; i++) {
      const raw = data.rows[i] as Record<string, unknown>;
      const rowNum = Number(raw?.row_number ?? i + 2);
      const parsed = RowSchema.safeParse({
        row_number: rowNum,
        employee_number: String(raw?.employee_number ?? "").trim(),
        email: String(raw?.email ?? "").trim(),
      });
      if (!parsed.success) {
        rows.push({
          row_number: rowNum,
          employee_number: String(raw?.employee_number ?? "").trim(),
          full_name_ar: null,
          current_faculty_email_masked: "—",
          current_auth_email_masked: "—",
          new_email: normalizeEmail(String(raw?.email ?? "")),
          outcome: "INVALID_EMAIL",
          message: parsed.error.issues[0]?.message ?? "بيانات غير صالحة",
          needs_auth_update: false,
          needs_faculty_update: false,
          warnings: [],
          profile_id: null,
          user_id: null,
        });
        continue;
      }
      try {
        rows.push(await classifyOneRow(parsed.data, rowNum));
      } catch (err: any) {
        rows.push({
          row_number: rowNum,
          employee_number: parsed.data.employee_number,
          full_name_ar: null,
          current_faculty_email_masked: "—",
          current_auth_email_masked: "—",
          new_email: normalizeEmail(parsed.data.email),
          outcome: "FAILED",
          message: err?.message ?? "خطأ غير متوقع",
          needs_auth_update: false,
          needs_faculty_update: false,
          warnings: [],
          profile_id: null,
          user_id: null,
        });
      }
    }

    const totals = summarize(rows);
    await logAudit(
      context.userId,
      "faculty_account_email_update_preview",
      null,
      `Dry Run لتحديث بريد الحسابات — إجمالي=${totals.total}`,
      { totals, file_name: data.file_name ?? null },
    );
    return { totals, rows };
  });

// ---------------- Execute ----------------
export const executeFacultyAccountEmailUpdates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { rows: unknown[]; file_name?: string; confirm: boolean }) =>
    z.object({
      rows: z.array(z.any()).max(2000),
      file_name: z.string().max(200).optional(),
      confirm: z.literal(true, {
        errorMap: () => ({ message: "التنفيذ يتطلب تأكيداً صريحاً" }),
      }),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertWrite(context.userId);
    await enforceRateLimit(`admin:${context.userId}`, SERVER_RATE_LIMIT_POLICIES.accountImport);

    // Re-classify server-side (never trust client outcome)
    const previewRows: PreviewRow[] = [];
    for (let i = 0; i < data.rows.length; i++) {
      const raw = data.rows[i] as Record<string, unknown>;
      const rowNum = Number(raw?.row_number ?? i + 2);
      const parsed = RowSchema.safeParse({
        row_number: rowNum,
        employee_number: String(raw?.employee_number ?? "").trim(),
        email: String(raw?.email ?? "").trim(),
      });
      if (!parsed.success) {
        previewRows.push({
          row_number: rowNum,
          employee_number: String(raw?.employee_number ?? "").trim(),
          full_name_ar: null,
          current_faculty_email_masked: "—",
          current_auth_email_masked: "—",
          new_email: normalizeEmail(String(raw?.email ?? "")),
          outcome: "INVALID_EMAIL",
          message: parsed.error.issues[0]?.message ?? "بيانات غير صالحة",
          needs_auth_update: false, needs_faculty_update: false,
          warnings: [], profile_id: null, user_id: null,
        });
        continue;
      }
      try {
        previewRows.push(await classifyOneRow(parsed.data, rowNum));
      } catch (err: any) {
        previewRows.push({
          row_number: rowNum,
          employee_number: parsed.data.employee_number,
          full_name_ar: null,
          current_faculty_email_masked: "—",
          current_auth_email_masked: "—",
          new_email: normalizeEmail(parsed.data.email),
          outcome: "FAILED",
          message: err?.message ?? "خطأ غير متوقع",
          needs_auth_update: false, needs_faculty_update: false,
          warnings: [], profile_id: null, user_id: null,
        });
      }
    }

    const results: Array<PreviewRow & { applied: boolean; error?: string }> = [];
    let updatedAuthAndFaculty = 0;
    let backfilledFacultyOnly = 0;
    let unchanged = 0;
    let conflicts = 0;
    let failed = 0;

    for (const r of previewRows) {
      if (!isReadyOutcome(r.outcome)) {
        if (r.outcome === "ALREADY_MATCHED") unchanged++;
        else if (r.outcome === "EMAIL_CONFLICT") conflicts++;
        else failed++;
        results.push({ ...r, applied: false });
        continue;
      }
      // Guardrail: only proceed if we still have both ids.
      if (!r.profile_id || !r.user_id) {
        failed++;
        results.push({ ...r, applied: false, error: "معرفات الحساب غير متاحة" });
        continue;
      }

      try {
        // 1) Auth email — only for READY_AUTH_AND_FACULTY_EMAIL_UPDATE.
        if (r.needs_auth_update) {
          const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(r.user_id, {
            email: r.new_email,
            email_confirm: true,
          });
          if (authErr) throw new Error(`Auth: ${authErr.message}`);
        }

        // 2) faculty.email backfill (via faculty_profiles.faculty_id).
        if (r.needs_faculty_update) {
          const { data: prof } = await supabaseAdmin
            .from("faculty_profiles").select("faculty_id").eq("id", r.profile_id).maybeSingle();
          const facultyRef = (prof as any)?.faculty_id as string | null;
          if (facultyRef) {
            const { error: fErr } = await supabaseAdmin
              .from("faculty").update({ email: r.new_email } as any).eq("id", facultyRef);
            if (fErr) throw new Error(`faculty.email: ${fErr.message}`);
          }
        }

        if (r.outcome === "READY_AUTH_AND_FACULTY_EMAIL_UPDATE") updatedAuthAndFaculty++;
        else backfilledFacultyOnly++;
        results.push({ ...r, applied: true });

        await logAudit(
          context.userId,
          r.outcome === "READY_AUTH_AND_FACULTY_EMAIL_UPDATE"
            ? "faculty_account_email_updated"
            : "faculty_email_backfilled",
          r.user_id,
          `تحديث بريد ${r.employee_number}`,
          {
            employee_number: r.employee_number,
            new_email: r.new_email,
            needs_auth_update: r.needs_auth_update,
            needs_faculty_update: r.needs_faculty_update,
            row_number: r.row_number,
          },
        );
      } catch (err: any) {
        failed++;
        results.push({ ...r, applied: false, error: err?.message ?? "فشل التحديث" });
      }
    }

    const totals = {
      total: previewRows.length,
      updated_auth_and_faculty: updatedAuthAndFaculty,
      backfilled_faculty_only: backfilledFacultyOnly,
      unchanged,
      conflicts,
      failed,
    };

    const status =
      totals.updated_auth_and_faculty + totals.backfilled_faculty_only === 0 && totals.failed === 0
        ? "no_changes"
        : totals.failed === 0
          ? "success"
          : totals.updated_auth_and_faculty + totals.backfilled_faculty_only === 0
            ? "all_failed"
            : "partial";

    await logImport({
      actor: context.userId,
      fileName: data.file_name ?? "faculty_account_email_update.xlsx",
      rowsTotal: totals.total,
      rowsSuccess: totals.updated_auth_and_faculty + totals.backfilled_faculty_only,
      rowsFailed: totals.failed,
      status,
      notes: JSON.stringify(totals),
    });

    await logAudit(
      context.userId,
      "faculty_account_email_update_execute",
      null,
      `تنفيذ تحديث البريد — ${JSON.stringify(totals)}`,
      { totals, status, file_name: data.file_name ?? null },
    );

    return { totals, results, status };
  });
