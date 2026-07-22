/**
 * STUDENT-ACCOUNTS-PRODUCTION-REALITY-RECONCILIATION-01 (track D)
 *
 * Read-only server wiring for the student_accounts preflight guards.
 * This module performs SELECT-only queries and Auth `listUsers` scans —
 * the exact same read patterns already used by
 * `previewBulkImportValidation("student_accounts", rawRows)`, which is
 * read-only by construction. There are NO inserts/updates/deletes, NO RPC
 * calls, and NO Auth user creation anywhere in this file.
 *
 * The decision logic itself lives in the pure core
 * (`student-accounts-preflight.ts`); everything here is dependency injection
 * for the DB/Auth boundary so the core stays unit-testable without mocks.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeUniversityLoginEmail } from "@/lib/university-email-auth";
import {
  buildStudentAccountsProductionSnapshot,
  STUDENT_ACCOUNTS_SNAPSHOT_TTL_MS,
  type StudentAccountsPreflightProfileRecord,
  type StudentAccountsPreflightReaders,
  type StudentAccountsProductionSnapshot,
} from "./student-accounts-preflight";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReadonlyDb = any;

/**
 * Build the dependency-injected readers over a service-role client.
 * Defaults to `supabaseAdmin` (service role, RLS-bypassing) so unlinked
 * profiles are visible; every query is a read.
 */
export function createStudentAccountsPreflightReaders(
  db: ReadonlyDb = supabaseAdmin,
): StudentAccountsPreflightReaders {
  return {
    async fetchProfileRecords({ academicNumbers, emails }) {
      const records = new Map<string, StudentAccountsPreflightProfileRecord>();
      const merge = (rows: unknown) => {
        for (const p of (rows as Record<string, unknown>[] | null) ?? []) {
          const ac = String(p.academic_number);
          records.set(ac, {
            academic_number: ac,
            email: (p.email as string | null) ?? null,
            user_linked: p.user_id != null,
          });
        }
      };
      if (academicNumbers.length > 0) {
        const { data, error } = await db
          .from("student_profiles")
          .select("academic_number, email, user_id")
          .in("academic_number", academicNumbers);
        if (error) throw new Error(error.message);
        merge(data);
      }
      if (emails.length > 0) {
        // Cross-student email ownership facts (CONFLICT detection).
        const { data, error } = await db
          .from("student_profiles")
          .select("academic_number, email, user_id")
          .in("email", emails);
        if (error) throw new Error(error.message);
        merge(data);
      }
      return [...records.values()];
    },

    async findAuthExistingEmails(emails) {
      const targets = new Set(emails.map((e) => normalizeUniversityLoginEmail(e)));
      const found = new Set<string>();
      // Same bounded pagination pattern as findAuthUserIdByEmailAdmin
      // (read-only Auth scan, 20 pages x 200 cap).
      for (let page = 1; page <= 20 && found.size < targets.size; page++) {
        const { data } = await db.auth.admin.listUsers({ page, perPage: 200 });
        const list = (data?.users ?? []) as { email?: string }[];
        for (const u of list) {
          const e = (u.email ?? "").toLowerCase();
          if (targets.has(e)) found.add(e);
        }
        if (list.length < 200) break;
      }
      return [...found];
    },
  };
}

/**
 * Capture a production snapshot (counts only — NO PII) via two read-only
 * count queries, matching the D-02 reconciliation shape
 * (total / linked / unlinked = total - linked).
 */
export async function captureStudentAccountsProductionSnapshot(opts: {
  project_ref: string;
  db?: ReadonlyDb;
  source_channel?: string;
  now?: Date;
  ttl_ms?: number;
}): Promise<StudentAccountsProductionSnapshot> {
  const db = opts.db ?? supabaseAdmin;
  const now = opts.now ?? new Date();
  const ttl = opts.ttl_ms ?? STUDENT_ACCOUNTS_SNAPSHOT_TTL_MS;

  const totalRes = await db
    .from("student_profiles")
    .select("id", { count: "exact", head: true });
  if (totalRes.error) throw new Error(totalRes.error.message);

  const linkedRes = await db
    .from("student_profiles")
    .select("id", { count: "exact", head: true })
    .not("user_id", "is", null);
  if (linkedRes.error) throw new Error(linkedRes.error.message);

  return buildStudentAccountsProductionSnapshot({
    total_profiles: totalRes.count ?? 0,
    linked_profiles: linkedRes.count ?? 0,
    captured_at: now.toISOString(),
    expires_at: new Date(now.getTime() + ttl).toISOString(),
    source_channel: opts.source_channel ?? "supabase_service_role_readonly",
    project_ref: opts.project_ref,
  });
}
