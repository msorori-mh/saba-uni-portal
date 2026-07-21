/**
 * STUDENT-EXISTING-ACCOUNTS-IMPORTER-01
 *
 * Create/link login accounts for students who already exist in student_profiles.
 * Never creates profiles and never mutates academic fields.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  isValidUniversityLoginEmail,
  normalizeUniversityLoginEmail,
} from "@/lib/university-email-auth";
import type {
  LookupMaps,
  RowError,
  StudentAccountsImportSummary,
  ValidatedRow,
  ValidationResult,
} from "./types";
import { getImportDb } from "./import-db";

export type StudentAccountOutcome =
  | "READY_TO_CREATE"
  | "ALREADY_LINKED"
  | "CONFLICT"
  | "STUDENT_NOT_FOUND"
  | "INVALID_EMAIL";

export type StudentAccountRow = {
  academic_number: string;
  university_email: string;
  must_change_password: boolean;
  is_active: boolean;
  notes: string | null;
  student_profile_id: string;
  outcome: StudentAccountOutcome;
};

export type { StudentAccountsImportSummary };

export type StudentAccountsAuthProbe = {
  findAuthUserIdByEmail: (email: string) => Promise<string | null>;
};

const str = (v: unknown) => (v == null ? "" : String(v).trim());

/** Map user-facing Arabic headers (and common variants) to canonical keys. */
const HEADER_ALIASES: Record<string, string> = {
  academic_number: "academic_number",
  "الرقم الأكاديمي": "academic_number",
  university_email: "university_email",
  "البريد الإلكتروني الجامعي": "university_email",
  "الايميل الجامعي": "university_email",
  "الإيميل الجامعي": "university_email",
  must_change_password: "must_change_password",
  is_active: "is_active",
  notes: "notes",
  "ملاحظات": "notes",
};

export function normalizeStudentAccountRaw(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    const canon = HEADER_ALIASES[key.trim()] ?? HEADER_ALIASES[key.trim().toLowerCase()] ?? key;
    if (out[canon] == null || out[canon] === "") out[canon] = value;
  }
  return out;
}

export function parseStudentAccountBool(v: unknown, defaultValue: boolean): boolean {
  if (v === null || v === undefined || v === "") return defaultValue;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (["true", "1", "yes", "y", "نعم", "صحيح"].includes(s)) return true;
  if (["false", "0", "no", "n", "لا", "خطأ"].includes(s)) return false;
  return defaultValue;
}

export function emptyStudentAccountsSummary(): StudentAccountsImportSummary {
  return {
    ready_to_create: 0,
    already_linked: 0,
    conflict: 0,
    student_not_found: 0,
    invalid_email: 0,
    created: 0,
    skipped: 0,
    failed: 0,
  };
}

export async function findAuthUserIdByEmailAdmin(email: string): Promise<string | null> {
  const target = normalizeUniversityLoginEmail(email);
  for (let page = 1; page <= 20; page++) {
    const { data } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    const list = data?.users ?? [];
    const hit = list.find((u) => (u.email ?? "").toLowerCase() === target);
    if (hit) return hit.id;
    if (list.length < 200) break;
  }
  return null;
}

function outcomeError(
  row: number,
  outcome: StudentAccountOutcome,
  message: string,
  column?: string,
): RowError {
  return { row, column, message: `[${outcome}] ${message}` };
}

/**
 * Validate existing-student account rows.
 * READY_TO_CREATE / ALREADY_LINKED → valid (parsed set).
 * CONFLICT / STUDENT_NOT_FOUND / INVALID_EMAIL → invalid (block live import).
 */
export async function validateStudentAccounts(
  rawRows: Record<string, unknown>[],
  _lookups: LookupMaps,
  probe?: StudentAccountsAuthProbe,
): Promise<ValidationResult<StudentAccountRow>> {
  const sb = getImportDb();
  const findAuth = probe?.findAuthUserIdByEmail ?? findAuthUserIdByEmailAdmin;

  const rows: ValidatedRow<StudentAccountRow>[] = [];
  const seenAc = new Map<string, number>();
  const seenEmail = new Map<string, number>();

  // Prefetch profiles by academic_number
  const academicNumbers = Array.from(
    new Set(
      rawRows
        .map((r) => str(normalizeStudentAccountRaw(r).academic_number))
        .filter(Boolean),
    ),
  );
  const profileByAc = new Map<
    string,
    { id: string; academic_number: string; user_id: string | null; email: string | null }
  >();
  if (academicNumbers.length > 0) {
    const { data: profiles, error } = await sb
      .from("student_profiles")
      .select("id, academic_number, user_id, email")
      .in("academic_number", academicNumbers);
    if (error) throw new Error(error.message);
    for (const p of profiles ?? []) {
      profileByAc.set(String((p as { academic_number: string }).academic_number), p as {
        id: string;
        academic_number: string;
        user_id: string | null;
        email: string | null;
      });
    }
  }

  for (let i = 0; i < rawRows.length; i++) {
    const rowNumber = i + 2;
    const raw = normalizeStudentAccountRaw(rawRows[i] ?? {});
    const errors: RowError[] = [];
    const academic_number = str(raw.academic_number);
    const emailRaw = str(raw.university_email);
    const university_email = normalizeUniversityLoginEmail(emailRaw);
    const must_change_password = parseStudentAccountBool(raw.must_change_password, true);
    const is_active = parseStudentAccountBool(raw.is_active, true);
    const notes = str(raw.notes) || null;

    if (!academic_number) {
      errors.push(
        outcomeError(rowNumber, "STUDENT_NOT_FOUND", "الرقم الأكاديمي مطلوب", "academic_number"),
      );
    } else {
      const prev = seenAc.get(academic_number);
      if (prev != null) {
        errors.push({
          row: rowNumber,
          column: "academic_number",
          message: `الرقم الأكاديمي مكرر في الملف (صف ${prev})`,
        });
      } else {
        seenAc.set(academic_number, rowNumber);
      }
    }

    let outcome: StudentAccountOutcome | null = null;

    if (!emailRaw) {
      outcome = "INVALID_EMAIL";
      errors.push(
        outcomeError(rowNumber, "INVALID_EMAIL", "البريد الإلكتروني الجامعي مطلوب", "university_email"),
      );
    } else if (!isValidUniversityLoginEmail(university_email)) {
      outcome = "INVALID_EMAIL";
      errors.push(
        outcomeError(rowNumber, "INVALID_EMAIL", "صيغة البريد الإلكتروني الجامعي غير صحيحة", "university_email"),
      );
    } else {
      const prevEmail = seenEmail.get(university_email);
      if (prevEmail != null) {
        outcome = "INVALID_EMAIL";
        errors.push({
          row: rowNumber,
          column: "university_email",
          message: `البريد مكرر في الملف (صف ${prevEmail})`,
        });
      } else {
        seenEmail.set(university_email, rowNumber);
      }
    }

    const profile = academic_number ? profileByAc.get(academic_number) : undefined;

    if (academic_number && !profile) {
      outcome = "STUDENT_NOT_FOUND";
      errors.push(
        outcomeError(
          rowNumber,
          "STUDENT_NOT_FOUND",
          "الطالب غير موجود — يجب استيراد بياناته أولاً",
          "academic_number",
        ),
      );
    }

    if (profile && university_email && isValidUniversityLoginEmail(university_email) && errors.length === 0) {
      // Email claimed by another student profile?
      const { data: emailOwner, error: emailErr } = await sb
        .from("student_profiles")
        .select("id, academic_number, user_id")
        .eq("email", university_email)
        .maybeSingle();
      if (emailErr) throw new Error(emailErr.message);
      if (emailOwner && (emailOwner as { id: string }).id !== profile.id) {
        outcome = "CONFLICT";
        errors.push(
          outcomeError(
            rowNumber,
            "CONFLICT",
            `البريد مرتبط بطالب آخر (${(emailOwner as { academic_number: string }).academic_number})`,
            "university_email",
          ),
        );
      } else if (profile.user_id) {
        outcome = "ALREADY_LINKED";
      } else {
        const authUserId = await findAuth(university_email);
        if (authUserId) {
          const { data: linkedProfile, error: linkErr } = await sb
            .from("student_profiles")
            .select("id, academic_number")
            .eq("user_id", authUserId)
            .maybeSingle();
          if (linkErr) throw new Error(linkErr.message);
          // Auth exists and is not this student's linked account → never auto-link.
          outcome = "CONFLICT";
          const otherAc = linkedProfile
            ? (linkedProfile as { academic_number: string }).academic_number
            : null;
          errors.push(
            outcomeError(
              rowNumber,
              "CONFLICT",
              otherAc
                ? `حساب Auth موجود بالبريد ومربوط بطالب آخر (${otherAc}) — لا ربط تلقائي`
                : "حساب Auth موجود بالبريد وغير مربوط بهذا الطالب — لا ربط تلقائي",
              "university_email",
            ),
          );
        } else if (!is_active) {
          outcome = "CONFLICT";
          errors.push(
            outcomeError(
              rowNumber,
              "CONFLICT",
              "is_active=false — لن يُنشأ حساب دخول لهذا الصف",
              "is_active",
            ),
          );
        } else {
          outcome = "READY_TO_CREATE";
        }
      }
    }

    if (
      errors.length > 0 ||
      !profile ||
      !outcome ||
      outcome === "STUDENT_NOT_FOUND" ||
      outcome === "INVALID_EMAIL" ||
      outcome === "CONFLICT"
    ) {
      rows.push({
        rowNumber,
        raw,
        parsed: null,
        errors:
          errors.length > 0
            ? errors
            : [outcomeError(rowNumber, "CONFLICT", "تعذّر تصنيف الصف")],
      });
      continue;
    }

    // READY_TO_CREATE | ALREADY_LINKED — valid rows (ALREADY_LINKED is skip, not create).
    rows.push({
      rowNumber,
      raw,
      parsed: {
        academic_number,
        university_email,
        must_change_password,
        is_active,
        notes,
        student_profile_id: profile.id,
        outcome,
      },
      errors: [],
    });
  }

  const validRows = rows.filter((r) => r.parsed !== null).length;
  return {
    rows,
    totalRows: rows.length,
    validRows,
    invalidRows: rows.length - validRows,
  };
}

export function summarizeStudentAccountValidation(
  rows: ValidatedRow<StudentAccountRow>[],
): StudentAccountsImportSummary {
  const summary = emptyStudentAccountsSummary();
  for (const r of rows) {
    if (r.parsed?.outcome === "READY_TO_CREATE") summary.ready_to_create += 1;
    else if (r.parsed?.outcome === "ALREADY_LINKED") summary.already_linked += 1;
    else {
      const msg = r.errors.map((e) => e.message).join(" | ");
      if (msg.includes("[CONFLICT]") || msg.includes("مكرر")) summary.conflict += 1;
      else if (msg.includes("[STUDENT_NOT_FOUND]")) summary.student_not_found += 1;
      else if (msg.includes("[INVALID_EMAIL]")) summary.invalid_email += 1;
      else summary.failed += 1;
    }
  }
  return summary;
}
